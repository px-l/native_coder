import { useEffect, useState } from "react";
import type { Task } from "../server/model";
export function DesignPolicy({
  task,
  disabled,
  act,
  onDirtyChange,
}: {
  task: Task;
  disabled: boolean;
  act: (action: string, data?: unknown) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const mode = task.designDecision?.mode || "generate";
  const complete = task.designDecision?.complete ?? true;
  const reason = task.designDecision?.reason || "";
  const [choice, setChoice] = useState(mode),
    [full, setFull] = useState(complete),
    [note, setNote] = useState(reason);
  useEffect(() => {
    setChoice(mode);
    setFull(complete);
    setNote(reason);
  }, [task.id, mode, complete, reason]);
  const dirty = choice !== mode || full !== complete || note !== reason;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  return (
    <section className="visual-panel">
      <h3>原型与验收策略</h3>
      {task.requirementImage && (
        <details>
          <summary>查看需求图片</summary>
          <div className="reference-preview">
            <img src={task.requirementImage} alt="需求上传图片" />
          </div>
        </details>
      )}
      <p className="muted">
        {task.designDecision
          ? `${mode === "simple" ? "简单需求，不生成原型" : mode === "reuse" ? "复用上传图，不生成新原型" : "生成新原型"}。${task.visualRequired ? "本地验证需进行原型比较。" : "本地验证跳过原型比较，仍运行项目检查。"}`
          : "生成需求初稿后自动判断。未判断时默认生成原型并进行比较；也可在下方明确选择。"}
      </p>
      <label className="field">
        处理方式
        <select
          value={choice}
          disabled={disabled}
          onChange={(e) => {
            setChoice(e.target.value as typeof choice);
            if (e.target.value === "simple") setFull(false);
          }}
        >
          <option value="generate">需要生成新原型</option>
          <option value="simple">简单需求，无需原型</option>
          <option value="reuse" disabled={!task.requirementImage}>
            上传图已明确展示，直接复用
          </option>
        </select>
      </label>
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={full && choice !== "simple"}
            disabled={disabled || choice === "simple"}
            onChange={(e) => setFull(e.target.checked)}
          />{" "}
          原型是可用于验收的完整页面（局部图、批注图或不完整原型取消勾选）
        </span>
      </label>
      <label className="field">
        判断原因
        <textarea
          rows={2}
          value={note}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={disabled || !dirty || !note.trim()}
        onClick={() =>
          act("design-decision", {
            mode: choice,
            complete: choice !== "simple" && full,
            reason: note,
          })
        }
      >
        保存策略
      </button>
    </section>
  );
}
