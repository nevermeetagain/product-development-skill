# 编码纪律与可选质量信号（engineering-discipline）

适用：`EXECUTE`（编码纪律、修 bug、重构）与 `PHASE_REVIEW`（可选度量信号）。思路借鉴 Robert C. Martin 的 [ub-mode](https://github.com/unclebob/ub-mode)（本身又源自 @poteto 的 poteto-mode/pstack），按本 Skill 的规则改写：**只跑定向测试、不设门禁、不设硬阈值、不逐卡停等复核**。与领域手册（`execution-playbooks.md`）冲突时以领域手册和卡面为准。

## 1. 顺序：先跑通，再做对，再收尾
1. **跑通**：用最小改动让验收的定向测试通过。
2. **做对**：在本卡允许路径内整理（去重复、拆大函数、命名），同一组定向测试前后都绿。
3. **收尾**：按 `execution-playbooks.md` §1 提交、推送、同步、留痕。

## 2. 编码纪律（每条一句，能做到就做，做不到在执行日志写原因）
- **一个决定只在一处**：规则、常量、校验、映射只定义一次，其余引用（文档层的“唯一源”延伸到代码层）。
- **最小编辑**：能改三行不改三十行；无关代码、格式、命名不动。
- **先减后加**：加功能前先看能否删掉多余分支/参数/层次。
- **先定数据形状再写逻辑**：类型/Schema 先于实现；让非法状态写不出来（枚举、判别联合、值对象）。
- **边界一次解析**：外部数据在入口校验并解析成内部类型，内部信任它；业务逻辑留在纯函数里。
- **不压制编译器/检查器**：不用 `any`、`@ts-ignore`、`# type: ignore`、空 `catch` 绕过；确需时写一行理由。
- **幂等**：脚本、迁移、任务、消息处理重跑一次或崩溃后重跑，结果相同。
- **单写者**：不需要同一个可变对象就各给一份；必须共享就只允许一个写者，并用结构（锁、队列、所有权）保证。
- **不硬接**：新需求若只能硬塞进旧设计，在自评里登记（通常 `NON_BLOCKING` + 回退条件，涉及契约/他人路径则 `BLOCKING`），交规划者排重构卡，不在本卡越界重写。
- **先手做一个再造工具**：重复且不直观的工作（批量改名、生成样板）先手做一个单元，再写脚本复现它；脚本放卡面允许的路径。

## 3. 修 bug：先复现，再修因
1. **复现**：写一个**定向**复现测试（放在被改模块的就近测试里），运行并确认它**因预期原因失败**；把失败输出记进执行日志。
2. **修因**：改根因；只把崩溃遮住的守卫（吞异常、加 `if null return`）不算修复。
3. **转绿**：同一测试通过 + 本卡其他定向测试通过；登记 `TEST_RUN`。
4. 写不出诚实的复现测试（环境、竞态、外部服务）时不写坏测试：在日志写复现步骤与证据，验收写 `manual` + 证据。

新功能推荐先写失败测试（TDD），但不强制，也不删“先于测试写的代码”。

## 4. 测试写法自检
- 像调用方那样调用，断言调用方能看到的结果；不断言私有实现细节。
- **空实现检验**：假设被测函数全部返回空/默认值，这个测试还会过吗？会 → 重写。
- 重构三步：**钉住**现有行为（缺测试先补定向测试）→ **改结构** → **证明**同一组测试仍绿。

## 5. 两次失败后的上报写法（补充准则 10）
上报时写出“两次修复共同依赖的前提”一句话，并说明它为何可能不成立。例：“两次都假设缓存失效由写请求触发——但后台导入任务直写数据库，不经过写接口。”规划者据此改卡，而不是让执行助手试第三种修法。

## 6. 可选质量信号（阶段体检用，永不阻塞）
有就用，没有就跳过；**任何结果都不是门禁**，不设硬阈值，不阻止卡转 `VERIFIED`，`pd.mjs quality` 退出码恒为 0。

**默认路径（Node，零安装）**：`node scripts/pd.mjs quality . --changed --phase <阶段> [--test-cmd "<本阶段定向测试命令>"]`。本 Skill 不装任何依赖；工具只在运行时经 `npx --yes <包>@<锁定主版本>` 临时拉取（npm 缓存复用，尊重 `HTTP(S)_PROXY` 与 npm 代理配置）。离线、找不到 npm、语言不支持 → 该项记 `UNKNOWN` + 原因。

| 信号 | 工具（许可证，主版本按 Node 选） | 怎么得出 | 参考线（只作信号） |
|---|---|---|---|
| 复杂度 | [ESLint](https://eslint.org/docs/latest/rules/complexity) 内置 `complexity` 规则（MIT；Node ≥20.19/22.13 用 10，Node 18 用 9）；TS 加 `@typescript-eslint/parser@8`（MIT）+ `typescript@5` | 逐函数圈复杂度与起止行；不读项目 ESLint 配置 | — |
| 覆盖率 | 已有 `coverage/coverage-final.json` 或 `coverage/lcov.info`；或 `--test-cmd` 设 `NODE_V8_COVERAGE` 跑定向测试后用 [c8](https://github.com/bcoe/c8) `report`（ISC；12，Node 18 用 10） | 逐函数行覆盖（扣除嵌套子函数） | — |
| CRAP | 上两项都有时计算：**CRAP = comp² × (1 − cov)³ + comp** | 逐函数，按最差排序 | ≥30 值得看；<10 为理想 |
| 重复 | [jscpd](https://github.com/kucherenko/jscpd) 5（MIT，Rust 预编译，含 Windows x64/arm64，支持 200+ 语言） | 全仓扫描，`--changed` 时只算触及改动文件的克隆；% = 改动源码中被克隆覆盖的行 / 改动源码总行 | 看新增的克隆 |
| 变异 | [StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/) `@stryker-mutator/core`（Apache-2.0；Node ≥22 用 10，20 用 9，18 用 8） | **只在项目已有 Stryker 配置或显式 `--mutation` 时跑**（慢）；`--changed` 时 `--mutate` 改动文件；无配置时用 command 运行器跑 `--test-cmd`/`npm test` | 幸存者 = 测试漏洞线索 |

- **范围**：`--changed` 的基线依次取 `--base <rev>` → `--phase` 下各卡 `execution.commits` 中最早提交的父提交 → 当前分支与主线的分叉点 → 有未提交改动用 `HEAD` → `HEAD~1`；再加未跟踪文件。`--paths a,b` 进一步限定（如只对金额/权限模块跑 `--mutation`）。全仓运行只在发版前、且可选。
- **覆盖率不额外跑全量**：优先读已有报告；要现场采集就把本阶段的定向测试命令传给 `--test-cmd`。都没有 → CRAP 记 `UNKNOWN`（仍输出复杂度）。报告早于改动时提示“可能过期”。
- **非 JS 项目**：jscpd 照常工作；复杂度/变异默认 `UNKNOWN`，可在 config 的 `quality.tools.complexity.command` / `quality.tools.mutation.command` 接入语言工具（Stryker.NET、Stryker4s 等输出同一 mutation-testing-report JSON），覆盖率给 lcov（`quality.coverage_report`）。约定见 `config-reference.md`。
- **Windows / Ubuntu**：优先用 Node 自带的 `npm/bin/npx-cli.js` 直接调用（不经 shell）；找不到时 Windows 经 shell 调 `npx.cmd` 并逐个加引号。路径一律按 `/` 存储。
- **登记**：`pd.mjs quality` 自动按信号（crap / duplication / mutation）各写一条台账：`kind: quality_signal`、`signal`、`target`（`--phase`/`--task`）、`result`（`PASS` = 工具跑完 / `UNKNOWN` + `reason`）、`metrics`（最差函数、≥30 个数、重复 %、变异分数等）、`covers_paths`（改动文件或 `.`）+ 指纹、`evidence`（证据目录下的摘要 md）。明细写 `.metrics/pd-quality-latest.json`（目录自带 `.gitignore`，不提交）。`--no-record` 只输出。手工跑其他工具时仍可用 `pd.mjs test-record --kind quality_signal` 登记。
- **处理**：信号交规划者判断是否排重构/补测卡（偶然相似 ≠ 同一决策，不强制合并；删死代码也要排卡）。不回头卡住已完成的卡。`quality_signal` 的 PASS 不能当阶段体检、回归或 `VERIFIED` 的依据（脚本已排除）。
- **可选替代**：已装 Python ≥3.11 的团队也可用 unclebob 的 [crapper](https://github.com/unclebob/crapper) / [dryer](https://github.com/unclebob/dryer) / [mutator](https://github.com/unclebob/mutator)（0BSD，Python 实现，首次运行自建 `.venv`；分析 Clojure/Java/Go/TS/Rust/Python），结果用 `test-record --kind quality_signal` 手工登记。
- uml-viewer（可视化）不纳入：依赖 Clojure + Java 21，并伴随启动带 `--yolo` 的代理会话，越出本 Skill 的权限边界。

## 7. 收尾报告与清理
- 收尾报告（执行日志 + 回复）写三件事：改了哪些文件、加/改了哪些测试、检查结果（命令 + 结果）。只记改变状态的动作和关键判断，不逐条记录每个操作（省 token）。
- 提交信息写**为什么、改了什么、怎么验证**（如 `T140-05 修复满减叠加取整；验证：npm test -- price.test.js PASS`）。
- 清理 worktree/分支/临时目录：先列清单（路径、是否有未提交改动、是否被其他卡引用），经用户或规划者确认再删；**未提交的工作永不删除**。
- 推送：沿用 `execution-and-git.md`。团队/共享仓库用分支模式，人审在项目自己的合并流程里异步进行，执行助手推完任务分支即 `DONE`，不停等审批。
