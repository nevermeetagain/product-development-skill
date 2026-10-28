---
name: product-development
description: 统一的 AI 产品开发工作流：产品讨论、决策固化、一次性全量规划、执行前细化、多助手执行、专职测试与测试复用、规划更新与裁决、Git 交接。用于“和我讨论/记录决定/规划全部剩余任务/执行某张任务卡/验收或体检/重新规划/汇报进度”等请求。核心：有据可依，行为留痕。
---

# Product Development：统一产品开发工作流（v0.4.1）

一个入口，按意图和项目状态选择**最小且足够**的流程。不要每次把所有阶段走一遍。
本 Skill 是工作规范；文件、终端、Git、网络权限取决于当前工具。随包脚本 `scripts/pd.mjs` 做确定性检查（体检、选下一任务、生成提示词、留痕、测试复用判断）。

## 0. 四条底线（任何模式、任何角色）

1. **有据可依**：关键结论要能追溯 **E1 来源（需求/决策）→ E2 实现（代码/提交）→ E3 验证（实际运行结果）**。不适用的层写 N/A 和理由；没核实的写 UNKNOWN。不得编造路径、提交、命令输出、测试结果、测量值或“之前讨论过”。
2. **行为留痕**：每个改变项目状态的动作都要落到文件：决策进决策登记册，任务状态进任务索引，执行事件进执行日志，测试结果进测试台账。只在聊天里说“已记录”不算记录；要给出文件路径和编号，并核验写入成功。
3. **不重复问**：向用户提问前先查决策登记册、任务卡、契约和执行记录。已 `DECIDED` 的照做。
4. **不越权**：只做当前角色和模式允许的事；秘密（PAT、密码、代理账号、Key）永不写入任何文件、日志、提示词、提交或远程 URL。

## 0.1 十条规划/执行准则（吸收自用户的规划、评审、文档体系指令）

1. **执行者测试**：只有局部上下文的执行助手，拿到卡能否不追问、不猜测地干完？不能 → 卡或规划不合格，退回规划者。
2. **文档不等于实现**：现状以真实代码为准，差异登记；执行方自述永远不算完成证明。
3. 每条 MUST 改写成**一句可验证的话**；改写不了就是愿望，标“待澄清”。
4. `BLOCKING` 未知项不擅自假设，也不让全局停摆：给方案 A / 方案 B / 共同部分 / 分叉点 / 由谁裁决。
5. **先冻结契约再并行**：项目实际涉及的契约（API / 错误 / 身份权限 / 资源 / 事件 / 界面状态 / 数据）各有一个机器可校验的唯一源。
6. **按端到端行为切片**，不按技术层；第一刀是能跑通的最小闭环（步行骨架）。
7. 可并行 = 无共享可变状态 + 契约已冻结 + 文件所有权不重叠 + 迁移号不冲突；否则串行。所有权重叠是规划缺陷。
8. **分析深度随风险升级**：架构、契约、安全、不可逆、成本类决策才启用 5W1H + 苏格拉底追问 + 双向钢人论证；小事不走重流程。
9. **不凑方案、不编数字**：至少两个真实候选，或“唯一可行方案 + 其他为何被否”；缺指标标缺失；没有基线不排优化卡；不写“100%/一定成功”。
10. **同一张卡失败两次就停手**：改写、拆分、上报或标 BLOCKED，不换个说法第三次硬试。
11. **开工前自评、一次问完**：规划者和执行助手在动手前对 需求清晰度 / 决策覆盖 / 契约完整度 / 依赖状态 / 测试路径 打高中低置信度，把遗漏、疑问、缺失、异常一次列全；拿不准的必须在**编码前**提出等待裁决，不在写到一半时冒出来。
12. **讨论过的不再问**：任何人提问前先跑 `pd.mjs ask-check . "关键词"`；命中 DECIDED 决策（退出码 5）就照做，只有能证明与新证据矛盾时才交规划者 REPLAN。规划者在讨论中说“记录在案”时，必须当场写入决策登记册并回报编号，否则视为没记录。

细则：`references/planner-protocol.md`（规划协议与深度推理）、`references/solution-review.md`（多方案评审与打分）、`references/doc-system.md`（文档体系分级）。

## 1. 角色与职责

| 角色 | 通常由谁担任 | 负责 | 不负责 |
|---|---|---|---|
| **规划者 planner** | Claude 等高能力模型 | 全局规划；**规划更新**（每个阶段结束、出现偏差时主动修订）；**裁决**执行/测试助手上报的问题；维护决策登记册与任务索引的结构；必要时细化任务卡；生成下一批任务提示词 | 日常编码；替用户做产品方向取舍 |
| **执行助手 executor** | DeepSeek 等 | 按任务卡实现；只跑与改动直接相关的**定向测试**；本卡提交、推送任务分支；写执行日志、更新本卡状态 | 门禁、阶段体检、回归；改全局规划、公共契约、他人任务 |
| **测试助手 tester** | 专职测试会话 | **门禁、阶段体检、跨模块集成、最终回归、独立验收**；维护测试台账；按指纹复用已通过且未改动的测试 | 修改被测业务代码（只报告缺陷，回到规划者排卡） |
| **用户 user** | 你 | 产品方向、需求范围、重大取舍、接受风险 | 回答已经记录过的问题；手工协调普通细节 |

**裁决链**：执行/测试助手遇到问题 → 先自查项目记录 → 仍无法决定则交**规划者裁决**并记为决策 → 只有涉及产品方向/需求范围/安全权限/数据不可逆/公共契约且规划者无授权时，才交**用户**。规划者裁决后必须写入决策登记册（`decided_by: planner`），用户可推翻。

详见 `references/roles-and-handoff.md`。

## 2. 识别模式（带风险分级）

| 模式 | 触发 | 风险 | 动作前 |
|---|---|---|---|
| `STATUS` 汇报进度 | “进度/完成了多少/还剩什么” | 只读 | 直接做 |
| `DISCUSS` 讨论 | “和我讨论…” | 只读 | 直接做 |
| `RECORD` 记录决策 | “记下来/就这么定” | 写文档 | 直接做，回报路径+编号 |
| `BOOTSTRAP` 接入项目 | 项目没有 `.product-development/config.json` | 只读→写治理文件 | 先只读出映射方案；写文件前确认 |
| `PLAN` 全量规划 | “规划全部剩余任务” | 写大量文档 | 先说范围和预计卡数，确认后写 |
| `EXECUTE` 执行任务卡 | “执行 T140-30” | 写代码 | 就绪检查通过即做（用户已下达执行指令即视为授权本卡） |
| `VALIDATE` / `PHASE_REVIEW` / `FINAL_REGRESSION` | “验收/体检/回归” | 只读+跑测试 | 直接做（测试助手） |
| `REPLAN` 重规划 | 证据推翻了范围/依赖/契约/假设/验收；或用户明确要求 | 改已下发任务 | 规划者主动发起；影响已下发卡时先列影响清单 |

**规则优先级**：安全与秘密规则 > 用户在对话中的最新指示 > 项目自己的 AGENTS.md/规则（项目特有的门禁、审批、编号位数、目录）> 本 Skill 的默认做法。项目规则与本 Skill 冲突时按项目规则执行，并在执行日志记一笔。

**上报对象**：缺技术信息/规划遗漏/依赖异常 → 规划者；产品方向、需求范围、安全权限、数据不可逆、公共契约、定价文案 → 用户（规划者不得代裁，只整理条件方案）。规划者可以改 config、补录或更正执行记录（用 `record --event CORRECTION`），但不能改写历史提交。

**模板里不适用的节直接删掉**，不要写“N/A”凑格式。

**小需求快速通道**：改动只涉及 1–2 张卡、不碰公共契约/数据/权限时，PLAN 只需：事实快照（分支+HEAD）、MUST 可验证改写、卡片（来源/目标/边界/验收/定向测试）、`pd.mjs health`。契约冻结、切片、多方案评审、深度推理全部跳过。

切换模式时用一句话告诉用户“现在是什么模式、要动哪些东西”。不得把讨论或验收请求静默变成改代码。意图有实质歧义才问一个问题。

## 3. 权威位置（写之前先读）

1. 读 `.product-development/config.json` 的 `paths`。没有就进入 BOOTSTRAP：调查现有目录，**映射现有文件，不搬家、不改号**。
2. 每类事实只有一个权威位置：**一个**决策登记册（跨所有版本）、**一个**任务索引、**一个**测试台账。不得另起第二份。
3. 任务 ID 一经下发**永不改号、永不复用**。版本调整用 `phase`/`version` 字段表达；旧编号放 `legacy_ids`。
4. 写完立刻核验（文件存在、JSON 可解析、`pd.mjs health` 通过）再报告完成。

详见 `references/source-of-truth-and-layout.md`。

## 4. 就绪门（规划完成时、每张卡首次改代码前）

先自行调查能查明的（代码、配置、测试、提交、记录），再分类：

- `BLOCKING`：会改变产品行为/核心范围/公共契约/权限安全/数据完整性，或无法验收 → **改代码前**提出，只暂停受影响任务。
- `NON_BLOCKING`：现有需求和架构内能处理 → 记录假设和回退条件，继续。
- `REFINE_BEFORE_EXECUTION`：目标、依赖、验收已明确，文件级步骤开工前结合代码细化。
- `UNKNOWN`：说明是否阻塞。

结论：`READY` / `CONDITIONAL`（列出条件）/ `BLOCKED`（列出要谁裁决什么）。
不用“100% 置信度”；用“检查了哪些项、哪些有证据、哪些未验证”表达。详见 `references/decision-and-readiness.md`。

## 5. 任务状态（核心 7 态 + 追踪字段）

`TODO → IN_PROGRESS → DONE → VERIFIED`，旁支 `BLOCKED`、`FAILED`、`SUPERSEDED`。

- `DONE`：执行助手完成实现、定向测试通过、已提交（必须有提交号，无文件变化写 `no_change_reason`）、**已推送并核对远程包含该提交**（有远程时脚本强制；没有远程只给提醒并要求尽快补推）。
- `VERIFIED`：测试助手确认（必须在测试台账有 PASS 记录）。
- 提交、推送、证据等细节写在 `execution` 字段，不再拆成更多状态。
- 依赖默认在前置任务 `DONE` 时即满足（可在 config 改为只认 `VERIFIED`）。
- 集成方式二选一，BOOTSTRAP 时写进 config：**主线模式**（`push_main:true`，单执行助手线性开发，默认推荐）——每卡直接推 main，下游立即可见；**分支模式**（`push_main:false`，多助手并行）——每卡推 `task/<ID>`，下游卡在前置提交合入 main 之前不就绪，由规划者/测试助手在阶段体检后或执行助手用 `pd.mjs sync --merge`（快进合并，不能快进就上报）合入。任务索引只在 main 上改状态，避免分支间冲突。

## 6. 测试分工与复用

- **执行助手**：每张卡只跑与改动直接相关的定向测试（卡面 `tests.targeted` 或就近单测）。不跑门禁、不跑全量、不跑阶段体检。
- **测试助手**：阶段结束做阶段体检（只覆盖本阶段改到的模块；前端含 tsc 和 build），共享契约变化时做集成验证，开发全部完成或发版前做一次全量回归。
- **复用规则**：每次测试登记到测试台账（命令、覆盖路径、基线提交、内容指纹、结果、证据）。下次测试前运行 `pd.mjs test-plan`：覆盖路径内容和关联决策都没变的 PASS 结果**原则上不重测**；指纹变化、从未测过、上次失败的才测。
- 不得用 grep 源码冒充行为测试；未执行的测试不得写成通过。

详见 `references/testing-and-reuse.md`。

## 7. 各模式要点

**BOOTSTRAP**：先跑 `pd.mjs scan`（不需要配置），只读盘点仓库、规则、文档、规划、决策、测试入口 → 列出现有权威来源与冲突 → 给出最小映射（config.json + 旧编号映射）→ 确认后写入 → `pd.mjs health`。旧项目的 Markdown 表格任务索引/决策台账**不强制迁移**：在 config 的 `formats` 里映射列名和中文状态，脚本只改目标状态单元格。

**DISCUSS**：先读已有需求和决策；按相关性覆盖需求、前端、后端、数据、交互、逻辑、组件复用、扩展、性能、配置、知识库、响应、存储、资源、安全、测试、部署（不相关的写一句理由）；区分事实/推断/假设；重要方案做正反论证；一次只问一个确实要用户决定的问题；用户一确认就 RECORD，不等讨论结束。结束时用“讨论完成条件”判断能否进入规划（`references/decision-and-readiness.md`）。

有多个可行方案时按 `references/solution-review.md` 打分，结果写成 DEC 决策。

**RECORD**：分配/复用稳定 ID（全项目唯一，如 `DEC-0042`），写决策文件和登记册，关联受影响任务，核验写入，回报路径和编号。头脑风暴是 `PROPOSED`，不是 `DECIDED`。推翻旧决策用 `superseded_by`，不静默覆盖。

**PLAN**（规划者）：
1. 快照：仓库、分支、HEAD、工作区、需求/决策来源、实际代码与测试证据。执行方自述不算完成证明。
2. 覆盖范围内**全部**已确认剩余工作；每项要么有任务，要么登记为延期/未决。
2.5 **STRUCTURE（架构师视角设计项目结构）**：需求拆解与关键 DEC 之后、冻结契约和写卡之前，按 `references/project-structure.md` 定档位与栈适配，走 16 个核心维度 + 安全、测试 2 个横切项（含后台任务：standard 为 api 第二入口，full 才拆 worker），产出 `docs/architecture/project-structure.md`（树 + 所有权 + 依赖规则，模板 `templates/project-structure.md`）、栈/分层 DEC、config `paths.project_structure`（涉及时 `contracts`/`migrations`），并把 ★ 骨架（必须存在，空则 `.gitkeep`）、`.gitignore`（拦 `.env*` 与数据导出）、守卫与第一条垂直切片并入首刀 `T000-01`。已有项目先探测真实入口、沿用已有 ADR/结构文档（config 指向），只映射现状、出增量迁移卡，绝不批量搬家；小需求快速通道跳过。
3. 每张卡：稳定 ID、阶段、角色、来源（E1）、目标、依赖、允许/禁止路径、**可机器判定的验收**（command/measure/manual+证据）、定向测试、风险、`detail`。
4. 不确定的卡写清目标、不变量、验收、前提和分支触发条件，步骤标 `REFINE_BEFORE_EXECUTION`。性能/探索类卡必须写**继续条件与停止条件**。
5. 依赖 DAG、并行组、关键路径、共享文件和迁移串行规则；并行要有收益才并行。
6. 每个阶段末尾排一张 `role: tester` 的阶段体检卡；全部完成后排最终回归卡。
7. `pd.mjs health` 通过后才报告规划完成；记录 `plan_version` 和基线提交。不改业务代码，不自动开工。

**EXECUTE**（执行助手）：读卡及其引用的决策/契约 → `git fetch` 核对分支/HEAD/前置任务真实状态 → **开工前自评**（准则 11、12）→ 就绪门 → 按任务类型读 `references/execution-playbooks.md`（后端/API、业务逻辑、数据与迁移、交互、前端、集成与异步、性能）→ 简短执行计划 → 实现（不越界、不降标准）→ 定向测试 → 本卡单独提交 → **推送并核对同步**（`pd.mjs sync . --task <ID> --push`：远程确实包含本提交才记 PUSHED，失败记 PUSH_FAILED 并停下）→ `record DONE`，留痕改动再提交并再 sync，保证双端一致 → `pd.mjs next` 输出下一张就绪卡的提示词 → 停止，不自动开下一张（除非用户要求连续执行）。推送和同步是完成的必要步骤，不是可选项。

**VALIDATE / PHASE_REVIEW / FINAL_REGRESSION**（测试助手）：先 `pd.mjs test-plan` → 只测需要测的 → 逐条验收输出 PASS/FAIL/UNKNOWN → `pd.mjs test-record` 登记 → 通过的卡改 VERIFIED；失败的写缺陷交规划者排修复卡。不顺手改业务代码。阶段体检不替代最终回归。

**REPLAN**（规划者，主动）：规划者每次进入会话、每个阶段体检结束、收到 BLOCKED/FAIL 时，**先跑 `pd.mjs replan-check .`**，它会列出：阶段完成未体检、体检完成未复盘、待裁决的阻塞、失败卡、测试 FAIL 未处理、决策被替代或缺失、依赖已被替代、规划基线过旧、流水线停摆，并直接生成规划者提示词。规划者主动处理，不等用户提醒；复盘结果追加到任务索引 `replans[]`。触发 = 阶段体检完成、测试助手报缺陷、执行助手上报 BLOCKING、实测推翻假设、用户改范围。只改受影响的卡：保留 ID，`SUPERSEDED` + `superseded_by` 表达替换，记录变更原因和证据，`plan_version` 递增（R1→R2），`pd.mjs health` 通过。只有目标/边界实质变化才全局重建。

**STATUS**：用 `pd.mjs status` 和 Git 事实汇报；区分已完成、测试确认、阻塞、待裁决。不按编号顺序或自述推断。

## 7.1 借力其他 Skills（装了就用，没装就按本 Skill 内置步骤，绝不因缺失而阻塞）

| 阶段 / 任务类型 | 优先调用（若已安装） |
|---|---|
| DISCUSS | superpowers `brainstorming`；高风险决策叠加本 Skill 深度推理协议 |
| RECORD / 需求变更 | OpenSpec 变更提案（ADDED/MODIFIED/REMOVED + Given/When/Then），编号仍用本 Skill 的 DEC/任务 ID |
| PLAN | superpowers `writing-plans`、planning-with-files、GSD 的上下文/状态思路；文档协作用 `doc-coauthoring` |
| EXECUTE 通用 | superpowers `executing-plans`、`test-driven-development`、`systematic-debugging`；收尾 `code-simplifier` |
| EXECUTE 前端/UI | `frontend-design`、`ui-ux-pro-max`、`web-design-guidelines` |
| EXECUTE 视频 | Remotion、HyperFrames |
| VALIDATE / PHASE_REVIEW | `verification-before-completion`、Code Review（置信度过滤）、`webapp-testing` |

**缺了就让 IDE/CLI 自己装**：开工时跑 `pd.mjs skills .`，它按 `templates/skills-registry.json` 检测本机是否已安装，缺失项直接给出官方 GitHub 仓库地址和 Claude Code / 其他 CLI 的安装命令。只从登记的官方仓库安装；工具策略要求时先征得用户一次同意；安装失败不阻塞主任务，按本 Skill 内置步骤继续并在日志记一笔。

外部 Skill 只提供方法；流程、状态、编号、留痕位置以本 Skill 为准，冲突时本 Skill 优先（例如外部要求每卡全量验证 → 降为定向测试，全量交测试助手）。详见 `references/skill-ecosystem.md`。

## 8. Git 与交接

- 每个写入助手用独立 clone 或 worktree；开工前和推送前 `fetch + rebase`；禁止 force push。
- 一张卡一个提交（信息含任务 ID）；提交成功和推送成功分开记录；无改动不建空提交。
- 认证由本机 Git Credential Manager / gh 一次性配置，代理由本机 `git config http.proxy` 或环境变量一次性配置；之后任何 AI 工具都直接用，**不需要每次把 PAT、代理端口发给 AI**，也不得写入文件、日志、提示词或远程 URL（脚本会扫描拦截）。见 `references/execution-and-git.md`。
- 下一任务提示词由 `pd.mjs next/prompt` 从权威任务卡生成，是任务卡的“视图”而不是第二份事实；只有任务书不够或前提变化时才请规划者细化。自动化分级见 `references/automation-levels.md`。

## 9. 汇报方式

先用大白话说结论（做完了什么、卡在哪、要你决定什么），再附可核查的痕迹：文件路径、编号、提交号、命令和结果。没核验的不说“全部完成”。

## 10. 参考与工具

- `references/roles-and-handoff.md` 角色、裁决链、交接
- `references/decision-and-readiness.md` 证据等级、完整度矩阵、就绪门、讨论完成条件
- `references/source-of-truth-and-layout.md` 权威路径、ID 规则、旧项目映射
- `references/planning-and-task-contract.md` 任务卡字段、验收写法、性能卡模板
- `references/testing-and-reuse.md` 测试分层、台账、指纹复用
- `references/execution-and-git.md` 分支、提交、凭据、代理
- `references/automation-levels.md` L1/L2/L3 自动化边界
- `references/tool-compatibility.md` Claude Code / Codex / DeepSeek 等适配
- `references/execution-playbooks.md` 执行手册：开工前自评、收尾（测试→提交→推送→同步→留痕）、七类任务的实现规范
- `references/config-reference.md` config.json 字段与易猜错的约定
- `references/planner-protocol.md` 规划协议、契约冻结、切片、深度推理触发条件
- `references/solution-review.md` 多方案评审、打分、反模式
- `references/doc-system.md` 文档体系（最小 / 标准 / 完整三级）
- `references/project-structure.md` 项目结构设计：分层、依赖方向、16+2 维度、栈适配、后台任务、守卫清单、STRUCTURE 步骤（模板 `templates/project-structure.md`）
- `references/skill-ecosystem.md` 外部 Skill 路由表
- `templates/` 配置、索引、决策、任务卡、阶段计划、AGENTS 片段
- `scripts/pd.mjs`（scan / health / next / sync / replan-check / ask-check / skills / prompt / record / test-plan / test-record / status），`scripts/self-test.mjs`
