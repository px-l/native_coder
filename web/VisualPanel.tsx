import { useEffect, useState } from "react";
import type { Task } from "../server/model";
export function VisualPanel({
  task,
  disabled,
  act,
  download,
  onDirtyChange,
}: {
  task: Task;
  disabled: boolean;
  act: (action: string, data?: unknown) => Promise<boolean>;
  download: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [url, setUrl] = useState(task.visualUrl),
    [selector, setSelector] = useState(task.visualReadySelector);
  useEffect(() => {
    setUrl(task.visualUrl);
    setSelector(task.visualReadySelector);
  }, [task.id, task.visualUrl, task.visualReadySelector]);
  const dirty = url !== task.visualUrl || selector !== task.visualReadySelector;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  if (!task.visualRequired)
    return task.designDecision ? (
      <section className="visual-panel">
        <h3>UIProof 原型比较 · 已跳过</h3>
        <p>{task.designDecision.reason}</p>
        <p className="muted">
          仍需通过项目的测试、类型检查、构建等已配置检查。
        </p>
      </section>
    ) : null;
  const approved = task.prototypes.find(
    (p) => p.id === task.approvedPrototypeId,
  );
  const editable = ["develop", "verify", "commit"].includes(task.stage);
  return (
    <section className="visual-panel" aria-label="UIProof 页面验收">
      <div className="visual-heading">
        <h3>UIProof 页面验收</h3>
        <span
          className={`badge ${task.visual?.status === "passed" ? "blue" : ""}`}
        >
          {task.visual?.status === "passed"
            ? "已通过"
            : task.visual?.status === "failed"
              ? "发现差异"
              : task.visual?.status === "error"
                ? "验收出错"
                : "待验收"}
        </span>
      </div>
      <p className="muted">
        对照已确认原型
        {approved
          ? ` v${approved.version}（${approved.drawing.width} × ${approved.drawing.height}）`
          : ""}
        检查页面。请在当前任务的工作副本启动预览服务。
      </p>
      <label className="field">
        本地预览地址
        <input
          value={url}
          disabled={disabled || !editable}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:3000"
        />
      </label>
      <details>
        <summary>页面就绪条件（可选）</summary>
        <label className="field">
          数据加载完成后出现的元素
          <input
            value={selector}
            disabled={disabled || !editable}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="[data-testid=page-ready]"
          />
        </label>
      </details>
      {editable && (
        <button
          className="secondary"
          disabled={disabled || !dirty || !url.trim()}
          onClick={() => act("visual-input", { url, readySelector: selector })}
        >
          {dirty ? "保存验收设置" : "设置已保存"}
        </button>
      )}
      <p className="muted">
        运行本地验证时，原型图将通过加密连接交给独立 UIProof
        服务，服务器通过临时隧道访问此页面。验收失败或无法连接时不能提交。请使用同源接口代理和测试数据。
      </p>
      {task.visual && (
        <>
          <details>
            <summary>查看差异摘要</summary>
            <pre>{task.visual.summary}</pre>
          </details>
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => void download()}
          >
            下载 HTML 验收报告
          </button>
          <small>
            验收时间：{new Date(task.visual.checkedAt).toLocaleString()}
          </small>
        </>
      )}
      {!task.visual && task.checks.find((c) => c.name === "UIProof MCP") && (
        <pre>{task.checks.find((c) => c.name === "UIProof MCP")?.output}</pre>
      )}
    </section>
  );
}
