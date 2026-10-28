# 测试分层与复用

| 层 | 谁 | 何时 | 范围 |
|---|---|---|---|
| T1 定向 | 执行助手 | 每张有代码改动的卡 | 改动直接相关的单测/卡面命令 |
| T2 阶段体检 | 测试助手 | 阶段所有卡 DONE | 本阶段改到的模块 + 关键路径；前端含 tsc、build |
| T3 集成 | 测试助手 | 共享契约/数据模型/跨阶段路径变化 | 受影响边界 |
| T4 全量回归 | 测试助手 | 开发全部完成或发版前 | 项目定义的完整回归、构建、安全检查 |
门禁（gates）属于 T2–T4，归测试助手。

## 测试台账（test-ledger.json）
每条：id、at、scope(task/phase/final)、kind(targeted/phase_review/integration/regression/gate)、target、result、commit、covers_paths、fingerprint、commands、evidence、covers_tasks、tester。
用 `pd.mjs test-record` 写入，指纹 = 覆盖路径在 HEAD 的 git 对象哈希摘要。

## 复用规则（未改需求和代码不重测）
运行 `pd.mjs test-plan [--phase P]`：
- 覆盖路径指纹不变且关联决策未变 → **复用**，不重测；
- 指纹变化 / 决策被替代 → 重测；
- 从未测过、上次 FAIL → 测。
例外（可以重测）：用户明确要求、发版前最终回归（可按项目策略复用 T2 结果，但需在报告里写明复用了哪些）、环境/依赖版本变化（把 lockfile 加入 covers_paths 即可自动触发）。
covers_paths 要写全：被测源码 + 测试文件 + 相关配置/lockfile。写少了会误复用。

## 纪律
- 未执行不得写 PASS；跑不了写 UNKNOWN 和原因。
- grep 源码只能当辅助检查，不能当行为验收。
- 测试失败：登记 FAIL + 证据 → 规划者排修复卡；无关任务继续。
