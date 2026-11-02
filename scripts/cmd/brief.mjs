// PDS-642：新会话简报（≤2 KB）。P1（停滞、阻塞/上报、未决决策、待验证）永不截断；P2 就绪卡、P3 进度按预算填充
import { detectStalls, stallLines } from '../stall.mjs';
import { DONE_LIKE } from '../lib.mjs';

export function buildBrief(ws, helpers, budget = 2048) {
  const tasks = (ws.tasks.tasks || []).filter((t) => t.status !== 'SUPERSEDED');
  const ready = helpers.readyTasks();
  const p1 = [];
  for (const l of stallLines(detectStalls(ws, ready))) p1.push(`! ${l}`);
  for (const t of tasks.filter((x) => x.status === 'BLOCKED')) p1.push(`! 阻塞 ${t.id}：${t.blocked_reason || '?'}${t.escalation?.needs ? `（需要：${t.escalation.needs}）` : ''}`);
  for (const t of tasks.filter((x) => x.status === 'NEEDS_VALIDATION')) p1.push(`! 待验证 ${t.id}：缺 ${t.execution?.missing_validation || '?'}`);
  for (const d of (ws.decisions.decisions || []).filter((x) => ['OPEN', 'PROPOSED'].includes(x.status))) p1.push(`! 未决 ${d.id} ${d.title || ''}`);
  const done = tasks.filter((t) => DONE_LIKE.includes(t.status)).length;
  const p3 = [`进度 ${done}/${tasks.length}，就绪 ${ready.length}，进行中 ${tasks.filter((t) => t.status === 'IN_PROGRESS').length}`];
  const p2 = ready.slice(0, 5).map((t) => `就绪 ${t.id} ${t.title || ''}`);
  const out = ['# 简报', ...(p1.length ? p1 : ['（无停滞、阻塞、未决决策）'])];
  let dropped = 0;
  for (const l of [...p3, ...p2]) {
    if (Buffer.byteLength([...out, l].join('\n')) <= budget - 40) out.push(l); else dropped++;
  }
  if (dropped) out.push(`…另有 ${dropped} 行因 2 KB 预算省略（pd.mjs status 看全量）`);
  return out.join('\n');
}

export function run({ ws, helpers }) { console.log(buildBrief(ws, helpers)); }
