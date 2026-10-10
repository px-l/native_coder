/** A constrained drawing format: model output never becomes executable markup. */
export type Drawing = {
  title: string;
  summary: string;
  width: number;
  height: number;
  background: string;
  elements: {
    kind: "rect" | "text" | "line";
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fill: string;
    fontSize: number;
  }[];
};
export type PrototypeVersion = {
  image?: string;
  id: string;
  version: number;
  revision: number;
  createdAt: string;
  brief: string;
  drawing: Drawing;
  svg: string;
};
const number = { type: "number" };
const string = { type: "string" };
export const drawingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "width", "height", "background", "elements"],
  properties: {
    title: string,
    summary: string,
    width: number,
    height: number,
    background: string,
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "x",
          "y",
          "width",
          "height",
          "text",
          "fill",
          "fontSize",
        ],
        properties: {
          kind: { type: "string", enum: ["rect", "text", "line"] },
          x: number,
          y: number,
          width: number,
          height: number,
          text: string,
          fill: string,
          fontSize: number,
        },
      },
    },
  },
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function renderDrawing(value: unknown): {
  drawing: Drawing;
  svg: string;
} {
  if (!value || typeof value !== "object") throw new Error("原型格式错误");
  const drawing = value as Drawing;
  const range = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const color = (s: unknown) =>
    typeof s === "string" && /^#[a-fA-F0-9]{6}$/.test(s);
  if (
    typeof drawing.title !== "string" ||
    !drawing.title.trim() ||
    drawing.title.length > 200 ||
    typeof drawing.summary !== "string" ||
    !drawing.summary.trim() ||
    drawing.summary.length > 6000 ||
    !range(drawing.width, 320, 1920) ||
    !range(drawing.height, 320, 2400) ||
    !color(drawing.background) ||
    !Array.isArray(drawing.elements) ||
    drawing.elements.length < 1 ||
    drawing.elements.length > 300
  )
    throw new Error("原型尺寸、说明或元素数量不符合要求");
  const nodes = drawing.elements.map((e) => {
    if (
      !e ||
      !["rect", "text", "line"].includes(e.kind) ||
      !range(e.x, 0, drawing.width) ||
      !range(e.y, 0, drawing.height) ||
      !range(e.width, 0, drawing.width - e.x) ||
      !range(e.height, 0, drawing.height - e.y) ||
      !range(e.fontSize, 10, 64) ||
      !color(e.fill) ||
      typeof e.text !== "string" ||
      e.text.length > 200
    )
      throw new Error("原型元素不合法或超出画布");
    if (e.kind === "text")
      return `<text x="${e.x}" y="${e.y}" fill="${e.fill}" font-size="${e.fontSize}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif" dominant-baseline="hanging">${escape(e.text)}</text>`;
    if (e.kind === "line")
      return `<line x1="${e.x}" y1="${e.y}" x2="${e.x + e.width}" y2="${e.y + e.height}" stroke="${e.fill}" stroke-width="1"/>`;
    return `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="6" fill="${e.fill}"/>`;
  });
  return {
    drawing,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}" height="${drawing.height}" viewBox="0 0 ${drawing.width} ${drawing.height}"><title>${escape(drawing.title)}</title><rect width="100%" height="100%" fill="${drawing.background}"/>${nodes.join("")}</svg>`,
  };
}
