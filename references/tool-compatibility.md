# 跨工具适配

| 工具 | Skill 位置 | 备注 |
|---|---|---|
| Claude Code | `~/.claude/skills/product-development/` 或仓库 `.claude/skills/product-development/` | 自动发现 SKILL.md |
| Codex | `~/.agents/skills/product-development/` 或仓库 `.agents/skills/` | 也读 AGENTS.md |
| DeepSeek 等不支持 Skill 的 CLI | 无 | 在仓库 AGENTS.md 粘贴 `templates/AGENTS.snippet.md`，并在提示词首行写“先读 AGENTS.md” |

所有工具最终引用同一份仓库内 AGENTS.md 和 config.json；不要为不同工具维护不同版本的规则。
Windows 对应位置：`%USERPROFILE%\.claude\skills\product-development\`（或 `CLAUDE_CONFIG_DIR\skills`）、`%USERPROFILE%\.agents\skills\product-development\`。安装用 `scripts\install.ps1` / `scripts\install.cmd`，Linux/macOS 用 `scripts/install.sh`；差异见 `config-reference.md` 的“Windows 注意事项”。
脚本需要 Node 18+；没有 Node 时，模型按本文规则手工执行同样的检查，并在报告里注明“未运行脚本”。
