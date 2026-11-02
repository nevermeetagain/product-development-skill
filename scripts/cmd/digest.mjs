// PDS-641：测试/构建日志摘要（≤1 KB）。支持 pd self-test、node:test/TAP、jest/vitest、pytest、tsc 五种格式
import fs from 'node:fs';
import path from 'node:path';
import { die, readText } from '../lib.mjs';

const cut = (s, n = 120) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const num = (re, txt) => { const m = txt.match(re); return m ? Number(m[1]) : null; };

export function digestText(txt) {
  const L = txt.split(/\r?\n/);
  const grab = (re) => L.filter((l) => re.test(l)).map((l) => cut(l.trim()));
  let f;
  if (/结果：\d+ 通过，\d+ 失败/.test(txt)) f = { fmt: 'pd-self-test', pass: num(/结果：(\d+) 通过/, txt), fail: num(/通过，(\d+) 失败/, txt), fails: grab(/^\s*✗/) };
  else if (/^# pass \d+/m.test(txt)) f = { fmt: 'tap', pass: num(/^# pass (\d+)/m, txt), fail: num(/^# fail (\d+)/m, txt), fails: grab(/^\s*not ok \d+/) };
  else if (/^\s*Tests:?\s+.*\b(passed|failed)\b/m.test(txt)) {
    const line = L.find((l) => /^\s*Tests:?\s+/.test(l)) || '';
    f = { fmt: 'jest/vitest', pass: num(/(\d+) passed/, line) ?? 0, fail: num(/(\d+) failed/, line) ?? 0, fails: grab(/^\s*(●|FAIL\s|×|✕)/) };
  } else if (/=+ .*\b(passed|failed)\b.* in [\d.]+s/.test(txt)) {
    const line = L.find((l) => /=+ .*\b(passed|failed)\b.* in [\d.]+s/.test(l));
    f = { fmt: 'pytest', pass: num(/(\d+) passed/, line) ?? 0, fail: (num(/(\d+) failed/, line) ?? 0) + (num(/(\d+) errors?/, line) ?? 0), fails: grab(/^(FAILED|ERROR) /) };
  } else if (/error TS\d+:/.test(txt)) {
    const errs = grab(/error TS\d+:/);
    f = { fmt: 'tsc', pass: null, fail: errs.length, fails: errs };
  } else return { fmt: 'unknown', text: `未识别格式；末 5 行：\n${L.filter((l) => l.trim()).slice(-5).map((l) => cut(l)).join('\n')}`.slice(0, 1024) };
  const head = `格式 ${f.fmt}：${f.pass !== null ? `通过 ${f.pass}，` : ''}失败 ${f.fail}`;
  const lines = [head, ...f.fails.slice(0, 5)];
  if (f.fails.length > 5) lines.push(`…另有 ${f.fails.length - 5} 条失败（看原日志）`);
  let text = lines.join('\n');
  if (Buffer.byteLength(text) > 1024) { while (Buffer.byteLength(text) > 990) text = text.slice(0, -20); text += '\n…（已截断到 1 KB）'; }
  return { ...f, text };
}

export function run({ ws, args }) {
  if (!args.file) die('用法：pd.mjs digest [root] --file <日志文件>');
  const abs = path.isAbsolute(args.file) ? args.file : path.join(ws.root, args.file);
  if (!fs.existsSync(abs)) die(`找不到 ${args.file}`);
  console.log(digestText(readText(abs)).text);
}
