> 更正（2026-11-02 21:30）：本方案共 **22 张卡**（P1 3 + P2 3 + P3 3 + P4 3 + P5 4 + P6 3 + P7 3），正文任何“19 张”的说法以此为准。P1（601–603）已完成。

# PDS（product-development Skill）评审与 v0.6.0 增量方案

- 日期：2026-11-02（CST）
- 评审对象一：用户上传的 zip（v0.1.0，ChatGPT 起草版，SKILL.md 169 行，全包 1,356 行）。
- 评审对象二：现行正本 v0.5.1。GitHub main 的 CHANGELOG 顶部为 0.5.1，与 `/workspace/tools/product-development` 一致。SKILL.md 214 行，全包约 4,778 行，其中 `pd.mjs` 785 行、`lib.mjs` 401 行、`self-test.mjs` 458 行。
- 取证方式：
  - 12 个参考项目只用 web_fetch 读原始文件，未 clone。
  - PDS 本体在沙箱 `/tmp` 解压并 grep。
  - 各参考项目的详细评审稿另存四份工作底稿。
- 证据记号：`[Z:]` 为 zip 包，`[S:]` 为 v0.5.1 本体，`[R:]` 为参考仓库原文，`[H:]` 为本对话或项目中的真实故障记录。

---

## 一、结论先行

PDS 的问题不在于缺规则，而在于规则太多、没有一个能推出全部规则的"信条"。机制也大多依赖执行者自觉，脚本没有替它把关。

v0.6.0 不再加章节，主要做三件事：

1. **立魂**：用三条信条统领全部规则。
   - **只信证据**：账本上没写的，等于没发生。
   - **只做必要**：最小改动、最小测试、最小上下文。
   - **卡住就说**：停滞、偏离、失败都要自动浮出，裁决后继续，不静默。
2. **补机**：把今天真实踩过的 5 类故障，从"靠自觉"改成脚本确定性检出。
   - 停滞检测
   - 卡面自洽检查
   - 完成三态
   - 上下文预算
   - 被跟踪文件检查
3. **减法**：合并或删除不能从信条推出的条款。SKILL.md 目标从 214 行压到 ≤150 行；细则下沉到 references，按需加载。

---

## 二、"缺灵魂"的诊断（每条附证据）

| # | 症状 | 证据 | 本质 |
|---|---|---|---|
| D1 | 条款堆叠，没有总纲 | `[S:SKILL.md:36-58]` 有"四条底线"，另有标题为"十条准则"的一节，实际写了 13 条，标题与内容自相矛盾。CHANGELOG 显示 0.2→0.5.1 全部在 2026-10-28 一天内叠加 `[R:CHANGELOG]` | 规则无法从同一原则推出，执行者只能逐条记忆 |
| D2 | 停滞检测只覆盖"无卡可做" | `[S:pd.mjs:696]` 只在"有未完成卡、无就绪卡、且无 IN_PROGRESS"时才报"流水线停摆" | 有就绪卡但长时间没人领，完全检测不到 |
| D3 | 卡面自洽没有机检 | `[S:pd.mjs:284-285]` 只是把 allowed/forbidden_paths 渲染成文字，没有校验"测试路径 ⊆ 允许路径"或跨 owner 冲突 | 矛盾只能等执行时撞上 |
| D4 | 完成态由执行者自写 | `[S:SKILL.md:123]` DONE 由执行助手 `record DONE`，只校验提交号和推送 | "已提交"被当成"已完成" |
| D5 | 上下文没有预算 | `[S:]` 没有 brief/digest/outline 子命令；规划文档动辄数百 KB | 新会话要么全读，要么丢状态 |
| D6 | 外部技能路由停在表格上 | `[S:SKILL.md:167-181]` 只有"装了就用"路由表，没有会话启动时的强制检查纪律 | 写了却不触发 |
| D7 | zip 的"克制"被稀释 | `[Z:SKILL.md:8]`"选择最小且足够的工作流程；不要每次都执行全部阶段"；`[Z:SKILL.md:45]` 要求"记录最强反方意见"。v0.5.1 保留了这些字句，但被 13 条准则和 16+2 维度淹没 | 初版的克制精神在膨胀中流失 |

D1–D6 对应的真实故障：

- **D2**：BotHot V0.35.0 中 Hark 名下 5 张卡（125/126/129/131/136）长时间 TODO，下游 18 张卡被卡住，没有任何告警。task-index 和 `12-执行记录-hark.md` 仅有表头 `[H:]`。
- **D3**：BotHot 卡面 §8 测试与 §10 允许路径有 10 处矛盾（D-V35-23）。126 的验证命令使用了归 136 所有的 `error-shell.spec.tsx`。`render.py:223` 因跨 owner 重叠而中止 `[H:]`。
- **D4**：Thesis V0.29 复核时，执行方宣称"全部完成"的 29 张卡中只有 3 张通过，另有 26 张失败，W10–W40 共 79 张没有提交 `[H:daily/2026-10-28]`。
- **D5**：沙箱今天连续 4 次卡死 `[H:]`；60 多张卡的规划无法在单上下文内复核。
- **其他**：Aidean 有被跟踪的 `docker/shared-infra/*_dump.sql`，health 报 4 个遗留错误；BotHot 的 `.workbuddy-ai/memory` 里有一处密钥形态误报（D-EXEC-019）`[H:]`。

---

## 三、逐项评审（13 项：zip + 12 个参考）

记号：✅ 采纳　◐ 部分采纳　✗ 不采纳。"落点"指 PDS 中的位置。

### 3.0 zip 包（v0.1.0）：◐，取回其克制精神

- **优点**：
  - 精简：SKILL 共 169 行，模式说明清楚。
  - 状态细分：IMPLEMENTED/COMMITTED/PUSHED/VALIDATED/ACCEPTED 分开 `[Z:SKILL.md:132]`。
  - 高影响决策须写"最强反方意见" `[Z:45]`。
  - 明确声明"本 Skill 不会自动获得文件、终端、Git……权限" `[Z:8]`。
- **缺点**：
  - 没有测试分工，也没有测试复用。
  - "默认不得自动推送到 main" `[Z:SKILL.md:131]` 与用户的主线偏好冲突（v0.5 已改为 `push_main`）。
  - README 引用的脚本缺失（0.2.0 已补）。
- **结论**：
  - 取回"最小且足够"的克制，作为信条二的来源。
  - "最强反方意见"保留在深度推理协议里。
  - 五态细分**不恢复**：v0.5 的 7 态 + execution 字段更省事。用"完成三态"（见 3.2）解决 D4 即可。

### 3.1 ponytail：◐

- **机制**：
  - 一句人格统领全部规则："The best code is the code never written"；"lazy about the solution, never about the change itself" `[R:ponytail/skills/ponytail/SKILL.md]`。
  - 主 prompt 约 3.5 KB `[R:README]`。
- **可用**：
  - P1 用人格化信条立魂 → SKILL.md §0。
  - P2 每次汇报以"未做 / 未查 / 风险"结尾 → `record` 新增 `not_checked`、`risks` 字段。
  - P3 卡面加"影响面"段 → 供 `test-plan` 选择定向测试。
  - P5 妥协登记为决策 `type:deferral`，必须带触发条件 → 决策登记册。
  - P6 审查只认带反例的问题，按 Must/Should/Nice 分级并给 Verdict → PHASE_REVIEW。
- **不采纳**：
  - ultra 档"质疑需求"会重开已决定的事项，违反底线 3。
  - 不把"最短 diff"当作全局目标。

### 3.2 Cloudflare security-audit-skill：◐（验证体系的主要来源）

- **机制**：
  - 只有两种结束态：完成，或 `run_status:"incomplete"` 加原因（"Never stop mid-phase"）。
  - 覆盖账本里"no unit may be silently unassigned"。
  - 独立证伪：验证者的 prompt 开头是"You did not write this candidate. Try to refute it"。
  - 三态 confirmed / needs_validation / rejected；needs_validation 必须写缺什么，"is never a parking place"。
  - JSON schema 用 `additionalProperties:false`，Markdown 报告从 JSON 派生。
  - 指纹不含行号 `[R:SKILL.md, VALIDATION-AND-REPORTING.md, report-schema.json]`。
- **可用**：
  - C1 完成三态 → VALIDATE 和 `record`。
  - C2 独立证伪验证者 → 只在阶段体检时批量做，不逐卡。
  - C3 精简的 findings schema → 新增 `pd.mjs findings-check`。
  - C4 确定性规格检查 → 新增 `pd.mjs spec-check`。
  - C6 密钥误报改为带理由的指纹白名单，源内容变化即失效。
  - C7 阶段收尾只允许两种结束态。
- **不采纳**：
  - OS 沙箱与产物晋升。
  - 两轮验证。
  - 安全领域的双轴严重度。
  - 以上都过重，且违反"不设门禁"。

### 3.3 ECC：◐

- **机制**：
  - 五种载体分工（skills / agents / rules / hooks / instincts）："Optimize the context window. Persist everything else."
  - hook 分 minimal / standard / strict 三档。
  - 记忆有信任边界："Memory is unreviewed context, not executable policy."
  - 审阅者有 Pre-Report Gate，"零发现是合法结果"："Severity inflation erodes trust faster than missed findings."
  - 委派完成契约："If you delegate, you own collection … Fire-and-forget delegation is forbidden"。
  - 本地验证与目标环境验证分开 `[R:ECC README, agents/code-reviewer.md, rules/common/agents.md, skills/verification-loop]`。
- **可用**：
  - H1 `test-plan --changed`，按 diff 选测试。
  - H2 `--profile standard|strict`：开发期宽，发版期严。用户的"不设门禁"指开发期，发版前全量回归本就由用户认可。
  - H3 PHASE_REVIEW 采用 Pre-Report Gate。
  - H4 派发者对收回负责，与停滞检测配合。
  - H5 教训带置信度，晋升为规则须人工确认。
  - H6 health 检查被 git 跟踪的 dump、.env、密钥文件。
  - H7 E3 证据分 local / target 两栏。
  - H8 每条硬规则注明"来自哪次失败"。
- **不采纳**：
  - 300 多个 skill 的大目录。
  - 后台 observer 进程（违反沙箱不起服务的规则）。
  - 80% 覆盖率与强制 TDD（违反不设硬阈值）。

### 3.4 claude-mem：◐（只借思路）

- **机制**：
  - 先给索引再取详情，每层标注读取成本："Show what exists and its retrieval cost first"；索引每条约 50–100 tokens，详情约 500–1,000 tokens。
  - observation 字段固定（title、facts、files_read、files_modified……）。
  - 会话结束时生成摘要（request / investigated / learned / completed / next_steps），"Summaries are checkpoints, not endings"。
  - ≥32 KB 的文件整读会被拦截，引导先看大纲 `[R:docs.claude-mem.ai progressive-disclosure, hooks-architecture, file-read-gate]`。
- **反证**：其自带评测显示，19 KB 文件开闸门反而 +20% tokens；"~10x 节省"没有实测数据。
- **可用**：
  - `pd.mjs index` / `show`：语义标题 + 大小。
  - `pd.mjs outline`：阈值 ≥32 KB。
  - 执行日志新增 `checkpoint` 事件（request / learned / next_steps）。
- **不采纳**：
  - Bun 常驻进程、SQLite / Chroma、由 LLM 自动压缩（会形成第二事实源）。
  - 默认托管服务。

### 3.5 context-mode：◐（上下文经济的主要来源）

- **机制**：
  - 只让 stdout 进入上下文。
  - 大于 5 KB 的输出按意图过滤，大于 100 KB 的只返回指针。
  - "Write artifacts to FILES — never inline. Return: file path + 1-line description"。
  - 事件分 P1–P4 四级，压缩快照不超过 2 KB，低优先级先丢。
  - "DO NOT ask 'what were we working on?' — SEARCH FIRST" `[R:README, configs/claude-code/CLAUDE.md, BENCHMARK.md]`。
- **数字核查**：
  - 头条"98%"由专门写的汇总脚本得出，BENCHMARK 自认对写代码"useless"。
  - 检索类真实节省为 50–93%（小计 82%）。
  - 小输出几乎无收益。
  - 方案中只引用有数据的那部分。
- **可用（P0）**：
  - 输出预算规则 + `pd.mjs digest`：大于 20 行或 5 KB 的输出落到日志文件，摘要现算、不存档。
  - `pd.mjs brief --role --card --budget 2k`：分级交接视图，P1 永不截断。
  - ask-check 先搜后问。
- **不采纳**：
  - MCP server、SQLite、强制拦截工具调用。
  - 14 天自动清理（与跨机器长期接力相反）。
  - ELv2 许可：只借思路，不复制代码。

### 3.6 pua：◐（只取机制，施压话术一律不取）

- **机制**：
  - 失败计数按"未达到预先定义的验收"计算，"未知就写历史计数未知"。
  - 改动前先写一行 `[PUA-DIAGNOSIS]` 承诺。
  - "`verifier_status` 只能由 verifier/harness 写入"。
  - 失败模式表明确列出"P8 卡住没人发现"。
  - 要求显式 `[TEARDOWN]` / `[REASSIGN]`，"不允许静默挂起" `[R:skills/pua/SKILL.md, references/harness-governance.md, p9-protocol.md]`。
- **反证**：README 自承工具调用 +50%，两组通过率同为 100%，提效未被证实。
- **可用**：
  - U1 停滞检测（直接对应 D2）。
  - U2 执行者只能写候选完成态（D4）。
  - U4 失败阶梯：第 2 次换本质不同的方案，第 3 次列 3 个假设，第 4 次结构化交接并标 BLOCKED。与现有准则 10"两次即停"合并为一条，两次后不再硬试，而是交接。
  - U5 开工一行诊断，并入 E1。
  - U7 重派卡时携带前任的失败次数和已排除项。
- **不采纳**：
  - 施压话术、大厂味道、旁白。
  - "改动前跑全量回归"（与用户的全局规则冲突）。
  - 冰山法则（诱发越界改动）。
  - P9 "绝不写代码"的四代理拓扑。

### 3.7 using-superpowers：✅（会话启动纪律）

- **机制**：在任何回答之前（包括澄清提问）先检查技能，"1% chance"即加载；红旗表逐条列出常见借口及其反驳；派给子代理的具体任务跳过路由步骤 `[R:obra/superpowers/skills/using-superpowers/SKILL.md]`。
- **可用**：
  - SKILL.md 入口路由表加红旗表，中文，每表不超过 8 行。
  - `pd.mjs next/prompt` 生成的执行提示词首行写"已路由，勿再路由"。
- **风险**：路由过度会拖慢小任务。用"小需求快速通道"兜底。

### 3.8 brainstorming：◐

- **机制**：一次只问一个问题；设计先获批准再动手；"builder check"让只读的新上下文以"要实现的人"身份读一遍，把问题分为三类：已有答案 / 小事自定并标注 / 必须问对方 `[R:skills/brainstorming/SKILL.md]`。
- **可用**：规划落盘前做一轮 builder check，派一个只读子代理按执行者身份通读每张卡。它是现有准则 1"执行者测试"的落地方式。只做一轮。
- **已吸收**：一次一问（DISCUSS 已有）。

### 3.9 writing-plans：◐（纠正一处旧认知）

- **事实更正**：现版本反对在计划里写完整代码："A plan longer than the code it describes has written the code instead." 只给签名、路径和测试断言；只有签名和测试无法确定的算法才写代码体。v0.5.1 `skill-ecosystem.md` 第 46 行写的"含精确路径、代码"需要更正。
- **机制**：每张卡用一个 Files 块，同时列出 Create / Modify / Test；自审禁止 "TBD" 和 "handle edge cases"，并检查类型一致性和比例 `[R:skills/writing-plans/SKILL.md]`。
- **可用**：卡面改为单一结构化 `files{create, modify, test}`，§8 测试与 §10 允许路径都从它生成，从源头消除 D3；再加"禁止占位语"自审。

### 3.10 executing-plans：◐（纠正一处旧认知）

- **事实更正**：现版本"Do not pause to check in … between tasks"，连续执行，靠进度账本，最后对整条分支做一次新鲜复审。不再是"批次加检查点"。这与用户的"不设门禁"一致。
- **机制**："A failing run records nothing"；"Rulings, not stalls"；偏离登记为裁决 `[R:skills/executing-plans/SKILL.md]`。
- **可用**：
  - 完成行由脚本在命令成功后写入，失败不写。
  - 偏离按"裁决：决定—理由—若错的代价"一行记入 `D-EXEC`，然后继续。
  - 只有四类情况必须停：不可逆、安全敏感、外部副作用、计划根本性错误。

### 3.11 OpenSpec：◐（多数已吸收）

- **机制**：specs/ 是唯一真相源，每个变更一个 change 目录，完成后合并进主 spec 并归档；"no phase gates"；"Dependencies are enablers, not gates"；行为写在 spec，文件路径写在 tasks `[R:docs/concepts.md]`。
- **已吸收**：ADDED/MODIFIED/REMOVED 加 Given/When/Then。
- **可用**：REPLAN 时每个变更一个 `changes/<ID>/`，完成后归档到 `archive/<日期>-<ID>/`。不引入 CLI。
- **不采纳**：OpenSpec 的 CLI 与 schema。

### 3.12 gsd-2（已归档 → gsd-pi）：◐

- **事实**：2026-10-04 已归档，迁到 open-gsd/gsd-pi；以下读的是 gsd-2 的核心 prompt（execute-task / plan-slice / complete-slice）。
- **机制**：
  - "expectedOutput must only list files the task actually creates"，前置输入必须由更早任务的 expectedOutput 产出。
  - "The DB-backed tool is the canonical write path"。
  - 证据表含命令、退出码、判定、耗时。
  - complete-slice 的"closer"把失败分三类：本卡造成的重开本卡；历史遗留或计划问题走重规划。
- **可用**：
  - spec-check 增加"输入 ⊆ 前置卡输出"的检查。
  - PHASE_REVIEW 采用 closer 三分流。
  - TEST_RUN 增加 `exit_code` 和 `duration`。
- **不采纳**：DB、自动提交、独立 CLI 代理。

### 3.13 planning-with-files：◐（核心已吸收）

- **机制**：三个文件 task_plan / findings / progress；做决策前重读计划；停滞检测读账本而不是 progress.md 的 mtime（"The gate's stall detector reads the ledger … rather than progress.md mtime"）；`/plan-doctor` 只报告不阻塞 `[R:SKILL.md]`。
- **已吸收**：2 动作规则、错误留痕。
- **可用**：
  - 停滞检测以执行日志 JSONL 为准（跨机器时文件 mtime 不可靠）。
  - 把 health / replan-check / spec-check 收进一个 `pd.mjs doctor`，只报告、退出码区分级别。
- **不采纳**：hooks、计划哈希与 nonce（Hark 等环境无 hook）。

---

## 四、信条（SKILL.md §0 的新写法）

> **PDS 只相信写进账本、可以复现的证据；只做达成验收所必需的最少的事；一旦卡住、偏离或失败，立刻写下来并说出来，然后裁决、继续，不静默、不硬试、不停等。**

| 信条 | 推出的现有规则 | v0.6 新增机制 |
|---|---|---|
| 一、只信证据 | 底线 1、2，E1→E2→E3，VERIFIED 须台账 PASS | 完成三态、脚本写完成行、findings schema、local/target 分栏 |
| 二、只做必要 | 定向测试、阶段体检、最终回归一次、小需求快速通道、准则 13 | 输出预算、brief/digest/outline、影响面、deferral 债务 |
| 三、卡住就说 | 底线 3、准则 10/11/12、裁决链 | 停滞检测、失败阶梯、裁决行、spec-check、两种阶段结束态 |

每条硬规则末尾加一行"来源：哪次失败"（H8）。推不出的条款下沉到 references 或删除。

---

## 五、v0.6.0 剩余任务大纲（4 级：阶段 → 任务卡 → 执行步 → 验收）

**全局约定**
- 仓库：`nevermeetagain/product-development-skill`，主线模式直推 main，每卡一个提交，不建分支。
- 只跑定向自测：`node scripts/self-test.mjs --filter <标签>`。若 `--filter` 不存在，由 PDS-601-3 先补。
- 阶段末跑一次全量 `self-test`。
- 版本：v0.6.0；卡号 PDS-6xx，永不复用。
- 用 v0.6 自身的 `pd.mjs` 在 `examples/minimal-workspace` 和一份脱敏的真实索引快照上自证。
- 零依赖、零服务，Node 18+；Windows 与 Ubuntu 兼容。

### 阶段 P1　立魂与减法（只改文档）

**PDS-601　SKILL.md 信条化重写**　owner：规划者
1. 执行步
   1. 把 §0 和 §0.1 合并为"信条 + 三张推导表"（见第四节），把"十条准则（实 13 条）"更正为编号连续的清单。
   2. 每条硬规则补一行"来源"（失败记录或用户指令日期）。
   3. 把 §7 中各模式的细节下沉到 `references/modes.md`，SKILL.md 只保留模式表和一行入口。
   4. 小需求快速通道提到第 2 节开头。
2. 验收
   1. `wc -l SKILL.md` ≤ 150。
   2. 用 grep 核对旧版每条规则在新版或 references 中都有去处，形成迁移对照表 `docs/v0.6-rule-map.md`，没有未处理行。
   3. self-test 中关于 SKILL.md 结构的用例通过。

**PDS-602　入口路由与红旗表**　owner：规划者
1. 执行步
   1. 新增 `references/routing.md`：会话启动先检查路由，覆盖模式 × 外部技能。
   2. 新增两张中文红旗表，每张不超过 8 行：规划者的借口与反驳、执行者的借口与反驳。例如"应该可以了"对应"没有命令输出就不算完成"。
   3. `templates/next-task-prompt` 首行加"已路由，勿再路由"。
2. 验收：`pd.mjs prompt` 输出的首行包含该标记；新增自测 1 项。

**PDS-603　外部生态表更正**　owner：规划者
1. 执行步
   1. `skill-ecosystem.md`：writing-plans 改为"签名 + 路径 + 断言，不写代码体"；executing-plans 改为"连续执行 + 最后一次复审"。
   2. gsd-2 标注已归档并指向 gsd-pi。
   3. 新增 ponytail、Cloudflare、ECC、claude-mem、context-mode、pua 六行"借鉴 / 不采纳"条目，只登记思想，不进 `skills-registry`（因其不是可选依赖）。
2. 验收：表中每个 URL 都经 web_fetch 返回 200，附核验日期。

### 阶段 P2　账本与停滞（解决 D2）

**PDS-611　执行日志新增事件**　owner：执行者
1. 执行步
   1. `lib.mjs` 的事件白名单增加 `CLAIM`、`START`、`HEARTBEAT`、`CHECKPOINT`（request / learned / next_steps）和 `RULING`（决定 / 理由 / 若错的代价）。
   2. `record` 校验必填字段，并做秘密扫描。
2. 验收：自测新增 5 项（合法写入、缺字段拒绝、秘密拦截）。

**PDS-612　停滞检测 `STALLED`**　owner：执行者
1. 执行步
   1. 规则一：卡已就绪且有 owner，但超过 `config.stall_minutes`（默认 10，对齐用户的 10 分钟规则）没有任何事件，判为 `UNCLAIMED_STALL`。
   2. 规则二：卡在 IN_PROGRESS，但超过 N 分钟没有事件，判为 `SILENT_STALL`。
   3. 只用执行日志的时间戳（UTC），不看文件 mtime。
   4. `status` 首行、`health` 和 `replan-check` 都优先列出停滞卡，并按 owner 聚合（例如"owner=hark 有 5 张就绪卡 0 事件"）。
   5. 保留 `pd.mjs:696` 原有的"无就绪卡"判断。
2. 验收
   1. 用 fixture 复现 BotHot 场景（5 张就绪卡、0 事件、时间推进 11 分钟），必须报出 5 条 `UNCLAIMED_STALL`。
   2. 自测新增 4 项。

**PDS-613　委派收回契约与重派携带**　owner：执行者
1. 执行步
   1. 新增 `pd.mjs reassign <ID> --to <owner>`：写入 `REASSIGN` 事件，并附带前任的失败计数和已排除项。
   2. 新提示词自动带上这两项。
2. 验收：重派后 `prompt` 输出包含前任失败计数；自测新增 2 项。

### 阶段 P3　卡面自洽（解决 D3）

**PDS-621　卡面单一 `files` 结构**　owner：规划者
1. 执行步
   1. 任务卡模板与 `task-index` 增加 `files:{create[], modify[], test[], read[]}`。
   2. `allowed_paths` 由 create + modify + test 生成。
   3. 旧字段保留兼容，不迁移旧项目。
2. 验收：`templates/task-card.md` 与 `config-reference.md` 同步；旧 fixture 仍能通过 health。

**PDS-622　`pd.mjs spec-check`（确定性，只报告）**　owner：执行者
1. 执行步
   1. 检查 1：test ⊆ allowed。
   2. 检查 2：一个文件只有一个 owner，跨 owner 重叠时列出冲突对。
   3. 检查 3：read 中的输入 ⊆ 前置卡的 create/modify 或仓库已有文件。
   4. 检查 4：卡面引用的 DEC ID 存在于决策登记册。
   5. 检查 5：迁移号唯一。
   6. 检查 6：禁止占位语（TBD、待定、handle edge cases、适当处理）。
   7. 退出码：0 通过；3 有 BLOCKING（规划不得宣布完成）；1 仅提醒。
2. 验收
   1. 用 fixture 复现 BotHot 126 / 136 的共享 spec 文件，必须报出。
   2. 复现 10 处 §8/§10 矛盾中的至少 3 种形态。
   3. 自测新增 8 项。

**PDS-623　builder check 协议**　owner：规划者
1. 执行步
   1. `planner-protocol.md` 增加一节：规划落盘前派一个只读新上下文，以执行者身份通读全部卡，问题分三类（已答 / 自定并标注 / 必须问）。
   2. 只做一轮，结果写入 `replans[]`。
2. 验收：协议文本附示例输出；规划完成清单中加入该项。

### 阶段 P4　完成与验证（解决 D4）

**PDS-631　完成三态**　owner：执行者
1. 执行步
   1. 执行者只能写 `DONE(candidate)`。`VERIFIED` 只能由 tester 写入，或由 `test-plan` 指纹复用判定 PASS 后写入。
   2. 新增 `NEEDS_VALIDATION`：必须写"缺什么证据"，并显示在 status 中，不得长期挂起（超过 N 天进入 replan-check）。
   3. `TEST_RUN` 增加 `exit_code` 和 `duration_ms`；命令失败时不写完成行。
   4. E3 证据分 `local` / `target` 两栏。
2. 验收：执行者身份写 VERIFIED 被拒（exit≠0）；自测新增 5 项。

**PDS-632　findings schema 与 `findings-check`**　owner：执行者
1. 执行步
   1. 新增 `templates/finding.schema.json`（`additionalProperties:false`）。
   2. 字段：`id`、`fingerprint`（不含行号）、`verdict`（confirmed / needs_validation / rejected）、`severity`（Must / Should / Nice，只有 confirmed 才有）、`trace`（file:line）、`counterexample`、`evidence_cmd`、`missing_fact`。
   3. 阶段体检报告的 Markdown 只能由 JSON 生成。
2. 验收：非法记录被丢弃并计数；rejected 的指纹在下次体检中被抑制；自测新增 4 项。

**PDS-633　PHASE_REVIEW 协议升级**　owner：规划者
1. 执行步
   1. 顺序固定为：合规（验收逐条）→ 独立证伪（"这不是你写的，试着推翻它"）→ 质量。
   2. 采用 Pre-Report Gate：能指到行、写出失败场景、给出反例；零发现是合法结果。
   3. closer 三分流：本卡造成的 → 重开本卡；历史遗留 → 新建修复卡；计划问题 → REPLAN。
   4. 阶段只允许两种结束态：`PHASE_OK`，或 `PHASE_INCOMPLETE` 加原因。
2. 验收：`references/testing-and-reuse.md` 与 PHASE_REVIEW 模板同步；示例报告由 schema 生成。

### 阶段 P5　上下文经济（解决 D5）

**PDS-641　输出预算规则 + `pd.mjs digest`**　owner：执行者
1. 执行步
   1. 规则：预计超过 20 行或 5 KB 的命令输出必须重定向到 `.pd/logs/<卡>/<时间>.log`（gitignore）。
   2. `digest <log>` 内置解析 node:test、vitest、jest、pytest、tsc 五种格式，输出通过/失败计数、前 5 个失败及其首段堆栈、日志路径和行号。
   3. 台账只记 `log_path` 和 `sha256`。
2. 验收：用 5 种格式的样本日志测试，摘要不超过 1 KB 且失败数正确；自测新增 6 项。

**PDS-642　`pd.mjs brief`**　owner：执行者
1. 执行步
   1. 参数：`--role planner|executor|tester`、`--card`、`--budget`（默认 2 KB）。
   2. 分级：P1 为当前卡目标、验收、依赖、未解决阻塞、相关 DEC 标题、上次 next_steps，**永不截断**；P2 为最近失败、被否方案、约束；P3 为已完成卡和变更文件。
   3. 超出预算时从 P3 开始丢弃，并列出被省略的 ID。
   4. 只生成，不落盘。
2. 验收：在 60 卡 fixture 上输出不超过 2,048 字节且包含 P1 全部字段；自测新增 4 项。

**PDS-643　`index` / `show` / `outline`**　owner：执行者
1. 执行步
   1. `index`：每行"ID｜类型｜语义标题｜状态｜~大小"。
   2. `show <ID…>`：批量取详情。
   3. `outline <file>`：仅对 ≥32 KB 的文档生效，输出标题树和行号范围。
2. 验收：在 60 卡 fixture 上 index 不超过 2 KB；outline 对 19 KB 文件不生效（反证约束）；自测新增 4 项。

**PDS-644　ask-check 先搜后问扩展**　owner：执行者
1. 执行步：除决策登记册外，还检索执行日志中的 `RULING`、`CHECKPOINT`、`blocker`、`rejected`。命中时引用 ID。
2. 验收：自测新增 2 项。

### 阶段 P6　卫生与档位

**PDS-651　被跟踪文件检查与密钥白名单**　owner：执行者
1. 执行步
   1. health 检测被跟踪的 `*_dump.sql`、`*.dump`、`.env*`（排除 example）、`*.pem`、`*.key`，以及助手记忆目录（`.workbuddy-ai/` 等，可配置）。
   2. 秘密扫描支持 `config.secret_allowlist[]`：每项包含 `{path, fingerprint, reason}`，源内容一变即失效。
2. 验收
   1. 用 fixture 复现 Aidean 的 dump 场景并报出。
   2. 复现 D-EXEC-019 的形态：加白名单后不报，改动内容后重新报。
   3. 自测新增 4 项。

**PDS-652　`--profile` 档位与 `doctor` 合并入口**　owner：执行者
1. 执行步
   1. `config.profile` 取值 `dev`（默认，只报告）或 `release`（发版前 spec-check / health 的 BLOCKING 视为失败）。
   2. 新增 `pd.mjs doctor`：一次跑 health + spec-check + replan-check + 停滞检测，统一分级输出。
2. 验收：两档在同一 fixture 上的退出码不同；自测新增 3 项。

**PDS-653　执行纪律补丁**　owner：规划者
1. 执行步
   1. `execution-playbooks.md` 加入失败阶梯（2 次换方案 / 3 次列假设 / 4 次交接并标 BLOCKED），与准则 10 合并。
   2. 开工前写一行诊断（写入 START 事件）。
   3. 收尾三件事：未做、未查、风险，对应 `record` 的 `not_checked`、`risks`。
   4. 妥协登记为 `type:deferral`，必须带触发条件。
2. 验收：模板与 `record` 字段一致；自测新增 2 项。

### 阶段 P7　收口与发布

**PDS-661　变更目录与归档（OpenSpec 思路）**　owner：规划者
1. 执行步：REPLAN 时每个变更建 `changes/<ID>/`，完成后归档到 `archive/<日期>-<ID>/`。写入 `source-of-truth-and-layout.md`，作为可选项。
2. 验收：文档和示例齐全；不影响旧项目的 health。

**PDS-662　真实索引自证**　owner：测试者
1. 执行步
   1. 取 BotHot V0.35、Thesis V0.36、Aidean V0.20 的 task-index 与执行日志，做脱敏快照（只保留 ID、状态、路径、时间）。
   2. 在快照上跑 `doctor`、`spec-check` 和停滞检测，记录真实读数。
2. 验收
   1. 能报出 BotHot 的 hark 停滞和 126/136 冲突，以及 Aidean 的 dump。
   2. 误报逐条判定。
   3. 读数写入 `docs/v0.6-dogfood.md`。

**PDS-663　全量自测、双平台冒烟、发布**　owner：测试者
1. 执行步
   1. 全量 `self-test`（预计 116 + 约 60 项）。
   2. 用一次 CI 跑 Ubuntu 和 Windows × Node 18/22。
   3. 更新 CHANGELOG 0.6.0 和 README。
   4. 推送 main 并核对远程。
   5. 同步 `/workspace/tools/product-development` 与自定义技能 `pds`。
2. 验收：自测全过的真实输出；CI 运行链接；远程 HEAD 等于本地。

---

## 六、依赖、并行与工作量

- **DAG**：
  - P1（601→602→603）可与 P2 并行。
  - 621 → 622 → 623。
  - 611 → 612 → 613。
  - 611 → 631 → 632 → 633。
  - 611 → 641 → 642/643/644。
  - 651、652、653 依赖 622 与 631。
  - 661 独立。
  - 662 依赖 612、622、631、651、652。
  - 663 最后。
- **共享可变文件**：`pd.mjs`、`lib.mjs`、`self-test.mjs` 是热点。多执行者并行时，每卡新增的逻辑放进独立模块（`scripts/cmd/<子命令>.mjs`），`pd.mjs` 只加一行分发，用串行提交解决冲突。
- **建议分工（2 名执行者 + 规划者）**：
  - 执行者 A：P2、P4 加 651。
  - 执行者 B：P3 脚本部分、P5 加 652。
  - 规划者：P1、621、623、633、653、661。
  - 测试者：662、663。
- **工作量粗估**：
  - 文档卡每张 0.5–1 小时。
  - 脚本卡每张 1–3 小时。
  - 合计约 25–35 小时。
  - 这是估计，不是基线数据。

## 七、风险、反证与不做的事

1. **规则变多的悖论**：v0.6 又加了机制。对冲办法是 PDS-601 的硬上限（SKILL.md ≤150 行），以及新增机制全部落在脚本里，不靠记忆。
2. **停滞阈值误报**：执行者离线、夜间时段。`stall_minutes` 可配置；停滞只报告不阻塞；HEARTBEAT 可由执行者手动打。
3. **三态增加 tester 负担**：用指纹复用自动升 VERIFIED，避免人工逐卡确认。
4. **brief 被当成事实**：brief 只生成不落盘，并在首行注明"视图，权威源见 task-index"。
5. **不做的事**：
   - 常驻进程、数据库、MCP、hooks 强依赖。
   - 施压话术。
   - 每卡全量回归、覆盖率阈值。
   - 300 多个技能的目录。
   - 复制有许可证限制的代码（context-mode 为 ELv2）。
6. **未核实项**：
   - pua 心跳回收的实现；ECC hooks 的脚本实现。
   - gsd-pi 与 gsd-2 的 prompt 是否仍一致。
   - planning-with-files 的模板原文。
   - 以上只借思想，不影响方案成立。
   - 本方案尚未在代码上执行，以上脚本行为都是"拟实现"。
