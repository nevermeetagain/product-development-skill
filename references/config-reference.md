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
