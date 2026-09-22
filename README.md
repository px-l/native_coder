# Native Coder

面向开发人员与产品经理的本地研发工作台：需求澄清 → 技术方案 → 开发 → 本地验证 → Git 提交。

工作台自身代码属于本仓库。业务改动在独立工作副本中生成，推送到业务项目原远端的任务分支。当前版本不包含部署功能。

## 启动

需要 Node.js 24、Git，以及已安装并登录的 Codex CLI。业务项目还需要自己的包管理器、运行时和测试依赖。

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

打开 http://127.0.0.1:4317 。服务只监听本机，不提供多人登录或公网访问。

在 `.env` 中设置 `CODEX_BIN` 可指定 Codex 可执行文件；留空使用 PATH 中的 `codex`。如果使用 macOS Codex 桌面应用的内置 CLI，可设置其实际路径。通过 `codex login status` 检查登录，必要时在终端完成 `codex login`。

`NATIVE_CODER_REFERENCE_REPO` 可指定受保护的参考仓库，例如本机 kedian 的路径。该项目始终只读，不能在界面中启用开发、安装依赖、验证、提交或推送。本次交付的本机配置已将 kedian 登记为只读。

## 使用流程

1. **接入项目**：选择已存在且至少有一个提交的本地 Git 仓库根目录。默认只读；需要生成代码的其他项目可勾选允许写入独立副本。接入时读取 `origin` 地址。
2. **新建需求**：选择项目，填写标题和原始需求。点击 Codex 生成初稿，补充澄清答案，保存并确认需求；也可手动填写完整文档。
3. **确认方案**：Codex 在隔离副本中读取代码，输出方案。补充并确认实现范围后进入开发。
4. **开发与验证**：可先安装业务项目依赖，再运行代码生成。检查失败时查看输出，点击继续修复，然后重新验证。需要额外环境变量的业务项目，在工作副本中自行配置，不会复制源目录中的 `.env`。
5. **提交与推送**：查看代码差异，填写提交说明，创建本地提交，再按需推送到 `native-coder/<任务 ID>` 分支。不会自动合并或强推。

每个任务在 `.native-coder/workspaces/` 中创建独立 clone，不通过 worktree 改写原仓库的 Git 管理信息。源仓库必须干净，未提交的代码不会被默默丢弃。提交身份继承源仓库当前解析到的 Git `user.name` 和 `user.email`；缺失时 Git 会明确报错，可在任务副本中配置后重试。

工作台调用 `codex exec`：需求与方案阶段使用只读沙箱，开发阶段使用 workspace-write。不会绕过 Codex 沙箱。模型调用使用现有 Codex 配置与登录；可能产生账户用量。仓库提示与 MCP 等配置应来自受信任的本机环境。

## 检查与状态

- Node 项目自动识别 `lint`、`typecheck`、`test`、`build` 脚本，识别 packageManager 中的 npm / pnpm / yarn。
- 接入时可填写自定义参数数组，例如 `[ { "name": "test", "argv": ["python3", "-m", "pytest"] } ]`。不通过 shell 拼接执行。
- 没有检查命令不能通过验证。所有配置的命令都必须通过。
- 验证绑定 Git tree；新增、删除或修改文件后必须重新验证。
- 提交前检查源 HEAD、暂存树和敏感文件名。推送前再次确认提交及文件状态。
- SQLite 保存需求、方案、执行记录、检查输出、提交标识与推送状态。重启后中断任务会标记失败，避免显示假成功。
- 命令输出有长度上限；Git 差异最多显示 150,000 字符，较大改动请在任务工作副本中进一步审查。

任务工作副本中的检查和依赖安装会执行项目代码，只接入可信仓库。HTTP 层限制 loopback Host、同源请求，并要求本机会话令牌。这是单用户本地工具，不是面向不可信多租户的代码执行沙箱。

## 开发与验证

```sh
npm run check   # lint + 类型检查 + 集成测试 + 构建
npm run dev     # 运行 TypeScript 后端，界面使用 dist/web
npm run build   # 修改界面后重新构建，再刷新浏览器
```

集成测试仅使用临时 Git 仓库与临时裸远端；Codex 模型响应使用测试替身，Git 提交、推送、进程和 HTTP 校验是真实执行。测试不会访问 kedian，也不消耗模型额度。真实模型生成效果仍需在用户授权的可写业务项目中验收。

项目级 Skills 位于 `.agents/skills/`：`$requirement-spec`、`$feature-dev`、`$release-check`。GitHub Actions 在 push/PR 时执行 `npm ci` 与 `npm run check`，无部署步骤。

## 数据与已知边界

- 默认数据目录 `.native-coder/`，可通过 `NATIVE_CODER_DATA` 改为其他绝对路径。停服务后备份整个数据目录即可保留任务和副本。
- `.env`、数据目录、依赖和构建产物不会提交到 Git。
- 不自动克隆远程业务项目，不初始化空业务仓库，不复制未跟踪文件、数据库或 secrets。
- 不自动处理子模块、Git LFS、远端合并冲突，也不自动创建 PR。
- 已确认需求和方案不回退编辑；范围变化创建新需求。
- 仓库只读权限与检查命令在接入时确定，首版不提供修改或删除项目的界面。
- Node 24 内置 SQLite 可能打印 experimental 警告，应用仍正常运行。

Codex 接入参数参考：[官方非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode)。
