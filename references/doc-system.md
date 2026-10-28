# 项目文档体系（doc-system）

文档的作用：让任何新成员或 AI 助手**不依赖聊天记录和个人记忆**，就能回答：项目为什么存在、现在有哪些正式需求、为什么这样做、当前在做什么、做完的证据在哪、下一步是什么。
文档只在服务于“定义目标 / 定义需求 / 记录决策 / 描述方案 / 计划 / 驱动执行 / 验证 / 保存历史 / 沉淀知识”之一时才存在。**文件数量服从项目复杂度，不服从模板；不创建空文档。**

## 1. 五条原则
1. **单一事实源**：每类事实只有一个权威位置，其他地方只引用 ID，不复制正文。
2. **按信息类型组织**，不按阶段组织（开发是循环的：需求→方案→计划→执行→验证→反馈→再计划）。
3. **可双向追溯**：从需求能找到任务和证据，从任务能找回需求和目标。
4. **历史不覆盖**：只用 `SUPERSEDED / REJECTED / CANCELLED / ARCHIVED` 表达失效，不删除、不改旧结论。
5. **当前状态与历史分离**：当前基线回答“现在是什么”，历史文件回答“为什么变成这样”。

## 2. 文档类型与唯一权威位置
左列是信息类型，右列是**本技能**中的权威位置（实际路径以 `.product-development/config.json` 的 `paths` 为准；“可选”项按 §5 分级启用，启用后在 config 增加对应键）。

| 信息 | 回答的问题 | 权威位置（config 键 → 默认路径） | ID |
|---|---|---|---|
| 规则 | 硬边界、所有权、禁止项、完成定义 | `rules` → `AGENTS.md` | — |
| 路径映射 | 每类文件在哪 | `.product-development/config.json` | — |
| 项目定义 | 为什么做、用户、范围、非目标、成功指标 | 可选 `product` → `docs/product.md` | — |
| 需求入口 | 原始需求原话 | 可选 `requirements_inbox` → `docs/requirements/inbox/` | `REQ-INBOX-YYYYMMDD-NNN` |
| 正式需求 | 做什么、验收条件 | 可选 `requirements` → `docs/requirements/`（标准级可合并为一个 `requirements.md`） | `REQ-F-NNN` 功能 / `REQ-NF-NNN` 非功能 / `REQ-C-NNN` 约束 |
| 需求基线 | 当前有效需求清单（不含历史） | 同上目录下 `baseline.md`，或 master_plan 的“需求基线”节 | — |
| 决策 | 为什么这样做、考虑过什么 | `decision_index` + `decision_dir` → `docs/decisions/` | `DEC-NNNN`（ADR 也用此编号；已有 ADR 系列则用 `decision_sources` 收编，沿用原编号） |
| 方案 | 某需求具体怎么实现 | 可选 `solutions` → `docs/solutions/` | `SOL-NNN` |
| 契约 | 接口/错误/身份/数据/事件载荷等共享约定 | 可选 `contracts` → 项目选定的唯一源目录（如 `packages/contracts`） | 按契约源格式 |
| 项目结构 | 目录、所有权、依赖规则 | 可选 `project_structure` → `docs/architecture/project-structure.md`（已有结构/基线文档则指向它） | `ARCH-STRUCTURE` |
| 迁移 | 数据库 schema 演进 | 可选 `migrations` → 如 `apps/api/prisma/migrations`（无持久 schema 不设） | 迁移版本号 |
| 总体计划 | 阶段、切片、快照、DAG、当前进度 | `master_plan` → `docs/plan/master-plan.md` | `PLAN-R<n>` |
| 任务 | 状态与卡面 | `task_index` + `task_cards` → `docs/plan/task-index.json` + `tasks/` | `<阶段>-<序号>`（如 `T140-30`） |
| 执行日志 | 每卡发生了什么 | `run_logs` → `docs/plan/runs/<ID>.jsonl` | — |
| 验证结果 | 是否真的满足要求 | `test_ledger` → `docs/evidence/test-ledger.json` | `TR-<时间戳>-<目标>` |
| 证据 | 用什么证明 | `evidence` → `docs/evidence/<ID>/` | 按任务 ID 或 TR ID 建目录 |
| 发布与变更 | 发布了什么、已知问题 | 可选 `changelog` → `CHANGELOG.md`；完整级 `releases` → `docs/releases/` | `REL-NNN` |
| 术语 | 同一概念唯一名字 | 可选 `glossary` → `docs/glossary.md` | — |
| 风险/假设/依赖 | 可能出什么事 / 暂认为成立 / 依赖谁 | 标准级写在 master_plan 对应节；完整级 `docs/registers/` | `RISK-` / `ASM-` / `DEP-` |
| 知识沉淀 | 复盘、经验、失败教训 | 可选 `knowledge` → `docs/knowledge/` | `RET-NNN` |
| 文档地图 | 目录结构与文档关系 | 可选 `project_map` → `docs/project-map.md` | — |
| 提示词视图 | 下发给助手的启动提示 | `prompts` → `.product-development/prompts/` | 由 `pd.mjs` 生成，不是事实源 |

**容易混淆的边界**：
- **决策 vs 方案**：决策回答“为什么选这个、放弃了什么”；方案回答“这个需求怎么实现、拆成哪些工作包”。两者互相引用，不合并。
- **需求 vs 待办**：待办只放 ID、标题、优先级、状态、来源，不放需求正文。本技能中任务索引兼任待办；未排期的需求在需求基线里标 `BACKLOG / ICEBOX`。
- **路线图 vs 当前计划**：路线图只写阶段目标，不写“改某文件”；文件级内容属于任务卡。
- **工作包 vs 任务 vs 步骤**：WP 是一组共享验收目标的任务；Task 是最小可独立验证的交付；Step 是做法。任务 ≤ 5 张的交付不必建 WP。
- **风险 vs 假设 vs 依赖**：“第三方 API 可能限流” / “当前配额够用” / “依赖该 API 可用”，三者分开写。
- **任务完成 vs 验证 vs 证据**：做了什么（任务 `DONE`）/ 是否真的满足（台账 PASS → `VERIFIED`）/ 用什么证明（证据目录）。
- **会议与聊天记录**不是事实源：其中的决定必须当轮落成 DEC 或需求条目。
- **AI 分析产物**（评审草稿、长篇推理）不写进正式需求/决策目录，放 `.ai-analysis/` 或任务证据目录；只有经裁决的结论进入 DEC，防止“AI 写入 → AI 读到 → 当成正式设计”的自证循环。
- **README** 只做入口与概览，不兼任需求、计划、任务板、发布说明。

## 3. ID 与元数据
- ID 稳定：不随标题、阶段、版本变化而改；下发后**永不改号、永不复用**。旧编号进 `legacy_ids`。
- 前缀表：`REQ-INBOX / REQ-F / REQ-NF / REQ-C / DEC / SOL / PLAN-R / WP / <阶段>-<序号> / TR / REL / RISK / ASM / DEP / RET / CR`（CR 仅完整级）。
- 文件名 = `ID[-短标题].md`；任务卡固定在 `tasks/` 下，**用状态字段表达进度，不靠移动文件**（路径稳定、引用稳定、Git 历史干净）。
- Markdown 正式文档用 front matter：
```yaml
---
id: REQ-F-012
type: requirement-feature   # requirement-* | decision | solution | plan | task | release | risk | assumption | knowledge
status: approved
created: 2026-10-28
updated: 2026-10-28
related: [DEC-0007, T140-30]
---
```
- JSON 索引（任务、决策、台账）本身就是元数据，字段定义见 `planning-and-task-contract.md`、`decision-and-readiness.md`、`testing-and-reuse.md`。

## 4. 索引与交叉链接
- **追溯链**（正式工作尽量完整，按分级可省略中间层）：
```text
REQ-INBOX → REQ-F/NF/C → DEC / SOL → PLAN-R → (WP) → 任务 → TR(台账) → 证据 → REL/CHANGELOG
```
- **链接方向**：下游引用上游，上游不手工维护下游清单（避免两处不一致）。
  任务 `requirements/decisions` → 需求、决策；决策 `applies_to` → 任务（决策是例外：需要知道影响面）；台账 `covers_tasks` → 任务；需求的“完成情况”由 `pd.mjs status` 反查生成，不手写。
- **入口**：AGENTS.md 指向 config.json；config.json 指向所有权威文件。完整级才单独维护 `project-map.md`（目录结构 + 文档关系 + 哪些核心文档已存在），它不存任何需求/任务/决策的内容。
- 引用用 ID + 相对路径，不复制对方正文。

## 5. 分级：按项目规模启用
| | 最小（个人/小工具，≤ 1 个执行助手） | 标准（默认；多助手并行） | 完整（多人/长期/高风险） |
|---|---|---|---|
| 规则 + config | 必需 | 必需 | 必需 |
| 项目定义 | master_plan 开头一段 | `product.md` | `product.md` + 成功指标 |
| 需求 | master_plan 的需求节（MUST/SHOULD/COULD/MUST NOT） | `requirements.md` 或 `requirements/` 分 F/NF/C | inbox + F/NF/C 分目录 + 基线 + 变更请求 CR |
| 决策 | 决策登记册 + DEC 文件 | 同左 | 同左 + 重新评估触发条件必填 |
| 方案 | 不建，写在 DEC | 满足 §6 条件时建 SOL | 同左 |
| 契约 | 不涉及可省 | 并行开发涉及的契约必需 | 全部适用契约 + 契约测试 |
| 项目结构 | 可省（树写在 master_plan） | `project-structure.md` | 同左 + project-map |
| 迁移目录 | 有持久 schema 才有 | 同左 | 同左 |
| 计划 + 任务 + 日志 | 必需 | 必需 | 必需（+ WP、里程碑） |
| 测试台账 + 证据 | 必需 | 必需 | 必需 + 发布前验收记录 |
| 风险/假设/依赖 | 不单列 | master_plan 对应节 | `registers/` 独立登记 |
| 术语表 | 可省 | 有共享契约时必需 | 必需 |
| 发布/变更 | CHANGELOG（可选） | CHANGELOG | `releases/` + CHANGELOG |
| 知识/复盘 | 可省 | 阶段结束一句经验（可写在 master_plan） | `knowledge/` + 复盘 |
| project-map | 不需要 | 不需要（config 即地图） | 需要 |

升级档位只新增文件，不搬迁已有文件；在 config 增加相应路径键即可。

## 6. 何时必须建方案文档（SOL）
任一成立：实现路径有多种需比较（同时产出 DEC）/ 跨模块或跨系统 / 预计拆出 > 3 张任务 / 交给 AI 助手执行且卡面装不下必要上下文。改文案、调样式等简单需求直接从需求到任务。

## 7. 生命周期与变更
- 通用状态：`draft → proposed → approved → active → superseded / archived`，旁支 `rejected / cancelled`。任务、决策沿用技能自己的状态集（任务 `TODO…VERIFIED`，决策 `PROPOSED…SUPERSEDED`）。
- 重大状态变化记录：旧状态、新状态、时间、原因、变更者（任务写在执行日志，决策写在 DEC 正文）。
- 失效文档原地置 `SUPERSEDED`/`ARCHIVED` 并保留原 ID；完整级可移入 `docs/archive/`，但需更新引用。
- **变更流程**（需求或方案变化时）：
```text
变更 → 影响分析（受影响的需求/决策/契约/任务清单）→ 更新需求基线 → 新 DEC（supersedes 旧的）
     → 更新方案/契约 → 规划者 REPLAN：受影响卡置 SUPERSEDED 或修订，plan_version+1 → 测试助手按指纹重测受影响部分
```
正式需求不得无记录地直接改写。
- **更新触发表**：需求变 → 需求、方案、计划、任务；方案变 → DEC、方案、契约、计划、任务；任务完成 → 任务状态、执行日志、证据（测试助手：台账）；发版 → CHANGELOG/REL；新增权威文件 → config.json（完整级加 project-map）。

## 8. 面向 AI 助手的要求
- 任务所需背景必须能从任务卡及其引用的 REQ/DEC/SOL/契约获得，不依赖隐含上下文。
- 执行前找不到任务的来源需求或决策、且无法从现有文档推出 → 标 `BLOCKED`，不猜。
- 完成时返回：做了什么、改了哪些文件、跑了什么验证、结果、证据路径、提交号；只说“完成了”不算。
- 不得擅自改变上层事实（需求、决策、范围、契约）；发现冲突 → 记录 → BLOCKED → 交规划者裁决。

## 9. 文档体检清单（规划者在 REPLAN 或阶段结束时跑，可由 `pd.mjs health` 部分自动化）
```text
[ ] 唯一性：同一需求/决策/任务状态没有出现在两处不同版本（只有一个登记册、一个索引、一个台账）
[ ] 追溯：每张任务有 E1 来源；每条 MUST 能找到任务或标为延期/未决
[ ] 一致性：需求 A → 方案 B → 任务 C → 代码 D 没有走样（抽查最近改动的卡）
[ ] 时效：任务状态与 Git 事实一致；DONE 卡都有提交号或 no_change_reason
[ ] 可验证：VERIFIED 卡在台账有 PASS 与证据路径
[ ] 历史：被推翻的决策是 SUPERSEDED 而不是被改写
[ ] 路径：config.json 列出的文件全部存在，无未登记的“第二份”索引
[ ] 秘密：任何文档、日志、提示词中没有令牌/密码；Git 未跟踪 .env 实值、*.dump、*_dump.sql 等数据导出
```
