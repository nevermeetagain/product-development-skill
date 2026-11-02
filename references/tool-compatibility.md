# 跨工具适配

| 工具 | Skill 位置 | 备注 |
|---|---|---|
| Claude Code | `~/.claude/skills/product-development/` 或仓库 `.claude/skills/product-development/` | 自动发现 SKILL.md |
| Codex | `~/.agents/skills/product-development/` 或仓库 `.agents/skills/` | 也读 AGENTS.md |
| Cursor | 从 `~/.agents/skills/`、`~/.cursor/skills/`、`~/.claude/skills/` 及仓库对应目录自动加载 | `/product-development` 直接调用 |
| DeepSeek 等不支持 Skill 的 CLI | 无 | 在仓库 AGENTS.md 粘贴 `templates/AGENTS.snippet.md`，并在提示词首行写“先读 AGENTS.md” |

`/pds` 快捷命令（`templates/commands/pds.md`，安装器自动放置；已有不同文件不覆盖，`--force` 先备份）：

| 工具 | 命令文件 | 调用 | 参数 | 官方依据 |
|---|---|---|---|---|
| Claude Code | `~/.claude/commands/pds.md`（`CLAUDE_CONFIG_DIR/commands`）/ 项目 `.claude/commands/` | `/pds …` | `$ARGUMENTS` | https://code.claude.com/docs/en/slash-commands |
| Codex | `~/.codex/prompts/pds.md`（`CODEX_HOME/prompts`），仅顶层 `.md` | `/prompts:pds …` | `$ARGUMENTS`；`$大写词` 会被当命名参数，模板里不要出现 | https://developers.openai.com/codex/custom-prompts（deprecated，仍可用） |
| Cursor | `~/.cursor/commands/pds.md` / 项目 `.cursor/commands/`（用 `templates/commands/cursor/pds.md`） | `/pds …` | 无占位符，读 `/pds` 后文字 | https://cursor.com/changelog/1-6 |

所有工具最终引用同一份仓库内 AGENTS.md 和 config.json；不要为不同工具维护不同版本的规则。
Windows 对应位置：`%USERPROFILE%\.claude\skills\product-development\`（或 `CLAUDE_CONFIG_DIR\skills`）、`%USERPROFILE%\.agents\skills\product-development\`。安装用 `scripts\install.ps1` / `scripts\install.cmd`，Linux/macOS 用 `scripts/install.sh`；差异见 `config-reference.md` 的“Windows 注意事项”。
脚本需要 Node 18+；没有 Node 时，模型按本文规则手工执行同样的检查，并在报告里注明“未运行脚本”。

## 附：跨平台命令对照（自 SKILL.md v0.5.1 下沉）

### 跨平台
脚本需要 Node.js 18+ 与 Git，Windows（PowerShell / cmd / Git Bash）与 Ubuntu/macOS 命令相同，只是路径分隔符写法不同：

| PowerShell / cmd | bash |
|---|---|
| `node <skill>\scripts\pd.mjs health .` | `node <skill>/scripts/pd.mjs health .` |
| `node <skill>\scripts\pd.mjs record . --task T1-01 --event TEST_RUN --cmd 'npm test' --paths 'src/a.js,test/a.test.js' --result PASS` | 同左，参数用单引号或双引号均可 |
| `Get-Command node` | `command -v node` |
| `git fetch` 再 `git rebase origin/main`（PowerShell 5.1 不支持 `&&`） | `git fetch && git rebase origin/main` |

- 写入任务索引/台账/日志的路径一律用 `/`；脚本会把 `\` 归一。不要手写反斜杠路径进 JSON。
- `--cmd` 只是**登记**实际执行过的命令原文，脚本不会代为执行；命令先在当前终端真实跑通再登记。PowerShell 5.1 里命令本身含双引号时，外层用单引号。
- Windows 下中文输出被管道/变量捕获出现乱码时，先 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`。详见 `references/config-reference.md`。

### 跨平台 commands：`/pds` 快捷入口
安装器会把薄封装 `templates/commands/pds.md` 一并装好，`/pds <意图>` = “用 product-development Skill 做这件事”：

| 工具 | 输入 | 安装位置（官方文档） |
|---|---|---|
| Claude Code | `/pds 执行 T140-05`（也可直接 `/product-development …`） | `~/.claude/commands/pds.md`（或 `CLAUDE_CONFIG_DIR\commands`）；项目级 `.claude/commands/` |
| Codex CLI / IDE | `/prompts:pds 执行 T140-05`（Skill 本身用 `$product-development`） | `~/.codex/prompts/pds.md`（或 `CODEX_HOME\prompts`）；官方已标记 custom prompts 为 deprecated，仍可用 |
| Cursor | `/pds 执行 T140-05`（Skill 也可 `/product-development`） | `~/.cursor/commands/pds.md`；项目级 `.cursor/commands/`；Skill 从 `~/.agents/skills` 自动加载 |

子命令：`规划`（PLAN）、`执行 <任务ID>`（EXECUTE）、`体检 [阶段]`（PHASE_REVIEW）、`状态`（STATUS）、`重规划`（REPLAN）、`讨论/记录 …`；其他文字按第 2 节识别。Claude/Codex 版用 `$ARGUMENTS` 接参数，Cursor 无官方参数占位符，读 `/pds` 后的文字。安装：`install.sh all` / `install.ps1 -Target All`（`both` 不含 Cursor），`--no-commands` / `-NoCommands` 跳过。
