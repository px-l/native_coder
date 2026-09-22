import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Prevent a second server from recovering jobs owned by a live first server. */
export function acquireLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, "server.lock");
  try {
    writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const pid = Number(readFileSync(lock, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error("服务锁状态不明确，请确认旧服务已停止后检查 server.lock");
    try {
      process.kill(pid, 0);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
        rmSync(lock);
        return acquireLock(directory);
      }
      throw new Error("无法确认现有服务状态，拒绝启动第二个实例");
    }
    throw new Error("此数据目录已有运行中的工作台，请使用现有服务");
  }
  return () => {
    try {
      if (readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock);
    } catch {
      /* Already released. */
    }
  };
}
