import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
export type VisualRequest = {
  url: string;
  readySelector: string;
  svg: string;
  imageBase64?: string;
  width: number;
  height: number;
  taskId: string;
  prototypeId: string;
  tree: string;
};
export type VisualResponse = {
  runId: string;
  status: "passed" | "failed" | "error";
  summary: string;
  html: string;
};
export type VisualVerifier = (
  request: VisualRequest,
) => Promise<VisualResponse>;
let active = false;
export function previewUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000)
    throw new Error("请填写本地预览地址");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error("本地预览地址格式错误");
  }
  if (
    u.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new Error(
      "预览地址须为 http://127.0.0.1:端口 或 http://localhost:端口，不含密码或片段",
    );
  return u;
}
export const verifyUIProof: VisualVerifier = async (input) => {
  if (active) throw new Error("UIProof 正在验收另一任务，请稍后重试");
  const host = process.env.UIPROOF_SSH_HOST;
  const command = process.env.UIPROOF_REMOTE_COMMAND || "/opt/uiproof/bin/mcp";
  const port = Number(process.env.UIPROOF_TUNNEL_PORT || 49317);
  if (
    !host ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/.test(host) ||
    !/^\/[a-zA-Z0-9_./-]+$/.test(command) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error(
      "UIProof 未配置：请设置有效的 UIPROOF_SSH_HOST、UIPROOF_REMOTE_COMMAND 和隧道端口",
    );
  const local = previewUrl(input.url),
    target = new URL(local.href);
  target.hostname = "127.0.0.1";
  target.port = String(port);
  const client = new Client({ name: "native-coder", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "ssh",
    args: [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=2",
      "-R",
      `127.0.0.1:${port}:127.0.0.1:${local.port || 80}`,
      host,
      command,
    ],
    stderr: "pipe",
  });
  active = true;
  let diagnostics = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-3000);
  });
  try {
    await client.connect(transport, { timeout: 20000 });
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 60000 },
      );
      const content = z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .parse(result.content);
      const output = content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      if (result.isError) throw new Error(output || "UIProof 调用失败");
      return JSON.parse(output) as unknown;
    };
    const context = {
      taskId: input.taskId,
      prototypeId: input.prototypeId,
      tree: input.tree,
    };
    const started = z.object({ jobId: z.string().uuid() }).parse(
      await call("uiproof_verify_image", {
        baselineBase64:
          input.imageBase64 || Buffer.from(input.svg).toString("base64"),
        config: {
          url: target.href,
          viewport: { width: input.width, height: input.height },
          ...(input.readySelector
            ? { readySelector: input.readySelector }
            : {}),
        },
        context,
      }),
    );
    const deadline = Date.now() + 180000;
    let runId = "";
    while (Date.now() < deadline) {
      const job = z
        .object({
          status: z.enum(["running", "complete", "error"]),
          runId: z.string().uuid().optional(),
          error: z.string().optional(),
        })
        .parse(await call("uiproof_status", { jobId: started.jobId }));
      if (job.status === "error")
        throw new Error(job.error || "UIProof 远端执行失败");
      if (job.status === "complete") {
        if (!job.runId) throw new Error("UIProof 未返回验收记录");
        runId = job.runId;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!runId) throw new Error("UIProof 验收超时");
    const result = z
      .object({
        status: z.enum(["passed", "failed", "error"]),
        clientContext: z.object({
          taskId: z.string(),
          prototypeId: z.string(),
          tree: z.string(),
        }),
        states: z.array(
          z.object({
            name: z.string(),
            status: z.string(),
            ratio: z.number().optional(),
            issueCount: z.number(),
            error: z.string().optional(),
          }),
        ),
      })
      .parse(await call("uiproof_result", { runId }));
    if (JSON.stringify(result.clientContext) !== JSON.stringify(context))
      throw new Error("UIProof 返回结果与当前任务/原型/代码不匹配");
    const report = z
      .object({
        runId: z.literal(runId),
        html: z.string().max(24 * 1024 * 1024),
      })
      .parse(await call("uiproof_report", { runId }));
    return {
      runId,
      status: result.status,
      summary: JSON.stringify({ server: host, ...result }, null, 2),
      html: report.html,
    };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${diagnostics ? "\nSSH: " + diagnostics : ""}`,
    );
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    active = false;
  }
};
