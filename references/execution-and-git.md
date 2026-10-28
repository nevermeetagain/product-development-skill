# 执行、Git、凭据与代理

## 分支与提交
- 每个写入助手独立 clone/worktree，不共用工作区。
- 开工前、推送前：`git fetch`，成功后 `git rebase origin/<主线>`（bash 可写 `git fetch && git rebase origin/<主线>`；PowerShell 5.1 不支持 `&&`，分两条执行）；禁止 `--force`。
- **一卡一个代码提交**（信息含任务 ID，只暂存本卡文件）+ **一个留痕提交**（`chore(<ID>): 留痕`，只含任务索引/执行日志/测试台账）。留痕要记录代码提交号，所以必然晚一个提交，这是允许的，不算违反“一卡一提交”。无改动不建空提交，写 `--no-change-reason`。
- **推送并同步是完成的必要步骤**：`pd.mjs sync . --task <ID> --push` = fetch →（远程领先则 rebase，冲突就中止并上报）→ push → 核对远程确实包含本提交 → 自动记 PUSHED；任何一步失败自动记 PUSH_FAILED 并停下，卡不得标 DONE 以外的“已同步”。留痕提交后再跑一次 `pd.mjs sync . --push`，保证本地与远程一致。
- 推送目标按 config.git：主线模式（`push_main:true`，推荐）每卡直接推 main；分支模式（`push_main:false`，多助手并行）推 `task/<ID>`，下游卡在前置提交合入 main 前不就绪，用 `pd.mjs sync . --task <ID> --push --merge` 快进合并（不能快进就上报，禁止 force）。任务索引状态只在 main 上改。
- 手写 `record --event PUSHED` 会被脚本拒绝，除非远程确实包含当前 HEAD。
- **团队/共享仓库**（有人要在合入前看 diff）：用分支模式，执行助手只推 `task/<ID>`，推送并核对远程即 `DONE`；PR 审阅/合入按项目规则由人或规划者/测试助手异步完成，执行助手不停等、不自行推 main。单人项目沿用主线模式。
- 提交信息：任务 ID + 为什么 + 改了什么 + 怎么验证（定向测试命令与结果）。
- 清理 worktree/分支/临时目录：先列清单（是否有未提交改动、是否仍被引用），确认后再删；未提交工作永不删除。

## 凭据（一次配置，不交给 AI；以后每次都不用再给）
- Windows：Git 自带 Git Credential Manager，首次推送弹窗登录后保存在凭据管理器；或 `gh auth login` 后 `gh auth setup-git`。
- PAT 用细粒度、限定仓库、设有效期。
- 禁止把 PAT 放进 AGENTS.md、SKILL.md、任务卡、日志、命令参数、远程 URL。`pd.mjs health` 会扫描这些文件。
- 推送报认证错误：停止并报告，不向用户索要明文令牌。

## 代理（一次配置）
```powershell
# 端口以你的代理软件 HTTP/Mixed 端口为准
[Environment]::SetEnvironmentVariable("HTTP_PROXY","http://127.0.0.1:<端口>","User")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY","http://127.0.0.1:<端口>","User")
git config --global http.proxy http://127.0.0.1:<端口>
```
```bash
# Ubuntu / macOS：写进 ~/.bashrc 或 ~/.zshrc
export HTTP_PROXY=http://127.0.0.1:<端口> HTTPS_PROXY=http://127.0.0.1:<端口>
git config --global http.proxy http://127.0.0.1:<端口>
```
Claude Code 只认 HTTP/HTTPS 代理，不认 SOCKS。改完重开终端。
