// PDS-632：findings-check
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const w = (rel, obj) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), JSON.stringify(obj)); };
  const good = { id: 'F1', severity: 'P1', file: 'src/price.js', line: 3, claim: '金额用浮点相加', evidence: 'toCents(0.1+0.2) 返回 30.000000000000004' };
  w('f.json', { findings: [good, { id: 'F2', severity: 'P9', file: 'a', claim: 'b', evidence: 'c' }, { id: 'F3', severity: 'P2', file: 'a', claim: '没有证据' }, { id: 'F4', severity: 'P0', file: 'src/cart.js', claim: '空购物车崩溃', evidence: 'npm test 第 2 例' }] });
  let r = run(d, 'findings-check', '.', '--file', 'f.json');
  ok('632：合法发现保留并按级别排序（P0 在前）', r.status === 0 && r.stdout.indexOf('| P0 |') < r.stdout.indexOf('| P1 |') && /保留 2/.test(r.stdout), r.stdout + r.stderr);
  ok('632：非法级别与缺证据被丢弃并计数', /丢弃（结构不合法）2/.test(r.stdout) && /丢弃 F2：severity/.test(r.stdout) && /丢弃 F3：缺 evidence/.test(r.stdout), r.stdout);
  const { fingerprintOf } = await import('../cmd/findings-check.mjs');
  w('docs/evidence/findings-rejected.json', { rejected: [{ fingerprint: fingerprintOf({ file: 'src/price.js', claim: '  金额用浮点相加 ' }), reason: '已用整数分' }] });
  r = run(d, 'findings-check', '.', '--file', 'f.json');
  ok('632：已驳回指纹被抑制（空白差异不影响指纹）', /抑制（已驳回）1/.test(r.stdout) && !/金额用浮点相加/.test(r.stdout), r.stdout);
  fs.writeFileSync(path.join(d, 'bad.json'), '{oops');
  r = run(d, 'findings-check', '.', '--file', 'bad.json');
  ok('632：非法 JSON 退出码 2', r.status === 2 && /不是合法 JSON/.test(r.stderr), r.stderr);
}
