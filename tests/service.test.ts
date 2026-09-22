import { test } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Service } from "../server/service.js";
import { run, type Runner } from "../server/process.js";
import { createApp } from "../server/http.js";
import type { AddressInfo } from "node:net";

async function fixture(readOnly = false) {
  const root = await mkdtemp(join(tmpdir(), "native-coder-test-"));
  const repo = join(root, "source");
  const remote = join(root, "remote.git");
  await mkdir(repo);
  await run(["git", "init", "-b", "main"], repo);
  await run(["git", "config", "user.name", "Test Developer"], repo);
  await run(["git", "config", "user.email", "test@example.invalid"], repo);
  await writeFile(join(repo, "hello.txt"), "original\n");
  await writeFile(join(repo, ".gitignore"), "node_modules/\n");
  await run(["git", "add", "."], repo);
  await run(["git", "commit", "-m", "initial"], repo);
  await run(["git", "init", "--bare", remote], root);
  await run(["git", "remote", "add", "origin", remote], repo);
  const store = new Store(join(root, "state"));
  const runner: Runner = async (argv, cwd, options) => {
    if (argv[0] === "fake-codex") {
      if (argv.includes("workspace-write"))
        await writeFile(join(cwd, "hello.txt"), "generated\n");
      const out = argv[argv.indexOf("--output-last-message") + 1];
      await writeFile(
        out,
        "目标：改进文本\n验收：内容更新\n方案：修改 hello.txt",
      );
      return "completed";
    }
    return run(argv, cwd, options);
  };
  const service = new Service(store, runner, "fake-codex");
  const project = await service.addProject({
    path: repo,
    readOnly,
    checks: [
      {
        name: "test",
        argv: [
          "node",
          "-e",
          "if(require('fs').readFileSync('hello.txt','utf8')!=='generated\\n')process.exit(1)",
        ],
      },
    ],
  });
  const task = service.createTask({
    projectId: project.id,
    title: "Update text",
    request: "Generate improved text",
  });
  async function action(name: string, input = {}) {
    const result = service.start(task.id, name, input);
    await result.completion;
    return store.task(task.id);
  }
  async function ready() {
    await action("generate");
    service.approve(task.id);
    await action("generate");
    service.approve(task.id);
    const current = store.task(task.id);
    await run(
      ["git", "config", "user.name", "Test Developer"],
      current.workspace,
    );
    await run(
      ["git", "config", "user.email", "test@example.invalid"],
      current.workspace,
    );
  }
  async function close() {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
  return {
    root,
    repo,
    remote,
    store,
    service,
    project,
    task,
    action,
    ready,
    close,
  };
}

test("five stages produce a real commit and push a task branch without modifying the source", async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.service.start(f.task.id, "develop"), /方案/);
    await f.ready();
    await f.action("develop");
    const verified = await f.action("verify");
    assert.equal(verified.stage, "commit");
    assert.equal(verified.checks[0].status, "passed");
    const committed = await f.action("commit", {
      message: "feat: improve text",
    });
    assert.equal(committed.stage, "done");
    assert.equal(committed.commit.length, 40);
    assert.equal(committed.pushed, false);
    const pushed = await f.action("push");
    assert.equal(pushed.pushed, true);
    assert.match(
      await run(
        ["git", "--git-dir", f.remote, "show", `${pushed.branch}:hello.txt`],
        f.root,
      ),
      /generated/,
    );
    assert.equal(
      await readFile(join(f.repo, "hello.txt"), "utf8"),
      "original\n",
    );
    assert.equal(await run(["git", "status", "--porcelain"], f.repo), "");
    assert.equal(
      await run(["git", "branch", "--show-current"], f.repo),
      "main",
    );
  } finally {
    await f.close();
  }
});
test("read-only project permits analysis but rejects development, checks, commit and push", async () => {
  const f = await fixture(true);
  try {
    await f.ready();
    for (const action of ["develop", "verify", "commit", "push", "install"])
      assert.throws(() => f.service.start(f.task.id, action), /只读/);
    assert.equal(await run(["git", "status", "--porcelain"], f.repo), "");
  } finally {
    await f.close();
  }
});
test("failed checks block commits and can be retried", async () => {
  const f = await fixture();
  try {
    await f.ready();
    await f.action("develop");
    const current = f.store.task(f.task.id);
    await writeFile(join(current.workspace, "hello.txt"), "bad\n");
    const failed = await f.action("verify");
    assert.equal(failed.stage, "verify");
    assert.equal(failed.checks[0].status, "failed");
    assert.throws(
      () => f.service.start(f.task.id, "commit", { message: "bad" }),
      /验证/,
    );
    await f.action("develop");
    assert.equal((await f.action("verify")).stage, "commit");
  } finally {
    await f.close();
  }
});
test("changes after verification invalidate the commit gate including untracked files", async () => {
  const f = await fixture();
  try {
    await f.ready();
    await f.action("develop");
    const current = await f.action("verify");
    await writeFile(join(current.workspace, "new.txt"), "new");
    const rejected = await f.action("commit", { message: "must fail" });
    assert.equal(rejected.stage, "verify");
    assert.match(rejected.error, /重新验证/);
    assert.equal(rejected.commit, "");
  } finally {
    await f.close();
  }
});
test("new sensitive files are rejected before committing", async () => {
  const f = await fixture();
  try {
    await f.ready();
    const current = await f.action("develop");
    await writeFile(join(current.workspace, ".env"), "SECRET=placeholder");
    await f.action("verify");
    const result = await f.action("commit", { message: "must fail" });
    assert.match(result.error, /密钥/);
    assert.equal(result.commit, "");
  } finally {
    await f.close();
  }
});
test("empty document, duplicate task execution and dirty source are rejected", async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.service.approve(f.task.id), /保存文档/);
    const execution = f.service.start(f.task.id, "generate");
    assert.throws(() => f.service.start(f.task.id, "generate"), /正在执行/);
    await execution.completion;
    const next = f.service.createTask({
      projectId: f.project.id,
      title: "next",
      request: "next",
    });
    await writeFile(join(f.repo, "hello.txt"), "dirty");
    await f.service.start(next.id, "generate").completion;
    assert.match(f.store.task(next.id).error, /未提交/);
  } finally {
    await f.close();
  }
});
test("interrupted jobs recover after restart and invalidate verification", async () => {
  const f = await fixture();
  try {
    const task = f.store.task(f.task.id);
    task.busy = true;
    task.stage = "commit";
    task.verifiedTree = "stale";
    f.store.saveTask(task);
    const second = new Store(f.store.directory);
    assert.equal(second.task(task.id).busy, false);
    assert.equal(second.task(task.id).stage, "verify");
    assert.equal(second.task(task.id).verifiedTree, "");
    second.close();
  } finally {
    await f.close();
  }
});
test("HTTP rejects untrusted origins, missing tokens and forged Host", async () => {
  const f = await fixture();
  const app = createApp(f.service, f.root);
  try {
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    assert.equal((await fetch(url + "/api/state")).status, 403);
    assert.equal(
      (
        await fetch(url + "/api/session", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const forgedHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = httpRequest(
          url + "/api/session",
          { headers: { Host: "evil.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    assert.equal(forgedHost, 403);
    const session = (await (await fetch(url + "/api/session")).json()) as {
      token: string;
    };
    const result = await fetch(url + "/api/state", {
      headers: { "X-Native-Token": session.token },
    });
    assert.equal(result.status, 200);
    const state = (await result.json()) as { projects: unknown[] };
    assert.equal(state.projects.length, 1);
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await f.close();
  }
});

test("verification preserves tracked files even when current ignore rules match them", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.repo, "tracked.log"), "tracked");
    await run(["git", "add", "tracked.log"], f.repo);
    await run(["git", "commit", "-m", "track log"], f.repo);
    await writeFile(join(f.repo, ".gitignore"), "*.log\n");
    await run(["git", "add", ".gitignore"], f.repo);
    await run(["git", "commit", "-m", "ignore new logs"], f.repo);
    await f.ready();
    const current = await f.action("develop");
    const tree = await f.service.snapshot(current.workspace);
    assert.equal(
      await run(["git", "show", `${tree}:tracked.log`], current.workspace),
      "tracked",
    );
  } finally {
    await f.close();
  }
});
test("failed push remains unpushed and can be retried without creating another commit", async () => {
  const f = await fixture();
  try {
    await f.ready();
    await f.action("develop");
    await f.action("verify");
    const committed = await f.action("commit", { message: "feat: text" });
    f.project.remote = join(f.root, "missing.git");
    f.store.saveProject(f.project);
    const failed = await f.action("push");
    assert.equal(failed.pushed, false);
    assert.equal(failed.commit, committed.commit);
    assert.ok(failed.error);
    f.project.remote = f.remote;
    f.store.saveProject(f.project);
    assert.equal((await f.action("push")).pushed, true);
  } finally {
    await f.close();
  }
});

test("another server cannot recover or overwrite active tasks in the same data directory", async () => {
  const { acquireLock } = await import("../server/lock.js");
  const root = await mkdtemp(join(tmpdir(), "native-coder-lock-"));
  const release = acquireLock(root);
  try {
    assert.throws(() => acquireLock(root), /已有运行/);
    release();
    const secondRelease = acquireLock(root);
    secondRelease();
  } finally {
    release();
    await rm(root, { recursive: true, force: true });
  }
});
test("long-running processes time out and fail instead of reporting success", async () => {
  await assert.rejects(
    run(["node", "-e", "setInterval(() => {}, 1000)"], tmpdir(), {
      timeout: 100,
    }),
    /超时/,
  );
});
