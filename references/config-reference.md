# config.json 字段说明（`.product-development/config.json`）

脚本和模型只从这里找文件；它是“全局规划放在哪”的唯一答案。`pd.mjs health` 会检查每个路径是否存在、ID 是否唯一、引用是否闭合。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema` | 是 | `product-development/config@2` |
| `paths.rules` | 是 | 项目规则文件（AGENTS.md） |
| `paths.task_index` | 是 | **唯一**任务索引（JSON 或 Markdown 表格） |
| `paths.decision_index` | 是 | **唯一**决策登记册（JSON 或 Markdown 表格） |
| `paths.test_ledger` | 是 | 测试台账 JSON（不存在时首次 test-record 自动创建） |
| `paths.decision_dir` / `task_cards` / `run_logs` / `evidence` / `prompts` / `master_plan` | 否 | 决策正文、任务卡、执行日志、证据、提示词、主计划 |
| `paths.requirements` / `glossary` / `product` | 否 | 需求、术语、产品文档（见 doc-system.md 分级） |
| `paths.project_structure` | 否（做过 STRUCTURE 则必填） | 结构文档，默认 `docs/architecture/project-structure.md`；已有项目指向现有结构/基线文档 |
| `paths.contracts` | 否 | 契约唯一源目录，如 `packages/contracts` 或 OpenAPI 文件所在目录 |
| `paths.migrations` | 否 | 迁移目录，如 `apps/api/prisma/migrations`；无持久 schema 不填 |
| `decision_sources` | 否 | 额外 ADR 目录：`[{dir, id_pattern}]` |
| `dependency_satisfied_by` | 否 | 依赖满足的状态，默认 `["DONE","VERIFIED"]`；严格项目用 `["VERIFIED"]` |
| `git.main_branch` | 否 | 默认 `main` |
| `git.push_main` | 否 | `true`=主线模式（单执行助手线性开发，推荐默认）；`false`=分支模式（多助手并行，下游卡等前置提交合入 main，`pd.mjs sync --merge` 快进合并） |
| `git.task_branch_pattern` | 否 | 默认 `task/{id}` |
| `replan.max_commits_since_baseline` | 否 | 距规划基线多少个提交提示重做快照，默认 30 |
| `formats.task_index` | 否 | 老项目 Markdown 表格：`columns`（id/title/depends_on/status/phase/owner/condition 对应的中文表头）、`status_map`（中文状态前缀→标准状态）、`status_write`（写回模板，支持 `{commit}` `{reason}`）、`cards_dir`、`plan_version` |
| `formats.decision_index` | 否 | `columns`、`default_status`、`open_pattern`（行文本匹配则视为 OPEN），`sources: [{path, id_column, title_column, id_pattern, default_status}]` 可把多个文件（如总台账 + 本版待裁决清单）合并读取 |

## 约定（评测中发现容易猜错的点）
- 新增键全部可选，旧 config 不用改；`health` 对不存在的路径只提醒（`task_index`/`decision_index` 除外）。已有 ADR 系列用 `decision_sources` 收编，不另起 DEC。
- 需求文档放 `paths.requirements`（默认 `docs/requirements/REQ-xxx.md`）；没有就在 BOOTSTRAP 时建。
- 阶段体检卡 ID：`<阶段>-90`；最终回归卡：`T999-01`（或项目已有约定）。
- “依赖未完成”不是 BLOCKED，只是未就绪：`next` 不会选它，`prompt` 拒绝生成；BLOCKED 专指需要裁决/外部条件。
- 产品方向、需求范围、安全权限、数据不可逆、公共契约的取舍归用户；其余规划者可裁决并记 `decided_by: planner`。
- 只改了留痕文件也要提交并同步（`chore(<ID>): 留痕`）。
- 金额、时间、单位等口径属于项目契约，规划时写进契约或决策，执行助手不得自定。

## Windows 注意事项（与 Ubuntu/macOS 的差异）
- **运行环境**：Node.js 18+（`node --version`）；Git for Windows（`git` 需在 PATH，`Get-Command git` 可查）。找不到 git 时 `health` 会提醒并跳过提交/指纹检查。
- **路径**：config 里的路径写 `/`（`docs/plan/task-index.json`）；写成 `docs\plan\...` 也能读，但脚本写回的 `covers_paths`、`evidence`、`card`、`file` 一律存为 POSIX `/`，保证 Windows 与 Linux 共用同一份台账。
- **换行与 BOM**：仓库 `.gitattributes` 规定 md/json/mjs/js/sh/yml 为 LF、ps1/cmd/bat 为 CRLF。脚本读 JSON/Markdown 时容忍 CRLF 和 UTF-8 BOM；Markdown 表格回写只改目标单元格，保留原换行与 BOM；JSON 写回保持原换行。
- **测试指纹**：用 `git rev-parse <提交>:<路径>` 的对象哈希，内容是 Git 规范化后的版本，`core.autocrlf=true` 的 Windows 工作区与 Linux 算出相同指纹；路径先转 `/` 再排序。
- **大小写**：NTFS/APFS 默认不区分大小写，Git 区分。`--paths` 大小写与 Git 记录不一致时指纹记为 missing（`test-record`/`TEST_RUN` 会提醒），任务卡路径大小写不一致时 `health` 提醒。
- **写盘**：台账/索引先写临时文件再改名；文件被编辑器或杀毒软件短暂占用（EPERM/EBUSY）时自动退避重试，最后退回直接覆盖，不会留下 `.tmp`。
- **中文输出**：Windows Terminal / conhost 直接显示正常；PowerShell 5.1 捕获到变量或管道时会按 OEM 代码页（936）解码，先执行 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`，cmd 执行 `chcp 65001`。Git 中文文件名按 UTF-8 原样处理（脚本内部固定 `core.quotepath=false`）。
- **`--cmd` 的引号**：脚本只登记、不执行命令。PowerShell 5.1 向原生程序传含双引号的参数会被拆坏，外层用单引号：`--cmd 'npm test -- --grep "price"'`；cmd 里用双引号。`npm`/`npx` 在 Windows 是 `npm.cmd`，若自己写脚本调用请用 `shell: true` 或显式 `npm.cmd`。
- **Skill 检测路径**（`templates/skills-registry.json` 的 `detect_paths`）：`~` = `os.homedir()`（Windows 为 `%USERPROFILE%`）；支持 `%VAR%`、`$VAR`、`${VAR}`、`*`、`**`（最多下探 6 层）；`cmd:<名字>` 在 PATH 中查找（Windows 按 PATHEXT 识别 `.cmd/.exe`）。`~/.claude/…` 额外检查 `CLAUDE_CONFIG_DIR`，`~/.codex/…` 额外检查 `CODEX_HOME`。Windows 上 `pd.mjs skills` 优先输出 `generic_install_windows` 的 PowerShell 安装命令。
- **安装脚本**：`install.ps1`（PowerShell 5.1/7，`-Target -Force -Dir`）、`install.cmd`（cmd 转调）、`install.sh`（`[claude|codex|both] --force --dir`）行为一致；`install-user.ps1` 保留为旧入口。
