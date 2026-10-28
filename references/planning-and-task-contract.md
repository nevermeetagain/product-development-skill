# 规划与任务卡契约

## 任务索引条目（task-index.json）
必填：id、title、phase、role（planner/executor/tester）、status、detail（READY/REFINE_BEFORE_EXECUTION）、depends_on、acceptance。
建议：requirements、decisions、source、objective、areas、priority、allowed_paths、forbidden_paths、tests.targeted、card、risk、legacy_ids。
追踪：execution{started_at, actor, commits[], branch, pushed, evidence[], no_change_reason}、blocked_reason、superseded_by。

## 验收必须可判定
每条 acceptance：`{id, desc, check}`，check 三选一：
- `command`：可运行的命令，退出码 0 即通过（行为测试，不是 grep 源码）。
- `measure`：`method`（同环境、交错 A/B 等）+ `threshold`。
- `manual`：说明人工核对什么、证据放哪。
“代码看起来对”“已实现”不是验收条件。

## 任务卡正文（tasks/<ID>.md）
目标 / 来源（E1）/ 前置与依赖 / 修改边界 / 实施步骤或“执行前细化”说明 / 验收 / 定向测试 / 风险与停止条件 / 交付物。正文只写本卡需要的；全局规则引用 AGENTS.md，不复制。

## 性能与探索类卡模板
| 字段 | 内容 |
|---|---|
| 目标 | 验证 X 是否改善 Y |
| 原始假设 | X 是瓶颈 |
| 基线 | 开工实测，不预填 |
| 方法 | 同环境、交错 A/B、样本数 |
| 继续条件 | 实测支持假设且风险可接受 |
| 停止条件 | 无可复现改善，或收益不足以抵消风险 |
| 停止后 | 写 ADR/决策，规划者取消或改向后续卡 |

## 规划完成检查
需求全覆盖；每卡有来源、依赖、可判定验收；无重复与环；阻塞只传播到下游；每阶段有 tester 体检卡；最终回归卡存在；`pd.mjs health` 通过；记录 plan_version 与基线提交。
