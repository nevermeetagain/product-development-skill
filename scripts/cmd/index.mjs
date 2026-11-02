// PDS-643：文档索引。列出 docs/ 与 references/ 下的 Markdown：路径、字节数、首个标题
import fs from 'node:fs';
import path from 'node:path';
import { readText, toPosix } from '../lib.mjs';
import { headings } from './outline.mjs';

export function run({ ws }) {
  const rows = [];
  const walk = (dir) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['node_modules', '.git', 'runs'].includes(e.name)) walk(p); } else if (e.name.endsWith('.md')) rows.push(p); } };
  for (const d of ['docs', 'references']) walk(path.join(ws.root, d));
  for (const p of rows.sort()) { const t = readText(p); console.log(`${toPosix(path.relative(ws.root, p))}\t${Buffer.byteLength(t)}\t${headings(t)[0]?.title || ''}${Buffer.byteLength(t) >= 32768 ? '\t（大文件：用 outline）' : ''}`); }
  console.log(`共 ${rows.length} 个文档`);
}
