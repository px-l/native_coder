import type { PrototypeVersion } from "./prototype.js";
export type Stage =
  | "requirements"
  | "prototype"
  | "plan"
  | "develop"
  | "verify"
  | "commit"
  | "done";
export type Check = { name: string; argv: string[] };
export type Project = {
  kind: "existing" | "new";
  id: string;
  name: string;
  path: string;
  remote: string;
  readOnly: boolean;
  checks: Check[];
};
export type Event = { at: string; text: string };
export type Task = {
  designDecision?: import("./design-policy.js").DesignDecision;
  requirementImage?: string;
  visualRequired: boolean;
  visualUrl: string;
  visualReadySelector: string;
  visual?: {
    runId: string;
    status: "passed" | "failed" | "error";
    summary: string;
    tree: string;
    prototypeId: string;
    prototypeHash: string;
    url: string;
    readySelector: string;
    checkedAt: string;
  };
  prototypeRequired: boolean;
  prototypeBrief: string;
  prototypeRevision: number;
  referenceImage: string;
  prototypes: PrototypeVersion[];
  approvedPrototypeId: string;
  id: string;
  projectId: string;
  title: string;
  request: string;
  requirements: string;
  plan: string;
  stage: Stage;
  busy: boolean;
  error: string;
  events: Event[];
  createdAt: string;
  workspace: string;
  base: string;
  branch: string;
  verifiedTree: string;
  commit: string;
  pushed: boolean;
  checks: {
    name: string;
    status: "passed" | "failed" | "skipped";
    output: string;
  }[];
};
