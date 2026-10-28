# 变更记录

## 0.4.0（2026-10-28）

- 新增 `references/execution-playbooks.md`：开工前五项置信度自评、一次问完；固定收尾（定向测试→提交→推送→同步核对→留痕）；后端/API、业务逻辑、数据与迁移、交互、前端、集成与异步、性能七类执行手册。
- 规划者主动更新：`pd.mjs replan-check` 自动找出阶段完成未体检、体检完成未复盘、待裁决阻塞、失败卡、测试 FAIL、决策被替代/缺失、依赖被替代、基线过旧、流水线停摆，并生成规划者提示词；复盘写入 `replans[]`。
- 推送并同步成为完成的必要步骤：`pd.mjs sync --task <ID> --push`（fetch→必要时 rebase→push→核对远程包含本提交）；没真推送就写 PUSHED 会被拒绝；失败自动记 PUSH_FAILED。
- “讨论过的不再问”：`pd.mjs ask-check` 提问前检索决策登记册和任务卡，命中 DECIDED 返回退出码 5。
- 外部 Skill 自动安装：`templates/skills-registry.json`（21 项，均为已打开核实的官方仓库）+ `pd.mjs skills` 检测并输出安装命令，交给 IDE/CLI 自己装；失败不阻塞。
- 按 v0.3 评测修复：Markdown 决策台账读全部表格、支持多来源（总台账 + 本版待裁决清单），Aidean 上正确识别 7 条 Q-14 待裁决；前置未完成的卡不能标 DONE/VERIFIED；`record TEST_RUN --cmd --paths --result` 直接进测试台账供阶段体检复用；明确“代码提交 + 留痕提交”；示例去掉占位提交号并补 `test/run-all.js`；新增 `references/config-reference.md`；小需求快速通道。
- 按 v0.4 评测修复：ask-check 改为按命中比例判断、Markdown 台账只看本行，未决项明确提示等待裁决；有远程时未推送不能标 DONE；推送失败保留 git 报错原文，status 显示未同步卡；分支模式下游卡需前置提交合入 main，`sync --merge` 快进合并；`baseline_commit` 字段统一；replan-check 去重，产品类未决项归用户裁决；规则优先级、上报对象、模板不适用节直接删。
- 新增架构师级目录体系：`references/project-structure.md` + `templates/project-structure.md`（提炼自用户提供的《项目完整目录结构》《项目完整文档体系》），PLAN 增加 STRUCTURE 步：从需求、前端、后端、数据、交互、逻辑、组件、复用、拓展、性能、配置、知识库、响应、存储、资源 15 个维度做结构决策，登记到 config，第一刀 T000-01 建骨架与边界守卫；老项目只映射、增量迁移。
- 自测 52 项全过。

## 0.3.0（2026-10-28）

- 吸收用户的《项目规划指令》《多方案评审标准》《项目完整文档体系》《5W1H+钢人论证》：新增 `planner-protocol.md`、`solution-review.md`、`doc-system.md`，SKILL.md 新增十条准则（执行者测试、MUST 可验证、契约冻结、垂直切片、风险分级的深度推理、两次失败即停等）；删去与效率原则冲突的每卡门禁、凑方案和“100%”式表述。
- 新增外部 Skill 路由（superpowers、OpenSpec、GSD、planning-with-files、frontend-design、ui-ux-pro-max、web-design-guidelines、Remotion、HyperFrames、doc-coauthoring、code-simplifier、Code Review）：装了就用，没装不阻塞。
- 脚本 v0.3：`scan` 只读盘点；Markdown 表格任务索引/决策台账兼容（中文状态映射，只改目标单元格）；`prompt` 拒绝未就绪卡（exit 4）；`record` 校验事件白名单、真实提交、BLOCKED 结构化上报（needs/escalate/options/recommend）、`PUSH_FAILED`、`CORRECTION`；DONE 必须有提交或无变化理由，VERIFIED 必须有台账 PASS；参数缺值直接报错；ISO UTC 时间；`test-record` 支持 `--reused-from`（指纹变化拒绝复用），PASS 必须写实际命令；`test-plan` 排除测试卡本身、识别上次失败；决策不在登记册视为阻塞；health 校验提交真实存在、`superseded_by`、多目录 ADR。
- 自测扩充到 37 项；在 Aidean V0.14.0 真实索引上验证（16 卡 / 8 完成 / 1 阻塞 / 下一张 T140-05，与人工盘点一致）。

## 0.2.0（2026-10-28，Hark 测试优化版）
基于 0.1.0（ChatGPT 起草）、Claude 评审意见、用户补充要求和 Aidean/AideanThesis 实际执行教训。

新增
- 角色分工：规划者 / 执行助手 / **测试助手** / 用户；门禁、阶段体检、回归全部归测试助手（用户补充 1）。
- **测试台账 + 内容指纹复用**：`pd.mjs test-record` / `test-plan`，需求和代码未变的已通过测试原则上不重测（用户补充 2）。
- **规划者主动职责与裁决链**：执行/测试 → 规划者裁决（落决策登记册）→ 仅产品/安全/数据/契约类交用户（用户补充 3）。
- 留痕强化：执行日志 JSONL、决策 `decided_by`、`pd.mjs health` 校验 DONE 必须有提交、VERIFIED 必须有台账 PASS（用户补充 4）。
- 模式风险分级与切换告知（Claude 建议）；状态精简为 7 态 + execution 追踪字段（Claude 建议）。
- 任务 ID 永不改号、`legacy_ids`；跨版本**单一决策登记册**（来自 Aidean 多套编号的教训）。
- 验收必须可判定（command / measure / manual+证据）；grep 源码冒充测试会被提醒（来自外部助手 17 卡复核教训）。
- 性能/探索卡的继续条件与停止条件模板（来自 T140-30）。
- 秘密扫描：PAT/Key 写进任务卡、日志、索引会被拦截。
- 大白话汇报（`pd.mjs status`）。

变更
- 脚本合并为单一 CLI `scripts/pd.mjs`（health / next / prompt / record / test-plan / test-record / status），零依赖，Node 18+。
- 0.1.0 README 引用但未随附的 references/templates/scripts 全部补齐。
