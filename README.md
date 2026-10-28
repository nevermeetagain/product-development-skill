# product-development：统一 AI 产品开发 Skill

版本 0.4.0 · 一个 Skill 统管：讨论 → 记录决策 → 一次性全量规划（执行前细化）→ 执行 → 专职测试（可复用）→ 规划更新与裁决。
核心：**有据可依，行为留痕**。

## 适合谁
用贵模型（如 Claude）做规划和裁决、便宜模型（如 DeepSeek）做执行、另开一个会话专门做测试的多助手开发。项目越长、任务越多越划算；一次性小脚本不必用。

## 包里有什么
```
product-development/
├── SKILL.md                 统一入口（角色、模式、底线、各模式流程）
├── references/              按需读取的细则（角色与裁决、证据与就绪门、权威路径、任务卡契约、测试复用、Git、自动化、跨工具）
├── templates/               config / 任务索引 / 决策登记册 / 测试台账 / 任务卡 / 阶段计划 / 主计划 / AGENTS 片段
├── scripts/pd.mjs           辅助命令（零依赖，Node 18+）
├── scripts/self-test.mjs    自测
├── scripts/install*.{sh,ps1}
└── examples/minimal-workspace/  虚构样例
```

## 安装
```powershell
.\scripts\install-user.ps1 -Target Both     # Windows：Claude Code + Codex
```
```bash
bash scripts/install.sh both                # macOS / Linux
```
不支持 Skill 的工具（DeepSeek 等）：把 `templates/AGENTS.snippet.md` 加进项目 AGENTS.md，提示词首行写“先读 AGENTS.md”。

## 三个角色怎么用
| 你对谁说 | 说什么 |
|---|---|
| 规划者（Claude） | “用 product-development 只读 BOOTSTRAP” → “和我讨论 X” → “规划全部剩余任务” → 阶段结束后“根据体检报告更新规划” |
| 执行助手（DeepSeek） | 粘贴 `pd.mjs next` 生成的提示词，或“执行 T001-02” |
| 测试助手 | “做 T001 阶段体检” / “做最终回归” |

## 常用命令
```bash
node scripts/pd.mjs health  <项目根>          # 一致性体检（ID/引用/依赖环/状态/证据/秘密）
node scripts/pd.mjs next    <项目根> [--all --write] [--role tester]   # 选就绪任务并生成提示词
node scripts/pd.mjs record  <项目根> --task T001-02 --event STARTED
node scripts/pd.mjs test-plan   <项目根> [--phase T001]               # 哪些测试可复用、哪些要重测
node scripts/pd.mjs test-record <项目根> --target T001 --scope phase --kind phase_review --result PASS --paths "src,test"
node scripts/pd.mjs status  <项目根>          # 大白话进度
node scripts/pd.mjs scan    <项目根>          # 老项目只读盘点（无需配置）
node scripts/pd.mjs sync    <项目根> --task T001-02 --push   # 推送并核对远程一致，自动记 PUSHED/PUSH_FAILED
node scripts/pd.mjs replan-check <项目根>     # 规划者主动检查：哪些要更新/裁决，并生成规划者提示词
node scripts/pd.mjs ask-check <项目根> "满减 叠加"   # 提问前查决策登记册，已决定的不再问
node scripts/pd.mjs skills  <项目根>          # 检查外部 Skill，缺失时输出官方仓库和安装命令
node scripts/self-test.mjs                     # 自测
```

## 接入已有项目
先只读 BOOTSTRAP：映射现有文件，**不搬家、不改号**。选定一个任务索引、一个决策登记册、一个测试台账作为权威，历史版本目录保持只读。写 `.product-development/config.json` 后跑 `pd.mjs health`。

## 边界
Skill 是规范，不是后台服务：自动连续调度多个 CLI 需要另写协调器（见 references/automation-levels.md）。脚本只做确定性检查，不替用户做产品决定，不推送 Git。本包不含任何凭据；PAT 和代理端口在本机一次配置（references/execution-and-git.md）。

## 来源
0.1.0 由 ChatGPT 起草；0.2.0/0.3.0 由 Hark 结合 Claude 评审、用户补充要求和真实项目执行教训优化并测试。变更见 CHANGELOG.md。
