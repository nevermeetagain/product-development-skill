// PDS-613：重派。写 REASSIGN 事件，携带前任失败计数与已裁决/排除项；新提示词自动带出
import { readEvents, ownerOf } from '../stall.mjs';
import { taskMap, die } from '../lib.mjs';

export function summarizePredecessor(ws, id) {
  const ev = readEvents(ws, id);
  return {
    fails: ev.filter((e) => ['FAILED', 'BLOCKED', 'PUSH_FAILED'].includes(e.event)).length,
    rulings: ev.filter((e) => e.event === 'RULING').map((e) => `${e.decision}（理由：${e.reason}）`),
    nextSteps: [...ev].reverse().find((e) => e.event === 'CHECKPOINT')?.next_steps,
    reassigns: ev.filter((e) => e.event === 'REASSIGN').map((e) => e.note),
  };
}

export function run({ ws, args, helpers }) {
  if (!args.task || !args.to) die('用法：pd.mjs reassign [root] --task <ID> --to <owner> [--note "原因"]');
  const t = taskMap(ws).get(args.task);
  if (!t) die(`任务不存在：${args.task}`);
  const from = ownerOf(ws, t);
  if (from === args.to) die(`${t.id} 已归 ${args.to}，无需重派`);
  const s = summarizePredecessor(ws, t.id);
  args.event = 'REASSIGN';
  args.note = `${from} → ${args.to}；前任失败/阻塞 ${s.fails} 次；已裁决 ${s.rulings.length} 项${args.note ? '；原因：' + args.note : ''}`;
  t.owner = String(args.to);
  t.execution = { ...(t.execution || {}), owner: String(args.to) };
  helpers.record();
}
