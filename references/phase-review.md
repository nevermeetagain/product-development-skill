# 阶段复核 PHASE_REVIEW（v0.6.0 / PDS-633）

阶段收口时由**非执行者**（测试者或规划者）做一次复核，顺序固定，前一步不过不进下一步：

1. **合规**：每张卡的提交只碰本卡 `files` 允许路径（`git show --stat <sha>` 对照）；`spec-check` 无 BLOCKING；执行日志有 STARTED → 提交 → PUSHED → DONE。
2. **证伪**：对每张卡的验收，先想“它怎样会是假的”，再找一条能推翻它的证据（换输入、换环境、读真实输出）。找不到推翻证据才算过。执行者自己的 TEST_RUN 只算自测。
3. **质量**：`pd.mjs quality . --changed` 作为信号；可读性、复用、性能问题写成 findings。

## 输出
- 发现写成 JSON（`severity P0–P3、file、line、claim、evidence`），用 `pd.mjs findings-check . --file <json>` 校验并生成 Markdown；**口头发现不算数**。驳回的发现写入 `docs/evidence/findings-rejected.json`（指纹 + 理由），下次自动抑制。
- 两种结束态，只能二选一：
  - `PHASE_REVIEW: PASS`——三步都过，逐卡写 `record --event VERIFIED --by <复核者>`；
  - `PHASE_REVIEW: FINDINGS n`——列出 n 条，不得写“基本通过”。

## 三分流（每条发现必须落到一处）
| 情况 | 去向 |
|---|---|
| 本阶段卡的缺陷（P0/P1） | 原卡记 FAILED 重做，或新开修复卡（卡号永不复用） |
| 需要外部条件才能验证 | 卡记 NEEDS_VALIDATION `--missing "<条件>"`，不算完成 |
| 范围外或 P2/P3 改进 | 进 backlog（新卡 TODO），本阶段不阻塞 |
