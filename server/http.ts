import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import type { Service } from "./service.js";
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
export function createApp(service: Service, webRoot: string) {
  const token = randomBytes(32).toString("hex");
  function json(response: ServerResponse, data: unknown, code = 200) {
    response.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(data));
  }
  async function body(
    request: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    if (!request.headers["content-type"]?.startsWith("application/json"))
      throw new Error("请求必须为 JSON");
    let content = "";
    for await (const part of request) {
      content += part;
      if (Buffer.byteLength(content) > 6000000) throw new Error("请求过大");
    }
    const result: unknown = JSON.parse(content || "{}");
    if (!result || Array.isArray(result) || typeof result !== "object")
      throw new Error("请求格式错误");
    return result as Record<string, unknown>;
  }
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    const expectedHost = `127.0.0.1:${serverAddress(request)}`;
    if (request.headers.host !== expectedHost)
      return json(response, { error: "仅接受本机地址访问" }, 403);
    const origin = `http://${expectedHost}`;
    if (
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      return json(response, { error: "拒绝跨站请求" }, 403);
    const path = new URL(request.url || "/", origin).pathname;
    try {
      if (path === "/api/session" && request.method === "GET")
        return json(response, { token });
      if (path.startsWith("/api/")) {
        const received = Buffer.from(
          String(request.headers["x-native-token"] || ""),
        );
        if (
          received.length !== token.length ||
          !timingSafeEqual(received, Buffer.from(token))
        )
          return json(response, { error: "访问令牌失效，请刷新页面" }, 403);
        if (path === "/api/state" && request.method === "GET")
          return json(response, {
            projects: service.store.projects(),
            tasks: service.store.tasks(),
          });
        if (path === "/api/health" && request.method === "GET") {
          let codex = "";
          let login = "";
          let error = "";
          try {
            codex = await service.runner(
              [service.codexBin, "--version"],
              service.store.directory,
              { timeout: 10000 },
            );
            login = await service.runner(
              [service.codexBin, "login", "status"],
              service.store.directory,
              { timeout: 10000 },
            );
          } catch (e) {
            error = String(e);
          }
          return json(response, { codex, login, error });
        }
        if (path === "/api/projects" && request.method === "POST")
          return json(
            response,
            await service.addProject(await body(request)),
            201,
          );
        if (path === "/api/tasks" && request.method === "POST")
          return json(response, service.createTask(await body(request)), 201);
        const binding = path.match(/^\/api\/projects\/([\w-]+)\/bind$/);
        if (binding && request.method === "POST")
          return json(
            response,
            await service.addProject(await body(request), binding[1]),
          );
        const match = path.match(
          /^\/api\/tasks\/([\w-]+)\/(design-decision|visual-input|visual-report|prototype-input|prototype|document|approve|generate|develop|verify|commit|push|diff|install)$/,
        );
        if (match) {
          if (match[2] === "visual-report" && request.method === "GET")
            return json(response, {
              html: await service.visualReport(match[1]),
            });
          if (match[2] === "diff" && request.method === "GET")
            return json(response, await service.diff(match[1]));
          if (request.method === "POST") {
            const input = await body(request);
            if (match[2] === "design-decision")
              return json(response, service.setDesignDecision(match[1], input));
            if (match[2] === "visual-input")
              return json(response, service.saveVisualInput(match[1], input));
            if (match[2] === "prototype-input")
              return json(
                response,
                service.savePrototypeInput(match[1], input),
              );
            if (match[2] === "document")
              return json(response, service.saveDocument(match[1], input));
            if (match[2] === "approve")
              return json(response, service.approve(match[1], input));
            return json(
              response,
              service.start(match[1], match[2], input).task,
              202,
            );
          }
        }
        return json(response, { error: "接口不存在" }, 404);
      }
      if (request.method !== "GET")
        return json(response, { error: "不支持此方法" }, 405);
      const root = resolve(webRoot);
      const file = resolve(
        root,
        "." + decodeURIComponent(path === "/" ? "/index.html" : path),
      );
      if (!file.startsWith(root + sep))
        return json(response, { error: "路径无效" }, 403);
      try {
        const content = await readFile(file);
        response.writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        response.end(content);
      } catch {
        json(response, { error: "页面未构建，请先运行 npm run build" }, 404);
      }
    } catch (error) {
      json(
        response,
        { error: error instanceof Error ? error.message : String(error) },
        400,
      );
    }
  });
}
function serverAddress(request: IncomingMessage) {
  return request.socket.localPort;
}
