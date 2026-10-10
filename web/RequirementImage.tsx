import { useState } from "react";
export function RequirementImage({
  value,
  onChange,
  onReading,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onReading: (value: boolean) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <div>
      <label className="field">
        需求图片（可选，PNG/JPEG，最大 4MB）
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            if (
              file.size > 4 * 1024 * 1024 ||
              !["image/png", "image/jpeg"].includes(file.type)
            ) {
              setError("请选择 4MB 以内的 PNG/JPEG 图片");
              return;
            }
            onReading(true);
            try {
              const image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error("图片读取失败"));
                reader.readAsDataURL(file);
              });
              onChange(image);
            } catch {
              setError("图片读取失败，请重试");
            } finally {
              onReading(false);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {value && (
        <div className="reference-preview">
          <img src={value} alt="需求附件预览" />
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            移除图片
          </button>
        </div>
      )}
      <p className="muted">
        可只上传图片，也可补充文字。生成初稿时会将图片交给本机
        Codex，判断是否需要新原型及页面对比。
      </p>
    </div>
  );
}
