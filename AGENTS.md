# Native Coder

本项目是独立的本地研发工作台。工作台代码属于 px-l/native_coder；业务代码属于接入项目的原仓库。不要将业务源码复制进本仓库提交。

## 结构与命令

- web/：React + TypeScript 界面。
- server/：Node 24 HTTP、SQLite、流程状态机、Codex CLI 与 Git 执行器。
- tests/：使用临时 Git 仓库验证关键流程，禁止对真实业务仓库运行变更测试。
- npm ci；npm run check；npm start。更改前端后重新 npm run build；npm run dev 启动 TypeScript 后端。

## 不变量

- 当前 kedian 只读；不得改动其代码、提交、推送或部署。
- 默认只读接入项目；已有项目的 Codex 操作在独立 clone 中执行；未绑定仓库的全新项目仅在专用设计目录做只读分析，绝不以源仓库为工作目录。
- 新流程为需求确认 → 原型生成与版本确认 → 方案确认 → 开发。旧任务已在方案或更后阶段时保留进度。验证失败不能提交；验证结果绑定 Git tree。
- Git 提交与推送分离；推送仅写任务分支，不强推、不自动合并、不触发部署。
- 禁止 shell 拼接执行用户输入。检查命令使用参数数组。
- 本地数据、业务工作副本、凭据不得入库。不要记录本机凭据。
- 本地 API 保持 loopback 绑定、Host/Origin 检查和会话令牌校验。

- 新任务的本地验证必须同时通过项目命令和独立 UIProof MCP 页面验收；结果绑定代码树、批准原型和预览配置。UIProof 服务代码和部署文件仅提交 UIProof-MCP 仓库。
