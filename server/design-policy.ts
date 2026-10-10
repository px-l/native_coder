import { imageSize } from "image-size";
import { z } from "zod";
import type { PrototypeVersion } from "./prototype.js";

export const decisionSchema = z
  .object({
    mode: z.enum(["simple", "reuse", "generate"]),
    complete: z.boolean(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type DesignDecision = z.infer<typeof decisionSchema>;
export const requirementsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requirements", "mode", "complete", "reason"],
  properties: {
    requirements: { type: "string" },
    mode: { type: "string", enum: ["simple", "reuse", "generate"] },
    complete: { type: "boolean" },
    reason: { type: "string" },
  },
};
export function validateImage(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 5600000)
    throw new Error("需求图片仅支持 4MB 以内的 PNG/JPEG");
  const match = value.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) throw new Error("需求图片格式无效，仅支持 PNG/JPEG");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 4 * 1024 * 1024 || bytes.toString("base64") !== match[2])
    throw new Error("需求图片内容无效或超过 4MB");
  try {
    const size = imageSize(bytes);
    if (
      size.type !== (match[1] === "jpeg" ? "jpg" : "png") ||
      !size.width ||
      !size.height ||
      size.width * size.height > 16000000
    )
      throw new Error("invalid");
  } catch {
    throw new Error("需求图片内容无效或尺寸过大（最多 1600 万像素）");
  }
  return value;
}
export function baseline(version: PrototypeVersion) {
  return version.image
    ? Buffer.from(version.image.split(",")[1], "base64")
    : Buffer.from(version.svg);
}
export function imageDimensions(image: string) {
  return imageSize(Buffer.from(image.split(",")[1], "base64"));
}
