import { resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { Store } from "./store.js";
import { Service } from "./service.js";
import { createApp } from "./http.js";
import { acquireLock } from "./lock.js";
import { stopProcesses } from "./process.js";
const directory = resolve(process.env.NATIVE_CODER_DATA || ".native-coder");
const release = acquireLock(directory);
process.on("exit", release);
const store = new Store(directory);
const reference = process.env.NATIVE_CODER_REFERENCE_REPO
  ? await realpath(process.env.NATIVE_CODER_REFERENCE_REPO)
  : "";
const service = new Service(
  store,
  undefined,
  undefined,
  reference ? [reference] : [],
);
if (reference) {
  const existing = store.projects().find((p) => p.path === reference);
  if (existing) {
    existing.readOnly = true;
    store.saveProject(existing);
  } else await service.addProject({ path: reference, readOnly: true });
}
const server = createApp(service, resolve("dist/web"));
const port = Number(process.env.PORT || 4317);
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Native Coder: http://127.0.0.1:${port}\n`),
);

function shutdown() {
  stopProcesses();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
