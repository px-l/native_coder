# 技术方案

本地单用户应用，React/TypeScript 界面与 Node 24 后端共用一个 loopback 地址。后端使用内置 SQLite 保存任务，调用本机 Codex CLI 和 Git。首版无需 Python 或 LangGraph 服务：六阶段审批流程采用明确状态机即可，避免增加无必要的服务与模型凭据。

## 目录

- `web/main.tsx`：项目接入、需求列表、阶段文档、差异、检查与执行记录。
- `server/http.ts`：同源 HTTP API 与静态资源。
- `server/service.ts`：状态转换、隔离 clone、Codex、检查及 Git 门禁。
- `server/store.ts`：SQLite 记录与中断恢复。
- `server/process.ts`：参数化子进程、输出上限、超时终止。

## 状态转换

`requirements → prototype → plan → develop → verify → commit → done`

- requirements / plan 可保存、重新生成和确认；文档为空不能确认。
- develop 调用 Codex 后进入 verify；生成失败保留错误并允许重试。
- verify 全部检查通过且 tree 未变化后进入 commit；否则留在 verify。
- commit 再检查 tree 与 HEAD，完成本地 Git 提交后进入 done。
- done 中 pushed 独立记录远端状态；失败可重试，不把本地提交当作已推送。
- 单个任务 busy 期间拒绝重复操作，错误及阶段转换持久化。

## 数据

Project：本地路径、origin、只读标记、检查参数数组。
Task：原始需求、需求文档、方案、阶段、隔离副本、基线提交、任务分支、验证 tree、检查结果、日志、提交 SHA、推送状态。

原仓库只用于读取：首次分析创建独立 clone，移除副本 origin，避免模型直接使用远端。所有模型执行都以副本为工作目录。复制源仓库的提交身份，不复制其他本地 Git 配置或未跟踪文件。

## 接口

GET `/api/session` 获取同源本机会话令牌；其他 API 要求 X-Native-Token。
GET `/api/state`、`/api/health`。
POST `/api/projects`、`/api/tasks`。
POST `/api/tasks/:id/document|approve|generate|develop|install|verify|commit|push`。
GET `/api/tasks/:id/diff`。

长操作返回 202，界面轮询持久化结果。进程失败和超时均记录为失败。

## 验证策略

测试替身只替代 Codex 模型调用；临时仓库的 clone、文件修改、命令执行、提交、裸远端推送与 HTTP 请求均为真实操作。业务仓库不参与写入测试。

## 原型阶段

Project 增加 kind（existing/new），全新项目可以暂不绑定路径。Task 增加原型输入、参考图、输入修订号、版本列表与已确认版本 ID。

原型使用只读 Codex CLI、output-schema 和可选 image 参数。`server/prototype.ts` 校验绘图数据并生成 SVG，仅允许矩形、文字、线段、有限坐标和十六进制颜色；文字进行 XML 转义，输出不会作为页面 HTML 执行。确认要求版本修订号与当前输入一致。已确认绘图结构随需求传入方案和开发提示。

新增 POST `/api/tasks/:id/prototype-input`、`/api/tasks/:id/prototype`；approve 在原型阶段接收 versionId。POST `/api/projects/:id/bind` 为全新项目绑定仓库；绑定后失效并重新确认已生成的技术方案。

历史记录读取时补全字段，已有方案及开发任务不回退阶段。需求阶段任务自动采用新流程。
