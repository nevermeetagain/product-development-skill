# 权威路径与目录

## config.json 是唯一的路径映射
`.product-development/config.json` 的 `paths` 指明：rules、decision_index、decision_dir、master_plan、task_index、task_cards、test_ledger、evidence、run_logs、prompts。脚本和模型都只从这里找文件。

## 旧项目接入（不搬家）
1. 只读盘点：现有 AGENTS.md/CLAUDE.md、docs 结构、各版本规划目录、任务索引、决策台账、证据目录。
2. 选定**一个**当前有效的任务索引和**一个**决策登记册作为权威；其余历史版本目录保持只读，作为历史证据。
3. 旧任务若需进入新索引，保留原 ID；若原 ID 冲突，新 ID + `legacy_ids`。不批量改号。
4. 写 config.json，跑 `pd.mjs health`，把不一致列成清单交规划者处理。

## 新项目最小结构（示例，可改）
```
AGENTS.md
.product-development/config.json
docs/decisions/decision-index.json + DEC-xxxx.md
docs/plan/master-plan.md
docs/plan/task-index.json
docs/plan/tasks/<ID>.md
docs/plan/runs/<ID>.jsonl
docs/evidence/test-ledger.json + <ID>/...
```
领域（前端/后端/性能）用任务的 `areas` 标签表达，不做一级目录；一张卡只存一份。

## ID 规则
- 任务：`<阶段>-<序号>`（如 T140-30）。下发后不改号、不复用。
- 决策：`DEC-<4位>`，全项目递增。
- 测试台账：`TR-<时间戳>-<目标>`，脚本生成。
- 规划版本：`PLAN-R<n>`，每次 REPLAN 递增；任务索引记录当前版本。

## 谁写什么
- 规划者：master_plan、任务索引结构（增删卡、依赖、验收）、决策登记册。
- 执行助手：本卡 `status/execution`、本卡执行日志。
- 测试助手：测试台账、本卡 VERIFIED/FAILED、证据目录。
并发写同一个 JSON 时以 rebase 后重放为准，冲突交规划者。
