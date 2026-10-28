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
