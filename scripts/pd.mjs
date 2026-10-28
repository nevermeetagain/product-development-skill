#!/usr/bin/env node
// pd —— product-development 辅助命令（零第三方依赖）
// 用法：node pd.mjs <命令> [工作区根目录] [选项]
//   health   [root]                         一致性体检（ID/引用/依赖环/状态/证据/秘密），有错误退出码 1
//   next     [root] [--role executor] [--all] [--write]   选出依赖已满足的就绪任务，生成启动提示词
//   prompt   [root] --task T1-01 [--write]   为指定任务生成启动提示词
//   record   [root] --task T1-01 --event E [--status S] [--note "..."] [--commit SHA] [--evidence path]
//   test-plan [root] [--phase P] [--task T]  按指纹判断哪些测试可复用、哪些必须重测
//   test-record [root] --target X --scope task|phase|final --kind K --result PASS|FAIL|UNKNOWN
//               --paths "a,b" [--cmd "..."] [--evidence path] [--by tester]
//   status   [root]                         大白话进度汇总
//   scan     [root]                         BOOTSTRAP 只读盘点：编号前缀、疑似索引/台账/规则文件（不需要 config）
//   sync     [root] [--task T] [--push]     推送并核对本地与远程一致；--task 时成功写 PUSHED、失败写 PUSH_FAILED
//   replan-check [root]                     规划者主动体检：列出需要规划更新/裁决的触发项，并生成规划者提示词
//   ask-check [root] "关键词 关键词"           提问前先查决策登记册与任务卡，已决定的不再问用户
//   skills   [root]                         检查可选外部 Skill 是否已安装，缺失时输出安装命令（让 IDE/CLI 自己装）
//   quality  [root] [--changed] [--phase P] [--base REV] [--test-cmd "..."] [--coverage file] [--mutation] [--offline] [--no-record]
//                                           可选质量信号（CRAP/重复/变异，经 npx 临时拉工具），永不阻塞、退出码恒 0
// 记录参数：--needs DEC-002 --escalate planner|user（BLOCKED）；--no-change-reason "..."；--remove-commit SHA（CORRECTION）
// 测试参数：--reused-from TR-xxx（复用登记，须指纹仍一致）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quality as runQuality } from './quality.mjs';
import {
  TASK_STATUS, DONE_LIKE, DECISION_STATUS, ROLES, DETAIL, RESULT, EVENTS, IS_WIN,
  loadWorkspace, writeJson, writeText, readText, saveTasks, gitInfo, git, gitRun, gitAvailable, commitExists, fingerprint, missingAtRev,
  scanSecrets, taskMap, decisionMap, parseArgs, nowIso, stamp, die, toPosix, pathList, detectCandidates, globFirst, which, existsExactCase,
} from './lib.mjs';

const [nodeMajor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 18) die(`需要 Node.js 18 或更高版本（当前 ${process.version}）`);

const args = parseArgs(process.argv.slice(2), ['all', 'write', 'json', 'force', 'push', 'merge', 'changed', 'mutation', 'offline', 'no-record']);
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });
const cmd = args._[0];
const root = args._[1] || '.';

const commands = { health, next, prompt, record, 'test-plan': testPlan, 'test-record': testRecord, status, scan, sync, 'replan-check': replanCheck, 'ask-check': askCheck, skills, quality: qualityCmd };
if (!commands[cmd]) {
  die('用法：node pd.mjs <health|next|prompt|record|test-plan|test-record|status|scan|sync|replan-check|ask-check|skills|quality> [root] [选项]');
}
let ws;
// scan / skills 不需要 config；不调用 process.exit，避免 Windows 控制台异步输出被截断
if (cmd === 'scan' || cmd === 'skills') commands[cmd]();
else if (cmd === 'quality') { try { ws = loadWorkspace(root); } catch { ws = null; } commands[cmd](); }
else {
  try { ws = loadWorkspace(root); } catch (e) { die(e.message); }
  await commands[cmd]();
}
/** 工作区内的存储路径 → 绝对路径（存储值可能来自 Windows，含反斜杠） */
function wsPath(rel) { return path.join(ws.root, toPosix(rel)); }
/** 显示用相对路径（POSIX 分隔） */
function relp(f) { return toPosix(path.relative(ws.root, f)); }

// ---------------------------------------------------------------- health
function health() {
  const errors = [];
  const warns = [];
  const E = (m) => errors.push(m);
  const W = (m) => warns.push(m);
  const cfg = ws.config;
  const md = ws.tasks._format === 'markdown-table';
  const g = gitInfo(ws.root);
  if (!g.isRepo && !gitAvailable()) W('找不到 git 命令（Windows 请安装 Git for Windows 并加入 PATH），提交/指纹/推送检查已跳过');

  // 1. 权威路径存在（run_logs / prompts / evidence 按需创建，不提醒）
  for (const [k, v] of Object.entries(cfg.paths || {})) {
    if (typeof v !== 'string' || ['run_logs', 'prompts', 'evidence'].includes(k)) continue;
    if (!fs.existsSync(wsPath(v))) (['task_index', 'decision_index'].includes(k) ? E : W)(`路径映射 ${k} → ${v} 不存在`);
  }
  // 1b. 防泄露：Git 跟踪了 .env 实值或数据库导出 → 错误；.gitignore 缺少对应规则 → 提醒
  if (g.isRepo) {
    const tracked = (git(ws.root, ['ls-files']) ?? '').split('\n').filter(Boolean);
    for (const f of tracked) { const b = path.basename(f); if (isLeakFile(b)) E(`Git 跟踪了不应提交的文件：${f}（.env 实值/数据库导出，移出 Git 并加入 .gitignore）`); }
    const gi = path.join(ws.root, '.gitignore');
    const txt = fs.existsSync(gi) ? readText(gi) : '';
    const miss = ['.env', '*.dump', '*_dump.sql'].filter((x) => !txt.split(/\r?\n/).some((l) => l.trim() === x || (x === '.env' && /^\.env\*?$/.test(l.trim()))));
    if (miss.length) W(`.gitignore 缺少防泄露规则：${miss.join(' ')}（另建议 .env* !.env.example dump*.sql *.sql.gz）`);
  }
  if (md) W('任务索引为 markdown 表格（兼容模式）：验收条件、需求来源等字段在任务卡正文，脚本不逐项检查');
  // 2. 任务
  const tasks = ws.tasks.tasks || [];
  const tm = new Map();
  const dm = decisionMap(ws);
  const legacy = new Map();
  for (const t of tasks) {
    if (!t.id) { E('存在缺少 id 的任务'); continue; }
    if (tm.has(t.id)) E(`任务 ID 重复：${t.id}`);
    tm.set(t.id, t);
    for (const l of t.legacy_ids || []) {
      if (legacy.has(l)) E(`旧编号 ${l} 同时映射到 ${legacy.get(l)} 和 ${t.id}`);
      legacy.set(l, t.id);
    }
  }
  const ledger = ws.ledger.entries || [];
  const hasPass = (id, phase) => ledger.some((e) => e.result === 'PASS' && e.kind !== 'quality_signal' && (e.target === id || (phase && e.target === phase) || (e.covers_tasks || []).includes(id)));
  for (const t of tasks) {
    const tag = `[${t.id}]`;
    const role = t.role || 'executor';
    if (t.status === 'UNKNOWN') { W(`${tag} 状态无法识别：「${t._md?.statusCell}」（在 formats.task_index.status_map 补映射）`); continue; }
    if (!TASK_STATUS.includes(t.status)) E(`${tag} 非法状态 ${t.status}（允许：${TASK_STATUS.join('/')}）`);
    if (t.role && !ROLES.includes(t.role)) E(`${tag} 非法角色 ${t.role}`);
    if (t.detail && !DETAIL.includes(t.detail)) E(`${tag} 非法 detail ${t.detail}`);
    if (!t.title) E(`${tag} 缺少 title`);
    if (!md && t.status !== 'SUPERSEDED') {
      if (!Array.isArray(t.acceptance) || t.acceptance.length === 0) E(`${tag} 缺少验收条件 acceptance`);
      for (const a of t.acceptance || []) {
        if (!a.id || !a.desc) E(`${tag} 验收项缺少 id/desc`);
        const c = a.check || {};
        if (!['command', 'manual', 'measure'].includes(c.type)) E(`${tag} 验收项 ${a.id} 缺少可判定的 check.type（command/measure/manual）`);
        if (c.type === 'command' && !c.cmd) E(`${tag} 验收项 ${a.id} 为 command 但缺少 cmd`);
        if (c.type === 'command' && /\b(grep|rg|findstr)\b/.test(c.cmd || '') && !c.allow_grep) W(`${tag} 验收项 ${a.id} 用 grep 检查源码，不能替代行为测试（确需请加 allow_grep 并说明）`);
        if (c.type === 'measure' && !(c.method && c.threshold !== undefined)) E(`${tag} 验收项 ${a.id} 为 measure 但缺少 method/threshold`);
      }
      if (!t.requirements?.length && !t.decisions?.length && !t.source) W(`${tag} 没有需求/决策来源（E1 缺失）`);
      if (role === 'executor' && t.detail === 'REFINE_BEFORE_EXECUTION' && !t.objective) W(`${tag} 待细化卡没有 objective，便宜模型容易自行发挥`);
    }
    if (t.card && !fs.existsSync(wsPath(t.card))) E(`${tag} 任务卡文件不存在：${t.card}`);
    else if (t.card && !existsExactCase(ws.root, t.card)) W(`${tag} 任务卡路径大小写与磁盘不一致：${t.card}（Windows/macOS 能打开，但 Git 与 Linux 区分大小写）`);
    if (t.card && /\\/.test(t.card)) W(`${tag} 任务卡路径含反斜杠：${t.card}（存储路径请用 /）`);
    for (const d of t.depends_on || []) {
      if (d === t.id) E(`${tag} 依赖自身`);
      else if (!tm.has(d)) (md ? W : E)(`${tag} 依赖不存在的任务 ${d}`);
      else if (tm.get(d).status === 'SUPERSEDED' && !['SUPERSEDED', 'DONE', 'VERIFIED'].includes(t.status)) E(`${tag} 依赖已被替代的任务 ${d}（应改为 ${tm.get(d).superseded_by || '?'}）`);
    }
    for (const d of t.decisions || []) {
      if (!dm.has(d)) (md ? W : E)(`${tag} 引用不在决策登记册中的决策 ${d}`);
      else if (dm.get(d).status === 'SUPERSEDED' && !DONE_LIKE.includes(t.status) && t.status !== 'SUPERSEDED') E(`${tag} 引用已被替代的决策 ${d}（新决策 ${dm.get(d).superseded_by || '?'}）`);
      else if (['PROPOSED', 'OPEN'].includes(dm.get(d).status) && t.status === 'IN_PROGRESS') E(`${tag} 正在执行，但依赖未决决策 ${d}（${dm.get(d).status}）——应在编码前裁决`);
    }
    if (t.status === 'SUPERSEDED' && !md && !t.superseded_by) E(`${tag} 已替代但未写 superseded_by`);
    if (t.superseded_by && !tm.has(t.superseded_by)) E(`${tag} superseded_by 指向不存在的任务 ${t.superseded_by}`);
    if (t.status === 'BLOCKED' && !t.blocked_reason) E(`${tag} BLOCKED 但没有 blocked_reason`);
    if (DONE_LIKE.includes(t.status)) {
      const ex = t.execution || {};
      if (role === 'tester') {
        if (!hasPass(t.id, t.phase) && !ex.no_change_reason) E(`${tag} 测试卡已完成，但测试台账没有对应 PASS 记录`);
      } else if (!ex.commits?.length && !ex.no_change_reason) (md ? W : E)(`${tag} 状态 ${t.status} 但没有提交记录（无文件变化请写 no_change_reason）`);
      for (const c of ex.commits || []) {
        if (!/^[0-9a-f]{7,40}$/i.test(c)) E(`${tag} 提交号格式无效：「${c}」`);
        else if (g.isRepo && !commitExists(ws.root, c)) (md ? W : E)(`${tag} 提交 ${c} 在本仓库找不到${md ? '（可能因 rebase 改写）' : ''}`);
      }
    }
    if (t.status === 'VERIFIED' && !hasPass(t.id, t.phase)) E(`${tag} 标记 VERIFIED 但测试台账没有对应 PASS 记录`);
  }
  // 3. 依赖环
  const color = new Map();
  const stack = [];
  const visit = (id) => {
    color.set(id, 1); stack.push(id);
    for (const d of tm.get(id)?.depends_on || []) {
      if (!tm.has(d)) continue;
      if (color.get(d) === 1) E(`依赖环：${[...stack.slice(stack.indexOf(d)), d].join(' → ')}`);
      else if (!color.get(d)) visit(d);
    }
    color.set(id, 2); stack.pop();
  };
  for (const id of tm.keys()) if (!color.get(id)) visit(id);

  // 4. 决策
  const seen = new Set();
  for (const d of ws.decisions.decisions || []) {
    const tag = `[${d.id}]`;
    if (!d.id) { E('存在缺少 id 的决策'); continue; }
    if (seen.has(d.id)) E(`决策 ID 重复：${d.id}`);
    seen.add(d.id);
    if (!DECISION_STATUS.includes(d.status)) E(`${tag} 非法决策状态 ${d.status}`);
    if (d.file && !fs.existsSync(wsPath(d.file))) E(`${tag} 决策文件不存在：${d.file}`);
    if (d.status === 'SUPERSEDED' && !d.superseded_by) E(`${tag} 已替代但未写 superseded_by`);
    if (d.superseded_by && !dm.has(d.superseded_by)) E(`${tag} 替代决策 ${d.superseded_by} 不存在`);
    if (d.status === 'DECIDED' && !d.decided_by) W(`${tag} DECIDED 但没写 decided_by（谁裁决的）`);
    for (const t of d.applies_to || []) if (!tm.has(t)) W(`${tag} applies_to 指向不存在的任务 ${t}`);
  }
  // 5. 测试台账
  for (const e of ledger) {
    if (!RESULT.includes(e.result)) E(`[台账 ${e.id}] 非法结果 ${e.result}`);
    if (!e.commit) E(`[台账 ${e.id}] 缺少 commit 基线`);
    if (!e.fingerprint) W(`[台账 ${e.id}] 缺少指纹，无法判断能否复用`);
    if (e.reused_from && !ledger.some((x) => x.id === e.reused_from)) E(`[台账 ${e.id}] reused_from 指向不存在的条目 ${e.reused_from}`);
    if (e.evidence && !fs.existsSync(wsPath(e.evidence))) W(`[台账 ${e.id}] 证据文件不存在：${e.evidence}`);
    if ((e.covers_paths || []).some((x) => /\\/.test(x))) W(`[台账 ${e.id}] covers_paths 含反斜杠（旧版 Windows 写入），指纹已按 / 归一计算`);
  }
  // 6. 秘密扫描（本工作流的机器文件、任务卡、执行日志）
  const files = [ws.cfgFile, ws.taskIndexFile, ws.decisionIndexFile, ws.testLedgerFile]
    .concat(tasks.map((t) => t.card && wsPath(t.card))).filter((f) => f && fs.existsSync(f) && fs.statSync(f).isFile());
  if (ws.runLogDir && fs.existsSync(ws.runLogDir) && fs.statSync(ws.runLogDir).isDirectory()) for (const f of fs.readdirSync(ws.runLogDir)) files.push(path.join(ws.runLogDir, f));
  for (const f of files) {
    const hit = scanSecrets(readText(f));
    if (hit.length) E(`疑似秘密写入了 ${relp(f)}（${hit.join(', ')}）`);
  }

  console.log(`工作区：${ws.root}`);
  console.log(`Git：${g.branch ?? '非 git 仓库'} @ ${g.head?.slice(0, 7) ?? '-'}${g.dirty ? '（有未提交改动）' : ''}`);
  console.log(`任务 ${tasks.length} 张，决策 ${(ws.decisions.decisions || []).length} 条，测试台账 ${ledger.length} 条`);
  for (const w of warns) console.log(`  提醒：${w}`);
  for (const e of errors) console.log(`  错误：${e}`);
  console.log(errors.length ? `体检未通过：${errors.length} 个错误，${warns.length} 个提醒` : `体检通过（${warns.length} 个提醒）`);
  process.exitCode = errors.length ? 1 : 0;
}

/** .env 实值、数据库导出（迁移 .sql 不算） */
function isLeakFile(b) {
  if (/^\.env(\..+)?$/i.test(b)) return !/^\.env\.(example|sample|template|defaults)$/i.test(b);
  return /\.dump$|_dump\.sql$|^dump.*\.sql$|\.sql\.gz$|^backup.*\.sql$/i.test(b);
}

// ---------------------------------------------------------------- next / prompt
function blockers(t) {
  const tm = taskMap(ws);
  const dm = decisionMap(ws);
  const doneSet = new Set(ws.config.dependency_satisfied_by || ['DONE', 'VERIFIED']);
  const why = [];
  if (t.status !== 'TODO') why.push(`状态是 ${t.status}，不是 TODO`);
  for (const d of t.depends_on || []) if (!doneSet.has(tm.get(d)?.status)) why.push(`前置任务 ${d} 状态 ${tm.get(d)?.status ?? '不存在'}`);
  if (ws.config.git?.push_main === false) {
    const main = ws.config.git.main_branch || 'main';
    for (const d of t.depends_on || []) for (const c of tm.get(d)?.execution?.commits || []) {
      if (commitExists(ws.root, c) && git(ws.root, ['merge-base', '--is-ancestor', c, main]) === null) why.push(`前置任务 ${d} 的提交 ${c.slice(0, 7)} 尚未合入 ${main}（分支模式：由规划者/测试助手在阶段体检后合并，或用 pd.mjs sync --merge）`);
    }
  }
  for (const d of t.decisions || []) {
    if (!dm.has(d)) why.push(`决策 ${d} 不在决策登记册中（先补录或裁决）`);
    else if (['PROPOSED', 'OPEN'].includes(dm.get(d).status)) why.push(`决策 ${d}（${dm.get(d).title || ''}）仍是 ${dm.get(d).status}`);
  }
  return why;
}

function readyTasks(role) {
  const tm = taskMap(ws);
  const out = [];
  for (const t of tm.values()) {
    if (role && (t.role || 'executor') !== role) continue;
    if (!blockers(t).length) out.push(t);
  }
  // 关键路径优先：被越多任务（传递）依赖越靠前；其次 priority；再按 ID
  const downstream = new Map();
  const count = (id, seen = new Set()) => {
    for (const t of tm.values()) if ((t.depends_on || []).includes(id) && !seen.has(t.id)) { seen.add(t.id); count(t.id, seen); }
    return seen.size;
  };
  for (const t of out) downstream.set(t.id, count(t.id));
  out.sort((a, b) => (downstream.get(b.id) - downstream.get(a.id)) || ((a.priority ?? 99) - (b.priority ?? 99)) || a.id.localeCompare(b.id));
  return out;
}

function buildPrompt(t) {
  const dm = decisionMap(ws);
  const tm = taskMap(ws);
  const g = gitInfo(ws.root);
  const cfg = ws.config;
  const role = t.role || 'executor';
  const lines = [];
  lines.push(`# 任务启动指令：${t.id} ${t.title}`);
  lines.push('');
  lines.push('使用 product-development Skill（工具不支持 Skill 时，读取仓库根目录 AGENTS.md 中的工作协议）。');
  lines.push(`模式：${role === 'tester' ? 'VALIDATE / PHASE_REVIEW（测试助手）' : 'EXECUTE（执行助手）'}`);
  lines.push('');
  lines.push('## 基线');
  lines.push(`- 规划版本：${ws.tasks.plan_version ?? '未登记'}`);
  lines.push(`- 生成时代码基线：${g.branch ?? '?'} @ ${g.head ?? '?'}`);
  lines.push(`- 任务卡（权威）：${t.card ?? '（无独立卡，以任务索引为准）'}`);
  lines.push(`- 任务索引：${cfg.paths.task_index}`);
  lines.push('');
  lines.push('## 目标');
  lines.push(t.objective || '见任务卡。');
  lines.push('');
  lines.push('## 来源（E1）');
  for (const r of t.requirements || []) lines.push(`- 需求 ${r}`);
  for (const d of t.decisions || []) {
    const x = dm.get(d);
    lines.push(`- 决策 ${d}（${x?.status ?? '未知'}）${x?.title ? '：' + x.title : ''}${x?.file ? ' → ' + x.file : ''}`);
  }
  if (!(t.requirements?.length || t.decisions?.length)) lines.push('- 未登记，开工前向规划者确认');
  lines.push('');
  lines.push('## 前置任务');
  if (!(t.depends_on || []).length) lines.push('- 无');
  for (const d of t.depends_on || []) {
    const x = tm.get(d);
    lines.push(`- ${d} ${x?.title ?? ''}：${x?.status ?? '不存在'}${x?.execution?.commits?.length ? '，提交 ' + x.execution.commits.join(', ') : ''}`);
  }
  lines.push('');
  lines.push('## 修改边界');
  lines.push(`- 允许：${(t.allowed_paths || []).join('，') || '见任务卡'}`);
  lines.push(`- 禁止：${(t.forbidden_paths || []).join('，') || '任务卡未列出的公共契约、迁移、其他任务的文件'}`);
  if (t.detail === 'REFINE_BEFORE_EXECUTION') {
    lines.push('');
    lines.push('## 执行前细化');
    lines.push('本卡的文件级步骤需要结合当前代码细化。先只读调查，写出简短执行计划（目标文件、改动、风险、要跑的测试），再开工。目标、依赖、验收不得改动。');
  }
  lines.push('');
  lines.push('## 验收条件（逐条给出结果和证据）');
  for (const a of t.acceptance || []) {
    const c = a.check || {};
    const how = c.type === 'command' ? `命令：\`${c.cmd}\`` : c.type === 'measure' ? `实测：${c.method}，阈值 ${c.threshold}` : `人工核对：${c.evidence ?? '附证据'}`;
    lines.push(`- ${a.id}：${a.desc}（${how}）`);
  }
  lines.push('');
  lines.push('## 测试分工');
  if (role === 'tester') {
    lines.push('- 你是测试助手：负责门禁、阶段体检、回归。先运行 `node <skill>/scripts/pd.mjs test-plan` 看哪些可复用，只重测指纹已变化或从未通过的部分。');
    lines.push('- 每次测试后用 `pd.mjs test-record` 登记结果（含命令、覆盖路径、证据），不得登记未执行的测试。');
  } else {
    lines.push(`- 你只跑与本次改动直接相关的定向测试：${(t.tests?.targeted || []).map((x) => '`' + x + '`').join('，') || '按改动文件就近选择单测'}。`);
    lines.push('- 不跑全量回归、不跑门禁、不跑阶段体检——这些由测试助手负责。');
    lines.push('- 不得用 grep 源码代替行为测试；不得把未执行的测试写成通过。');
  }
  lines.push('');
  lines.push('## 开工前自评（编码前必须完成，一次性提出全部问题）');
  lines.push('1. 核对分支/HEAD/工作区，`git fetch` 后确认与远程一致；确认前置任务真实完成（看提交，不看自述）。');
  lines.push('2. 对五项打 高/中/低 置信度：需求清晰度、决策覆盖、契约完整度、依赖状态、测试路径。任一为“低”必须说明缺什么。');
  lines.push('3. 把发现的遗漏/疑问/缺失/异常一次列全。每个问题先跑 `node <skill>/scripts/pd.mjs ask-check . "关键词"`：已 DECIDED 的照做，**不得再问用户**；查不到的先交规划者裁决，规划者无权决定的（产品取舍、安全、数据不可逆、公共契约）才交用户。');
  lines.push('4. 结论 READY / CONDITIONAL（写明假设与回退条件）/ BLOCKED（`pd.mjs record --event BLOCKED --note ... --needs ... --escalate planner|user`，只暂停本卡）。BLOCKED 时不写任何代码。');
  lines.push('5. 按任务类型读对应执行手册：`references/execution-playbooks.md`（后端/API、业务逻辑、数据与迁移、交互、前端、集成、性能）。');
  lines.push('');
  lines.push('## 收尾（顺序固定，缺一步不算完成）');
  lines.push(`1. 跑定向测试；通过后本卡代码单独提交（信息含 ${t.id}），记 \`pd.mjs record . --task ${t.id} --event COMMITTED --commit <sha>\`（脚本校验提交真实存在）。`);
  lines.push(`2. 登记定向测试：\`pd.mjs record . --task ${t.id} --event TEST_RUN --cmd "<实际命令>" --paths "<被测源码,测试文件,相关配置>" --result PASS\`，它同时写入测试台账，测试助手阶段体检时可直接复用，不重复测试。`);
  lines.push(`3. 推送并核对同步：\`node <skill>/scripts/pd.mjs sync . --task ${t.id} --push\`。成功自动记 PUSHED（远程确实包含本提交）；失败自动记 PUSH_FAILED 并停下报告，禁止 force push。`);
  lines.push(`4. \`pd.mjs record . --task ${t.id} --event DONE\`，再把任务索引/日志的留痕改动提交并再次 \`pd.mjs sync . --push\`，保证双端一致。`);
  lines.push('5. `pd.mjs next .` 生成下一张就绪卡的提示词附在回报末尾。');
  lines.push('- 认证用本机 Git Credential Manager / gh，代理用本机环境变量或 git config；PAT、密码、代理账号不得出现在任何文件、日志、提示词或提交里。');
  lines.push('');
  lines.push('## 交付回报（大白话）');
  lines.push('做了什么、改了哪些文件、提交号、推送与同步结果、跑了哪些测试和结果、还有什么没解决、下一张卡的提示词。完成后停止，不自动开始下一张卡（除非用户要求连续执行）。');
  return lines.join('\n') + '\n';
}

function writePrompt(t, text) {
  const dir = ws.p('prompts') || path.join(ws.root, '.product-development', 'prompts');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${t.id}.md`);
  writeText(f, text);
  return relp(f);
}

function next() {
  const role = args.role;
  const list = readyTasks(role);
  if (!list.length) {
    const todo = [...taskMap(ws).values()].filter((t) => t.status === 'TODO' && (!role || (t.role || 'executor') === role));
    console.log(todo.length ? `没有就绪任务。${todo.length} 张待办在等前置任务或决策：` : '没有待办任务。');
    for (const t of todo.slice(0, 30)) console.log(`  ${t.id}：${blockers(t).join('；')}`);
    process.exitCode = 3;
    return;
  }
  const pick = args.all ? list : [list[0]];
  console.log(`就绪任务 ${list.length} 张：${list.map((t) => t.id).join(', ')}`);
  for (const t of pick) {
    const text = buildPrompt(t);
    if (args.write) console.log(`已生成提示词：${writePrompt(t, text)}`);
    else { console.log(`\n----- ${t.id} -----\n`); process.stdout.write(text); }
  }
}

function prompt() {
  const t = taskMap(ws).get(args.task);
  if (!t) die(`任务不存在：${args.task}`);
  const why = blockers(t);
  if (why.length && !args.force) {
    console.log(`${t.id} 未就绪，不生成执行提示词：`);
    for (const w of why) console.log(`  - ${w}`);
    console.log('处理：前置未完成 → 等待或改做就绪卡；决策未定 → 交规划者裁决（产品取舍再交用户）。确需生成（如给规划者细化用）加 --force。');
    process.exitCode = 4;
    return;
  }
  const text = buildPrompt(t);
  if (args.write) console.log(`已生成提示词：${writePrompt(t, text)}`);
  else process.stdout.write(text);
}

// ---------------------------------------------------------------- record
function record() {
  const t = taskMap(ws).get(args.task);
  if (!t) die(`任务不存在：${args.task}`);
  if (!args.event) die('缺少 --event');
  const event = String(args.event).toUpperCase();
  if (!EVENTS.includes(event)) die(`未知事件 ${event}（允许：${EVENTS.join('/')}）`);
  const g = gitInfo(ws.root);
  const ev = { at: nowIso(), task: t.id, event, actor: args.by || process.env.PD_ACTOR || 'unknown', branch: g.branch, head: g.head, dirty: g.dirty };
  for (const k of ['note', 'evidence', 'status', 'needs', 'escalate', 'options', 'recommend']) if (args[k]) ev[k] = String(args[k]);
  if (ev.evidence) ev.evidence = toPosix(ev.evidence);
  if (args['no-change-reason']) ev.no_change_reason = String(args['no-change-reason']);
  if (args['remove-commit']) ev.remove_commit = String(args['remove-commit']);
  if (args.commit) {
    if (!commitExists(ws.root, String(args.commit))) die(`拒绝写入：提交 ${args.commit} 在本仓库不存在（先确认 git commit 成功，作者身份已配置）`);
    ev.commit = git(ws.root, ['rev-parse', String(args.commit)]);
  }
  if (ev.status && !TASK_STATUS.includes(ev.status)) die(`非法状态 ${ev.status}`);
  if (event === 'BLOCKED' && !ev.note) die('BLOCKED 必须带 --note（缺什么、已查了什么）；建议同时带 --needs <决策/前置ID> --escalate planner|user');
  if (ev.escalate && !['planner', 'user'].includes(ev.escalate)) die('--escalate 只能是 planner 或 user');
  if (event === 'CORRECTION' && !ev.note) die('CORRECTION 必须带 --note 说明更正了什么');
  const hit = scanSecrets(JSON.stringify(ev));
  if (hit.length) die(`拒绝写入：事件内容疑似包含秘密（${hit.join(', ')}）`);

  // 先算出任务的新状态，校验通过再落盘
  const ex = t.execution = { ...(t.execution || {}) };
  let status = ev.status || t.status;
  if (event === 'STARTED') { ex.started_at = ev.at; ex.actor = ev.actor; if (!ev.status && t.status === 'TODO') status = 'IN_PROGRESS'; }
  if (ev.remove_commit) ex.commits = (ex.commits || []).filter((c) => !c.startsWith(ev.remove_commit) && c !== 'true');
  if (ev.commit) ex.commits = [...new Set([...(ex.commits || []), ev.commit])];
  if (event === 'PUSHED') {
    const v = remoteContains(ws.root, g.head);
    if (!v.ok) die(`拒绝写 PUSHED：${v.why}。请用 pd.mjs sync --task ${t.id} --push，失败时会自动记 PUSH_FAILED`);
    ex.pushed = true; ex.remote_branch = v.ref; ex.pushed_head = g.head;
  }
  if (event === 'PUSH_FAILED') { ex.pushed = false; ex.push_error = ev.note || 'unknown'; }
  if (ev.evidence) ex.evidence = [...new Set([...(ex.evidence || []), ev.evidence])];
  if (ev.no_change_reason) ex.no_change_reason = ev.no_change_reason;
  if (event === 'BLOCKED') { t.blocked_reason = ev.note; t.escalation = { needs: ev.needs, to: ev.escalate || 'planner', options: ev.options, recommend: ev.recommend, at: ev.at }; if (!ev.status) status = 'BLOCKED'; }
  if (event === 'UNBLOCKED') { delete t.blocked_reason; delete t.escalation; if (!ev.status) status = 'TODO'; }
  if (['DONE', 'VERIFIED', 'FAILED'].includes(event) && !ev.status) status = event;
  if (DONE_LIKE.includes(status) && !DONE_LIKE.includes(t.status)) {
    const tmx = taskMap(ws); const sat = ws.config.dependency_satisfied_by || ['DONE', 'VERIFIED'];
    const unmet = (t.depends_on || []).filter((d) => !sat.includes(tmx.get(d)?.status) && tmx.get(d)?.status !== 'SUPERSEDED');
    if (unmet.length) die(`拒绝：${t.id} 的前置任务未完成（${unmet.join(', ')}），不能标 ${status}；部分完成请记 BLOCKED 或拆卡`);
  }
  if (DONE_LIKE.includes(status)) {
    const role = t.role || 'executor';
    const ledgerOk = (ws.ledger.entries || []).some((e) => e.result === 'PASS' && e.kind !== 'quality_signal' && (e.target === t.id || e.target === t.phase || (e.covers_tasks || []).includes(t.id)));
    if (status === 'VERIFIED' && !ledgerOk) die(`拒绝：${t.id} 要标 VERIFIED，测试台账必须先有 PASS 记录（pd.mjs test-record）`);
    if (role === 'tester' && !ledgerOk && !ex.no_change_reason) die(`拒绝：测试卡 ${t.id} 完成前必须先登记测试台账`);
    if (role !== 'tester' && !(ex.commits || []).length && !ex.no_change_reason) die(`拒绝：${t.id} 标 ${status} 需要真实提交（--commit <sha>）或 --no-change-reason`);
    if (status === 'DONE' && role !== 'tester' && (ex.commits || []).length && !ex.pushed && !ex.no_change_reason) {
      if (git(ws.root, ['remote'])) die(`拒绝：${t.id} 还没推送并核对同步。先跑 pd.mjs sync . --task ${t.id} --push（推送是完成的必要步骤）`);
      console.log('提醒：本仓库没有配置远程，DONE 无法同步到远程；请尽快配置 origin 并补推。');
    }
  }
  t.status = status;
  if (event === 'TEST_RUN' && args.cmd && args.paths && args.result) {
    if (!RESULT.includes(args.result)) die('--result 只能是 PASS/FAIL/UNKNOWN');
    const covers = pathList(args.paths);
    const miss = missingAtRev(ws.root, covers);
    if (miss.length) console.log(`提醒：这些覆盖路径在 HEAD 中不存在：${miss.join(', ')}（未提交、拼错，或大小写与 Git 记录不一致），指纹记为 missing`);
    const entry = { id: `TR-${stamp()}-${t.id.replace(/[^A-Za-z0-9-]/g, '')}`, at: ev.at, scope: 'task', kind: 'targeted', target: t.id, result: args.result,
      commit: g.head, dirty: g.dirty, covers_paths: covers, fingerprint: fingerprint(ws.root, covers), commands: [String(args.cmd)], tester: ev.actor, by_role: t.role || 'executor' };
    if (ws.testLedgerFile) { ws.ledger.entries = [...(ws.ledger.entries || []), entry]; writeJson(ws.testLedgerFile, ws.ledger); ev.ledger_entry = entry.id; console.log(`定向测试已登记测试台账 ${entry.id}（阶段体检可据此复用）`); }
    if (g.dirty) console.log('提醒：先提交再记 TEST_RUN，指纹才能覆盖本次改动；否则阶段体检会判定需要重测。');
  }

  const dir = ws.runLogDir || path.join(ws.root, '.product-development', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${t.id}.jsonl`);
  fs.appendFileSync(f, JSON.stringify(ev) + '\n', 'utf8');
  saveTasks(ws, [t.id]);
  console.log(`已记录 ${ev.event} → ${relp(f)}；${t.id} 当前状态 ${t.status}`);
  if (event === 'BLOCKED') console.log(`已上报 ${t.escalation.to}${ev.needs ? '，需要：' + ev.needs : ''}。只暂停本卡，就绪卡：${readyTasks('executor').map((x) => x.id).join(', ') || '无'}`);
}

// ---------------------------------------------------------------- test ledger
function testPlan() {
  const tm = taskMap(ws);
  // 只评估“产出代码”的卡；测试卡本身由阶段/全量台账条目体现
  let scopeTasks = [...tm.values()].filter((t) => DONE_LIKE.includes(t.status) && (t.role || 'executor') !== 'tester');
  if (args.phase) scopeTasks = scopeTasks.filter((t) => t.phase === args.phase);
  if (args.task) scopeTasks = scopeTasks.filter((t) => t.id === args.task);
  const entries = ws.ledger.entries || [];
  const reuse = []; const stale = []; const never = []; const failed = [];
  const dm = decisionMap(ws);
  const evalEntry = (e) => {
    const fpNow = fingerprint(ws.root, e.covers_paths || []);
    const decChanged = (e.decisions || []).some((d) => dm.get(d)?.status === 'SUPERSEDED');
    return { fpNow, same: fpNow === e.fingerprint && !decChanged, decChanged };
  };
  const latest = (list) => list.sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0];
  for (const t of scopeTasks) {
    const mine = entries.filter((e) => e.kind !== 'quality_signal' && (e.target === t.id || (e.covers_tasks || []).includes(t.id)));
    const last = latest([...mine]);
    const pass = latest(mine.filter((e) => e.result === 'PASS'));
    if (last && last.result === 'FAIL' && (!pass || last.at > pass.at)) { failed.push({ task: t.id, entry: last.id }); continue; }
    if (!pass) { never.push({ task: t.id }); continue; }
    const r = evalEntry(pass);
    (r.same ? reuse : stale).push({ task: t.id, entry: pass.id, reason: r.same ? '' : (r.decChanged ? '相关决策已变化' : '覆盖路径内容已变化') });
  }
  const phaseEntries = entries.filter((e) => e.scope !== 'task' && e.result === 'PASS' && e.kind !== 'quality_signal' && (!args.phase || e.target === args.phase));
  const phaseState = phaseEntries.map((e) => ({ entry: e.id, target: e.target, kind: e.kind, ...evalEntry(e) }));
  console.log(`测试计划（基于 ${gitInfo(ws.root).head?.slice(0, 7) ?? '?'}${args.phase ? '，阶段 ' + args.phase : ''}）`);
  console.log(`  可复用（需求和代码未变，原则上不重测）：${reuse.map((x) => `${x.task}←${x.entry}`).join(', ') || '无'}`);
  console.log(`  必须重测（指纹变化）：${stale.map((x) => `${x.task}[${x.reason}]`).join(', ') || '无'}`);
  console.log(`  从未测过：${never.map((x) => x.task).join(', ') || '无'}`);
  console.log(`  上次失败：${failed.map((x) => x.task).join(', ') || '无'}`);
  for (const p of phaseState) console.log(`  ${p.kind} ${p.target}（${p.entry}）：${p.same ? '可复用' : '需重跑'}`);
  console.log('提醒：指纹只覆盖登记的 covers_paths，被测代码的依赖（被 import 的模块、配置、lockfile）要一并登记，否则可能误复用。');
  if (args.json) console.log(JSON.stringify({ reuse, stale, never, failed, phase: phaseState }, null, 2));
}

function testRecord() {
  for (const k of ['target', 'scope', 'kind', 'result']) if (!args[k]) die(`缺少 --${k}`);
  if (!RESULT.includes(args.result)) die('--result 只能是 PASS/FAIL/UNKNOWN');
  if (!['task', 'phase', 'integration', 'final'].includes(args.scope)) die('--scope 只能是 task/phase/integration/final');
  if (!ws.testLedgerFile) die('config.paths.test_ledger 未配置');
  const g = gitInfo(ws.root);
  if (!g.head) die('不是 git 仓库，无法记录基线');
  let covers = args.paths ? pathList(args.paths) : [];
  let reusedFrom;
  if (args['reused-from']) {
    reusedFrom = (ws.ledger.entries || []).find((e) => e.id === args['reused-from']);
    if (!reusedFrom) die(`复用来源 ${args['reused-from']} 不存在`);
    if (reusedFrom.result !== 'PASS') die('只能复用 PASS 结果');
    if (fingerprint(ws.root, reusedFrom.covers_paths || []) !== reusedFrom.fingerprint) die(`拒绝复用：${reusedFrom.id} 的覆盖路径内容已变化，必须重测`);
    if (args.result !== 'PASS') die('复用登记只能是 PASS');
    if (!covers.length) covers = (reusedFrom.covers_paths || []).map(toPosix);
  } else if (!covers.length) die('缺少 --paths（本次测试覆盖的源码/测试/配置路径，逗号分隔）');
  const missing = missingAtRev(ws.root, covers);
  if (missing.length) console.log(`提醒：这些覆盖路径在 HEAD 中不存在：${missing.join(', ')}（未提交、拼错，或大小写与 Git 记录不一致），指纹记为 missing`);
  if (!reusedFrom && args.result === 'PASS' && !args.cmd) die('PASS 必须写 --cmd（实际执行的命令）；未执行的测试不能登记 PASS');
  const entry = {
    id: `TR-${stamp()}-${String(args.target).replace(/[^A-Za-z0-9-]/g, '')}`,
    at: nowIso(), scope: args.scope, kind: args.kind, target: String(args.target), result: args.result,
    commit: g.head, dirty: g.dirty, covers_paths: covers, fingerprint: fingerprint(ws.root, covers),
    commands: args.cmd ? [String(args.cmd)] : [], evidence: args.evidence ? toPosix(args.evidence) : undefined,
    covers_tasks: args.tasks ? String(args.tasks).split(',').map((s) => s.trim()) : undefined,
    decisions: args.decisions ? String(args.decisions).split(',').map((s) => s.trim()) : undefined,
    reused_from: reusedFrom?.id, tester: args.by || process.env.PD_ACTOR || 'tester',
  };
  if ((ws.ledger.entries || []).some((e) => e.id === entry.id)) entry.id += '-' + Math.random().toString(36).slice(2, 5);
  if (g.dirty) console.log('提醒：工作区有未提交改动，指纹按 HEAD 计算，未提交部分不受保护。');
  const hit = scanSecrets(JSON.stringify(entry));
  if (hit.length) die(`拒绝写入：疑似包含秘密（${hit.join(', ')}）`);
  ws.ledger.entries = [...(ws.ledger.entries || []), entry];
  writeJson(ws.testLedgerFile, ws.ledger);
  console.log(`已登记 ${entry.id}：${entry.kind} ${entry.target} = ${entry.result}${reusedFrom ? `（复用 ${reusedFrom.id}）` : ''}，指纹 ${entry.fingerprint}`);
}

// ---------------------------------------------------------------- status
function status() {
  const tasks = ws.tasks.tasks || [];
  const by = {};
  for (const t of tasks) by[t.status] = (by[t.status] || 0) + 1;
  const live = tasks.filter((t) => t.status !== 'SUPERSEDED');
  const done = live.filter((t) => DONE_LIKE.includes(t.status)).length;
  const ready = readyTasks();
  const openDec = (ws.decisions.decisions || []).filter((d) => ['OPEN', 'PROPOSED'].includes(d.status));
  console.log(`规划 ${ws.tasks.plan_version ?? '?'}：共 ${live.length} 张有效任务，已完成 ${done} 张（${live.length ? Math.round(done * 100 / live.length) : 0}%），其中测试确认 ${by.VERIFIED || 0} 张。`);
  console.log(`进行中 ${by.IN_PROGRESS || 0}，阻塞 ${by.BLOCKED || 0}，失败 ${by.FAILED || 0}，已替代 ${by.SUPERSEDED || 0}${by.UNKNOWN ? `，状态无法识别 ${by.UNKNOWN}` : ''}。`);
  console.log(`现在可以开工：${ready.map((t) => `${t.id}(${t.role || 'executor'})`).join(', ') || '无'}`);
  for (const t of tasks.filter((x) => x.status === 'BLOCKED')) console.log(`  阻塞 ${t.id}：${String(t.blocked_reason).slice(0, 120)}${t.escalation ? `（已上报 ${t.escalation.to}）` : ''}`);
  const unsynced = tasks.filter((x) => x.execution?.pushed === false || (x.status === 'DONE' && (x.execution?.commits || []).length && x.execution?.pushed !== true && x._md === undefined));
  for (const t of unsynced) console.log(`  未同步 ${t.id}：${t.execution?.push_error ? '推送失败：' + String(t.execution.push_error).slice(0, 100) : '已完成但没有 PUSHED 记录'}`);
  console.log(`待裁决决策：${openDec.map((d) => `${d.id}（${d.title}）`).join('；') || '无'}`);
}

// ---------------------------------------------------------------- scan（BOOTSTRAP 只读盘点）
function scan() {
  const r = path.resolve(root);
  const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo', 'out']);
  const files = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (/\.(md|json|ya?ml)$/i.test(e.name)) files.push(f);
    }
  };
  walk(r, 0);
  const rel = (f) => toPosix(path.relative(r, f));
  const pick = (re) => files.filter((f) => re.test(rel(f)));
  const prefixes = new Map();
  for (const f of files.filter((x) => /\.md$/i.test(x)).slice(0, 4000)) {
    const txt = readText(f);
    for (const m of txt.matchAll(/\b([A-Z][A-Z0-9]{0,5})-(\d{1,4})(?:-\d{1,4})?\b/g)) {
      const k = m[1];
      if (!prefixes.has(k)) prefixes.set(k, { count: 0, files: new Set() });
      const p = prefixes.get(k); p.count++; if (p.files.size < 3) p.files.add(rel(f));
    }
  }
  const g = gitInfo(r);
  console.log(`BOOTSTRAP 盘点（只读）：${r}`);
  console.log(`Git：${g.branch ?? '非 git 仓库'} @ ${g.head?.slice(0, 7) ?? '-'}${g.dirty ? '（有未提交改动）' : ''}；远程：${git(r, ['remote']) || '无'}`);
  const recent = git(r, ['log', '--oneline', '-5']);
  if (recent) console.log('最近提交：\n  ' + recent.split('\n').join('\n  '));
  const show = (title, list) => { console.log(`${title}（${list.length}）`); for (const f of list.slice(0, 15)) console.log(`  ${rel(f)}`); if (list.length > 15) console.log(`  …另 ${list.length - 15} 个`); };
  show('规则文件', pick(/(^|\/)(AGENTS|CLAUDE|GEMINI|CONTRIBUTING)\.md$|开发流程|规范|rules?\.md$/i));
  show('疑似任务索引', pick(/task-?index|任务索引|tasks?\.json$|backlog/i));
  show('疑似决策登记', pick(/decision|决策|台账|ADR|adr-/i));
  show('疑似规划/计划', pick(/plan|规划|roadmap|计划/i).filter((f) => !/task-?index/i.test(f)));
  show('疑似证据/测试记录', pick(/EVD|evidence|证据|test-?ledger|验收/i));
  console.log('编号前缀（出现次数，前 20）：');
  for (const [k, v] of [...prefixes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20)) console.log(`  ${k}-*：${v.count} 次，例：${[...v.files].join('，')}`);
  console.log('下一步：确定唯一的任务索引 / 决策登记册 / 测试台账，写 .product-development/config.json（markdown 表格用 formats 兼容），再跑 pd.mjs health。');
}

// ---------------------------------------------------------------- 推送与同步核对
function remoteContains(r, sha) {
  const remote = (git(r, ['remote']) || '').split('\n').filter(Boolean)[0];
  if (!remote) return { ok: false, why: '本仓库没有配置远程（git remote 为空）' };
  git(r, ['fetch', '--quiet', remote]);
  const refs = (git(r, ['branch', '-r', '--contains', sha]) || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!refs.length) return { ok: false, why: `远程 ${remote} 不包含提交 ${sha?.slice(0, 7)}` };
  return { ok: true, ref: refs[0] };
}
function sync() {
  const r = ws.root; const g = gitInfo(r);
  if (!g.head) die('不是 git 仓库');
  const remote = (git(r, ['remote']) || '').split('\n').filter(Boolean)[0];
  const t = args.task ? taskMap(ws).get(args.task) : null;
  if (args.task && !t) die(`任务不存在：${args.task}`);
  const fail = (why) => {
    console.log(`同步失败：${why}`);
    if (t) { args.event = 'PUSH_FAILED'; args.note = why; record(); }
    process.exitCode = 3;
  };
  if (!remote) return fail('没有远程仓库；先由用户/规划者配置 origin（凭据交给 Git Credential Manager 或 gh，不写进任何文件）');
  if (g.dirty) console.log('提醒：工作区有未提交改动，它们不会被推送。');
  const cfg = ws.config.git || {};
  const branch = g.branch;
  if (branch === (cfg.main_branch || 'main') && cfg.push_main === false && !args.merge) return fail(`当前在 ${branch}，而 config.git.push_main=false；请在任务分支提交后推送，或由用户把 push_main 改为 true`);
  if (args.push) {
    git(r, ['fetch', '--quiet', remote]);
    const up = git(r, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (up) {
      const behind = Number(git(r, ['rev-list', '--count', `HEAD..${up}`]) || 0);
      if (behind > 0) {
        const rb = git(r, ['rebase', up]);
        if (rb === null || gitInfo(r).dirty && /rebase/.test(git(r, ['status']) || '')) { git(r, ['rebase', '--abort']); return fail(`远程领先 ${behind} 个提交且 rebase 有冲突，已中止 rebase；交规划者裁决`); }
      }
    }
    const pr = gitRun(r, ['push', remote, `HEAD:refs/heads/${branch}`]);
    if (!pr.ok) return fail(`git push ${remote} ${branch} 失败：${pr.err || '无输出'}（常见原因：认证/代理/权限/保护分支）。禁止 force push`);
  }
  if (args.merge) {
    const main = cfg.main_branch || 'main';
    if (branch === main) return fail('已在主线，无需 --merge');
    const cur = branch;
    let m = gitRun(r, ['checkout', '-q', main]); if (!m.ok) return fail(`切换到 ${main} 失败：${m.err}`);
    gitRun(r, ['pull', '--ff-only', '-q', remote, main]);
    m = gitRun(r, ['merge', '--ff-only', '-q', cur]);
    if (!m.ok) { gitRun(r, ['checkout', '-q', cur]); return fail(`无法快进合并 ${cur} → ${main}：${m.err}（先 rebase ${main}，有冲突交规划者）`); }
    m = gitRun(r, ['push', remote, `${main}:refs/heads/${main}`]);
    if (!m.ok) { gitRun(r, ['checkout', '-q', cur]); return fail(`推送 ${main} 失败：${m.err}`); }
    console.log(`已快进合并 ${cur} → ${main} 并推送`);
  }
  const head = gitInfo(r).head;
  const v = remoteContains(r, head);
  if (!v.ok) return fail(v.why);
  const remoteHead = git(r, ['rev-parse', `${remote}/${branch}`]);
  const same = remoteHead === head;
  console.log(`同步核对：本地 ${branch}@${head.slice(0, 7)}，远程 ${remote}/${branch}@${remoteHead?.slice(0, 7) ?? '-'} → ${same ? '一致' : '远程已包含本地提交，但分支指针不同'}`);
  if (t) { args.event = 'PUSHED'; args.note = `${remote}/${branch}@${head.slice(0, 7)}`; record(); }
}

// ---------------------------------------------------------------- 规划者主动更新
function replanCheck() {
  const tasks = ws.tasks.tasks || [];
  const tm = taskMap(ws); const dm = decisionMap(ws);
  const items = [];
  const seenK = new Set();
  const add = (kind, target, why, action) => { const k = `${kind}|${target}|${why}`; if (seenK.has(k)) return; seenK.add(k); items.push({ kind, target, why, action }); };
  const userOwned = (dd) => /user|用户/i.test(`${dd.owner || ''} ${dd.decider || ''} ${dd.escalate || ''} ${(dd._row || '').split('|').slice(-2).join(' ')}`) || /产品|范围|安全|权限|定价|文案|数据删除|不可逆/.test(dd.title || '');
  // 1 阶段完成但没有阶段体检 / 阶段体检完成但未做规划复盘
  const phases = [...new Set(tasks.map((t) => t.phase).filter(Boolean))];
  for (const p of phases) {
    const inP = tasks.filter((t) => t.phase === p && t.status !== 'SUPERSEDED');
    const dev = inP.filter((t) => (t.role || 'executor') !== 'tester');
    const tester = inP.filter((t) => t.role === 'tester');
    if (dev.length && dev.every((t) => DONE_LIKE.includes(t.status))) {
      if (!tester.length) add('缺阶段体检卡', p, '本阶段开发卡全部完成，但没有 role:tester 的体检卡', '补一张阶段体检卡');
      else if (tester.every((t) => DONE_LIKE.includes(t.status))) {
        const reviewed = (ws.tasks.replans || []).some((x) => x.after_phase === p);
        if (!reviewed) add('阶段复盘', p, '阶段体检已完成，规划者尚未复盘', '复盘本阶段证据，更新后续卡（依赖/验收/假设），登记 replans[]，plan_version 递增');
      }
    }
  }
  // 2 阻塞与失败
  for (const t of tasks.filter((x) => x.status === 'BLOCKED')) add(t.escalation?.to === 'user' ? '待用户裁决' : '待规划者裁决', t.id, String(t.blocked_reason || '').slice(0, 140), t.escalation?.needs ? `裁决 ${t.escalation.needs} 并写入决策登记册，然后 record UNBLOCKED` : '裁决并解除阻塞或改卡');
  for (const t of tasks.filter((x) => x.status === 'FAILED')) add('失败卡', t.id, '执行或测试失败', '分析原因：拆卡 / 改验收 / 排修复卡（两次失败不再原样重试）');
  for (const e of (ws.ledger.entries || []).filter((x) => x.result === 'FAIL')) {
    const later = (ws.ledger.entries || []).some((y) => y.target === e.target && y.result === 'PASS' && y.at > e.at);
    if (!later) add('测试失败未处理', e.target, `测试台账 ${e.id} 为 FAIL`, '排修复卡或改判');
  }
  // 3 决策变化
  for (const t of tasks.filter((x) => !DONE_LIKE.includes(x.status) && x.status !== 'SUPERSEDED')) {
    for (const d of t.decisions || []) {
      const dd = dm.get(d);
      if (!dd) add('决策缺失', t.id, `引用的 ${d} 不在决策登记册`, '补录或裁决');
      else if (dd.status === 'SUPERSEDED') add('决策已被替代', t.id, `${d} → ${dd.superseded_by || '?'}`, '按新决策修订本卡');
      else if (['OPEN', 'PROPOSED'].includes(dd.status)) {
        if (userOwned(dd)) add('待用户裁决', t.id, `${d}（${(dd.title || '').slice(0, 40)}）仍是 ${dd.status}`, '属于用户裁决范围：规划者不得代裁，整理条件方案 A/B（共同部分、分叉点、各自影响）交用户');
        else add('未决决策阻挡任务', t.id, `${d} 仍是 ${dd.status}`, '规划者权限内可裁决（写 decided_by: planner）；涉及产品方向/范围/安全/数据/公共契约则交用户');
      }
    }
  }
  // 4 规划基线过旧
  const base = ws.tasks.baseline_commit || ws.tasks.base_commit;
  if (base && commitExists(ws.root, base)) {
    const n = Number(git(ws.root, ['rev-list', '--count', `${base}..HEAD`]) || 0);
    if (n >= (ws.config.replan?.max_commits_since_baseline ?? 30)) add('规划基线过旧', ws.tasks.plan_version || '?', `距规划基线已 ${n} 个提交`, '重做事实快照，核对文档与代码差异');
  }
  // 5 依赖异常
  for (const t of tasks) for (const d of t.depends_on || []) if (tm.get(d)?.status === 'SUPERSEDED' && !DONE_LIKE.includes(t.status)) add('依赖已被替代', t.id, `依赖 ${d} 已 SUPERSEDED`, `改依赖为 ${tm.get(d).superseded_by || '替代卡'}`);
  // 6 无事可做
  const ready = readyTasks();
  const open = tasks.filter((t) => !DONE_LIKE.includes(t.status) && t.status !== 'SUPERSEDED');
  if (open.length && !ready.length && !tasks.some((t) => t.status === 'IN_PROGRESS')) add('流水线停摆', '-', `还有 ${open.length} 张未完成卡，但没有可开工的卡`, '找出卡住的依赖/决策，优先解锁');
  if (!items.length) { console.log('规划检查：没有需要更新或裁决的事项。'); return; }
  console.log(`规划检查：${items.length} 项需要规划者处理（规划者应主动处理，不等用户提醒）`);
  items.forEach((x, i) => console.log(`${i + 1}. [${x.kind}] ${x.target}：${x.why} → ${x.action}`));
  console.log('\n----- 规划者提示词 -----');
  console.log([`你是本项目的规划者。请按 product-development Skill 的 REPLAN 模式处理以下事项：`, ...items.map((x, i) => `${i + 1}. [${x.kind}] ${x.target}：${x.why}（建议：${x.action}）`),
    '要求：只改受影响的卡，保留 ID；替换用 SUPERSEDED + superseded_by；裁决写入决策登记册（decided_by: planner），超出授权的上报用户并给条件方案；在任务索引 replans[] 追加 {at, after_phase?, reason, changed}；plan_version 递增；最后跑 pd.mjs health 和 pd.mjs next 输出下一批提示词。'].join('\n'));
  if (args.json) console.log(JSON.stringify(items, null, 2));
}

// ---------------------------------------------------------------- 提问前查记录
function askCheck() {
  const q = args._.slice(2).join(' ') || args.q;
  if (!q) die('用法：pd.mjs ask-check [root] "关键词 关键词"');
  const words = String(q).split(/[\s,，、]+/).filter((w) => w.length >= 2);
  const norm = (x) => String(x).toLowerCase().replace(/[\s`*「」“”"'（）()]/g, '');
  const score = (txt) => { const t = norm(txt); return words.reduce((n, w) => n + (t.includes(norm(w)) ? 1 : 0), 0); };
  const hits = [];
  for (const d of ws.decisions.decisions || []) {
    let txt = `${d.id} ${d.title || ''} ${d.summary || ''} ${d.decision || ''} ${d._row || ''}`;
    if (d._row) { /* markdown 台账：只看本行，不读整份文件 */ }
    else if (d.file) { const f = wsPath(d.file); if (fs.existsSync(f)) txt += ' ' + readText(f); }
    else if (ws.config.paths?.decision_dir) { const f = path.join(wsPath(ws.config.paths.decision_dir), `${d.id}.md`); if (fs.existsSync(f)) txt += ' ' + readText(f); }
    const s = score(txt); if (s) hits.push({ s, kind: '决策', id: d.id, status: d.status, title: d.title });
  }
  const cards = ws.config.paths?.task_cards ? wsPath(ws.config.paths.task_cards) : null;
  if (cards && fs.existsSync(cards)) for (const f of fs.readdirSync(cards).filter((x) => x.endsWith('.md'))) {
    const s = score(readText(path.join(cards, f))); if (s) hits.push({ s, kind: '任务卡', id: f.replace(/\.md$/, ''), status: taskMap(ws).get(f.replace(/\.md$/, ''))?.status, title: '' });
  }
  const need = words.length <= 1 ? 1 : Math.max(2, Math.ceil(words.length * 0.6));
  const strong = hits.filter((h) => h.s >= need);
  hits.sort((a, b) => b.s - a.s);
  if (!strong.length && hits.length) {
    console.log(`只找到弱相关记录（命中词数 < ${need}/${words.length}），不能视为已决定：`);
    for (const h of hits.slice(0, 5)) console.log(`  ${h.kind} ${h.id}${h.status ? ' [' + h.status + ']' : ''} ${h.title || ''}（命中 ${h.s}/${words.length}）`);
    console.log('请先读这些记录确认；确实没覆盖就提问（先规划者，超出授权再问用户），裁决后写入决策登记册。');
    return;
  }
  if (!hits.length) { console.log(`记录中没有与「${q}」相关的内容：可以提问（规划者裁决优先，超出授权再问用户），裁决后立即写入决策登记册。`); return; }
  console.log(`与「${q}」相关的已有记录（先读这些，已 DECIDED 的照做，不要再问用户）：`);
  for (const h of hits.slice(0, 8)) console.log(`  ${h.kind} ${h.id}${h.status ? ' [' + h.status + ']' : ''} ${h.title || ''}（命中 ${h.s}/${words.length}）`);
  const open = strong.filter((h) => h.kind === '决策' && ['OPEN', 'PROPOSED'].includes(h.status));
  if (open.length) console.log(`注意：${open.map((h) => h.id).join(', ')} 仍未决——这类问题应等裁决，不要自行假设。`);
  const decided = strong.filter((h) => h.kind === '决策' && h.status === 'DECIDED');
  if (decided.length && !open.length) { console.log(`结论：已有 DECIDED 决策 ${decided.map((h) => h.id).join(', ')}，不得再向用户提问，除非能证明它与新证据矛盾（此时交规划者 REPLAN）。`); process.exitCode = 5; }
}

// ---------------------------------------------------------------- 可选质量信号（逻辑在 quality.mjs）
function qualityCmd() {
  // 没有 config 也能跑（只输出、不写台账）；任何工具问题都记 UNKNOWN，不抛错、不改退出码
  try { runQuality({ root: ws?.root || root, ws, args }); } catch (e) { console.log(`质量信号：UNKNOWN —— 内部错误：${String(e?.message).replace(/(\w+:\/\/)[^\s@/]+@/g, '$1***@').slice(0, 200)}`); }
  process.exitCode = 0;
}

// ---------------------------------------------------------------- 外部 Skill 安装检查
function skills() {
  // fileURLToPath：Windows 上 URL.pathname 是 /C:/...，不能直接当路径用
  const here = path.dirname(fileURLToPath(import.meta.url));
  const regFile = path.join(here, '..', 'templates', 'skills-registry.json');
  if (!fs.existsSync(regFile)) die('缺少 templates/skills-registry.json');
  const reg = JSON.parse(readText(regFile));
  const list = Array.isArray(reg) ? reg : reg.skills || [];
  const r = path.resolve(root);
  // 检测路径：$(command -v X) / cmd:X → PATH 查找（Windows 按 PATHEXT）；其余展开 ~ %VAR% $VAR 与 * / ** 通配
  const detect = (p) => {
    const m = String(p).match(/^\$\(command -v (\S+)\)$|^cmd:(\S+)$/);
    if (m) return which(m[1] || m[2]);
    for (const c of detectCandidates(p, r)) { const hit = globFirst(c); if (hit) return hit; }
    return null;
  };
  const missing = [];
  for (const s of list) {
    let found = null;
    for (const p of s.detect_paths || []) { found = detect(p); if (found) break; }
    console.log(`${found ? '✓' : '✗'} ${s.id}${found ? '  ' + found : ''}  [${(s.phases || []).join('/')}]`);
    if (!found) missing.push(s);
  }
  if (!missing.length) return;
  console.log('\n缺失的可选 Skill —— 请当前 IDE/CLI 自行安装（只从下列官方仓库；失败不阻塞主任务，按本 Skill 内置步骤继续并记录）：');
  const seen = new Set();
  for (const s of missing) {
    const generic = IS_WIN && s.generic_install_windows ? s.generic_install_windows : s.generic_install;
    const key = JSON.stringify([s.repo, s.claude_code_install, generic]);
    if (seen.has(key)) continue; seen.add(key);
    const same = missing.filter((m) => JSON.stringify([m.repo, m.claude_code_install, IS_WIN && m.generic_install_windows ? m.generic_install_windows : m.generic_install]) === key).map((m) => m.id);
    console.log(`\n# ${same.join(' / ')}  ${s.repo}`);
    for (const c of s.claude_code_install || []) console.log(`  [Claude Code] ${c}`);
    for (const c of generic || []) console.log(`  [其他 CLI${IS_WIN && s.generic_install_windows ? '·PowerShell' : ''}]   ${c}`);
  }
}
