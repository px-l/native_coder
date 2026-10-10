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
import { renderDrawing, type Drawing } from "../server/prototype.js";

const drawing: Drawing = {
  title: "需求工作台",
  summary: "左侧导航，右侧需求列表与新建按钮。",
  width: 1440,
  height: 900,
  background: "#f5f7fb",
  elements: [
    {
      kind: "rect",
      x: 0,
      y: 0,
      width: 240,
      height: 900,
      text: "",
      fill: "#ffffff",
      fontSize: 16,
    },
    {
      kind: "text",
      x: 280,
      y: 50,
      width: 0,
      height: 0,
      text: "需求列表",
      fill: "#202938",
      fontSize: 28,
    },
  ],
};

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
  const prompts: string[] = [];
  const runner: Runner = async (argv, cwd, options) => {
    if (argv[0] === "fake-codex") {
      prompts.push(options?.input || "");
      if (argv.includes("workspace-write"))
        await writeFile(join(cwd, "hello.txt"), "generated\n");
      const out = argv[argv.indexOf("--output-last-message") + 1];
      await writeFile(
        out,
        argv.includes("--output-schema")
          ? JSON.stringify(
              argv.some((a) => a.includes("requirements-schema-"))
                ? {
                    requirements: "目标：改进文本\n验收：内容更新",
                    mode: "generate",
                    complete: true,
                    reason: "需要完整页面原型",
                  }
                : drawing,
            )
          : "目标：改进文本\n验收：内容更新\n方案：修改 hello.txt",
      );
      return "completed";
    }
    return run(argv, cwd, options);
  };
  const service = new Service(store, runner, "fake-codex", [], async () => ({
    runId: "00000000-0000-4000-8000-000000000001",
    status: "passed",
    summary: "mock UIProof passed",
    html: "<!doctype html><h1>Fixture report</h1>",
  }));
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
    const prototype = await action("prototype");
    service.approve(task.id, { versionId: prototype.prototypes[0].id });
    await action("generate");
    service.approve(task.id);
    service.saveVisualInput(task.id, { url: "http://127.0.0.1:3000" });
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
    prompts,
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

test("six stages produce a real commit and push a task branch without modifying the source", async () => {
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

test("prototype gate follows requirements and passes the approved drawing to the plan", async () => {
  const f = await fixture(true);
  try {
    assert.throws(() => f.service.start(f.task.id, "prototype"), /确认需求/);
    await f.action("generate");
    assert.equal(f.service.approve(f.task.id).stage, "prototype");
    assert.throws(() => f.service.start(f.task.id, "generate"), /无法生成文档/);
    assert.throws(() => f.service.approve(f.task.id), /先生成/);
    const result = await f.action("prototype");
    assert.equal(result.prototypes.length, 1);
    assert.match(result.prototypes[0].svg, /<svg/);
    assert.match(f.prompts.at(-1)!, /已有项目/);
    assert.match(f.prompts.at(-1)!, /目标：改进文本/);
    assert.equal(
      f.service.approve(f.task.id, { versionId: result.prototypes[0].id })
        .stage,
      "plan",
    );
    await f.action("generate");
    assert.match(f.prompts.at(-1)!, /已确认原型 v1/);
    assert.match(f.prompts.at(-1)!, /需求列表/);
    assert.equal(await run(["git", "status", "--porcelain"], f.repo), "");
    assert.throws(
      () => f.service.savePrototypeInput(f.task.id, { brief: "late" }),
      /仅原型/,
    );
  } finally {
    await f.close();
  }
});
test("changed design input invalidates old versions and a failed generation preserves history", async () => {
  const f = await fixture();
  try {
    f.service.saveDocument(f.task.id, { content: "confirmed requirement" });
    f.service.approve(f.task.id);
    const first = await f.action("prototype");
    f.service.savePrototypeInput(f.task.id, { brief: "顶部添加筛选按钮" });
    assert.throws(
      () => f.service.approve(f.task.id, { versionId: first.prototypes[0].id }),
      /当前设计输入/,
    );
    const original = f.service.runner;
    f.service.runner = async (argv, cwd, options) => {
      if (argv[0] === "fake-codex") throw new Error("model unavailable");
      return original(argv, cwd, options);
    };
    const failed = await f.action("prototype");
    assert.equal(failed.prototypes.length, 1);
    assert.equal(failed.stage, "prototype");
    assert.match(failed.error, /unavailable/);
    f.service.runner = original;
    const second = await f.action("prototype");
    assert.equal(second.prototypes[1].version, 2);
    assert.equal(
      f.service.approve(f.task.id, { versionId: second.prototypes[1].id })
        .stage,
      "plan",
    );
  } finally {
    await f.close();
  }
});
test("new projects can clarify and prototype without a repository, then bind before development", async () => {
  const f = await fixture();
  try {
    const p = await f.service.addProject({ kind: "new", name: "全新产品" });
    const task = f.service.createTask({
      projectId: p.id,
      title: "新产品",
      request: "需求列表",
    });
    await f.service.start(task.id, "generate").completion;
    f.service.approve(task.id);
    await f.service.start(task.id, "prototype").completion;
    const result = f.store.task(task.id);
    assert.equal(result.workspace, "");
    assert.equal(result.prototypes.length, 1);
    assert.match(f.prompts.at(-1)!, /全新项目/);
    f.service.approve(task.id, { versionId: result.prototypes[0].id });
    await f.service.start(task.id, "generate").completion;
    f.service.approve(task.id);
    assert.throws(() => f.service.start(task.id, "develop"), /绑定业务/);
    // A separate initialized repository stands in for the new product repository.
    const repo = join(f.root, "new-product");
    await run(["git", "clone", f.repo, repo], f.root);
    const bound = await f.service.addProject(
      { path: repo, readOnly: false, checks: f.project.checks },
      p.id,
    );
    assert.equal(bound.kind, "new");
    assert.equal(bound.readOnly, false);
    assert.equal(f.store.task(task.id).stage, "plan");
    assert.equal(f.store.task(task.id).plan, "");
    await f.service.start(task.id, "generate").completion;
    f.service.approve(task.id);
    await f.service.start(task.id, "develop").completion;
    assert.equal(f.store.task(task.id).stage, "verify");
    await assert.rejects(
      f.service.addProject({ path: repo }, p.id),
      /只有未绑定/,
    );
  } finally {
    await f.close();
  }
});
test("old tasks preserve progress while old requirements tasks adopt the prototype gate", async () => {
  const f = await fixture();
  try {
    const legacy = { ...f.task } as unknown as Record<string, unknown>;
    for (const key of [
      "prototypeRequired",
      "prototypeBrief",
      "prototypeRevision",
      "referenceImage",
      "prototypes",
      "approvedPrototypeId",
    ])
      delete legacy[key];
    legacy.stage = "plan";
    f.store.db
      .prepare("UPDATE records SET body=? WHERE kind=? AND id=?")
      .run(JSON.stringify(legacy), "task", f.task.id);
    assert.equal(f.store.task(f.task.id).prototypeRequired, false);
    assert.deepEqual(f.store.task(f.task.id).prototypes, []);
    legacy.stage = "requirements";
    legacy.requirements = "ready";
    f.store.db
      .prepare("UPDATE records SET body=? WHERE kind=? AND id=?")
      .run(JSON.stringify(legacy), "task", f.task.id);
    assert.equal(f.service.approve(f.task.id).stage, "prototype");
  } finally {
    await f.close();
  }
});
test("drawing output escapes text and rejects unsafe colors and invalid coordinates", () => {
  const text = {
    ...drawing,
    elements: [{ ...drawing.elements[1], text: "<script>alert(1)</script>" }],
  };
  assert.ok(!renderDrawing(text).svg.includes("<script>"));
  assert.match(renderDrawing(text).svg, /&lt;script&gt;/);
  assert.throws(
    () => renderDrawing({ ...drawing, background: "url(https://example.com)" }),
    /不符合/,
  );
  assert.throws(
    () =>
      renderDrawing({
        ...drawing,
        elements: [{ ...drawing.elements[0], width: 2000 }],
      }),
    /超出画布/,
  );
});
test("reference image validation and prototype busy locking are enforced", async () => {
  const f = await fixture();
  try {
    f.service.saveDocument(f.task.id, { content: "ready" });
    f.service.approve(f.task.id);
    assert.throws(
      () =>
        f.service.savePrototypeInput(f.task.id, {
          referenceImage: "data:image/svg+xml;base64,PHN2Zz4=",
        }),
      /PNG/,
    );
    assert.throws(
      () =>
        f.service.savePrototypeInput(f.task.id, {
          referenceImage: "data:image/png;base64,YWJj",
        }),
      /内容无效/,
    );
    const operation = f.service.start(f.task.id, "prototype");
    assert.throws(
      () => f.service.savePrototypeInput(f.task.id, { brief: "race" }),
      /正在执行/,
    );
    await operation.completion;
    const second = new Store(f.store.directory);
    assert.equal(second.task(f.task.id).prototypes.length, 1);
    second.close();
  } finally {
    await f.close();
  }
});

test("UIProof failure or outage blocks commit; changing visual settings invalidates a pass", async () => {
  const f = await fixture();
  try {
    await f.ready();
    await f.action("develop");
    f.service.visualVerifier = async () => ({
      runId: "00000000-0000-4000-8000-000000000002",
      status: "failed",
      summary: "Missing card",
      html: "<h1>Failed</h1>",
    });
    let task = await f.action("verify");
    assert.equal(task.stage, "verify");
    assert.equal(task.verifiedTree, "");
    assert.equal(
      task.checks.find((c) => c.name === "UIProof MCP")?.status,
      "failed",
    );
    assert.match(await f.service.visualReport(task.id), /Failed/);
    assert.throws(
      () => f.service.start(task.id, "commit", { message: "blocked" }),
      /验证/,
    );
    f.service.visualVerifier = async () => {
      throw new Error("SSH unavailable");
    };
    task = await f.action("verify");
    assert.equal(task.stage, "verify");
    assert.equal(task.visual, undefined);
    f.service.visualVerifier = async () => ({
      runId: "00000000-0000-4000-8000-000000000003",
      status: "passed",
      summary: "Passed",
      html: "<h1>Passed</h1>",
    });
    task = await f.action("verify");
    assert.equal(task.stage, "commit");
    f.service.saveVisualInput(task.id, { url: "http://127.0.0.1:3001" });
    task = f.store.task(task.id);
    assert.equal(task.stage, "verify");
    assert.equal(task.verifiedTree, "");
    assert.equal(task.visual, undefined);
  } finally {
    await f.close();
  }
});
test("UIProof submission guard binds the approved prototype and code tree", async () => {
  const f = await fixture();
  try {
    await f.ready();
    await f.action("develop");
    const task = await f.action("verify");
    assert.equal(task.stage, "commit");
    task.visual!.prototypeHash = "tampered";
    f.store.saveTask(task);
    const blocked = await f.action("commit", { message: "blocked" });
    assert.match(blocked.error, /UIProof/);
    assert.equal(blocked.commit, "");
  } finally {
    await f.close();
  }
});
test("UIProof preview address rejects non-local targets and credentials", async () => {
  const f = await fixture();
  try {
    await f.ready();
    for (const url of [
      "file:///etc/hosts",
      "https://example.com",
      "http://127.0.0.1.evil.test:3000",
      "http://user:secret@127.0.0.1:3000",
    ])
      assert.throws(
        () => f.service.saveVisualInput(f.task.id, { url }),
        /预览地址/,
      );
  } finally {
    await f.close();
  }
});

test("legacy tasks entering the prototype flow also acquire the UIProof gate", async () => {
  const f = await fixture();
  try {
    const task = f.store.task(f.task.id);
    const old = JSON.parse(JSON.stringify(task)) as Record<string, unknown>;
    delete old.visualRequired;
    delete old.prototypeRequired;
    f.store.db
      .prepare("UPDATE records SET body=? WHERE kind=? AND id=?")
      .run(JSON.stringify(old), "task", task.id);
    assert.equal(f.store.task(task.id).prototypeRequired, true);
    assert.equal(f.store.task(task.id).visualRequired, true);
  } finally {
    await f.close();
  }
});

async function requestImage() {
  return `data:image/png;base64,${(await readFile(new URL("./fixtures/requirement.png", import.meta.url))).toString("base64")}`;
}

test("image-only requests persist, attach the image to analysis, and reuse complete images without generating", async () => {
  const f = await fixture();
  try {
    const image = await requestImage();
    const task = f.service.createTask({
      projectId: f.project.id,
      title: "目标界面",
      requirementImage: image,
    });
    const original = f.service.runner;
    let images = 0;
    f.service.runner = async (argv, cwd, options) => {
      if (argv[0] === "fake-codex") {
        assert.ok(argv.includes("--image"));
        assert.equal(
          (await readFile(argv[argv.indexOf("--image") + 1])).toString(
            "base64",
          ),
          image.split(",")[1],
        );
        images++;
        if (argv.some((a) => a.includes("requirements-schema-"))) {
          await writeFile(
            argv[argv.indexOf("--output-last-message") + 1],
            JSON.stringify({
              requirements: "复现图片展示",
              mode: "reuse",
              complete: true,
              reason: "图片已完整明确目标效果",
            }),
          );
          return "done";
        }
      }
      return original(argv, cwd, options);
    };
    await f.service.start(task.id, "generate").completion;
    const approved = f.service.approve(task.id);
    assert.equal(approved.stage, "plan");
    assert.equal(approved.prototypeRequired, false);
    assert.equal(approved.visualRequired, true);
    assert.equal(approved.prototypes[0].image, image);
    assert.equal(approved.prototypes[0].drawing.width, 320);
    assert.throws(() => f.service.start(task.id, "prototype"), /先确认需求/);
    await f.service.start(task.id, "generate").completion;
    f.service.approve(task.id);
    await f.service.start(task.id, "develop").completion;
    assert.equal(images, 3);
    f.service.saveVisualInput(task.id, { url: "http://127.0.0.1:3000" });
    f.service.visualVerifier = async (input) => {
      assert.equal(input.imageBase64, image.split(",")[1]);
      assert.equal(input.width, 320);
      return {
        runId: "image-baseline",
        status: "failed",
        summary: "pixel difference",
        html: "<p>difference</p>",
      };
    };
    await f.service.start(task.id, "verify").completion;
    assert.equal(f.store.task(task.id).stage, "verify");
    assert.throws(
      () => f.service.start(task.id, "commit", { message: "blocked" }),
      /先通过/,
    );
    const reopened = new Store(join(f.root, "state"));
    assert.equal(reopened.task(task.id).requirementImage, image);
    assert.equal(reopened.task(task.id).designDecision?.mode, "reuse");
    reopened.close();
  } finally {
    await f.close();
  }
});

test("simple and incomplete-image tasks skip only visual comparison; ordinary checks and commit binding remain", async () => {
  for (const mode of ["simple", "reuse"] as const) {
    const f = await fixture();
    try {
      const task = f.service.createTask({
        projectId: f.project.id,
        title: "局部调整",
        request: "修改文案",
        requirementImage: await requestImage(),
      });
      f.service.saveDocument(task.id, { content: "只修改局部文案" });
      f.service.setDesignDecision(task.id, {
        mode,
        complete: false,
        reason: mode === "simple" ? "简单文案调整" : "仅局部图，不是完整页面",
      });
      assert.equal(f.service.approve(task.id).stage, "plan");
      await f.service.start(task.id, "generate").completion;
      f.service.approve(task.id);
      await f.service.start(task.id, "develop").completion;
      f.service.visualVerifier = async () => {
        throw new Error("must not be called");
      };
      let taskState = f.store.task(task.id);
      await writeFile(join(taskState.workspace, "hello.txt"), "bad");
      await f.service.start(task.id, "verify").completion;
      assert.equal(f.store.task(task.id).stage, "verify");
      await writeFile(join(taskState.workspace, "hello.txt"), "generated\n");
      await f.service.start(task.id, "verify").completion;
      taskState = f.store.task(task.id);
      assert.equal(taskState.stage, "commit");
      assert.equal(
        taskState.checks.find((c) => c.name === "UIProof MCP")?.status,
        "skipped",
      );
      assert.equal(
        taskState.checks.find((c) => c.name === "test")?.status,
        "passed",
      );
      assert.throws(
        () =>
          f.service.setDesignDecision(task.id, {
            mode: "simple",
            complete: false,
            reason: "late",
          }),
        /需求确认前/,
      );
      await writeFile(
        join(taskState.workspace, "hello.txt"),
        "changed after verify",
      );
      await f.service.start(task.id, "commit", { message: "should fail" })
        .completion;
      assert.equal(f.store.task(task.id).stage, "verify");
      assert.equal(await run(["git", "status", "--porcelain"], f.repo), "");
    } finally {
      await f.close();
    }
  }
});

test("malformed uploads and reuse without image reject; document edits reset obsolete skip decisions", async () => {
  const f = await fixture();
  try {
    for (const requirementImage of [
      null,
      42,
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,YWJj",
      "data:image/png;base64," + "A".repeat(5600001),
    ]) {
      assert.throws(() =>
        f.service.createTask({
          projectId: f.project.id,
          title: "bad",
          request: "test",
          requirementImage,
        }),
      );
    }
    assert.throws(
      () =>
        f.service.setDesignDecision(f.task.id, {
          mode: "reuse",
          complete: true,
          reason: "missing",
        }),
      /上传/,
    );
    f.service.setDesignDecision(f.task.id, {
      mode: "simple",
      complete: true,
      reason: "small",
    });
    assert.equal(f.store.task(f.task.id).visualRequired, false);
    f.service.saveDocument(f.task.id, { content: "now a complex new page" });
    assert.equal(f.store.task(f.task.id).visualRequired, true);
    assert.equal(f.store.task(f.task.id).designDecision, undefined);
    f.service.runner = async (argv) => {
      if (argv[0] === "fake-codex") return "no output";
      throw new Error("analysis unavailable");
    };
    await f.action("generate");
    assert.equal(f.store.task(f.task.id).visualRequired, true);
  } finally {
    await f.close();
  }
});

test("prototype review can mark a generated partial drawing incomplete with an explicit reason", async () => {
  const f = await fixture();
  try {
    await f.action("generate");
    f.service.approve(f.task.id);
    const task = await f.action("prototype");
    assert.throws(
      () =>
        f.service.approve(task.id, {
          versionId: task.prototypes[0].id,
          comparisonComplete: false,
          skipReason: "",
        }),
      /原因/,
    );
    const approved = f.service.approve(task.id, {
      versionId: task.prototypes[0].id,
      comparisonComplete: false,
      skipReason: "只覆盖局部组件",
    });
    assert.equal(approved.stage, "plan");
    assert.equal(approved.visualRequired, false);
    assert.equal(approved.designDecision?.reason, "只覆盖局部组件");
  } finally {
    await f.close();
  }
});

test("structured analysis chooses each policy and invalid analysis never silently bypasses checks", async () => {
  const f = await fixture();
  try {
    const original = f.service.runner;
    for (const decision of [
      { mode: "simple", complete: false, reason: "仅修改文字" },
      { mode: "reuse", complete: false, reason: "上传图只展示局部" },
      { mode: "generate", complete: true, reason: "需要设计新页面" },
    ]) {
      const task = f.service.createTask({
        projectId: f.project.id,
        title: "判断策略",
        requirementImage: await requestImage(),
      });
      f.service.runner = async (argv, cwd, options) => {
        if (argv[0] === "fake-codex") {
          await writeFile(
            argv[argv.indexOf("--output-last-message") + 1],
            JSON.stringify({ requirements: "验收描述", ...decision }),
          );
          return "done";
        }
        return original(argv, cwd, options);
      };
      await f.service.start(task.id, "generate").completion;
      const result = f.store.task(task.id);
      assert.equal(result.error, "");
      assert.equal(result.designDecision?.mode, decision.mode);
      assert.equal(result.prototypeRequired, decision.mode === "generate");
      assert.equal(result.visualRequired, decision.complete);
    }
    const task = f.service.createTask({
      projectId: f.project.id,
      title: "无效判断",
      request: "新增页面",
    });
    f.service.runner = async (argv, cwd, options) => {
      if (argv[0] === "fake-codex") {
        await writeFile(
          argv[argv.indexOf("--output-last-message") + 1],
          '{"requirements":"text","mode":"simple","complete":false}',
        );
        return "done";
      }
      return original(argv, cwd, options);
    };
    await f.service.start(task.id, "generate").completion;
    assert.ok(f.store.task(task.id).error);
    assert.equal(f.store.task(task.id).visualRequired, true);
    assert.equal(f.store.task(task.id).requirements, "");
  } finally {
    await f.close();
  }
});
