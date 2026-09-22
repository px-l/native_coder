import { spawn } from "node:child_process";
const active = new Set<() => void>();
export function stopProcesses() {
  for (const stop of active) stop();
}
export type Runner = (
  argv: string[],
  cwd: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    input?: string;
    onOutput?: (text: string) => void;
  },
) => Promise<string>;
export const run: Runner = (argv, cwd, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    let settled = false;
    const kill = () => {
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* Process already stopped. */
      }
    };
    active.add(kill);
    const timer = setTimeout(() => {
      kill();
      finish(new Error("执行超时。\n" + output));
    }, options.timeout ?? 120_000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      active.delete(kill);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output.trim());
    }
    function collect(data: Buffer) {
      const text = data.toString();
      output = (output + text).slice(-120_000);
      options.onOutput?.(text);
    }
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", finish);
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(`命令退出码 ${code}：${argv[0]}\n${output}`),
      ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
