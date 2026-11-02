// PDS-643：大文档按需读取。outline 只对 ≥32 KB 的文件列标题+行号；show 只输出一个章节
import fs from 'node:fs';
import path from 'node:path';
import { die, readText } from '../lib.mjs';

export const BIG = 32 * 1024;
export function headings(txt) {
  const out = []; let fence = false;
  txt.split(/\r?\n/).forEach((l, i) => { if (/^```/.test(l)) fence = !fence; const m = !fence && l.match(/^(#{1,6})\s+(.+)/); if (m) out.push({ line: i + 1, level: m[1].length, title: m[2].trim() }); });
  return out;
}
export function section(txt, title) {
  const L = txt.split(/\r?\n/); const hs = headings(txt);
  const i = hs.findIndex((h) => h.title === title || h.title.includes(title));
  if (i < 0) return null;
  const h = hs[i]; const next = hs.slice(i + 1).find((x) => x.level <= h.level);
  return L.slice(h.line - 1, next ? next.line - 1 : L.length).join('\n');
}
export function run({ ws, args }) {
  if (!args.file) die('用法：pd.mjs outline [root] --file <md> [--section "标题"]');
  const abs = path.isAbsolute(args.file) ? args.file : path.join(ws.root, args.file);
  if (!fs.existsSync(abs)) die(`找不到 ${args.file}`);
  const txt = readText(abs); const size = Buffer.byteLength(txt);
  if (args.section) { const s = section(txt, String(args.section)); if (s === null) die(`没有章节「${args.section}」`); console.log(s); return; }
  if (size < BIG) { console.log(`${args.file} 只有 ${size} 字节（<32 KB），直接读全文即可`); return; }
  console.log(`${args.file}（${size} 字节）章节：`);
  for (const h of headings(txt)) console.log(`${'  '.repeat(h.level - 1)}L${h.line} ${h.title}`);
  console.log('用 --section "标题" 只读一个章节');
}
