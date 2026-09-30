import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Project, Task } from "./model.js";
export class Store {
  db: DatabaseSync;
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "workbench.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(kind,id))",
    );
    for (const task of this.tasks())
      if (task.busy) {
        task.busy = false;
        task.error = "上次执行因服务停止而中断，请检查记录后重试。";
        task.verifiedTree = "";
        if (task.stage === "commit") task.stage = "verify";
        this.saveTask(task);
      }
  }
  private list<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as { body: string }[]
    ).map((row) => JSON.parse(row.body) as T);
  }
  projects() {
    return this.list<Project>("project").map((project) => ({
      ...project,
      kind: project.kind || "existing",
    }));
  }
  tasks() {
    return this.list<Task>("task").map((task) => ({
      ...task,
      prototypeBrief: task.prototypeBrief ?? "",
      prototypeRevision: task.prototypeRevision ?? 0,
      referenceImage: task.referenceImage ?? "",
      prototypes: task.prototypes ?? [],
      approvedPrototypeId: task.approvedPrototypeId ?? "",
      prototypeRequired:
        task.prototypeRequired ?? task.stage === "requirements",
    }));
  }
  project(id: string) {
    const item = this.projects().find((p) => p.id === id);
    if (!item) throw new Error("项目不存在");
    return item;
  }
  task(id: string) {
    const item = this.tasks().find((t) => t.id === id);
    if (!item) throw new Error("任务不存在");
    return item;
  }
  saveProject(project: Project) {
    this.save("project", project);
  }
  saveTask(task: Task) {
    this.save("task", task);
  }
  private save(kind: string, value: { id: string }) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      )
      .run(kind, value.id, JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}
