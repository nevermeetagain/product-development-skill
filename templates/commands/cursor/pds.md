# /pds：product-development 快捷入口

用 product-development Skill 处理本次请求。先加载并严格遵循该 Skill（Cursor 会从 `~/.agents/skills/`、`~/.cursor/skills/`、`~/.claude/skills/` 或仓库内对应目录自动发现；未加载时读取其中的 `product-development/SKILL.md`），按 Skill 的模式识别、四条底线、就绪门与留痕规则执行。本文件只是快捷入口，不另立规则。

用户意图：本消息里紧跟在 `/pds` 后面的文字（例如 `/pds 执行 T140-05` 的意图是“执行 T140-05”）。

子命令含义（按意图映射到 Skill 模式；没有附加文字时先汇报状态，再问一句要做什么）：
- `规划` → PLAN：一次性全量规划剩余任务（先说范围与预计卡数，确认后写）；项目尚无 `.product-development/config.json` 时先走 BOOTSTRAP。
- `执行 <任务ID>`（如 `执行 T140-05`）→ EXECUTE：就绪检查通过即按任务卡实现，只跑定向测试，提交、推送并留痕。
- `体检`（可带阶段，如 `体检 T140`）→ PHASE_REVIEW：只对本阶段改到的模块体检，结果写测试台账。
- `状态` → STATUS：大白话汇报进度、阻塞与待你裁决的决策（可用 `pd.mjs status`）。
- `重规划` → REPLAN：按证据修订规划，影响已下发卡时先列影响清单（可用 `pd.mjs replan-check`）。
- `讨论 <话题>` → DISCUSS；`记录 <决定>` → RECORD（写入决策登记册并回报编号）；`验收`、`回归` → VALIDATE / FINAL_REGRESSION。
- 其他自然语言：按 Skill 第 2 节识别模式；有实质歧义才问一个问题。

开头用一句话说明“现在是什么模式、要动哪些东西”。
