// PDS-621：files 结构；PDS-622：spec-check（复现 BotHot 126/136 共用 spec 文件）
export default async function ({ ok, run, fresh, edit, fs, path }) {
  const card = (id, owner, files, extra = {}) => ({ id, title: `卡 ${id}`, status: 'TODO', role: 'executor', owner, phase: 'P8', depends_on: [], requirements: ['REQ-1'], files, acceptance: [{ id: 'A1', desc: '可判定', check: { type: 'manual', evidence: 'x' } }], ...extra });
  const withCards = (cards) => { const d = fresh(); edit(d, 'docs/plan/task-index.json', (j) => { j.tasks.push(...cards); }); return d; };

  // 621
  let d = withCards([card('X-1', 'hark', { create: ['src/new.js'], modify: ['src/price.js'], test: ['test/new.test.js'], read: ['src/price.js'] })]);
  let r = run(d, 'prompt', '.', '--task', 'X-1');
  ok('621：允许路径 = 新建∪修改∪测试，且分组显示', /允许：src\/new\.js，src\/price\.js，test\/new\.test\.js/.test(r.stdout) && /只读输入：src\/price\.js/.test(r.stdout), r.stdout);
  r = run(d, 'prompt', '.', '--task', 'T001-02');
  ok('621：旧字段 allowed_paths 仍可用', r.status === 0 && /允许：/.test(r.stdout), r.stdout);

  // 622
  r = run(fresh(), 'spec-check', '.');
  ok('622：样例工作区干净 → 退出码 0', r.status === 0 && /BLOCKING 0，提醒 0/.test(r.stdout), r.stdout);
  d = withCards([
    card('B-136', 'helperB', { create: ['apps/web/test/error-shell.spec.tsx'], modify: ['apps/web/src/error-shell.tsx'] }),
    card('B-126', 'hark', { modify: ['apps/web/src/plan.tsx'], test: ['apps/web/test/error-shell.spec.tsx'] }),
  ]);
  r = run(d, 'spec-check', '.');
  ok('622：BotHot 126/136 形态 → 跨 owner 共用测试文件 BLOCKING，退出码 3', r.status === 3 && /① B-126：测试文件 apps\/web\/test\/error-shell\.spec\.tsx 归 B-136/.test(r.stdout) && /② B-136（helperB）与 B-126（hark）/.test(r.stdout), r.stdout);
  d = withCards([card('S-1', 'hark', { modify: ['src/a.js'] }), card('S-2', 'hark', { modify: ['src/'] })]);
  r = run(d, 'spec-check', '.');
  ok('622：同 owner / 未分配 owner 重叠（含目录前缀）只提醒，退出码 1', r.status === 1 && /须串行/.test(r.stdout) && /未分配 owner/.test(r.stdout), r.stdout);
  d = withCards([card('R-1', 'hark', { modify: ['src/a.js'], read: ['src/not-exist.js'] })]);
  r = run(d, 'spec-check', '.');
  ok('622：只读输入不存在且无前置产出 → BLOCKING', r.status === 3 && /③ R-1/.test(r.stdout), r.stdout);
  d = withCards([card('D-1', 'hark', { modify: ['src/a.js'] }, { decisions: ['DEC-9999'] })]);
  r = run(d, 'spec-check', '.');
  ok('622：引用不存在的决策 → BLOCKING', r.status === 3 && /④ D-1：引用的决策 DEC-9999/.test(r.stdout), r.stdout);
  d = withCards([card('M-1', 'a', { create: ['db/migrations/0007_a.sql'] }), card('M-2', 'b', { create: ['db/migrations/0007_b.sql'] })]);
  r = run(d, 'spec-check', '.');
  ok('622：迁移号重复 → BLOCKING', r.status === 3 && /⑤ 迁移号 0007/.test(r.stdout), r.stdout);
  d = withCards([card('P-1', 'hark', { modify: ['src/a.js'] }, { objective: '金额计算，边界待定' })]);
  r = run(d, 'spec-check', '.');
  ok('622：占位语只提醒，退出码 1', r.status === 1 && /⑥ P-1：含占位语「待定」/.test(r.stdout), r.stdout);
}
