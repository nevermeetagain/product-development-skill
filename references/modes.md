# 各模式要点（自 SKILL.md v0.5.1 §7 下沉，v0.6.0）

> 本文件由 SKILL.md 引用；内容与 v0.5.1 §7 一致，仅移动位置。每条服务的信条见 SKILL.md §0。

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

**EXECUTE**（执行助手）：读卡及其引用的决策/契约 → `git fetch` 核对分支/HEAD/前置任务真实状态 → **开工前自评**（准则 11、12）→ 就绪门 → 按任务类型读 `references/execution-playbooks.md`（后端/API、业务逻辑、数据与迁移、交互、前端、集成与异步、性能），通用编码纪律与修 bug 顺序读 `references/engineering-discipline.md` → 简短执行计划 → 实现（不越界、不降标准）→ 定向测试 → 本卡单独提交 → **推送并核对同步**（`pd.mjs sync . --task <ID> --push`：远程确实包含本提交才记 PUSHED，失败记 PUSH_FAILED 并停下）→ `record DONE`，留痕改动再提交并再 sync，保证双端一致 → `pd.mjs next` 输出下一张就绪卡的提示词 → 停止，不自动开下一张（除非用户要求连续执行）。推送和同步是完成的必要步骤，不是可选项。

**VALIDATE / PHASE_REVIEW / FINAL_REGRESSION**（测试助手）：先 `pd.mjs test-plan` → 只测需要测的 → 逐条验收输出 PASS/FAIL/UNKNOWN → `pd.mjs test-record` 登记 → 通过的卡改 VERIFIED；失败的写缺陷交规划者排修复卡。不顺手改业务代码。阶段体检不替代最终回归。

**REPLAN**（规划者，主动）：规划者每次进入会话、每个阶段体检结束、收到 BLOCKED/FAIL 时，**先跑 `pd.mjs replan-check .`**，它会列出：阶段完成未体检、体检完成未复盘、待裁决的阻塞、失败卡、测试 FAIL 未处理、决策被替代或缺失、依赖已被替代、规划基线过旧、流水线停摆，并直接生成规划者提示词。规划者主动处理，不等用户提醒；复盘结果追加到任务索引 `replans[]`。触发 = 阶段体检完成、测试助手报缺陷、执行助手上报 BLOCKING、实测推翻假设、用户改范围。只改受影响的卡：保留 ID，`SUPERSEDED` + `superseded_by` 表达替换，记录变更原因和证据，`plan_version` 递增（R1→R2），`pd.mjs health` 通过。只有目标/边界实质变化才全局重建。

**STATUS**：用 `pd.mjs status` 和 Git 事实汇报；区分已完成、测试确认、阻塞、待裁决。不按编号顺序或自述推断。
