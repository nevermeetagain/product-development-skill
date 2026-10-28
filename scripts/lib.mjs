// product-development 辅助脚本公共库（零第三方依赖，Node >= 18）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

export const IS_WIN = process.platform === 'win32';

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

// ------------------------------------------------------------ 跨平台：路径、文本、写盘
/** 存储用路径一律 POSIX：反斜杠转 /，去掉开头 ./（Windows 上 path.join/relative 产生的 \\ 不写进台账/索引） */
export function toPosix(p) {
  if (p === undefined || p === null) return p;
  return String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/');
}
/** 逗号分隔的路径列表 → 去重的 POSIX 路径数组 */
export function pathList(s) {
  return [...new Set(String(s || '').split(/[,，]/).map((x) => toPosix(x.trim())).filter(Boolean))];
}
/** 读文本：去 UTF-8 BOM（Windows PowerShell 5 / 记事本常写 BOM） */
export function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}
/** 文件主导换行符：CRLF 多于 LF 时返回 \r\n（写回时保持原样，避免 Windows 仓库整文件变动） */
export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}
export function readJson(file) {
  try { return JSON.parse(readText(file)); }
  catch (e) { throw new Error(`无法读取 JSON：${file}（${e.message}）`); }
}
function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* 忽略 */ } }
/**
 * 原子写：先写同目录临时文件再 rename；Windows 上目标被编辑器/杀毒软件短暂占用时 rename 会 EPERM/EBUSY，
 * 退避重试 5 次，仍失败则直接覆盖写（保证不丢数据），并清理临时文件。
 */
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  for (let i = 0; i < 6; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES', 'EEXIST'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { /* 忽略 */ } throw e; }
      sleepMs(50 * (i + 1));
    }
  }
  try { fs.writeFileSync(file, text, 'utf8'); } finally { try { fs.unlinkSync(tmp); } catch { /* 忽略 */ } }
}
/** JSON 写回：保持文件原有换行符（新文件用 LF），末尾换行 */
export function writeJson(file, data) {
  let eol = '\n';
  try { eol = detectEol(fs.readFileSync(file, 'utf8')); } catch { /* 新文件 */ }
  const body = JSON.stringify(data, null, 2) + '\n';
  writeText(file, eol === '\n' ? body : body.replace(/\n/g, '\r\n'));
}

/** 主目录：os.homedir()（Windows 为 %USERPROFILE%），兼容 HOME 覆盖 */
export function homeDir() { return os.homedir() || process.env.HOME || process.env.USERPROFILE || ''; }

/**
 * 展开检测路径：~ / %VAR% / $VAR / ${VAR} / 以 ./ 开头的项目相对路径；统一用 path.join 拼接
 * Windows 下 ~/.claude 即 %USERPROFILE%\.claude；设置了 CLAUDE_CONFIG_DIR / CODEX_HOME 时由 detectCandidates 额外检查。
 */
export function expandPath(p, root = '.') {
  let s = String(p)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, k) => (process.env[k] ?? m))
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => (process.env[k] ?? m))
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, k) => (process.env[k] ?? m));
  if (!IS_WIN) s = s.replace(/\\/g, '/'); // 配置里写的 Windows 分隔符在 POSIX 上也能用
  if (/^~(?=[\/\\]|$)/.test(s)) return path.join(homeDir(), s.slice(1));
  if (path.isAbsolute(s) || /^[A-Za-z]:[\/\\]/.test(s)) return path.normalize(s);
  return path.join(path.resolve(root), s.replace(/^\.[\/\\]/, ''));
}
/** 一个检测路径的所有候选：~/.claude/* 兼容 CLAUDE_CONFIG_DIR，~/.codex/* 兼容 CODEX_HOME */
export function detectCandidates(p, root = '.') {
  const out = [expandPath(p, root)];
  const m = String(p).match(/^~[\/\\]\.(claude|codex)(?=[\/\\]|$)(.*)$/);
  const alt = m && (m[1] === 'claude' ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME);
  if (alt) out.push(path.join(alt, m[2] || ''));
  return out;
}
/** 在 PATH 中查找可执行文件（Windows 按 PATHEXT 补 .cmd/.exe 等），等价于 command -v / Get-Command */
export function which(cmd) {
  const exts = IS_WIN ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  for (const dir of (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const f = path.join(dir, cmd + ext);
      try { if (fs.statSync(f).isFile()) return f; } catch { /* 下一个 */ }
    }
  }
  return null;
}
/** 支持 * 与 ** 的存在性检查（** 最多下探 maxDepth 层，避免扫全盘）；返回首个命中路径或 null */
export function globFirst(pattern, maxDepth = 6) {
  const abs = path.resolve(pattern);
  if (!/[*?]/.test(abs)) return fs.existsSync(abs) ? abs : null;
  const parts = abs.split(/[\/\\]+/);
  let base = parts.shift();
  base = base === '' ? path.sep : base + path.sep; // POSIX 根 或 Windows 盘符
  const toRe = (seg) => new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', IS_WIN ? 'i' : '');
  const list = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
  const walk = (dir, i, budget) => {
    if (i === parts.length) return fs.existsSync(dir) ? dir : null;
    const seg = parts[i];
    if (seg === '**') {
      const here = walk(dir, i + 1, budget); if (here) return here;
      if (budget <= 0) return null;
      for (const e of list(dir)) if (e.isDirectory()) { const r = walk(path.join(dir, e.name), i, budget - 1); if (r) return r; }
      return null;
    }
    if (!/[*?]/.test(seg)) return walk(path.join(dir, seg), i + 1, budget);
    const re = toRe(seg);
    for (const e of list(dir)) if (re.test(e.name)) { const r = walk(path.join(dir, e.name), i + 1, budget); if (r) return r; }
    return null;
  };
  return walk(base, 0, maxDepth);
}
/** 大小写敏感的存在性检查：Windows/macOS 文件系统不区分大小写，但 Git 区分；不一致时指纹会判为 missing */
export function existsExactCase(root, rel) {
  let dir = path.resolve(root);
  for (const seg of toPosix(rel).split('/').filter(Boolean)) {
    let names; try { names = fs.readdirSync(dir); } catch { return false; }
    if (!names.includes(seg)) return false;
    dir = path.join(dir, seg);
  }
  return true;
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
  const lines = readText(file).split(/\r?\n/);
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
  const raw = fs.readFileSync(file, 'utf8');
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = detectEol(raw);
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
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
    return { head, rows, lines, eol, bom };
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
      const f = toPosix(path.posix.join(toPosix(fmt.cards_dir), `${task.id}.md`));
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
    const file = path.join(ws.root, toPosix(src.path));
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
      out.push({ id, title: (row[titleCol] || Object.values(row)[1] || '').slice(0, 80), status: DECISION_STATUS.includes(st) ? st : dflt, decided_by: 'legacy', file: toPosix(src.path), _row: text });
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
    return typeof v === 'string' ? path.join(root, toPosix(v)) : null;
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
    const dir = path.join(root, toPosix(extra.dir));
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(new RegExp(extra.id_pattern || '^(ADR-\\d+)'));
      if (m && !ws.decisions.decisions.some((d) => d.id === m[1])) ws.decisions.decisions.push({ id: m[1], title: f, status: extra.status || 'DECIDED', decided_by: 'legacy', file: toPosix(path.posix.join(toPosix(extra.dir), f)) });
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
  writeText(ws.taskIndexFile, (t.bom || '') + lines.join(t.eol || '\n'));
}

// core.quotepath=false：中文文件名按 UTF-8 原样输出（否则是 "\344\273..." 八进制转义）
const GIT_BASE = ['-c', 'core.quotepath=false'];
let gitMissing = false;
/** git 是否可用（Windows 需安装 Git for Windows 并在 PATH 中） */
export function gitAvailable() { if (!gitMissing) git('.', ['--version']); return !gitMissing; }
export function git(root, args, { allowFail = true } = {}) {
  try {
    return execFileSync('git', [...GIT_BASE, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).replace(/\r\n/g, '\n').trim();
  } catch (e) {
    if (e.code === 'ENOENT') gitMissing = true;
    if (allowFail) return null;
    throw e;
  }
}
/** 带错误原文的 git 调用（推送等需要把报错告诉用户的场景） */
export function gitRun(root, args) {
  const r = spawnSync('git', [...GIT_BASE, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.error?.code === 'ENOENT') gitMissing = true;
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim().split(/\r?\n/).slice(-3).join(' | ') };
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

/**
 * 内容指纹：覆盖路径在给定提交上的 git 对象哈希摘要；路径不存在记为 missing。
 * 用 git 对象哈希（blob/tree 存的是 Git 规范化后的内容，与工作区 CRLF/autocrlf 无关），
 * 路径先转 POSIX，所以 Windows 与 Linux 对同一提交算出同一指纹。
 */
export function fingerprint(root, paths, rev = 'HEAD') {
  const parts = [];
  for (const p of [...paths].map(toPosix).sort()) {
    const h = git(root, ['rev-parse', `${rev}:${p.replace(/\/$/, '')}`]);
    parts.push(`${p}=${h ?? 'missing'}`);
  }
  return 'sha256:' + crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}
/** 覆盖路径中在给定提交里不存在的项（未提交、拼错，或 Windows/macOS 上大小写与 Git 记录不一致） */
export function missingAtRev(root, paths, rev = 'HEAD') {
  return [...paths].map(toPosix).filter((p) => git(root, ['rev-parse', '--verify', '-q', `${rev}:${p.replace(/\/$/, '')}`]) === null);
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
