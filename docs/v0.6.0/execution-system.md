# PDS v0.6.0 可执行体系（基于真实代码，2026-11-02 21:45 CST）

> 本文件取代 `executor-prompts.md`（用户 21:39 指示：本任务无助手，由 Hark 独立完成并测试）。卡面细则仍以 `plan.md` 为准；本文件补充代码穿透发现、新增卡、原子步与证据链要求。

## 0. 事实基线（E3：均为本次实际命令输出）

| # | 事实 | 证据 |
|---|---|---|
| 0.1 | main = `e400380`（P1 提交），父 `3a96739`（v0.5.1） | `git push` 输出 `3a96739..e400380 HEAD -> main`；`git log origin/main -1` |
| 0.2 | self-test 基线 116 通过 0 失败（含 P1 的 pd.mjs 改动） | `node scripts/self-test.mjs` → `结果：116 通过，0 失败`，EXIT=0 |
| 0.3 | 规模：pd.mjs 786 行、lib.mjs 401、quality.mjs 464、self-test.mjs 458；references 19 个文件 | `wc -l` |
| 0.4 | SKILL.md 118 行（目标 ≤150） | `wc -l SKILL.md` |
| 0.5 | 退出码约定（现状）：1 health 有错、2 die、3 next 无就绪 / sync 失败、4 prompt 未就绪、5 ask-check 命中 DECIDED | pd.mjs:199、lib:24、345、604、365、741 |

## 1. 代码穿透发现（每条：现象 → 证据 → 影响 → 处置卡）

| # | 维度 | 现象 | 证据（文件:行） | 影响 | 处置 |
|---|---|---|---|---|---|
| F1 | 逻辑/配置 | `sync --push` 在远程领先时自动 `git rebase`，与用户“不 rebase”规则冲突 | pd.mjs:617 `git(r, ['rebase', up])` | 多人直推 main 时会改写本地提交，执行日志里记的 sha 失效（health 的“提交找不到”即此来源） | **新卡 614** |
| F2 | 逻辑 | 停摆检测只看“无就绪 + 无进行中”，有就绪卡无人认领检测不到 | pd.mjs:697 | BotHot V0.35 的 hark 5 张就绪卡 0 事件数小时无告警 | 612 |
| F3 | 数据 | 没有 owner 概念；markdown 有 `col.owner` 但 JSON 卡、`status`、`next` 都不读 | lib:232；pd.mjs:229-245 | 无法按 owner 聚合停滞 | 612 |
| F4 | 数据/存储 | 事件白名单无 CLAIM/HEARTBEAT/CHECKPOINT/RULING/REASSIGN；`STARTED` 已存在 | lib:16-17 | 裁决与断点只能写 NOTE，无法检索 | 611（复用 STARTED，不新增 START） |
| F5 | 逻辑 | 只渲染 allowed/forbidden，不校验测试路径 ⊆ 允许路径 | pd.mjs:284-286 | BotHot 136/126 共享 spec 文件未被发现 | 621/622 |
| F6 | 逻辑 | 执行者可直接写 VERIFIED（只要台账有 PASS，执行者自己的 TEST_RUN 也算） | pd.mjs:421-422、436-438 | 自证完成 | 631 |
| F7 | 数据 | TEST_RUN 不记 exit_code/duration；`--result PASS` 由调用者自填 | pd.mjs:431-438 | 未执行也能写 PASS（仅靠 --cmd 存在） | 631 |
| F8 | 安全 | 泄露文件只认 .env/dump/sql.gz，不认 .pem/.key/助手记忆目录；无秘密白名单 | pd.mjs:203-206；lib:19-22 | Aidean dump 能报，密钥文件与 D-EXEC-019 类误报无法处理 | 651 |
| F9 | 性能 | `readyTasks` 对每张就绪卡递归扫描全部任务算下游数，O(R·N²) 级；`blockers` 每次重建 taskMap/decisionMap | pd.mjs:210-211、237-242 | 60 卡可接受，600 卡会明显变慢；status/next/replan 重复计算 | **新卡 654** |
| F10 | 性能/资源 | `sync` 中 `fetch` 最多 3 次（612、remoteContains×1、record→PUSHED 内 remoteContains） | pd.mjs:590、612、404 | 慢网络下推送核对慢 3 倍 | 654 |
| F11 | 复用/拓展 | 所有命令挤在 pd.mjs 一个文件，热点冲突；self-test 无 `--filter`，只能全量跑 | pd.mjs:39；self-test 全文 | 违背“每卡只跑定向测试”；新增命令都改同一文件 | **新卡 600** |
| F12 | 响应/知识库 | 大输出无预算；新会话只能通读文档 | 无对应代码 | 上下文浪费 | 641–644 |
| F13 | 交互 | `next` 无就绪时只列前 30 张，未区分“等前置 / 等决策 / 无人认领” | pd.mjs:342-345 | 用户看不出卡在哪 | 612 |

不适用维度（辩证说明）：本仓库无前端页面与服务端，“前端/组件”对应 CLI 输出格式与模板，“后端”对应 pd.mjs 子命令，“存储”对应 JSON/JSONL 文件；不引入数据库、常驻进程（plan.md §七-5）。

## 2. P1 反省（已推送 e400380，但验收未全部满足）

| 验收项 | 状态 | 证据 / 缺口 | 补救 |
|---|---|---|---|
| 601-1 SKILL.md ≤150 行 | 满足 | 118 行 | — |
| 601-2 rule-map 无未处理行 | 满足 | `docs/v0.6-rule-map.md` 覆盖 §0 四条 + §0.1 十三条 | — |
| 601-3 self-test 结构用例 / `--filter` | **未满足** | self-test 无 `--filter` | 600 |
| 602 prompt 首行含“已路由”+ 自测 1 项 | **部分**：标记在第 4 行而非首行，且无自测 | pd.mjs:257 | 600-4 补自测，标记位置改为紧随标题 |
| 603 URL 经 web_fetch 200 | **未满足**：未逐个核验 | — | 603b |

## 3. 可执行体系（阶段 → 卡 → 原子步 → 验收；四级编号）

约定：每卡一提交直推 main；每卡只跑 `self-test --filter <标签>`；阶段末跑一次全量；每卡完成写“证据链 + 反省”（§4）。

### P0 地基（先做，解除 F11）
- **600 self-test 过滤与命令模块化**
  - 600.1 self-test 每段加标签，`--filter a,b` 只跑匹配段；无参数行为不变。
  - 600.2 新命令放 `scripts/cmd/<name>.mjs`，导出 `run(ctx)`；pd.mjs 只加分发一行。ctx = { ws, args, root, helpers }。
  - 600.3 把 `blockers/readyTasks/buildPrompt` 依赖的 helpers 暴露给 ctx（不搬迁旧代码，避免大改）。
  - 600.4 补 602 自测：prompt 输出前 3 行含“已路由”。
  - 验收：`--filter 体检` 只跑第 1 段且通过；全量仍 116+1。
- **603b 生态表 URL 核验**：逐个 web_fetch，写核验日期；失败的标“未核实”。

### P2 账本与停滞
- **611 事件扩展**
  - 611.1 EVENTS 增加 CLAIM、HEARTBEAT、CHECKPOINT、RULING、REASSIGN。
  - 611.2 必填：CHECKPOINT 需 --learned 与 --next；RULING 需 --decision、--reason、--cost；CLAIM 需 --by。
  - 611.3 CLAIM 写 `execution.owner`；STARTED 未声明 owner 时以 --by 补。
  - 验收：合法写入 3 项、缺字段拒绝 2 项、秘密拦截 1 项。
- **612 停滞检测**
  - 612.1 owner 来源优先级：task.owner → execution.owner → config.owners[role] → 未分配。
  - 612.2 最后事件时间 = 该卡 jsonl 最后一行 `at`；无日志则取 task-index 的 `ready_since` 或文件提交时间（git log -1 索引文件）。
  - 612.3 规则 UNCLAIMED_STALL（就绪且距最后事件 > stall_minutes）、SILENT_STALL（IN_PROGRESS 且超时）；`PD_NOW` 环境变量可注入时间（测试用）。
  - 612.4 `status` 首行先报停滞并按 owner 聚合；`replan-check` 新增“停滞”项；`next` 无就绪时分三类原因。
  - 验收：BotHot 形态 fixture（5 就绪、0 事件、+11 分钟）报 5 条 UNCLAIMED_STALL 且聚合为 1 行；SILENT_STALL 1 项；未超时不报 1 项。
- **613 重派**
  - 613.1 `reassign --task X --to Y [--note]` 写 REASSIGN，统计前任 FAILED/BLOCKED 次数与 RULING 中的排除项。
  - 613.2 buildPrompt 增“前任记录”段。
  - 验收：重派后 prompt 含失败计数 1 项、owner 改变 1 项。
- **614 sync 不再 rebase**（F1）
  - 614.1 远程领先时：默认 `merge --no-edit`（不改写历史），冲突则 `merge --abort` 并记 PUSH_FAILED；`config.git.on_behind` 可设 `fail`。
  - 614.2 文档 `execution-and-git.md` 同步。
  - 验收：本地裸仓库模拟远程领先，推送后本地提交 sha 不变 1 项；冲突时中止 1 项。

### P3 卡面自洽
- **621 files 结构**：621.1 卡与模板增 `files{create,modify,test,read}`；621.2 有 files 时 allowed = create∪modify∪test；621.3 旧字段兼容。验收：旧样例 health 不变；prompt 显示 files 1 项。
- **622 spec-check**：622.1 test⊆allowed；622.2 跨 owner 文件重叠；622.3 read 输入来源；622.4 DEC 存在；622.5 迁移号唯一（`migrations/NNNN_` 前缀）；622.6 占位语；622.7 退出码 0/1/3。验收：BotHot 126/136 形态报出；8 项自测。
- **623 builder check 协议**：planner-protocol 加一节 + 示例。

### P4 完成与验证
- **631 完成三态**：631.1 执行者写 VERIFIED 被拒（role=executor 且 --by 非 tester）；631.2 NEEDS_VALIDATION 状态需 --missing；631.3 TEST_RUN 增 `--exit-code`，非 0 不得写 PASS；631.4 证据 `--where local|target`。验收 5 项。
- **632 findings**：schema + `findings-check <json>`：非法丢弃计数、rejected 指纹抑制、Markdown 只由 JSON 生成。验收 4 项。
- **633 PHASE_REVIEW 协议**：合规 → 证伪 → 质量；两种结束态；三分流。文档 + 示例。

### P5 上下文经济
- **641 digest**：五种日志格式解析；摘要 ≤1 KB。验收 6 项。
- **642 brief**：P1 永不截断，≤2 KB。验收 4 项（含 60 卡 fixture）。
- **643 index/show/outline**：outline 仅 ≥32 KB 生效。验收 4 项。
- **644 ask-check 扩展**：检索 RULING/CHECKPOINT。验收 2 项。

### P6 卫生、档位、性能
- **651 泄露与白名单**：.pem/.key/记忆目录；`secret_allowlist{path,fingerprint,reason}`。验收 4 项。
- **652 profile + doctor**：dev/release 退出码不同。验收 3 项。
- **653 执行纪律补丁**：失败阶梯写入 playbooks；record 增 `--not-checked`、`--risks`、`type:deferral` 需 `--trigger`。验收 2 项。
- **654 性能**（F9/F10）：654.1 下游计数改为一次反向图 + 记忆化；654.2 taskMap/decisionMap 每次命令只建一次；654.3 sync 内 fetch 只做一次。验收：600 卡合成 fixture 上 `status` 耗时记录前后对比；结果一致 1 项。

### P7 收口
- **661 变更目录**（文档，可选）。
- **662 真实索引自证**：用脱敏 fixture 复现 BotHot 停滞 + 126/136 冲突、Aidean dump；读数写 `docs/v0.6-dogfood.md`。
- **663 发布**：全量自测、CHANGELOG 0.6.0、README、SKILL.md 去掉“落地中”标注、同步 `/workspace/tools/product-development`。CI 双平台：仓库无 workflow 则标“未查”，不伪造。

## 4. 每卡证据链与反省模板（写入提交正文）

```
E1 来源：plan.md / execution-system.md 的卡号与发现编号
E2 实现：改动文件:行
E3 验证：命令 + 实际输出摘要（通过数/总数）
反省：① 是否引入新规则而非由信条推出？② 有无回归旧行为？③ 未做 / 未查 / 风险
```

## 5. 顺序（单人串行）
600 → 603b → 611 → 612 → 613 → 614 →（P2 全量）→ 621 → 622 → 623 →（P3 全量）→ 631 → 632 → 633 →（P4 全量）→ 641 → 642 → 643 → 644 →（P5 全量）→ 651 → 652 → 653 → 654 →（P6 全量）→ 661 → 662 → 663。共 25 张（原 22 + 600/614/654）。

## 6. 实际执行结果（2026-11-02 23:25 CST，全部推送 main）

| 卡 | 提交 | 定向自测 | 备注 |
|---|---|---|---|
| 600 | 1187bc3 | 2/2 | 本文件落盘 |
| 611 | 1a5cd1f | 8/8 | |
| 612 | f569c32 | 5/5 | |
| 613 | 4a53bb3 | 3/3 | |
| 614 | 99e34b5 | 2/2 | P2 全量 136/0 |
| 621 | 8567343 | 2/2 | /tmp 被清空后重做 |
| 622 | 499cb09 | 7/7 | 修正“未分配 owner”误报 |
| 623 | 3d90f29 | 文档 | P3 全量 145/0 |
| 631 | 7e17a07 → 1550ace | 7/7 | 7e17a07 带 2 项旧用例回归被推送，1550ace 修复 |
| 632 | d6adfb8 | 4/4 | |
| 633 | 80ad78e | 文档 | P4 全量 156/0 |
| 641 | 066fc16 | 6/6 | |
| 642 | e6cd807 | 4/4 | |
| 643 | 66d371f | 4/4 | show 并入 outline --section |
| 644 | 99d80ba | 2/2 | P5 全量 172/0 |
| 651 | 25b18d8 | 5/5 | |
| 652 | 34bc948 | 3/3 | |
| 653 | 6a8630f | 3/3 | P6 全量 186/0 |
| 654 | 7eefa20 | 3/3 | 600 卡 next 166→134 ms |
| 603b | b2658ca | curl 29/29=200 | |
| 662/663 | 见 git log | 全量见 CHANGELOG | 661 并入 CHANGELOG，不单独成文 |

仍未核实：skill-ecosystem §4.1 借鉴表引文（子代理读取，未逐篇核对）；真实私有仓库上的运行；Windows。
