// Explicit live integration check. Never runs as part of the offline test suite.
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { verifyUIProof } from "../server/uiproof.js";
import path from "node:path";
let broken = false;
const page = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<html><style>html,body{margin:0;background:white}.box{position:absolute;left:32px;top:32px;width:120px;height:80px;background:${broken ? "#ff0000" : "#0055cc"}}</style><div class="box"></div></html>`,
  );
});
await new Promise<void>((resolve) => page.listen(0, "127.0.0.1", resolve));
const addr = page.address();
if (!addr || typeof addr === "string") throw new Error("Missing local port");
const request = {
  url: `http://127.0.0.1:${addr.port}`,
  readySelector: ".box",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320"><rect width="400" height="320" fill="white"/><rect x="32" y="32" width="120" height="80" fill="#0055cc"/></svg>',
  width: 400,
  height: 320,
  taskId: "uiproof-deployment-smoke",
  prototypeId: "approved-fixture",
  tree: "a".repeat(40),
};
const directory = path.resolve(
  process.env.NATIVE_CODER_DATA || ".native-coder",
  "uiproof-smoke",
);
await mkdir(directory, { recursive: true });
try {
  for (const [name, change, expected] of [
    ["baseline", false, "passed"],
    ["regression", true, "failed"],
    ["repaired", false, "passed"],
  ] as const) {
    broken = change;
    const result = await verifyUIProof(request);
    await writeFile(path.join(directory, name + ".html"), result.html);
    console.log(
      JSON.stringify({
        step: name,
        status: result.status,
        runId: result.runId,
        report: path.join(directory, name + ".html"),
      }),
    );
    if (result.status !== expected)
      throw new Error(
        `${name}: expected ${expected}, received ${result.status}\n${result.summary}`,
      );
  }
} finally {
  await new Promise<void>((resolve) => page.close(() => resolve()));
}
