import { useEffect, useState } from "react";
import type { Project, Task } from "../server/model";
export function PrototypePanel({
  task,
  project,
  pending,
  act,
}: {
  task: Task;
  project?: Project;
  pending: boolean;
  act: (action: string, data?: unknown) => Promise<boolean>;
}) {
  const [brief, setBrief] = useState(task.prototypeBrief);
  const [reference, setReference] = useState(task.referenceImage);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [comparisonComplete, setComparisonComplete] = useState(
    task.visualRequired,
  );
  const [skipReason, setSkipReason] = useState(
    task.designDecision?.reason || "",
  );
  useEffect(() => {
    setComparisonComplete(task.visualRequired);
    setSkipReason(task.designDecision?.reason || "");
  }, [task.id, task.visualRequired, task.designDecision?.reason]);
  useEffect(() => {
    setBrief(task.prototypeBrief);
    setReference(task.referenceImage);
    setError("");
  }, [task.id, task.prototypeRevision]);
  useEffect(() => {
    setSelected(task.approvedPrototypeId || task.prototypes.at(-1)?.id || "");
  }, [task.id, task.prototypes.length, task.approvedPrototypeId]);
  const version = task.prototypes.find((v) => v.id === selected);
  const editable = task.stage === "prototype";
  const dirty =
    brief !== task.prototypeBrief || reference !== task.referenceImage;
  const disabled = pending || task.busy || reading;
  const src = version
    ? version.image ||
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(version.svg)}`
    : "";
  return (
    <div className="prototype-panel">
      <h3>
        原型设计{" "}
        <span className="badge blue">
          {project?.kind === "new"
            ? "全新项目 · 从零设计"
            : "已有项目 · 延续现有界面"}
        </span>
      </h3>
      <p className="muted">
        {project?.kind === "new"
          ? "根据已确认的需求生成界面布局，无需先创建代码仓库。"
          : "结合仓库中的页面与样式，并参考你提供的截图，设计新增功能。不会修改业务代码。"}
        原型为静态 SVG 图，不包含实际交互。
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {editable && (
        <>
          <label className="field">
            {project?.kind === "new"
              ? "页面范围与视觉偏好（可选）"
              : "参考页面、需要保留的样式与修改意见（可选）"}
            <textarea
              rows={4}
              value={brief}
              maxLength={12000}
              disabled={disabled}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={
                project?.kind === "new"
                  ? "例如：面向产品经理的需求列表，浅色，突出任务进度。"
                  : "例如：参考 /companies 和现有列表组件，在顶部增加行业筛选。"
              }
            />
          </label>
          <label className="field">
            参考界面截图（可选，PNG/JPEG，最大 4MB）
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={disabled}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                if (
                  file.size > 4 * 1024 * 1024 ||
                  !["image/png", "image/jpeg"].includes(file.type)
                ) {
                  setError("请选择 4MB 以内的 PNG 或 JPEG 图片");
                  return;
                }
                setReading(true);
                try {
                  const data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error("图片读取失败"));
                    reader.readAsDataURL(file);
                  });
                  setReference(data);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setReading(false);
                }
              }}
            />
          </label>
          {reference && (
            <div className="reference-preview">
              <img src={reference} alt="提供给原型生成的参考界面" />
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => setReference("")}
              >
                移除参考图
              </button>
            </div>
          )}
          <p className="muted">
            保存后，设计说明和参考图会在生成时交给本机
            Codex。修改输入后，旧版原型需重新生成才能确认。
          </p>
          <div className="action-bar">
            <button
              className="secondary"
              disabled={disabled || !dirty}
              onClick={() =>
                act("prototype-input", { brief, referenceImage: reference })
              }
            >
              保存设计输入
            </button>
            <button
              className="primary"
              disabled={disabled || dirty}
              onClick={() => act("prototype")}
            >
              {task.prototypes.length ? "根据反馈生成新版本" : "生成原型图"}
            </button>
          </div>
        </>
      )}
      {!!task.prototypes.length && (
        <>
          <label className="field">
            原型版本
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {task.prototypes.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.drawing.title}
                  {task.approvedPrototypeId === v.id ? "（已确认）" : ""}
                </option>
              ))}
            </select>
          </label>
          {version && (
            <>
              <div className="prototype-canvas">
                <img
                  src={src}
                  alt={`原型 v${version.version}：${version.drawing.title}`}
                />
              </div>
              <p className="prototype-summary">{version.drawing.summary}</p>
              {editable && (
                <div>
                  <label className="field">
                    <span>
                      <input
                        type="checkbox"
                        checked={comparisonComplete}
                        disabled={disabled}
                        onChange={(e) =>
                          setComparisonComplete(e.target.checked)
                        }
                      />{" "}
                      这是完整页面原型，本地验证时进行原型比较
                    </span>
                  </label>
                  {!comparisonComplete && (
                    <label className="field">
                      跳过比较原因（仍需通过代码检查）
                      <textarea
                        value={skipReason}
                        maxLength={2000}
                        disabled={disabled}
                        onChange={(e) => setSkipReason(e.target.value)}
                        placeholder="例如：仅设计了局部组件，不能作为整页比较基准"
                      />
                    </label>
                  )}
                </div>
              )}
              <div className="action-bar">
                <a
                  className="secondary"
                  href={src}
                  download={`prototype-v${version.version}.${version.image ? (version.image.startsWith("data:image/png") ? "png" : "jpg") : "svg"}`}
                >
                  下载原型图
                </a>
                {editable && (
                  <button
                    className="primary"
                    disabled={
                      disabled ||
                      dirty ||
                      version.revision !== task.prototypeRevision ||
                      (!comparisonComplete && !skipReason.trim())
                    }
                    onClick={() =>
                      act("approve", {
                        versionId: version.id,
                        comparisonComplete,
                        skipReason,
                      })
                    }
                  >
                    确认 v{version.version}，进入技术方案 →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {!task.prototypes.length && (
        <div className="list-empty">
          {editable
            ? "尚未生成原型图。先生成并确认，再进入技术方案。"
            : task.prototypeRequired
              ? "确认需求后进入原型设计。"
              : task.designDecision
                ? `无需生成原型：${task.designDecision.reason}`
                : "此任务创建于原型功能上线前，沿用原流程。"}
        </div>
      )}
    </div>
  );
}
