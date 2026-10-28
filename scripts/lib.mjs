// product-development 辅助脚本公共库（零第三方依赖，Node >= 18）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

export const TASK_STATUS = ['TODO', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'BLOCKED', 'FAILED', 'SUPERSEDED'];
export const DONE_LIKE = ['DONE', 'VERIFIED'];
export const DECISION_STATUS = ['PROPOSED', 'OPEN', 'DECIDED', 'SUPERSEDED', 'REJECTED'];
export const ROLES = ['planner', 'executor', 'tester', 'user'];
export const DETAIL = ['READY', 'REFINE_BEFORE_EXECUTION'];
export const RESULT = ['PASS', 'FAIL', 'UNKNOWN'];
export const EVENTS = ['STARTED', 'PLAN_CONFIRMED', 'BLOCKED', 'UNBLOCKED', 'TEST_RUN', 'COMMITTED', 'PUSHED', 'PUSH_FAILED',
  'DONE', 'VERIFIED', 'FAILED', 'CORRECTION', 'ESCALATED', 'DECIDED', 'REPLANNED', 'NOTE'];

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /gho_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /https?:\/\/[^\s/:@]+:[^\s/@]+@github\.com/,
];

export function die(msg, code = 2) { console.error(msg); process.exit(code); }

/** 不依赖 Date.prototype.toISOString（某些环境被改写为本地化字符串） */
export function nowIso() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
}
export const stamp = () => nowIso().replace(/[-:TZ]/g, '').slice(0, 14);

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`无法读取 JSON：${file}（${e.message}）`); }
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ------------------------------------------------------------ markdown 表格适配（老项目不搬家）
function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = []; let cur = ''; let tick = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '`') tick = !tick;
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|' && !tick) { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** 读取文件里所有含 idColumn 表头的 markdown 表格 */
export function readMdTables(file, idColumn) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const head = splitRow(lines[i]);
    if (!head.includes(idColumn) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const cells = splitRow(lines[j]);
      const row = {}; head.forEach((h, k) => { row[h] = cells[k] ?? ''; });
      rows.push({ line: j, row, text: lines[j] });
    }
    out.push({ head, rows });
    i = j;
  }
  return out;
}

/** 读取文件里第一张含 idColumn 表头的 markdown 表格 */
export function readMdTable(file, idColumn) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const head = splitRow(lines[i]);
    if (!head.includes(idColumn) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const cells = splitRow(lines[j]);
      const row = {}; head.forEach((h, k) => { row[h] = cells[k] ?? ''; });
      rows.push({ line: j, row });
    }
    return { head, rows, lines };
  }
  throw new Error(`在 ${file} 中找不到表头含「${idColumn}」的 markdown 表格`);
}

const SHA_RE = /\b[0-9a-f]{7,40}\b/g;

function mapStatus(cell, statusMap) {
  const c = cell.replace(/\*\*/g, '').trim();
  for (const [prefix, st] of Object.entries(statusMap || {})) if (c.toLowerCase().startsWith(prefix.toLowerCase())) return st;
  return TASK_STATUS.find((s) => c.toUpperCase().startsWith(s)) || 'UNKNOWN';
}

function loadMdTasks(ws, fmt) {
  const col = { id: 'ID', title: 'title', depends_on: 'depends_on', status: 'status', ...(fmt.columns || {}) };
  const t = readMdTable(ws.taskIndexFile, col.id);
  const tasks = t.rows.filter((r) => /\S/.test(r.row[col.id])).map(({ line, row }) => {
    const statusCell = row[col.status] ?? '';
    const status = mapStatus(statusCell, fmt.status_map);
    const deps = (row[col.depends_on] || '').split(/[,，、\s]+/).map((x) => x.trim()).filter((x) => /^[A-Za-z]+[\w-]*\d/.test(x));
    const task = {
      id: row[col.id].replace(/\*\*/g, '').trim(), title: row[col.title] || '', status, depends_on: deps,
      role: fmt.default_role || 'executor', _md: { line, statusCell },
    };
    if (col.phase) task.phase = row[col.phase];
    if (col.owner) task.owner = row[col.owner];
    if (col.condition) {
      const m = (row[col.condition] || '').match(/条件[:：]\s*([A-Za-z0-9-]+)/);
      if (m) task.decisions = [m[1]];
    }
    const shas = DONE_LIKE.includes(status) ? (statusCell.match(SHA_RE) || []) : [];
    task.execution = { commits: shas.slice(0, 1) };
    if (status === 'BLOCKED') task.blocked_reason = statusCell;
    if (fmt.cards_dir) {
      const f = path.join(fmt.cards_dir, `${task.id}.md`);
      if (fs.existsSync(path.join(ws.root, f))) task.card = f;
    }
    return task;
  });
  return { plan_version: fmt.plan_version, tasks, _format: 'markdown-table', _table: t, _col: col };
}

function loadMdDecisions(ws, fmt) {
  // 多来源：fmt.sources = [{ path, id_column?, title_column?, id_pattern?, default_status?, open_pattern? }]
  const sources = fmt.sources || [].concat(ws.config.paths.decision_index).map((p) => ({ path: p }));
  const out = []; const seen = new Set();
  for (const src of sources) {
    const file = path.join(ws.root, src.path);
    if (!fs.existsSync(file)) continue;
    const idCol = src.id_column || fmt.columns?.id || 'ID';
    const titleCol = src.title_column || fmt.columns?.title || 'title';
    const idRe = new RegExp(src.id_pattern || fmt.id_pattern || '^[A-Z][A-Za-z]*-[\\w-]*\\d');
    const openRe = src.open_pattern || fmt.open_pattern ? new RegExp(src.open_pattern || fmt.open_pattern) : null;
    const dflt = src.default_status || fmt.default_status || 'DECIDED';
    for (const t of readMdTables(file, idCol)) for (const { row, text } of t.rows) {
      const id = (row[idCol] || '').replace(/\*\*/g, '').trim();
      if (!id || !idRe.test(id) || seen.has(id)) continue;
      seen.add(id);
      let st = fmt.columns?.status && row[fmt.columns.status] !== undefined ? mapStatus(row[fmt.columns.status], fmt.status_map) : dflt;
      if (openRe && openRe.test(text)) st = 'OPEN';
      out.push({ id, title: (row[titleCol] || Object.values(row)[1] || '').slice(0, 80), status: DECISION_STATUS.includes(st) ? st : dflt, decided_by: 'legacy', file: src.path, _row: text });
    }
  }
  return { decisions: out, _format: 'markdown-table' };
}

/** 加载工作区：root 下的 .product-development/config.json */
export function loadWorkspace(root) {
  root = path.resolve(root || '.');
  const cfgFile = path.join(root, '.product-development', 'config.json');
  if (!fs.existsSync(cfgFile)) throw new Error(`未找到 ${cfgFile}。先执行 BOOTSTRAP 建立路径映射（可先跑 pd.mjs scan 盘点）。`);
  const config = readJson(cfgFile);
  const p = (k) => {
    const v = config.paths?.[k];
    return typeof v === 'string' ? path.join(root, v) : null;
  };
  const ws = { root, config, cfgFile, p };
  ws.taskIndexFile = p('task_index');
  ws.decisionIndexFile = p('decision_index');
  ws.testLedgerFile = p('test_ledger');
  ws.runLogDir = p('run_logs');
  const tf = config.formats?.task_index;
  const df = config.formats?.decision_index;
  if (ws.taskIndexFile && fs.existsSync(ws.taskIndexFile)) ws.tasks = tf?.type === 'markdown-table' ? loadMdTasks(ws, tf) : readJson(ws.taskIndexFile);
  else ws.tasks = { tasks: [] };
  if (config.paths?.decision_index && (df?.type === 'markdown-table' || (ws.decisionIndexFile && fs.existsSync(ws.decisionIndexFile)))) {
    ws.decisions = df?.type === 'markdown-table' ? loadMdDecisions(ws, df) : readJson(ws.decisionIndexFile);
  } else ws.decisions = { decisions: [] };
  // 额外决策来源（如多个 ADR 目录、待裁决清单）：只登记 ID 存在性
  for (const extra of config.decision_sources || []) {
    const dir = path.join(root, extra.dir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(new RegExp(extra.id_pattern || '^(ADR-\\d+)'));
      if (m && !ws.decisions.decisions.some((d) => d.id === m[1])) ws.decisions.decisions.push({ id: m[1], title: f, status: extra.status || 'DECIDED', decided_by: 'legacy', file: path.join(extra.dir, f) });
    }
  }
  ws.ledger = ws.testLedgerFile && fs.existsSync(ws.testLedgerFile) ? readJson(ws.testLedgerFile) : { entries: [] };
  return ws;
}

/** 保存任务索引：JSON 整体写回；markdown 只改动变更任务的“状态”单元格 */
export function saveTasks(ws, changedIds) {
  if (ws.tasks._format !== 'markdown-table') {
    const { _format, ...data } = ws.tasks; writeJson(ws.taskIndexFile, data); return;
  }
  const fmt = ws.config.formats.task_index;
  const { _table: t, _col: col } = ws.tasks;
  const lines = t.lines;
  const statusIdx = t.head.indexOf(col.status);
  for (const id of changedIds) {
    const task = ws.tasks.tasks.find((x) => x.id === id);
    const tmpl = (fmt.status_write || {})[task.status] || task.status;
    const commit = task.execution?.commits?.[0] || '';
    const cellText = tmpl.replace('{commit}', commit.slice(0, 8)).replace('{reason}', task.blocked_reason || '').trim();
    const cells = splitRow(lines[task._md.line]);
    cells[statusIdx] = cellText;
    lines[task._md.line] = '| ' + cells.join(' | ') + ' |';
  }
  fs.writeFileSync(ws.taskIndexFile, lines.join('\n'), 'utf8');
}

export function git(root, args, { allowFail = true } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}
/** 带错误原文的 git 调用（推送等需要把报错告诉用户的场景） */
export function gitRun(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim().split('\n').slice(-3).join(' | ') };
}
export function gitInfo(root) {
  return {
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(root, ['rev-parse', 'HEAD']),
    dirty: (git(root, ['status', '--porcelain']) ?? '') !== '',
    isRepo: git(root, ['rev-parse', '--git-dir']) !== null,
  };
}
export function commitExists(root, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha || '')) return false;
  return git(root, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

/** 内容指纹：覆盖路径在给定提交上的 git 对象哈希摘要；路径不存在记为 missing */
export function fingerprint(root, paths, rev = 'HEAD') {
  const parts = [];
  for (const p of [...paths].sort()) {
    const h = git(root, ['rev-parse', `${rev}:${p.replace(/\\/g, '/').replace(/\/$/, '')}`]);
    parts.push(`${p}=${h ?? 'missing'}`);
  }
  return 'sha256:' + crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

export function scanSecrets(text) {
  return SECRET_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}

export function taskMap(ws) { return new Map((ws.tasks.tasks || []).map((t) => [t.id, t])); }
export function decisionMap(ws) { return new Map((ws.decisions.decisions || []).map((d) => [d.id, d])); }

/** 参数解析：--flag value；值缺失或为空字符串时报错（防止 --commit "" 被当成 true） */
export function parseArgs(argv, booleanFlags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (booleanFlags.includes(k)) { out[k] = true; continue; }
      const n = argv[i + 1];
      if (n === undefined || n.startsWith('--') || n.trim() === '') die(`参数 --${k} 缺少值（不能为空）`);
      out[k] = n; i++;
    } else out._.push(a);
  }
  return out;
}
