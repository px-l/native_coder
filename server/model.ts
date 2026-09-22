export type Stage =
  "requirements" | "plan" | "develop" | "verify" | "commit" | "done";
export type Check = { name: string; argv: string[] };
export type Project = {
  id: string;
  name: string;
  path: string;
  remote: string;
  readOnly: boolean;
  checks: Check[];
};
export type Event = { at: string; text: string };
export type Task = {
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
  checks: { name: string; status: "passed" | "failed"; output: string }[];
};
