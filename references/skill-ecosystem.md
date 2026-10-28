# 外部 Skill 生态与路由（skill-ecosystem）

> 调研日期 2026-10-28。下列 URL 均为实际打开过的页面；未打开的不列。仓库会迁移，安装名以对方 README 为准。

## 0. 总规则：可选增强，绝不阻塞

1. **装了就用，没装就按本 Skill 内置等价做法执行；绝不因缺少可选 Skill 而停工、提问或要求用户去安装。** 代理可按 §6 自行安装，失败即回退内置做法。
2. 外部 Skill 只是"怎么做得更好"的方法库；**流程、状态、ID、权威文件永远归本 Skill**。外部 Skill 产出的计划/记录必须回写到本 Skill 的权威位置（任务卡、决策登记册、测试台账、执行日志），不得另起平行文件体系。
3. 外部 Skill 的规则与本 Skill 冲突时，**以本 Skill 为准**（见 §3 冲突表）。
4. 调用前用一句话说明"本步借用 X 的做法"；没装就静默走内置做法，不需要解释。
5. 判断是否已安装：看当前工具的可用 skills 列表 / `.claude/skills`、`.agents/skills`、插件列表。查不到即视为未安装。

## 1. 路由表（阶段/任务类型 → 外部 Skill）

| 阶段 | 任务类型 | 推荐外部 Skill（装了才用） | 何时调用 | 本 Skill 仍负责 |
|---|---|---|---|---|
| DISCUSS | 通用功能 | superpowers `brainstorming` | 需求模糊、需要追问意图并复述确认 | 提问前先查决策登记册；结论进 RECORD |
| DISCUSS | 探索方案 | OpenSpec `/opsx:explore` 的思路 | 不确定怎么做、需读代码比较方案 | 不写代码；方案取舍交用户/规划者 |
| DISCUSS / RECORD | 文档、PRD、设计文档 | Anthropic `doc-coauthoring` | 写规格/决策文档/提案 | 文档落到 config.paths 指定位置；决策编号 |
| DISCUSS / PLAN | 前端视觉方向 | Anthropic `frontend-design`、`ui-ux-pro-max` | 新 UI 或改版，需要配色/字体/版式体系 | 设计系统文件路径写进任务卡；视觉取舍记为决策 |
| RECORD | 变更提案 | OpenSpec 变更文件夹/delta 格式 | 改动现有行为、需说明 ADDED/MODIFIED/REMOVED | 决策 ID、登记册唯一性 |
| PLAN | 通用 | superpowers `writing-plans`；GSD discuss→plan | 拆卡：每卡含文件路径、验证方式 | 稳定任务 ID、任务索引、依赖、卡数确认 |
| PLAN | 长任务/跨会话 | planning-with-files（task_plan/findings/progress） | 单卡跨多次会话、易丢上下文 | 计划文件必须在仓库内（不可 gitignore），映射到本 Skill 路径 |
| EXECUTE | 通用 | superpowers `executing-plans` / `subagent-driven-development` | 多卡顺序或并行执行 | 一卡一分支/提交；只跑定向测试；写执行日志 |
| EXECUTE | 逻辑/算法/修 bug | superpowers `test-driven-development` | 行为可单测的卡 | 只跑与改动相关的测试，不跑全量 |
| EXECUTE | 疑难缺陷 | superpowers `systematic-debugging` | 失败原因不明、修了又坏 | 根因与尝试记入执行日志；越权问题交规划者裁决 |
| EXECUTE | 前端实现 | `frontend-design`、`ui-ux-pro-max` | 写 UI 代码 | 前端卡结束跑 tsc + build（阶段体检时） |
| EXECUTE | 视频（React） | Remotion `remotion-best-practices` 等 | 项目用 Remotion | 渲染产物路径与验证写回任务卡 |
| EXECUTE | 视频（HTML） | HyperFrames `/hyperframes` 等 | HTML→MP4、动效、字幕 | 同上；lint/preview/render 结果作为 E3 证据 |
| EXECUTE（收尾） | 代码整理 | Anthropic `code-simplifier` | 本卡改动完成、行为不变的整理 | 只动本卡改过的代码；整理后仍跑定向测试 |
| VALIDATE | Web 应用 | Anthropic `webapp-testing`（Playwright） | 测试助手做 UI 冒烟/截图/日志 | 结果进测试台账（含指纹）；缺陷回规划者排卡 |
| VALIDATE | UI 规范审查 | Vercel `web-design-guidelines` | 可访问性/交互规范审查 | 发现按 `file:line` 记为缺陷，不直接改业务码 |
| VALIDATE | 声明完成前 | superpowers `verification-before-completion` | 任何"已完成/已通过"声明前 | E1/E2/E3 证据链；状态写回任务索引 |
| PHASE_REVIEW | 代码审查 | superpowers `requesting-code-review`；Anthropic `code-review` 插件 | 一批卡/一个阶段结束 | 只审本阶段改到的模块；问题分级、排卡 |
| REPLAN | 通用 | GSD verify→生成修复计划；OpenSpec 更新 proposal/design | 证据推翻范围/依赖/假设 | 影响清单；不改号；旧号进 legacy_ids |
| 元 | 维护本 Skill | Anthropic `skill-creator` | 修改/评测本 Skill 本身 | 版本号与 CHANGELOG |

不在表内的任务类型：直接用本 Skill 内置流程。

## 2. 各 Skill 速查

| Skill | 一句话 | 打开过的 URL | 安装名/方式 | 阶段 |
|---|---|---|---|---|
| superpowers（obra） | 自动触发的开发方法论：brainstorming→worktree→writing-plans→subagent/executing→TDD→code review→finish | https://github.com/obra/superpowers | Claude Code：`/plugin install superpowers@claude-plugins-official` | DISCUSS–PHASE_REVIEW 全程 |
| · brainstorming | 先追问意图、分块复述，大项目产出设计文档 | 同上（README） | 随 superpowers | DISCUSS |
| · writing-plans | 拆成 2–5 分钟小任务，含精确路径、代码、验证步骤 | 同上 | 随 superpowers | PLAN |
| · executing-plans | 单会话内联执行全部任务，最后整体复审 | 同上 | 随 superpowers | EXECUTE |
| · subagent-driven-development | 每任务派新子代理，两段式复审（合规→质量） | 同上 | 随 superpowers | EXECUTE |
| · test-driven-development | 强制 RED-GREEN-REFACTOR，删掉先于测试写的代码 | 同上 | 随 superpowers | EXECUTE |
| · systematic-debugging | 四阶段根因分析（溯源、纵深防御、条件等待） | 同上 | 随 superpowers | EXECUTE |
| · requesting-code-review | 按计划审查，按严重度报告，Critical 阻塞 | 同上 | 随 superpowers | PHASE_REVIEW |
| · verification-before-completion | "无新鲜验证证据不得声称完成"：识别命令→运行→读输出→再下结论 | https://raw.githubusercontent.com/obra/superpowers/main/skills/verification-before-completion/SKILL.md | 随 superpowers | VALIDATE |
| OpenSpec（Fission-AI） | 轻量规格驱动：specs/ 为真相源，changes/ 内含 proposal/specs delta/design/tasks，归档时合并 | https://github.com/Fission-AI/OpenSpec ；https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/concepts.md | `npm i -g @fission-ai/openspec` 后 `openspec init`；命令 `/opsx:explore\|propose\|apply\|archive` | DISCUSS/RECORD/PLAN/REPLAN |
| GSD（TÂCHES） | 上下文工程 + 阶段循环 Discuss→Plan→Execute→Verify→Ship；重活放新上下文子代理，STATE.md/CONTEXT.md 跨会话 | https://github.com/glittercowboy/get-shit-done（已归档，跳转）→ https://raw.githubusercontent.com/open-gsd/gsd-core/main/README.md | `npx @opengsd/gsd-core@latest`；`/gsd-new-project`、`/gsd-onboard` | 全阶段 |
| gsd-2 → GSD Pi | 本地 CLI 编码代理：里程碑/切片/任务、worktree 隔离、`.gsd/` 存需求/决策/验证证据 | https://raw.githubusercontent.com/gsd-build/gsd-2/main/README.md（已迁移）→ https://raw.githubusercontent.com/open-gsd/gsd-pi/main/README.md | `npx @opengsd/gsd-pi@latest`，命令 `gsd` | PLAN/EXECUTE/VALIDATE（独立工具，非 skill） |
| planning-with-files（OthmanAdi） | 磁盘三文件 task_plan.md/findings.md/progress.md + hooks 每轮重注入，抗 /clear 与上下文腐烂 | https://github.com/OthmanAdi/planning-with-files | `npx skills add OthmanAdi/planning-with-files --skill planning-with-files -g`（中文版 `planning-with-files-zh`） | PLAN/EXECUTE |
| frontend-design（Anthropic） | 有主见的视觉设计：先出 token 方案（色/字/版式/原则），对照"AI 模板味"清单自审再写码 | https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md | `/plugin marketplace add anthropics/skills` → `example-skills` | DISCUSS/EXECUTE（前端） |
| doc-coauthoring（Anthropic） | 三段式写文档：收集上下文→逐节头脑风暴/起草→用无上下文子代理做"读者测试" | https://raw.githubusercontent.com/anthropics/skills/main/skills/doc-coauthoring/SKILL.md | 同上 | DISCUSS/RECORD（文档） |
| webapp-testing（Anthropic） | Python Playwright 测本地 Web 应用；with_server.py 管服务；先侦察 DOM 再操作 | https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md | 同上 | VALIDATE（前端） |
| skill-creator（Anthropic） | 起草→测试提示词→有/无 skill 对照评测→迭代；优化 description 触发率 | https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md | 同上 | 元（维护本 Skill） |
| code-simplifier（Anthropic） | 行为不变前提下简化"最近修改的代码"，避免嵌套三元、过度压缩 | https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/code-simplifier/agents/code-simplifier.md | claude-plugins-official 市场插件 `code-simplifier` | EXECUTE 收尾 |
| code-review 插件（Anthropic） | `/code-review`：4 个并行代理（2×规范合规、bug、git 历史），0–100 置信度打分，<80 过滤 | https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/code-review/README.md | claude-plugins-official 市场插件 `code-review`；需 `gh` | PHASE_REVIEW |
| ui-ux-pro-max | 设计系统生成器：按产品类型推理出版式/风格/配色/字体/反模式/交付前清单；可持久化 MASTER.md + 页面覆盖 | https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/README.md | `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` 或 `npx ui-ux-pro-max-cli init --ai claude` | DISCUSS/PLAN/EXECUTE（前端） |
| web-design-guidelines（Vercel） | 拉取最新 Web Interface Guidelines，审查文件并以 `file:line` 输出 | https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md | `npx skills add vercel-labs/agent-skills`（选 web-design-guidelines） | VALIDATE/PHASE_REVIEW（前端） |
| Remotion skills | Remotion（React 视频）最佳实践：create/markup/studio/render/captions/maps 等 | https://raw.githubusercontent.com/remotion-dev/skills/main/README.md | `npx skills add remotion-dev/skills` | EXECUTE（视频） |
| HyperFrames（HeyGen） | HTML+CSS+可寻址动画确定性渲染 MP4；skill 教规划→写 HTML→lint→预览→渲染 | https://github.com/heygen-com/hyperframes | `npx hyperframes skills update`（核心集）或 `claude plugin install hyperframes@hyperframes`；需 Node 22+、FFmpeg | EXECUTE/VALIDATE（视频） |

注：superpowers 子技能除 verification-before-completion 外，描述来自主 README，未逐个打开 SKILL.md。

## 3. 冲突与取舍（以本 Skill 规则为准）

| 外部做法 | 冲突点 | 本 Skill 处理 |
|---|---|---|
| superpowers `verification-before-completion` 要求"运行完整命令" | 执行助手只跑定向测试 | 借用"证据先于结论"，但**证据范围 = 本卡定向测试 + 构建**；全量回归归测试助手/发版前 |
| superpowers TDD "删掉先于测试写的代码"、using-git-worktrees "验证干净测试基线" | 不设门禁、不跑全量 | 只对可单测逻辑卡建议先写测试；不删代码、不跑全量基线 |
| superpowers `requesting-code-review` "Critical 阻塞进度"；subagent-driven 每任务后复审 | 不逐卡停等复核 | 复审放到 PHASE_REVIEW 批量做；Critical 问题由规划者排修复卡，不阻塞其他卡 |
| finishing-a-development-branch "验证测试后再合并" | 门禁归测试助手 | 执行助手只推任务分支；合并前验证由测试助手做 |
| planning-with-files 计划文件默认 gitignore、任务完成后被覆盖；Stop gate 拦截停止 | 计划必须持久化在仓库、ID 稳定 | 三文件只作单卡工作草稿；结论回写任务卡/执行日志；不启用 gated 模式 |
| OpenSpec 按 kebab-case 名称命名变更、归档时移动目录 | 稳定 ID、不搬家 | 变更文件夹名前缀带任务/决策 ID；归档只改状态，不改号 |
| GSD/GSD Pi 自带 `.gsd/`、STATE.md 等状态文件 | 每类事实唯一权威位置 | 若已在用，BOOTSTRAP 时映射为权威路径；不并存两套 |
| ub-mode：CRAP<10、重复≥0.8 必须消除、变异幸存者必须杀死；“最后推到主线”；自行回收磁盘 | 不设门禁/硬阈值；团队项目推前需人看；删除需确认 | 度量降为阶段体检的可选信号（`quality_signal`）；推送沿用分支/主线模式配置；清理只提议。未登记为可自动安装的外部 Skill（规则与本 Skill 冲突），其可用做法已改写进 `engineering-discipline.md` |
| code-review 插件默认 `--comment` 可发 PR 评论 | 对外发布需确认 | 默认只输出到终端/台账；发评论前确认 |
| frontend-design / ui-ux-pro-max 自带设计判断 | 产品方向归用户 | 视觉方向有多选时记为决策；用户已定的照做 |

## 4. 值得借鉴、并入本 Skill 的做法

1. **变更提案 + delta（OpenSpec）**：对已上线行为的修改，在任务卡/决策中写 `ADDED / MODIFIED（注明 Previously）/ REMOVED` 三段，需求用 SHALL/MUST + Given/When/Then 场景。规格只写可观察行为，实现细节放 design/任务卡。默认"轻量规格"，跨模块/契约/迁移/安全才用完整规格。→ 并入 RECORD/PLAN。
2. **证据先于声明（superpowers verification）**：任何"已完成/已修复/已通过"前，必须在本轮运行对应命令并读取输出；对子代理/执行助手的"成功"报告要用 `git diff`/提交核验。把"应该可以""看起来对"列为红旗词。→ 强化底线 1 的 E2/E3，范围受 §3 第一行约束。
3. **新鲜上下文子代理 + 主会话保持精简（GSD）**：规划者只持有任务索引与决策摘要；每张卡交给新会话执行，提示词自包含（卡、相关决策、契约、定向测试命令）。计划要能装进一个新上下文窗口。→ 并入 EXECUTE 提示词生成（pd.mjs）。
4. **跨会话状态文件（GSD STATE.md / planning-with-files progress.md）**：维护一个简短的"当前状态"视图（当前阶段、进行中卡、阻塞、下一步），每次会话开始先读、结束先写。由任务索引 + 执行日志生成，不另存事实。→ 并入 STATUS。
5. **2 动作规则与错误留痕（planning-with-files）**：每做 2 次查看/搜索就把发现写进执行日志；所有错误和失败尝试都记录，禁止重复同一失败做法。→ 并入执行日志规范。
6. **置信度过滤的审查（code-review 插件）**：PHASE_REVIEW 中每个问题打 0–100 置信度，<80 不上报；排除既有问题、lint 能抓的、吹毛求疵的。→ 降低规划者裁决噪音。
7. **读者测试（doc-coauthoring）**：重要规格/交接文档完成后，用无上下文子代理提 5–10 个读者问题检验可理解性，暴露隐含假设。→ 并入 PLAN 完成前自检（可选）。
8. **两段式复审：先合规后质量（superpowers subagent-driven）**：阶段体检先查"是否满足任务卡验收标准"，再查代码质量；收尾可用 code-simplifier 只整理本阶段改动。→ 并入 PHASE_REVIEW 顺序。
9. **先跑通再做对 + 确定性度量（ub-mode）**：修 bug 先复现、测试空实现检验、重构三步、先减后加；crapper/dryer/mutator 的 `--changed` 结果作阶段体检信号。→ 并入 `engineering-discipline.md`。

## 5. 内置等价做法（未安装时）

- 讨论：先查记录 → 最多 2–3 个关键问题 → 复述理解待确认。
- 规划：每卡写目标、涉及文件、验收标准、定向测试命令、依赖。
- 执行：读卡 → 实现 → 定向测试 → 提交本卡 → 写日志。
- 验证：列出声明 → 运行对应命令 → 引用输出 → 写台账。
- 前端：先定 4–6 色 + 字体 + 版式草图再写码；交付前查对比度、键盘焦点、375/768/1024/1440 响应式、reduced-motion。
- 视频：明确时长/分辨率/素材 → 预览 → 渲染 → 抽帧检查。

## 6. 自动安装（IDE/CLI 代理自行补装可选 Skill）

> 机器可读版：`templates/skills-registry.json`（id、repo、phases、task_types、安装命令、detect_paths）。下列仓库与命令均于 2026-10-28 打开 README 核对；标"手动"的是 README 未直接给出、按其目录结构推导的通用做法。

**规则**
1. **只从下表官方仓库安装**；不用镜像、fork、第三方打包或搜索到的同名包。
2. 当前工具的权限策略要求确认时（全局安装、运行 npx/npm 代码、联网），**只在首次安装前问用户一次**，列出将执行的全部命令；用户拒绝则本会话不再提。策略不要求确认则直接装。
3. **固定默认分支**（main/master，即 README 命令的默认行为）；不指定其他分支/tag，不用 `--all` 之类扩大范围的参数。
4. **安装失败绝不阻塞主任务**：立即回退 §5 内置做法，在执行日志记一行 `skill-install: <id> FAILED <原因> → fallback builtin`；成功也记一行。同一会话同一 Skill 只尝试一次。
5. 先检测再装：任一 detect_path 存在、或 `/plugin` 列表 / 工具 skills 列表已有即视为已装，跳过。只装当前阶段/任务类型路由到的 Skill（§1），不预装全部。
6. Claude Code 中 `/plugin …` 斜杠命令若代理无法直接执行，用等价 CLI：`claude plugin marketplace add …` / `claude plugin install …`；装完提示需重启/新会话生效。
7. 其他 CLI（Codex、Cursor、OpenCode 等）：Codex 个人 skills 读 `~/.agents/skills/`（项目级 `.agents/skills/`）；`npx skills add … -g` 会装到这里。
8. Windows：`~` 即 `%USERPROFILE%`；下表“手动”列里的 `git clone … /tmp/X && mkdir -p … && cp -r …` 在 PowerShell 中对应 `git clone --depth 1 <仓库> "$env:TEMP\X"`、`New-Item -ItemType Directory -Force "$HOME\.agents\skills"`、`Copy-Item -Recurse -Force "$env:TEMP\X\skills\*" "$HOME\.agents\skills\"`；`command -v X` 对应 `Get-Command X`。`pd.mjs skills` 在 Windows 上会直接输出 PowerShell 版命令。

| Skill | 仓库（已打开） | Claude Code | Codex / 其他 CLI | 已安装检测 |
|---|---|---|---|---|
| superpowers（brainstorming、writing-plans、executing-plans、test-driven-development、systematic-debugging、verification-before-completion、requesting-code-review） | https://github.com/obra/superpowers | `/plugin install superpowers@claude-plugins-official`（或 `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace`） | Codex CLI：`/plugins` 搜 superpowers → Install Plugin；手动：`git clone --depth 1 https://github.com/obra/superpowers.git /tmp/superpowers && mkdir -p ~/.agents/skills && cp -r /tmp/superpowers/skills/* ~/.agents/skills/` | `~/.claude/plugins/**/superpowers`；`~/.agents/skills/brainstorming/SKILL.md` |
| OpenSpec | https://github.com/Fission-AI/OpenSpec | `npm install -g @fission-ai/openspec@latest`，再在项目内 `openspec init` | 同左（或 `curl -fsSL https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/scripts/binary/install.sh \| sh`）；`openspec init` 按提示选工具 | `command -v openspec`；项目 `openspec/` |
| GSD Core | https://github.com/open-gsd/gsd-core | `npx @opengsd/gsd-core@latest --claude --global` | `npx @opengsd/gsd-core@latest --codex --global`（其他：`--opencode`/`--kilo`/`--kimi` …） | `~/.claude/` 下 `/gsd-*` 命令；`~/.codex/skills/gsd-*/SKILL.md` |
| GSD Pi（独立 CLI） | https://github.com/open-gsd/gsd-pi | `npx @opengsd/gsd-pi@latest --yes` | `npm install -g @opengsd/gsd-pi@latest`，命令 `gsd` | `command -v gsd`；`~/.gsd/` |
| planning-with-files | https://github.com/OthmanAdi/planning-with-files | `/plugin marketplace add OthmanAdi/planning-with-files` → `/plugin install planning-with-files@planning-with-files` | `npx skills add OthmanAdi/planning-with-files --skill planning-with-files -g`（中文 `--skill planning-with-files-zh`） | `~/.agents/skills/planning-with-files/SKILL.md`；`~/.claude/plugins/**/planning-with-files` |
| frontend-design、doc-coauthoring、webapp-testing、skill-creator（Anthropic） | https://github.com/anthropics/skills | `/plugin marketplace add anthropics/skills` → `/plugin install example-skills@anthropic-agent-skills`（四者均在 example-skills） | 手动：`git clone --depth 1 https://github.com/anthropics/skills.git /tmp/anthropic-skills && mkdir -p ~/.agents/skills && cp -r /tmp/anthropic-skills/skills/<name> ~/.agents/skills/` | `~/.claude/plugins/**/example-skills`；`~/.agents/skills/<name>/SKILL.md` |
| code-simplifier（Anthropic） | https://github.com/anthropics/claude-plugins-official | `/plugin install code-simplifier@claude-plugins-official` | 无官方通用安装 → 直接用内置做法 | `~/.claude/plugins/**/code-simplifier` |
| code-review 插件（Anthropic） | 同上（plugins/code-review） | `/plugin install code-review@claude-plugins-official`；需 `gh` | 无官方通用安装 → 内置审查做法 | `~/.claude/plugins/**/code-review` |
| ui-ux-pro-max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` → `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` | `npm install -g ui-ux-pro-max-cli` 后在项目内 `uipro init --ai codex`（其他：`--ai cursor`/`universal`；全局加 `--global`） | `.claude/skills/ui-ux-pro-max/`；`.agents/skills/ui-ux-pro-max/` |
| web-design-guidelines（Vercel） | https://github.com/vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` | 同左，加 `-g` 装到全局 | `~/.agents/skills/web-design-guidelines/SKILL.md`；`~/.claude/skills/web-design-guidelines/` |
| Remotion skills | https://github.com/remotion-dev/skills | `npx skills add remotion-dev/skills` | 同左（或 `gh skill install remotion-dev/skills`） | `~/.agents/skills/remotion-best-practices/SKILL.md` |
| HyperFrames（HeyGen） | https://github.com/heygen-com/hyperframes | `claude plugin marketplace add heygen-com/hyperframes` → `claude plugin install hyperframes@hyperframes` | 代理/非交互：`npx hyperframes skills update`（只装核心集）；需 Node 22+、FFmpeg | `~/.agents/skills/hyperframes/SKILL.md`；`~/.claude/plugins/**/hyperframes` |

**安装流程（每个 Skill 最多一次）**：检测 → 已装则用 → 未装且路由需要 → （策略要求时）一次性征询 → 执行上表命令 → 再检测 → 成功则本步借用，失败/拒绝则记日志并走 §5 内置做法，主任务继续。
