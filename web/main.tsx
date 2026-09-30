import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Project, Task, Stage } from "../server/model";
import "./style.css";
import { PrototypePanel } from "./PrototypePanel";
const stages: { id: Stage; label: string; hint: string }[] = [
  { id: "requirements", label: "需求澄清", hint: "明确目标与验收标准" },
  { id: "prototype", label: "原型设计", hint: "预览并确认新的界面" },
  { id: "plan", label: "技术方案", hint: "确定实现与改动范围" },
  { id: "develop", label: "开发", hint: "在独立副本中生成代码" },
  { id: "verify", label: "本地验证", hint: "执行项目质量检查" },
  { id: "commit", label: "代码提交", hint: "审查差异并推送分支" },
];
let token = "";
async function api<T>(path: string, data?: unknown): Promise<T> {
  if (!token) {
    const response = await fetch("/api/session");
    token = (await response.json()).token;
  }
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Native-Token": token },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result as T;
}
function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState("");
  const [projectId, setProjectId] = useState("");
  const [view, setView] = useState<"work" | "projects">("work");
  const [newTask, setNewTask] = useState(false);
  const [addProject, setAddProject] = useState(false);
  const [projectKind, setProjectKind] = useState<"existing" | "new">(
    "existing",
  );
  const [bindingProject, setBindingProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [health, setHealth] = useState("正在检查 Codex…");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [tab, setTab] = useState<"document" | "prototype" | "diff" | "events">(
    "document",
  );
  const [diff, setDiff] = useState({
    diff: "",
    files: "",
    branch: "",
    remote: "",
  });
  const task = tasks.find((t) => t.id === selected);
  const project = projects.find((p) => p.id === (task?.projectId || projectId));
  async function refresh() {
    const result = await api<{ projects: Project[]; tasks: Task[] }>("state");
    setProjects(result.projects);
    setTasks(result.tasks);
    setProjectId((prev) => prev || result.projects[0]?.id || "");
  }
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    api<{ codex: string; login: string; error: string }>("health")
      .then((h) =>
        setHealth(
          h.error
            ? "Codex 未就绪 · 检查本机登录"
            : `${h.codex.split("\n").at(-1)} · 已连接`,
        ),
      )
      .catch(() => setHealth("Codex 未连接"));
    const timer = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, []);
  const taskStages =
    task?.prototypeRequired === false
      ? stages.filter((s) => s.id !== "prototype")
      : stages;
  const stage = task?.stage;
  const savedDocument = task
    ? stage === "requirements"
      ? task.requirements
      : task.plan
    : "";
  useEffect(() => {
    setDraft(savedDocument);
    setDirty(false);
  }, [selected, stage, savedDocument]);
  useEffect(() => {
    let active = true;
    setDiff({ diff: "", files: "", branch: "", remote: "" });
    if (tab === "diff" && task?.workspace && !task.busy)
      api<typeof diff>(`tasks/${task.id}/diff`)
        .then((value) => {
          if (active) setDiff(value);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [tab, selected, task?.busy, task?.stage]);
  async function act(action: string, data: unknown = {}) {
    if (!task) return false;
    setPending(true);
    setError("");
    try {
      await api(`tasks/${task.id}/${action}`, data);
      await refresh();
      if (action === "document") setDirty(false);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setPending(false);
    }
  }
  const disabled = pending || task?.busy;
  const readOnly = project?.readOnly;
  const countActive = tasks.filter((t) => t.stage !== "done").length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Native Coder 首页">
          <span className="brand-mark">N</span>
          <span>
            Native Coder<small>研发工作台</small>
          </span>
        </a>
        <div className="space-label">
          工作空间 <span>LOCAL</span>
        </div>
        <button
          className={`nav ${view === "work" ? "active" : ""}`}
          onClick={() => setView("work")}
        >
          <Icon name="grid" />
          需求与交付 <span className="count">{tasks.length}</span>
        </button>
        <button
          className={`nav ${view === "projects" ? "active" : ""}`}
          onClick={() => setView("projects")}
        >
          <Icon name="repo" />
          项目仓库 <span className="count">{projects.length}</span>
        </button>
        <div className="sidebar-title">已接入项目</div>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`project-nav ${project?.id === p.id ? "chosen" : ""}`}
            onClick={() => {
              setProjectId(p.id);
              setSelected("");
              setView("work");
            }}
          >
            <span className="repo-icon">⌘</span>
            <span>
              {p.name}
              <small>
                {!p.path
                  ? "全新项目 · 未绑定仓库"
                  : p.readOnly
                    ? "只读参考"
                    : "允许生成代码"}
              </small>
            </span>
          </button>
        ))}
        {!projects.length && (
          <p className="sidebar-empty">
            接入本地 Git 仓库
            <br />
            开始第一条需求
          </p>
        )}
        <div className="sidebar-bottom">
          <span className="avatar">本</span>
          <div>
            本地工作空间<small>代码与记录保存在本机</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            工作空间 <span>/</span>{" "}
            {view === "projects" ? "项目仓库" : "需求与交付"}
          </div>
          <div className="connection">
            <span className="dot" />
            {health}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">DEVELOPMENT WORKSPACE</div>
              <h1>
                {view === "projects"
                  ? "连接你的业务项目"
                  : "从需求，走向代码。"}
              </h1>
              <p>
                {view === "projects"
                  ? "在独立工作副本中开发，将改动交付到各自的仓库。"
                  : "澄清需求、确认方案，让每一步交付都有依据。"}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                if (view === "projects" || !projects.length)
                  setAddProject(true);
                else setNewTask(true);
              }}
            >
              ＋{" "}
              {view === "projects" || !projects.length
                ? "接入项目"
                : "新建需求"}
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")}>关闭</button>
            </div>
          )}
          {view === "projects" ? (
            <div className="project-grid">
              {projects.map((p) => (
                <section className="project-card" key={p.id}>
                  <div className="card-top">
                    <Icon name="repo" />
                    <span className={`badge ${p.readOnly ? "" : "blue"}`}>
                      {p.kind === "new" ? "全新项目" : "已有项目"} ·{" "}
                      {!p.path ? "待绑定" : p.readOnly ? "只读参考" : "可开发"}
                    </span>
                  </div>
                  <h2>{p.name}</h2>
                  <p className="path">
                    {p.path || "无需仓库即可开始需求澄清和原型设计"}
                  </p>
                  <div className="repo-address">{p.remote || "未配置远端"}</div>
                  {!p.path && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setBindingProject(p);
                        setProjectKind("existing");
                        setAddProject(true);
                      }}
                    >
                      绑定开发仓库
                    </button>
                  )}
                  <div className="check-tags">
                    {p.checks.map((c) => (
                      <span key={c.name}>{c.name}</span>
                    ))}
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setProjectId(p.id);
                      setView("work");
                      setNewTask(true);
                    }}
                  >
                    为此项目创建需求 →
                  </button>
                </section>
              ))}
              {!projects.length && (
                <Empty
                  title="还没有接入项目"
                  detail="接入已有仓库，或创建无需仓库的全新项目。"
                />
              )}
            </div>
          ) : (
            <>
              <div className="metrics">
                <div>
                  <span>需求总数</span>
                  <strong>{tasks.length.toString().padStart(2, "0")}</strong>
                </div>
                <div>
                  <span>进行中</span>
                  <strong>{countActive.toString().padStart(2, "0")}</strong>
                </div>
                <div>
                  <span>已提交</span>
                  <strong>
                    {tasks
                      .filter((t) => t.commit)
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                </div>
                <div className="metrics-note">
                  <Icon name="branch" />
                  <span>
                    每个任务，独立分支
                    <br />
                    <small>通过验证后再提交</small>
                  </span>
                </div>
              </div>
              <div className="work-layout">
                <section className="task-list">
                  <div className="section-title">
                    <h2>需求列表</h2>
                    <span>
                      {
                        tasks.filter(
                          (t) => !projectId || t.projectId === projectId,
                        ).length
                      }{" "}
                      项
                    </span>
                  </div>
                  <label className="sr-only" htmlFor="filter">
                    筛选项目
                  </label>
                  <select
                    id="filter"
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setSelected("");
                    }}
                  >
                    <option value="">全部项目</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {tasks
                    .filter((t) => !projectId || t.projectId === projectId)
                    .map((t) => (
                      <button
                        className={`task-card ${selected === t.id ? "selected" : ""}`}
                        key={t.id}
                        onClick={() => {
                          setSelected(t.id);
                          setTab("document");
                          setError("");
                        }}
                      >
                        <div className="task-meta">
                          <span>REQ-{t.id.slice(0, 4).toUpperCase()}</span>
                          <span>
                            {t.busy
                              ? "执行中"
                              : t.error
                                ? "需处理"
                                : t.stage === "done"
                                  ? "已提交"
                                  : stages.find((s) => s.id === t.stage)?.label}
                          </span>
                        </div>
                        <h3>{t.title}</h3>
                        <p>{t.request}</p>
                        <div className="task-foot">
                          {projects.find((p) => p.id === t.projectId)?.name}
                          <span>
                            {new Date(t.createdAt).toLocaleDateString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </span>
                        </div>
                      </button>
                    ))}
                  {!tasks.filter((t) => !projectId || t.projectId === projectId)
                    .length && (
                    <div className="list-empty">
                      暂无需求
                      <br />
                      <small>从一个明确的小功能开始</small>
                    </div>
                  )}
                </section>
                <section className="detail">
                  {!task ? (
                    <div className="welcome">
                      <div className="welcome-icon">
                        <Icon name="flow" />
                      </div>
                      <h2>把想法变成可交付的改动</h2>
                      <p>新建一条需求，或选择左侧任务继续。</p>
                      <div className="empty-stages">
                        {stages.map((s, i) => (
                          <div key={s.id}>
                            <span>{i + 1}</span>
                            <strong>{s.label}</strong>
                            <small>{s.hint}</small>
                          </div>
                        ))}
                      </div>
                      <button
                        className="primary"
                        onClick={() =>
                          projects.length
                            ? setNewTask(true)
                            : setAddProject(true)
                        }
                      >
                        {projects.length ? "创建第一条需求" : "接入第一个项目"}{" "}
                        →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="detail-heading">
                        <div className="eyebrow">
                          REQ-{task.id.slice(0, 4).toUpperCase()}{" "}
                          <span> / {project?.name}</span>
                        </div>
                        <h2>{task.title}</h2>
                        <div className="detail-badges">
                          <span className="badge blue">
                            {task.busy
                              ? "正在执行…"
                              : task.stage === "done"
                                ? "已创建提交"
                                : stages.find((s) => s.id === task.stage)
                                    ?.label}
                          </span>
                          {readOnly && (
                            <span className="badge">只读参考项目</span>
                          )}
                        </div>
                      </div>
                      <ol className="stepper">
                        {taskStages.map((s, i) => {
                          const current =
                            task.stage === "done"
                              ? taskStages.length
                              : taskStages.findIndex(
                                  (row) => row.id === task.stage,
                                );
                          return (
                            <li
                              key={s.id}
                              className={
                                i < current
                                  ? "complete"
                                  : i === current
                                    ? "current"
                                    : ""
                              }
                            >
                              <span>{i < current ? "✓" : i + 1}</span>
                              {s.label}
                            </li>
                          );
                        })}
                      </ol>
                      {task.error && (
                        <div className="alert error" role="alert">
                          {task.error}
                        </div>
                      )}
                      {readOnly && (
                        <div className="alert info">
                          {!project?.path
                            ? "此全新项目可先澄清需求、设计原型和方案；开发前请在项目仓库页绑定 Git 仓库。"
                            : "此项目可进行需求、原型和方案设计，业务代码生成与提交已禁用。"}
                        </div>
                      )}
                      <div
                        className="tabs"
                        role="tablist"
                        aria-label="任务内容"
                      >
                        <button
                          role="tab"
                          aria-selected={tab === "document"}
                          onClick={() => setTab("document")}
                        >
                          工作内容
                        </button>
                        <button
                          role="tab"
                          aria-selected={tab === "prototype"}
                          onClick={() => setTab("prototype")}
                        >
                          原型图
                        </button>
                        <button
                          role="tab"
                          aria-selected={tab === "diff"}
                          onClick={() => setTab("diff")}
                        >
                          代码差异
                        </button>
                        <button
                          role="tab"
                          aria-selected={tab === "events"}
                          onClick={() => setTab("events")}
                        >
                          执行记录 <span>{task.events.length}</span>
                        </button>
                      </div>
                      <div className="tab-body">
                        {tab === "prototype" ||
                        (tab === "document" && task.stage === "prototype") ? (
                          <PrototypePanel
                            key={task.id}
                            task={task}
                            project={project}
                            pending={pending}
                            act={act}
                          />
                        ) : tab === "events" ? (
                          <div className="timeline">
                            {[...task.events].reverse().map((event, i) => (
                              <article key={i}>
                                <time>
                                  {new Date(event.at).toLocaleString("zh-CN")}
                                </time>
                                <pre>{event.text}</pre>
                              </article>
                            ))}
                          </div>
                        ) : tab === "diff" ? (
                          <>
                            <p className="muted">
                              {diff.remote || project?.remote}
                              <br />
                              {task.branch || "开发后创建任务分支"}
                            </p>
                            <pre className="diff-stat">{diff.files}</pre>
                            <pre className="code-diff">
                              {diff.diff || "暂无代码改动。"}
                            </pre>
                          </>
                        ) : (
                          <>
                            {task.stage === "requirements" ||
                            task.stage === "plan" ? (
                              <>
                                <div className="editor-label">
                                  <h3>
                                    {task.stage === "requirements"
                                      ? "需求说明与验收标准"
                                      : "技术方案与任务拆分"}
                                  </h3>
                                  <span>{dirty ? "未保存" : "已保存"}</span>
                                </div>
                                <p className="muted">
                                  {task.stage === "requirements"
                                    ? "让 Codex 整理初稿，在下方补充澄清答案后确认。"
                                    : "Codex 将结合仓库代码生成方案；确认范围后进入开发。"}
                                </p>
                                <textarea
                                  className="document-editor"
                                  aria-label="阶段文档"
                                  value={draft}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    setDraft(e.target.value);
                                    setDirty(true);
                                  }}
                                  placeholder={
                                    task.stage === "requirements"
                                      ? "目标用户与场景\n\n功能范围\n\n验收标准\n\n异常情况与待澄清问题"
                                      : "实现方案\n\n涉及文件与接口\n\n开发任务\n\n验证方式"
                                  }
                                />
                                <div className="action-bar">
                                  <button
                                    className="secondary"
                                    disabled={disabled || dirty}
                                    onClick={() => act("generate")}
                                  >
                                    ✧ {draft ? "重新生成" : "Codex 生成初稿"}
                                  </button>
                                  <div>
                                    <button
                                      className="secondary"
                                      disabled={
                                        disabled || !dirty || !draft.trim()
                                      }
                                      onClick={() =>
                                        act("document", { content: draft })
                                      }
                                    >
                                      保存文档
                                    </button>
                                    <button
                                      className="primary"
                                      disabled={
                                        disabled || dirty || !draft.trim()
                                      }
                                      onClick={() => act("approve")}
                                    >
                                      确认
                                      {task.stage === "requirements"
                                        ? "需求"
                                        : "方案"}{" "}
                                      →
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="delivery-content">
                                  <h3>
                                    {task.stage === "develop"
                                      ? "方案已确认，准备开发"
                                      : task.stage === "verify"
                                        ? "验证本次代码改动"
                                        : task.stage === "commit"
                                          ? "验证通过，准备提交"
                                          : task.pushed
                                            ? "代码已推送到业务仓库"
                                            : "本地提交已创建"}
                                  </h3>
                                  <p className="muted">
                                    {task.stage === "develop"
                                      ? "Codex 在独立工作副本中执行已确认的方案。源目录保持不变。"
                                      : task.stage === "verify"
                                        ? "运行接入时配置的检查。失败后可让 Codex 根据结果继续修复。"
                                        : task.stage === "commit"
                                          ? "查看代码差异，填写提交说明。提交后可单独推送任务分支。"
                                          : "提交记录保存在当前任务，可查看完整改动与执行过程。"}
                                  </p>
                                  {task.workspace && (
                                    <p className="workspace-path">
                                      工作副本：{task.workspace}
                                    </p>
                                  )}
                                  <div className="checks">
                                    {project?.checks.map((check) => {
                                      const result = task.checks.find(
                                        (c) => c.name === check.name,
                                      );
                                      return (
                                        <details key={check.name}>
                                          <summary>
                                            <span
                                              className={`check-icon ${result?.status || ""}`}
                                            >
                                              {result?.status === "passed"
                                                ? "✓"
                                                : result?.status === "failed"
                                                  ? "×"
                                                  : "○"}
                                            </span>
                                            <strong>{check.name}</strong>
                                            <code>{check.argv.join(" ")}</code>
                                            <span>
                                              {result?.status === "passed"
                                                ? "通过"
                                                : result?.status === "failed"
                                                  ? "失败"
                                                  : "未执行"}
                                            </span>
                                            <small>展开</small>
                                          </summary>
                                          <pre>
                                            {result?.output || "尚无执行输出"}
                                          </pre>
                                        </details>
                                      );
                                    })}
                                  </div>
                                  {task.stage === "commit" && (
                                    <label className="field">
                                      提交说明
                                      <input
                                        value={commitMessage}
                                        onChange={(e) =>
                                          setCommitMessage(e.target.value)
                                        }
                                        placeholder="feat: 描述本次改动"
                                      />
                                    </label>
                                  )}
                                  {task.commit && (
                                    <div className="commit-result">
                                      <span>COMMIT</span>
                                      <code>{task.commit}</code>
                                      <p>{task.branch}</p>
                                      <span className="badge blue">
                                        {task.pushed ? "已推送" : "仅本地提交"}
                                      </span>
                                    </div>
                                  )}
                                  <div className="delivery-actions">
                                    {["develop", "verify"].includes(
                                      task.stage,
                                    ) && (
                                      <>
                                        <button
                                          className="primary"
                                          disabled={disabled || readOnly}
                                          onClick={() => act("develop")}
                                        >
                                          {task.stage === "verify"
                                            ? "让 Codex 继续修复"
                                            : "开始开发"}{" "}
                                          →
                                        </button>
                                        <button
                                          className="secondary"
                                          disabled={disabled || readOnly}
                                          onClick={() => act("install")}
                                        >
                                          安装项目依赖
                                        </button>
                                      </>
                                    )}
                                    {["verify", "commit"].includes(
                                      task.stage,
                                    ) && (
                                      <button
                                        className="secondary"
                                        disabled={disabled || readOnly}
                                        onClick={() => act("verify")}
                                      >
                                        运行本地验证
                                      </button>
                                    )}
                                    {task.stage === "commit" && (
                                      <button
                                        className="primary"
                                        disabled={
                                          disabled ||
                                          readOnly ||
                                          !commitMessage.trim()
                                        }
                                        onClick={() =>
                                          act("commit", {
                                            message: commitMessage,
                                          })
                                        }
                                      >
                                        创建本地提交
                                      </button>
                                    )}
                                    {task.stage === "done" && !task.pushed && (
                                      <button
                                        className="primary"
                                        disabled={
                                          disabled ||
                                          readOnly ||
                                          !project?.remote
                                        }
                                        onClick={() => act("push")}
                                      >
                                        推送到远端任务分支 →
                                      </button>
                                    )}
                                  </div>
                                  <details className="approved-doc">
                                    <summary>查看已确认的需求与方案</summary>
                                    <h4>需求说明</h4>
                                    <pre>{task.requirements}</pre>
                                    <h4>技术方案</h4>
                                    <pre>{task.plan}</pre>
                                  </details>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      {task.busy && (
                        <div className="running" role="status">
                          <span className="spinner" />
                          正在执行，请保持服务运行。完成后自动更新结果。
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </>
          )}
          <footer>
            Native Coder <span>本地优先 · 可审查的每一步</span>
            <span>v0.1</span>
          </footer>
        </main>
      </div>
      {newTask && (
        <Modal title="新建需求" onClose={() => setNewTask(false)}>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setPending(true);
              try {
                const result = await api<Task>("tasks", {
                  projectId: data.get("projectId"),
                  title: data.get("title"),
                  request: data.get("request"),
                });
                await refresh();
                setProjectId(result.projectId);
                setSelected(result.id);
                setTab("document");
                setNewTask(false);
                setView("work");
              } catch (e) {
                setError(String(e));
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="field">
              业务项目
              <select name="projectId" defaultValue={projectId} required>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.readOnly ? "（只读参考）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              需求标题
              <input
                name="title"
                placeholder="例如：为公司列表增加行业筛选"
                required
                maxLength={160}
              />
            </label>
            <label className="field">
              原始需求
              <textarea
                name="request"
                rows={6}
                placeholder="描述使用场景、期望行为与边界情况…"
                required
                maxLength={30000}
              />
            </label>
            <button className="primary full" disabled={pending}>
              创建需求
            </button>
          </form>
        </Modal>
      )}
      {addProject && (
        <Modal
          title={bindingProject ? "绑定开发仓库" : "添加项目"}
          onClose={() => {
            setAddProject(false);
            setBindingProject(null);
          }}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setPending(true);
              setError("");
              try {
                const checks = String(data.get("checks") || "").trim();
                await api(
                  bindingProject
                    ? `projects/${bindingProject.id}/bind`
                    : "projects",
                  {
                    kind: projectKind,
                    name: data.get("name"),
                    path: data.get("path"),
                    readOnly: data.get("writable") !== "on",
                    ...(checks ? { checks: JSON.parse(checks) } : {}),
                  },
                );
                await refresh();
                setAddProject(false);
                setBindingProject(null);
              } catch (e) {
                setError(String(e));
              } finally {
                setPending(false);
              }
            }}
          >
            {!bindingProject && (
              <label className="field">
                项目类型
                <select
                  value={projectKind}
                  onChange={(e) =>
                    setProjectKind(e.target.value as "new" | "existing")
                  }
                >
                  <option value="existing">已有项目：参考原界面设计</option>
                  <option value="new">全新项目：从零设计，无需仓库</option>
                </select>
              </label>
            )}
            <label className="field">
              项目名称
              <input
                name="name"
                defaultValue={bindingProject?.name || ""}
                required={projectKind === "new"}
                placeholder={
                  projectKind === "new"
                    ? "例如：团队需求管理平台"
                    : "项目简称（可选）"
                }
              />
            </label>
            {projectKind === "new" ? (
              <p className="muted">
                先澄清需求并生成新原型，开发前再绑定已初始化且有首个提交的 Git
                仓库。
              </p>
            ) : (
              <>
                <label className="field">
                  仓库绝对路径
                  <input
                    name="path"
                    placeholder="/Users/you/projects/my-app"
                    required
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="writable" />
                  允许在独立副本中生成代码与提交
                </label>
                <p className="muted">
                  不勾选则只允许需求、原型与方案设计。原始工作目录始终不会被修改。
                </p>
                <details>
                  <summary>自定义检查命令（可选）</summary>
                  <p className="muted">
                    默认识别 package.json 的
                    lint、typecheck、test、build。其他项目可填写命令数组。
                  </p>
                  <label className="field">
                    检查配置 JSON
                    <textarea
                      name="checks"
                      rows={4}
                      placeholder={
                        '[{"name":"test","argv":["python3","-m","pytest"]}]'
                      }
                    />
                  </label>
                </details>
              </>
            )}
            <button className="primary full" disabled={pending}>
              {bindingProject
                ? "绑定仓库"
                : projectKind === "new"
                  ? "创建全新项目"
                  : "接入已有项目"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-title">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="关闭对话框">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="welcome">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {name === "grid" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      ) : name === "repo" ? (
        <>
          <path d="M5 3h15v17H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3M3 17h17M8 7h8M8 10h6" />
        </>
      ) : (
        <>
          <circle cx="6" cy="5" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="6" cy="19" r="2" />
          <path d="M6 7v10M18 8c0 7-12 1-12 8" />
        </>
      )}
    </svg>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
