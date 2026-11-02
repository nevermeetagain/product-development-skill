// PDS-632：审查发现（findings）结构化校验。只读；Markdown 只由 JSON 生成，防止“口头发现”
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { die, readText } from '../lib.mjs';

const SEV = ['P0', 'P1', 'P2', 'P3'];
export const fingerprintOf = (f) => crypto.createHash('sha1').update(`${String(f.file).trim()}|${String(f.claim).replace(/\s+/g, ' ').trim().toLowerCase()}`).digest('hex').slice(0, 12);

/** 校验一条发现：返回缺陷原因，合法返回 null */
function invalid(f) {
  if (!f || typeof f !== 'object') return '不是对象';
  if (!SEV.includes(f.severity)) return `severity 必须是 ${SEV.join('/')}`;
  for (const k of ['file', 'claim', 'evidence']) if (!f[k] || !String(f[k]).trim()) return `缺 ${k}`;
  if (f.line !== undefined && !Number.isInteger(f.line)) return 'line 必须是整数';
  return null;
}

export function checkFindings(input, rejected = []) {
  const rej = new Set(rejected.map((r) => r.fingerprint || r));
  const kept = []; const dropped = []; const suppressed = [];
  for (const f of input.findings || []) {
    const why = invalid(f);
    if (why) { dropped.push({ id: f?.id, why }); continue; }
    const fp = f.fingerprint || fingerprintOf(f);
    if (rej.has(fp)) { suppressed.push({ id: f.id, fp }); continue; }
    kept.push({ ...f, fingerprint: fp });
  }
  kept.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity));
  return { kept, dropped, suppressed };
}

export function toMarkdown(r) {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = ['| 级别 | 位置 | 结论 | 证据 | 指纹 |', '|---|---|---|---|---|'];
  for (const f of r.kept) lines.push(`| ${f.severity} | ${esc(f.file)}${f.line ? ':' + f.line : ''} | ${esc(f.claim)} | ${esc(f.evidence)} | ${f.fingerprint} |`);
  lines.push('', `保留 ${r.kept.length}，丢弃（结构不合法）${r.dropped.length}，抑制（已驳回）${r.suppressed.length}`);
  for (const d of r.dropped) lines.push(`- 丢弃 ${d.id || '?'}：${d.why}`);
  return lines.join('\n');
}

export function run({ ws, args }) {
  const file = args.file || args._?.find((x) => x.endsWith('.json'));
  if (!file) die('用法：pd.mjs findings-check [root] --file <findings.json> [--rejected <rejected.json>]');
  const abs = path.isAbsolute(file) ? file : path.join(ws.root, file);
  if (!fs.existsSync(abs)) die(`找不到 ${file}`);
  let input; try { input = JSON.parse(readText(abs)); } catch (e) { die(`${file} 不是合法 JSON：${e.message}`); }
  const rf = args.rejected || ws.config.paths?.findings_rejected || 'docs/evidence/findings-rejected.json';
  const rabs = path.isAbsolute(rf) ? rf : path.join(ws.root, rf);
  const rejected = fs.existsSync(rabs) ? (JSON.parse(readText(rabs)).rejected || []) : [];
  console.log(toMarkdown(checkFindings(input, rejected)));
}
