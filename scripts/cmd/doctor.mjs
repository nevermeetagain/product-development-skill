// PDS-652：doctor = 体检汇总，按档位给退出码。dev：只看 health 错误；release：任何未收口项都失败
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DONE_LIKE } from '../lib.mjs';
import { detectStalls, readEvents } from '../stall.mjs';
import { specCheck } from './spec-check.mjs';

const PD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pd.mjs');

export function run({ ws, args, helpers }) {
  const profile = String(args.profile || ws.config.profile || 'dev');
  if (!['dev', 'release'].includes(profile)) { console.error('--profile 只能是 dev 或 release'); process.exit(2); }
  const h = spawnSync(process.execPath, [PD, 'health', ws.root], { encoding: 'utf8' });
  const spec = specCheck(ws);
  const tasks = (ws.tasks.tasks || []).filter((t) => t.status !== 'SUPERSEDED');
  const stalls = detectStalls(ws, helpers.readyTasks()).stalls;
  const nv = tasks.filter((t) => t.status === 'NEEDS_VALIDATION').map((t) => t.id);
  const openDec = (ws.decisions.decisions || []).filter((d) => ['OPEN', 'PROPOSED'].includes(d.status)).map((d) => d.id);
  const unfinished = tasks.filter((t) => !DONE_LIKE.includes(t.status)).map((t) => t.id);
  const anon = tasks.filter((t) => readEvents(ws, t.id).some((e) => !e.actor || e.actor === 'unknown')).map((t) => t.id);
  const items = [
    ['health 错误', h.status === 1 ? 1 : 0, true],
    ['spec-check BLOCKING', spec.blocking.length, false],
    ['停滞', stalls.length, false],
    ['待验证 NEEDS_VALIDATION', nv.length, false],
    ['未决决策', openDec.length, false],
    ['未完成卡', unfinished.length, false],
    ['执行日志身份未知（未带 --by / PD_ACTOR）', anon.length, false],
  ];
  console.log(`doctor（档位 ${profile}）`);
  let fail = false;
  for (const [name, n, always] of items) {
    const bad = n > 0 && (always || profile === 'release');
    if (bad) fail = true;
    console.log(`  ${n ? (bad ? '✗' : '!') : '✓'} ${name}：${n}`);
  }
  console.log(fail ? `结论：${profile} 档位未通过` : `结论：${profile} 档位通过${profile === 'dev' ? '（dev 只拦 health 错误；发版前用 --profile release）' : ''}`);
  process.exitCode = fail ? 1 : 0;
}
