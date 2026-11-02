// PDS-642：简报 ≤2 KB，P1 永不截断
export default async function ({ ok, run, fresh, edit }) {
  let r = run(fresh(), 'brief', '.');
  ok('642：样例简报含进度与就绪卡', r.status === 0 && /进度 \d+\/\d+/.test(r.stdout) && /就绪 T001-02/.test(r.stdout), r.stdout + r.stderr);
  const d = fresh();
  edit(d, 'docs/plan/task-index.json', (j) => { for (let i = 0; i < 60; i++) j.tasks.push({ id: `T7-${String(i).padStart(2, '0')}`, title: '一张标题很长很长很长很长很长很长的卡'.repeat(2), status: 'TODO', role: 'executor', depends_on: [], requirements: ['REQ-1'], acceptance: [{ id: 'A1', desc: 'x', check: { type: 'manual', evidence: 'y' } }] }); });
  r = run(d, 'brief', '.');
  ok('642：60 卡 fixture 简报 ≤2 KB', Buffer.byteLength(r.stdout) <= 2048, String(Buffer.byteLength(r.stdout)));
  ok('642：就绪卡最多列 5 张', (r.stdout.match(/^就绪 T/gm) || []).length <= 5, r.stdout);
  const d2 = fresh();
  edit(d2, 'docs/plan/task-index.json', (j) => { for (let i = 0; i < 40; i++) j.tasks.push({ id: `B-${i}`, title: 'b', status: 'BLOCKED', blocked_reason: '缺少预发环境与数据库连接串'.repeat(2), role: 'executor', depends_on: [], requirements: ['REQ-1'], acceptance: [{ id: 'A1', desc: 'x', check: { type: 'manual', evidence: 'y' } }] }); });
  r = run(d2, 'brief', '.');
  ok('642：P1（阻塞）超预算也全部保留', (r.stdout.match(/^! 阻塞 B-/gm) || []).length === 40, String((r.stdout.match(/^! 阻塞 B-/gm) || []).length));
}
