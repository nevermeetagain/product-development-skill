// pd quality —— 可选质量信号（Node 路径，零安装）：复杂度/CRAP（ESLint complexity + 覆盖率）、重复（jscpd）、变异（StrykerJS，按需）
// 永不阻塞：没有阈值门禁，退出码恒为 0；工具缺失、语言不支持、离线 → UNKNOWN + 原因。
// 工具只在运行时经 `npx --yes <包>@<锁定主版本>` 拉取（尊重 HTTP(S)_PROXY），本 Skill 不安装任何依赖。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IS_WIN, toPosix, git, gitInfo, which, readJson, writeJson, writeText, nowIso, stamp, fingerprint, scanSecrets } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const JS_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
export const TS_EXT = /\.(?:[cm]?ts|tsx)$/i;
export const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx|py|go|java|kt|kts|scala|cs|fs|rb|php|rs|swift|c|cc|cpp|cxx|h|hpp|m|mm|clj|cljs|cljc|ex|exs|dart|lua|vue|svelte|astro|sql|sh)$/i;
export const TEST_RE = /(^|\/)(test|tests|__tests__|spec|specs|__mocks__|e2e)\/|\.(test|spec)\.[^/]+$/i;
export const SKIP_DIR = /(^|\/)(node_modules|dist|build|out|coverage|\.git|\.metrics|reports|vendor|target|\.stryker-tmp|\.next|\.nuxt)(\/|$)/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const STRYKER_CONFIGS = ['stryker.config.mjs', 'stryker.config.js', 'stryker.config.cjs', 'stryker.config.json', 'stryker.conf.mjs', 'stryker.conf.js', 'stryker.conf.cjs', 'stryker.conf.json', '.stryker.conf.mjs', '.stryker.conf.js', '.stryker.conf.cjs', '.stryker.conf.json'];

// ---------------------------------------------------------------- 纯函数（自测直接调用）
/** 按 Node 版本选锁定主版本（各包 engines 已在 npm 核实，见 engineering-discipline.md §6） */
export function pickVersions(nodeVer = process.versions.node) {
  const [M, m] = String(nodeVer).replace(/^v/, '').split('.').map(Number);
  const at = (maj, min) => M === maj && m >= min;
  return {
    eslint: at(20, 19) || at(22, 13) || M >= 24 ? '10' : '9', // eslint 10: ^20.19 || ^22.13 || >=24；9: ^18.18
    tsParser: '8', typescript: '5',
    c8: at(20, 19) || at(22, 12) || M >= 23 ? '12' : '10', // c8 12: ^20.19 || ^22.12 || >=23；10: >=18
    jscpd: '5', // >=18，Rust 预编译二进制（含 windows-x64/arm64）
    stryker: M >= 22 ? '10' : M >= 20 ? '9' : '8', // core 10: >=22；9: >=20；8: >=18
  };
}

/** CRAP = comp² × (1 − cov)³ + comp；cov 为 0..1；任一未知 → null */
export function crap(comp, cov) {
  if (!Number.isFinite(comp) || cov === null || cov === undefined || !Number.isFinite(cov)) return null;
  const c = Math.min(1, Math.max(0, cov));
  return Math.round((comp * comp * (1 - c) ** 3 + comp) * 100) / 100;
}

const keyOf = (root, p) => { const k = toPosix(path.resolve(root, toPosix(p))); return IS_WIN ? k.toLowerCase() : k; };

/** 读覆盖率：istanbul coverage-final.json 或 lcov.info → Map<规范化绝对路径, [{line, hit}]> */
export function parseCoverage(text, root, hint = '') {
  const map = new Map();
  const add = (file, line, hit) => { const k = keyOf(root, file); if (!map.has(k)) map.set(k, []); map.get(k).push({ line, hit }); };
  const t = text.replace(/^\uFEFF/, '');
  if (/\.json$/i.test(hint) || /^\s*\{/.test(t)) {
    const j = JSON.parse(t);
    for (const [k, v] of Object.entries(j)) {
      const file = v.path || k;
      for (const [id, loc] of Object.entries(v.statementMap || {})) add(file, loc.start.line, (v.s?.[id] ?? 0) > 0);
      if (!Object.keys(v.statementMap || {}).length) for (const [id, fn] of Object.entries(v.fnMap || {})) add(file, (fn.loc || fn.decl).start.line, (v.f?.[id] ?? 0) > 0);
    }
    return map;
  }
  let cur = null;
  for (const raw of t.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('SF:')) cur = l.slice(3);
    else if (l.startsWith('DA:') && cur) { const [ln, cnt] = l.slice(3).split(','); add(cur, Number(ln), Number(cnt) > 0); }
    else if (l === 'end_of_record') cur = null;
  }
  return map;
}

/** 单个函数的覆盖率：函数行区间内、扣除严格嵌套子函数区间后的语句/行命中比例；无数据 → null */
export function functionCoverage(fn, siblings, lines) {
  if (!lines || !fn.line || !fn.endLine) return null;
  const nested = siblings.filter((g) => g !== fn && g.line >= fn.line && g.endLine <= fn.endLine && (g.line > fn.line || g.endLine < fn.endLine));
  const mine = lines.filter((x) => x.line >= fn.line && x.line <= fn.endLine && !nested.some((g) => x.line >= g.line && x.line <= g.endLine));
  if (!mine.length) return null;
  return mine.filter((x) => x.hit).length / mine.length;
}

/** 合并函数复杂度与覆盖率，算每函数 CRAP */
export function crapTable(functions, covMap, root) {
  const byFile = new Map();
  for (const f of functions) { const k = keyOf(root, f.file); if (!byFile.has(k)) byFile.set(k, []); byFile.get(k).push(f); }
  const out = [];
  for (const [k, fns] of byFile) {
    const lines = covMap ? covMap.get(k) : undefined;
    for (const f of fns) {
      const cov = covMap ? functionCoverage(f, fns, lines) : null;
      out.push({ ...f, coverage: cov === null ? null : Math.round(cov * 1000) / 1000, crap: crap(f.complexity, cov), note: covMap && !lines ? '覆盖率报告中没有此文件' : undefined });
    }
  }
  return out.sort((a, b) => (b.crap ?? -1) - (a.crap ?? -1) || b.complexity - a.complexity);
}

/** 区间并集的行数 */
export function unionLines(ranges) {
  const s = [...ranges].sort((a, b) => a[0] - b[0]); let n = 0; let cs = null; let ce = null;
  for (const [a, b] of s) { if (cs === null || a > ce + 1) { if (cs !== null) n += ce - cs + 1; cs = a; ce = b; } else ce = Math.max(ce, b); }
  if (cs !== null) n += ce - cs + 1;
  return n;
}

/** mutation-testing-report-schema（StrykerJS / Stryker.NET / Stryker4s 通用）→ 计数与分数 */
export function mutationScore(report) {
  const c = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0, Pending: 0 };
  for (const f of Object.values(report.files || {})) for (const m of f.mutants || []) c[m.status] = (c[m.status] || 0) + 1;
  const detected = c.Killed + c.Timeout; const valid = detected + c.Survived + c.NoCoverage;
  return { score: valid ? Math.round(detected * 10000 / valid) / 100 : null, killed: c.Killed, timeout: c.Timeout, survived: c.Survived, no_coverage: c.NoCoverage, errors: c.CompileError + c.RuntimeError, ignored: c.Ignored };
}

/** 去掉 URL 中的凭据（代理地址常带 token），避免写进输出/台账 */
export const scrub = (s) => String(s ?? '').replace(/(\w+:\/\/)[^\s@/]+@/g, '$1***@');

// ---------------------------------------------------------------- 范围：改动文件
/** 选 diff 基线：--base > 阶段最早提交的父提交 > 分支与主线的 merge-base > 有未提交改动用 HEAD > HEAD~1 */
export function resolveBase(root, { base, phase, tasks = [], mainBranch = 'main' } = {}) {
  if (base) { const b = git(root, ['rev-parse', '--verify', '-q', `${base}^{commit}`]); return b ? { base: b, how: `--base ${base}` } : { base: null, how: `--base ${base} 无效` }; }
  if (phase) {
    const commits = [...new Set(tasks.filter((t) => t.phase === phase).flatMap((t) => t.execution?.commits || []))]
      .map((c) => git(root, ['rev-parse', '--verify', '-q', `${c}^{commit}`])).filter(Boolean);
    if (commits.length) {
      const first = commits.find((c) => commits.every((o) => o === c || git(root, ['merge-base', '--is-ancestor', c, o]) !== null)) || commits[0];
      const parent = git(root, ['rev-parse', '--verify', '-q', `${first}^`]);
      return { base: parent || EMPTY_TREE, how: `阶段 ${phase} 最早提交 ${first.slice(0, 7)} 的父提交` };
    }
  }
  const g = gitInfo(root);
  if (g.branch && g.branch !== mainBranch && g.branch !== 'HEAD') {
    const mb = git(root, ['merge-base', mainBranch, 'HEAD']);
    if (mb && mb !== g.head) return { base: mb, how: `${g.branch} 与 ${mainBranch} 的分叉点` };
  }
  if (g.dirty) return { base: 'HEAD', how: '未提交改动（相对 HEAD）' };
  const prev = git(root, ['rev-parse', '--verify', '-q', 'HEAD~1']);
  return prev ? { base: prev, how: '最近一次提交（HEAD~1）' } : { base: EMPTY_TREE, how: '仓库只有一个提交' };
}

export function changedFiles(root, base) {
  const diff = (git(root, ['diff', '--name-only', '--diff-filter=ACMRT', base]) ?? '').split('\n');
  const untracked = (git(root, ['ls-files', '--others', '--exclude-standard']) ?? '').split('\n');
  return [...new Set([...diff, ...untracked].map((f) => toPosix(f.trim())).filter(Boolean))]
    .filter((f) => !SKIP_DIR.test(f) && fs.existsSync(path.join(root, f))).sort();
}

export function allFiles(root) {
  const listed = git(root, ['ls-files', '-co', '--exclude-standard']);
  if (listed !== null) return listed.split('\n').map((f) => toPosix(f.trim())).filter((f) => f && !SKIP_DIR.test(f) && fs.existsSync(path.join(root, f))).sort();
  const out = [];
  const walk = (d, depth) => { if (depth > 12) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const rel = toPosix(path.relative(root, path.join(d, e.name))); if (SKIP_DIR.test(rel + '/')) continue; if (e.isDirectory()) walk(path.join(d, e.name), depth + 1); else if (e.isFile()) out.push(rel); } };
  walk(root, 0);
  return out.sort();
}

// ---------------------------------------------------------------- 运行外部工具
function findNpxCli() {
  const dir = path.dirname(process.execPath);
  const c = [path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js'), path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')];
  return c.find((f) => fs.existsSync(f)) || null;
}
const quoteWin = (a) => (/^[\w@.\/\\:=,+-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);

/** 组装 npx 调用：优先 `node npx-cli.js`（不经 shell，两平台一致）；否则 PATH 中的 npx（Windows 为 npx.cmd，经 shell 并逐个加引号） */
export function npxInvocation(specs, cmdArgs, { isWin = IS_WIN, npxCli = findNpxCli(), npxBin = which('npx') } = {}) {
  const a = ['--yes', ...specs.flatMap((s) => ['-p', s]), ...cmdArgs];
  if (npxCli) return { file: process.execPath, args: [npxCli, ...a], shell: false };
  if (!npxBin) return null;
  if (isWin) return { file: ['npx', ...a].map(quoteWin).join(' '), args: [], shell: true };
  return { file: npxBin, args: a, shell: false };
}

function toolEnv(opts) {
  const env = { ...process.env, npm_config_yes: 'true', npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false', npm_config_loglevel: 'error', NO_COLOR: '1', FORCE_COLOR: '0' };
  const hp = env.HTTPS_PROXY || env.https_proxy; const p = env.HTTP_PROXY || env.http_proxy;
  if (hp && !env.npm_config_https_proxy) env.npm_config_https_proxy = hp;
  if (p && !env.npm_config_proxy) env.npm_config_proxy = p;
  if (opts.offline) env.npm_config_offline = 'true';
  return env;
}

export function failReason(r) {
  if (r.disabled) return r.disabled;
  if (r.timedOut) return `超时（${Math.round(r.timeoutMs / 60000)} 分钟）`;
  if (r.error?.code === 'ENOENT' || r.missing) return '找不到 npx/npm（需要随 Node.js 安装的 npm）';
  const err = scrub(`${r.stderr || ''}\n${r.error?.message || ''}`);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTCACHED|ENETUNREACH|getaddrinfo|network|proxy|CERT_|self.signed/i.test(err)) return `无法下载工具（离线/代理/证书）：${(err.match(/.*(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTCACHED|ENETUNREACH|getaddrinfo|network|proxy|CERT_|self.signed).*/i) || [''])[0].trim().slice(0, 160)}`;
  const last = err.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(-2).join(' | ');
  return `退出码 ${r.status}${last ? '：' + last.slice(0, 200) : ''}`;
}

export function runNpx(specs, cmdArgs, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10 * 60000;
  if (process.env.PD_QUALITY_NO_NPX === '1') return { ok: false, disabled: '已禁用 npx（PD_QUALITY_NO_NPX=1）', timeoutMs };
  const inv = npxInvocation(specs, cmdArgs);
  if (!inv) return { ok: false, missing: true, timeoutMs };
  const r = spawnSync(inv.file, inv.args, { cwd: opts.cwd, env: toolEnv(opts), shell: inv.shell, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error, timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM', timeoutMs };
}

function runShell(command, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10 * 60000;
  const r = spawnSync(command, { cwd: opts.cwd, env: { ...toolEnv(opts), ...(opts.env || {}) }, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error, timedOut: r.error?.code === 'ETIMEDOUT', timeoutMs };
}

/** 配置的自定义命令：PD_QUALITY_FILES（范围文件列表 JSON）、PD_QUALITY_OUT（结果 JSON 写这里，或打印到 stdout） */
function runOverride(command, files, ctx, timeoutMs) {
  const filesJson = path.join(ctx.tmp, `files-${Math.random().toString(36).slice(2, 7)}.json`);
  const out = path.join(ctx.tmp, `out-${Math.random().toString(36).slice(2, 7)}.json`);
  fs.writeFileSync(filesJson, JSON.stringify(files));
  const r = runShell(command, { cwd: ctx.root, env: { PD_QUALITY_FILES: filesJson, PD_QUALITY_OUT: out, PD_QUALITY_ROOT: ctx.root }, timeoutMs, offline: ctx.offline });
  let data = null;
  try { data = JSON.parse(fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : r.stdout); } catch { data = null; }
  return { r, data };
}

// ---------------------------------------------------------------- 各项信号
function complexityStep(ctx) {
  const cfg = ctx.tools.complexity;
  const src = ctx.scope.filter((f) => SOURCE_EXT.test(f) && !TEST_RE.test(f));
  if (cfg === false) return { status: 'UNKNOWN', reason: '配置 quality.tools.complexity=false 已关闭', functions: [] };
  if (cfg?.command) {
    const { r, data } = runOverride(cfg.command, src, ctx, ctx.timeoutMs);
    const list = Array.isArray(data) ? data : data?.functions;
    if (!Array.isArray(list)) return { status: 'UNKNOWN', reason: `自定义复杂度命令未输出函数 JSON（${r.ok ? '格式不对' : failReason(r)}）`, functions: [], cmd: cfg.command };
    return { status: 'OK', tool: 'custom', cmd: cfg.command, functions: list.map((f) => ({ ...f, file: toPosix(path.relative(ctx.root, path.resolve(ctx.root, toPosix(f.file)))), complexity: Number(f.complexity) })) };
  }
  const js = src.filter((f) => JS_EXT.test(f));
  const other = src.length - js.length;
  if (!js.length) return { status: 'UNKNOWN', reason: src.length ? `范围内 ${other} 个源码文件不是 JS/TS；按语言配置 quality.tools.complexity.command` : '范围内没有源码文件', functions: [] };
  const ts = js.some((f) => TS_EXT.test(f));
  const v = ctx.versions;
  const specs = [`eslint@${v.eslint}`, ...(ts ? [`@typescript-eslint/parser@${v.tsParser}`, `typescript@${v.typescript}`] : [])];
  const job = path.join(ctx.tmp, 'eslint-job.json'); const out = path.join(ctx.tmp, 'eslint-out.json');
  fs.writeFileSync(job, JSON.stringify({ root: ctx.root, files: js, typescript: ts, out }));
  const r = runNpx(specs, ['node', path.join(HERE, 'quality-eslint.mjs'), job], { cwd: ctx.root, timeoutMs: ctx.timeoutMs, offline: ctx.offline });
  const cmd = `npx --yes ${specs.map((s) => '-p ' + s).join(' ')} node scripts/quality-eslint.mjs`;
  if (!r.ok || !fs.existsSync(out)) return { status: 'UNKNOWN', reason: `ESLint 未运行：${failReason(r)}`, functions: [], cmd };
  const res = readJson(out);
  return {
    status: 'OK', tool: `eslint@${res.version}${res.typescript ? ' + @typescript-eslint/parser' : ''}`, cmd,
    functions: res.functions.map((f) => ({ ...f, file: toPosix(path.relative(ctx.root, f.file)) })),
    skipped: res.skipped.map((s) => ({ ...s, file: toPosix(path.relative(ctx.root, s.file)) })),
    note: other ? `另有 ${other} 个非 JS/TS 源码文件未计复杂度（可配 quality.tools.complexity.command）` : undefined,
  };
}

function coverageStep(ctx) {
  const explicit = ctx.args.coverage || ctx.q.coverage_report;
  const testCmd = ctx.args['test-cmd'] || ctx.q.test_command;
  const fromFile = (rel, how) => {
    const f = path.resolve(ctx.root, toPosix(rel));
    if (!fs.existsSync(f)) return { status: 'UNKNOWN', reason: `覆盖率报告不存在：${rel}` };
    try {
      const map = parseCoverage(fs.readFileSync(f, 'utf8'), ctx.root, f);
      const newest = Math.max(0, ...ctx.scope.map((s) => { try { return fs.statSync(path.join(ctx.root, s)).mtimeMs; } catch { return 0; } }));
      return { status: 'OK', map, source: toPosix(path.relative(ctx.root, f)) || rel, how, stale: fs.statSync(f).mtimeMs + 1000 < newest };
    } catch (e) { return { status: 'UNKNOWN', reason: `覆盖率报告无法解析（${String(e.message).slice(0, 100)}）` }; }
  };
  if (ctx.args.coverage) return fromFile(ctx.args.coverage, '--coverage');
  if (ctx.args['test-cmd']) return runC8(ctx, ctx.args['test-cmd']);
  if (explicit) return fromFile(explicit, 'quality.coverage_report');
  if (testCmd) return runC8(ctx, testCmd);
  for (const c of ['coverage/coverage-final.json', 'coverage/lcov.info']) if (fs.existsSync(path.join(ctx.root, c))) return fromFile(c, '自动发现');
  return { status: 'UNKNOWN', reason: '没有覆盖率报告，也没有测试命令（加 --test-cmd "<本阶段定向测试命令>"，或配置 quality.test_command / quality.coverage_report）' };
}

function runC8(ctx, testCmd) {
  const js = ctx.scope.filter((f) => JS_EXT.test(f) && !TEST_RE.test(f));
  if (!js.length) return { status: 'UNKNOWN', reason: 'c8 只采集 Node.js 代码覆盖率；非 JS 项目请提供 lcov/istanbul 报告（quality.coverage_report）' };
  if (process.env.PD_QUALITY_NO_NPX === '1') return { status: 'UNKNOWN', reason: '已禁用 npx（PD_QUALITY_NO_NPX=1）' };
  const raw = path.join(ctx.tmp, 'v8'); const out = path.join(ctx.tmp, 'c8');
  fs.mkdirSync(raw, { recursive: true });
  // 直接设 NODE_V8_COVERAGE 跑测试命令（c8 本身也是这么做的），避免把命令字符串再经一层参数拆分
  const t = runShell(testCmd, { cwd: ctx.root, env: { NODE_V8_COVERAGE: raw }, timeoutMs: ctx.timeoutMs, offline: ctx.offline });
  const testNote = t.ok ? '' : `测试命令未通过（${failReason(t)}），覆盖率仍按已执行部分统计`;
  const r = runNpx([`c8@${ctx.versions.c8}`], ['c8', 'report', '--temp-directory', raw, '--reporter', 'json', '--report-dir', out, '--all', '--exclude-after-remap', ...js.flatMap((f) => ['--include', f])], { cwd: ctx.root, timeoutMs: ctx.timeoutMs, offline: ctx.offline });
  const f = path.join(out, 'coverage-final.json');
  if (!r.ok || !fs.existsSync(f)) return { status: 'UNKNOWN', reason: `c8 未生成报告：${failReason(r)}`, testNote };
  return { status: 'OK', map: parseCoverage(fs.readFileSync(f, 'utf8'), ctx.root, f), source: `c8@${ctx.versions.c8} ← ${testCmd}`, how: '--test-cmd', testNote, cmd: `NODE_V8_COVERAGE=… ${testCmd} && npx c8@${ctx.versions.c8} report --reporter json --all` };
}

function duplicationStep(ctx) {
  const cfg = ctx.tools.duplication;
  if (cfg === false) return { status: 'UNKNOWN', reason: '配置 quality.tools.duplication=false 已关闭' };
  const out = path.join(ctx.tmp, 'jscpd');
  const ignore = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/coverage/**,**/.metrics/**,**/reports/**,**/vendor/**,**/target/**,**/.stryker-tmp/**';
  const spec = `jscpd@${ctx.versions.jscpd}`;
  const extra = Array.isArray(cfg?.args) ? cfg.args.map(String) : [];
  // 全仓扫描（改动文件与未改文件之间的重复也能发现），再只保留触及范围文件的克隆
  const r = runNpx([spec], ['jscpd', '.', '-r', 'json,silent', '-o', out, '--absolute', '--ignore', ignore, ...extra], { cwd: ctx.root, timeoutMs: ctx.timeoutMs, offline: ctx.offline });
  const f = path.join(out, 'jscpd-report.json');
  const cmd = `npx --yes ${spec} . -r json -o <tmp> --ignore "<构建/依赖目录>"${extra.length ? ' ' + extra.join(' ') : ''}`;
  if (!fs.existsSync(f)) return { status: 'UNKNOWN', reason: `jscpd 未运行：${failReason(r)}`, cmd };
  const rep = readJson(f);
  const rel = (n) => toPosix(path.relative(ctx.root, path.resolve(ctx.root, n)));
  const dups = (rep.duplicates || []).map((d) => ({ a: rel(d.firstFile.name), as: d.firstFile.start, ae: d.firstFile.end, b: rel(d.secondFile.name), bs: d.secondFile.start, be: d.secondFile.end, lines: d.lines, kind: d.kind }));
  const total = rep.statistics?.total || {};
  return { status: 'OK', tool: spec, cmd, ...duplicationMetrics(dups, ctx.changed ? ctx.scope : null, ctx.root, total) };
}

/** 重复度：全量用 jscpd 统计；限定范围时 = 范围源码文件内被克隆覆盖的行 / 范围源码文件总行数 */
export function duplicationMetrics(dups, scope, root, total = {}) {
  if (!scope) return { percentage: Number(total.percentage ?? 0), clones: dups.length, project_percentage: Number(total.percentage ?? 0), top: dups.slice().sort((x, y) => y.lines - x.lines).slice(0, 5) };
  const set = new Set(scope);
  const mine = dups.filter((d) => set.has(d.a) || set.has(d.b));
  const ranges = new Map();
  for (const d of mine) for (const [f, s, e] of [[d.a, d.as, d.ae], [d.b, d.bs, d.be]]) if (set.has(f)) { if (!ranges.has(f)) ranges.set(f, []); ranges.get(f).push([s, e]); }
  let dupLines = 0; for (const rs of ranges.values()) dupLines += unionLines(rs);
  let lines = 0;
  for (const f of scope.filter((x) => SOURCE_EXT.test(x))) { try { lines += fs.readFileSync(path.join(root, f), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length; } catch { /* 跳过 */ } }
  return { percentage: lines ? Math.round(dupLines * 10000 / lines) / 100 : 0, clones: mine.length, duplicated_lines: dupLines, scope_lines: lines, project_percentage: total.percentage !== undefined ? Number(total.percentage) : undefined, top: mine.slice().sort((x, y) => y.lines - x.lines).slice(0, 5) };
}

function mutationStep(ctx) {
  const cfg = ctx.tools.mutation;
  const configFile = STRYKER_CONFIGS.find((c) => fs.existsSync(path.join(ctx.root, c)));
  if (cfg === false) return { status: 'SKIPPED', reason: '配置 quality.tools.mutation=false 已关闭' };
  if (!ctx.args.mutation && !configFile && !cfg?.command) return { status: 'SKIPPED', reason: '未启用：项目没有 Stryker 配置；需要时加 --mutation（慢，只对高风险模块）' };
  const src = ctx.scope.filter((f) => SOURCE_EXT.test(f) && !TEST_RE.test(f));
  const tm = ctx.mutationTimeoutMs;
  if (cfg?.command) {
    const { r, data } = runOverride(cfg.command, src, ctx, tm);
    let rep = data;
    if (!rep?.files && cfg.report && fs.existsSync(path.join(ctx.root, cfg.report))) rep = readJson(path.join(ctx.root, cfg.report));
    if (!rep?.files) return { status: 'UNKNOWN', reason: `自定义变异命令没有产出 mutation-testing-report JSON（${r.ok ? '格式不对' : failReason(r)}）`, cmd: cfg.command };
    return { status: 'OK', tool: 'custom', cmd: cfg.command, ...mutationScore(rep) };
  }
  const js = src.filter((f) => JS_EXT.test(f));
  if (!js.length) return { status: 'UNKNOWN', reason: 'StrykerJS 只支持 JS/TS；C# 用 Stryker.NET、Scala 用 Stryker4s，经 quality.tools.mutation.command 接入（输出 mutation-testing-report JSON）' };
  const local = fs.existsSync(path.join(ctx.root, 'node_modules', '@stryker-mutator', 'core', 'package.json'));
  const specs = local ? [] : [`@stryker-mutator/core@${ctx.versions.stryker}`];
  const reportFile = path.join(ctx.tmp, 'mutation.json');
  let args;
  if (configFile) {
    args = ['stryker', 'run', configFile, '--reporters', 'json,clear-text', ...(ctx.changed ? ['--mutate', js.join(',')] : [])];
  } else {
    const testCmd = ctx.args['test-cmd'] || ctx.q.test_command || 'npm test';
    const tmpCfg = path.join(ctx.tmp, 'stryker.pd.json');
    fs.writeFileSync(tmpCfg, JSON.stringify({ testRunner: 'command', commandRunner: { command: testCmd }, coverageAnalysis: 'off', mutate: js, reporters: ['json', 'clear-text'], jsonReporter: { fileName: reportFile }, tempDirName: '.stryker-tmp', cleanTempDir: true }, null, 2));
    args = ['stryker', 'run', tmpCfg];
  }
  const r = runNpx(specs, args, { cwd: ctx.root, timeoutMs: tm, offline: ctx.offline });
  const cmd = `npx --yes ${local ? '' : specs[0] + ' '}stryker run ${configFile || '<临时配置>'}${ctx.changed ? ' --mutate <范围文件>' : ''}`;
  const f = [reportFile, path.join(ctx.root, 'reports', 'mutation', 'mutation.json')].find((x) => fs.existsSync(x) && fs.statSync(x).mtimeMs >= ctx.startedAt - 1000);
  if (!f) return { status: 'UNKNOWN', reason: `Stryker 未产出报告：${failReason(r)}`, cmd };
  return { status: 'OK', tool: local ? 'stryker（项目本地）' : specs[0], cmd, ...mutationScore(readJson(f)) };
}

// ---------------------------------------------------------------- 汇总与台账
export function buildEntries(summary, { target, scope, commit, dirty, covers, fp, evidence, tester, at = nowIso(), st = stamp() }) {
  const out = [];
  for (const [signal, s] of Object.entries(summary.signals)) {
    if (s.status === 'SKIPPED') continue;
    out.push({
      id: `TR-${st}-${String(target).replace(/[^A-Za-z0-9-]/g, '')}-q${signal}`,
      at, scope, kind: 'quality_signal', signal, target: String(target), result: s.status === 'OK' ? 'PASS' : 'UNKNOWN',
      commit, dirty, covers_paths: covers, fingerprint: fp, commands: s.cmd ? [scrub(s.cmd)] : [], evidence, tester,
      tool: s.tool, metrics: s.metrics, reason: s.reason ? scrub(s.reason) : undefined,
    });
  }
  return out;
}

function fmtSummary(sum) {
  const L = [];
  const s = sum.signals;
  L.push(`质量信号（只作规划者排卡线索，不是门禁）—— 范围：${sum.scope_desc}，${sum.files} 个文件`);
  const c = s.crap;
  if (c.status === 'OK') {
    const m = c.metrics;
    L.push(`  CRAP：${m.functions} 个函数，最差 ${m.worst ? `${m.worst.crap ?? '?'} @ ${m.worst.file}:${m.worst.line} ${m.worst.name}（复杂度 ${m.worst.complexity}，覆盖 ${m.worst.coverage === null ? '?' : Math.round(m.worst.coverage * 100) + '%'}）` : '—'}；≥30 的 ${m.over30} 个，最大复杂度 ${m.max_complexity}`);
  } else L.push(`  CRAP：UNKNOWN —— ${c.reason}${c.metrics?.functions ? `（已取复杂度：${c.metrics.functions} 个函数，最大 ${c.metrics.max_complexity}）` : ''}`);
  const d = s.duplication;
  L.push(d.status === 'OK' ? `  重复：${d.metrics.percentage}%（克隆 ${d.metrics.clones} 处${d.metrics.project_percentage !== undefined && sum.changed ? `；全仓 ${d.metrics.project_percentage}%` : ''}）${d.metrics.top?.[0] ? `，最大 ${d.metrics.top[0].a}:${d.metrics.top[0].as}-${d.metrics.top[0].ae} ≈ ${d.metrics.top[0].b}:${d.metrics.top[0].bs}-${d.metrics.top[0].be}` : ''}` : `  重复：UNKNOWN —— ${d.reason}`);
  const mu = s.mutation;
  L.push(mu.status === 'OK' ? `  变异：分数 ${mu.metrics.score ?? '?'}%（杀死 ${mu.metrics.killed}，超时 ${mu.metrics.timeout}，幸存 ${mu.metrics.survived}，未覆盖 ${mu.metrics.no_coverage}）` : `  变异：${mu.status} —— ${mu.reason}`);
  for (const n of sum.notes) L.push(`  注：${n}`);
  return L.join('\n');
}

/** 入口：ws 可为 null（没有 config 时只输出、不写台账） */
export function quality({ root, ws, args }) {
  const startedAt = Date.now();
  root = path.resolve(root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.log(`质量信号：UNKNOWN —— 目录不存在：${root}`); process.exitCode = 0; return null; }
  const q = ws?.config?.quality || {};
  const tools = q.tools || {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-quality-'));
  const versions = { ...pickVersions(), ...(q.versions || {}) };
  const timeoutMs = Number(args.timeout || q.timeout_minutes || 10) * 60000;
  const ctx = { root, ws, args, q, tools, tmp, versions, timeoutMs, mutationTimeoutMs: Number(args.timeout || q.mutation_timeout_minutes || 30) * 60000, offline: !!args.offline, startedAt, changed: !!args.changed };
  const notes = [];
  let scopeDesc = '全仓';
  const isRepo = git(root, ['rev-parse', '--git-dir']) !== null;
  if (args.changed) {
    if (!isRepo) { notes.push('不是 git 仓库，--changed 无法计算，改为全仓'); ctx.changed = false; ctx.scope = allFiles(root); }
    else {
      const b = resolveBase(root, { base: args.base, phase: args.phase, tasks: ws?.tasks?.tasks || [], mainBranch: ws?.config?.git?.main_branch || 'main' });
      if (!b.base) { notes.push(`${b.how}，改为全仓`); ctx.changed = false; ctx.scope = allFiles(root); }
      else { ctx.scope = changedFiles(root, b.base); scopeDesc = `改动文件（基线：${b.how}${b.base.length === 40 ? ' ' + b.base.slice(0, 7) : ''}）`; ctx.base = b.base; }
    }
  } else ctx.scope = allFiles(root);
  if (args.paths) { const want = String(args.paths).split(',').map((s) => toPosix(s.trim())).filter(Boolean); ctx.scope = ctx.scope.filter((f) => want.some((w) => f === w || f.startsWith(w.replace(/\/$/, '') + '/'))); ctx.changed = true; scopeDesc += `，限定 ${want.join(',')}`; }

  const safe = (fn, label) => { try { return fn(ctx); } catch (e) { return { status: 'UNKNOWN', reason: `${label} 内部错误：${scrub(e.message).slice(0, 160)}` }; } };
  const comp = ctx.scope.length ? safe(complexityStep, '复杂度') : { status: 'UNKNOWN', reason: '范围内没有文件', functions: [] };
  const cov = comp.status === 'OK' && comp.functions.length ? safe(coverageStep, '覆盖率') : { status: 'UNKNOWN', reason: '没有可计分的函数，跳过覆盖率' };
  if (cov.testNote) notes.push(cov.testNote);
  if (cov.stale) notes.push(`覆盖率报告 ${cov.source} 早于范围内最新改动，可能过期`);
  if (comp.note) notes.push(comp.note);
  if (comp.skipped?.length) notes.push(`复杂度跳过 ${comp.skipped.length} 个文件（${comp.skipped[0].file}：${comp.skipped[0].reason}）`);
  const table = comp.status === 'OK' ? crapTable(comp.functions, cov.status === 'OK' ? cov.map : null, root) : [];
  const worst = table[0];
  const crapSig = {
    status: comp.status === 'OK' && cov.status === 'OK' && table.some((t) => t.crap !== null) ? 'OK' : 'UNKNOWN',
    tool: [comp.tool, cov.source].filter(Boolean).join(' + ') || undefined,
    cmd: [comp.cmd, cov.cmd].filter(Boolean).join(' ; ') || undefined,
    reason: comp.status !== 'OK' ? comp.reason : cov.status !== 'OK' ? `覆盖率未知：${cov.reason}（只有复杂度）` : (table.some((t) => t.crap !== null) ? undefined : '覆盖率报告未覆盖范围内任何函数'),
    metrics: comp.status === 'OK' ? {
      functions: table.length, max_complexity: Math.max(0, ...table.map((t) => t.complexity)),
      over30: table.filter((t) => (t.crap ?? 0) >= 30).length,
      worst: worst ? { file: worst.file, line: worst.line, name: worst.name, complexity: worst.complexity, coverage: worst.coverage, crap: worst.crap } : null,
      top: table.slice(0, 10).map((t) => ({ file: t.file, line: t.line, name: t.name, complexity: t.complexity, coverage: t.coverage, crap: t.crap })),
      coverage_source: cov.source,
    } : undefined,
  };
  const dup = ctx.scope.length ? safe(duplicationStep, '重复') : { status: 'UNKNOWN', reason: '范围内没有文件' };
  const mut = ctx.scope.length ? safe(mutationStep, '变异') : { status: 'SKIPPED', reason: '范围内没有文件' };
  const pack = (s, keys) => ({ status: s.status, tool: s.tool, cmd: s.cmd, reason: s.reason, metrics: s.status === 'OK' ? Object.fromEntries(keys.map((k) => [k, s[k]]).filter(([, v]) => v !== undefined)) : undefined });
  const summary = {
    at: nowIso(), root: toPosix(root), changed: ctx.changed, base: ctx.base, scope_desc: scopeDesc, files: ctx.scope.length, versions,
    signals: { crap: crapSig, duplication: pack(dup, ['percentage', 'clones', 'duplicated_lines', 'scope_lines', 'project_percentage', 'top']), mutation: pack(mut, ['score', 'killed', 'timeout', 'survived', 'no_coverage', 'errors', 'ignored']) },
    notes: notes.map(scrub), functions: table,
  };
  const text = fmtSummary(summary);
  console.log(text);

  // 原始明细写 .metrics/（不提交），摘要写证据目录，台账逐信号登记
  const metricsDir = path.join(root, '.metrics');
  try { fs.mkdirSync(metricsDir, { recursive: true }); if (!fs.existsSync(path.join(metricsDir, '.gitignore'))) fs.writeFileSync(path.join(metricsDir, '.gitignore'), '*\n'); fs.writeFileSync(path.join(metricsDir, 'pd-quality-latest.json'), JSON.stringify(summary, null, 2)); } catch { /* 只读目录也不阻塞 */ }
  const target = args.phase || args.task || args.target || 'quality';
  if (!ws) console.log('未找到 .product-development/config.json：只输出结果，未写测试台账。');
  else if (args['no-record']) console.log('--no-record：未写测试台账。');
  else if (!ws.testLedgerFile) console.log('config.paths.test_ledger 未配置：未写测试台账。');
  else {
    const g = gitInfo(root);
    if (!g.head) console.log('不是 git 仓库（或还没有提交）：未写测试台账。');
    else {
      const st = stamp();
      const evDir = ws.p('evidence') || metricsDir;
      const evFile = path.join(evDir, `quality-${String(target).replace(/[^A-Za-z0-9-]/g, '')}-${st}.md`);
      const mdText = `# 质量信号 ${target}（${summary.at}）\n\n基于提交 ${g.head.slice(0, 7)}${g.dirty ? '（有未提交改动）' : ''}。只作规划者排卡线索，不是门禁；PASS 只表示工具跑完。\n\n\`\`\`\n${text}\n\`\`\`\n`;
      if (scanSecrets(mdText).length) console.log('摘要疑似含秘密，未写证据文件。'); else writeText(evFile, mdText);
      const covers = ctx.changed ? ctx.scope : ['.'];
      const entries = buildEntries(summary, { target, scope: args.task && !args.phase ? 'task' : 'phase', commit: g.head, dirty: g.dirty, covers, fp: fingerprint(root, covers), evidence: fs.existsSync(evFile) ? toPosix(path.relative(root, evFile)) : undefined, tester: args.by || process.env.PD_ACTOR || 'tester', st });
      const hit = scanSecrets(JSON.stringify(entries));
      if (hit.length) console.log(`台账条目疑似含秘密（${hit.join(', ')}），未写入。`);
      else if (entries.length) {
        ws.ledger.entries = [...(ws.ledger.entries || []), ...entries];
        writeJson(ws.testLedgerFile, ws.ledger);
        console.log(`已登记 ${entries.map((e) => `${e.id}=${e.result}`).join('，')}（kind: quality_signal，不能当阶段体检/回归 PASS 复用）`);
      }
    }
  }
  if (args.json) console.log(JSON.stringify({ ...summary, functions: undefined }, null, 2));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows 占用时留给系统清理 */ }
  process.exitCode = 0;
  return summary;
}
