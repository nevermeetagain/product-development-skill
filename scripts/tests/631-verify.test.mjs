// PDS-631：完成三态（DONE / NEEDS_VALIDATION / VERIFIED）、不自证、退出码
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const rec = (...a) => run(d, 'record', '.', '--task', 'T001-02', ...a);
  const idx = () => JSON.parse(fs.readFileSync(path.join(d, 'docs/plan/task-index.json'), 'utf8')).tasks.find((t) => t.id === 'T001-02');
  rec('--event', 'STARTED', '--by', 'hark');
  let r = rec('--event', 'TEST_RUN', '--by', 'hark', '--cmd', 'node test.js', '--paths', 'src/price.js', '--result', 'PASS', '--exit-code', '1');
  ok('631：退出码 1 不能登记 PASS', r.status !== 0 && /退出码 1 不能登记 PASS/.test(r.stderr), r.stderr);
  r = rec('--event', 'TEST_RUN', '--by', 'hark', '--cmd', 'node test.js', '--paths', 'src/price.js', '--result', 'PASS', '--exit-code', '0', '--duration-ms', '1200');
  const led = JSON.parse(fs.readFileSync(path.join(d, 'docs/evidence/test-ledger.json'), 'utf8')).entries.at(-1);
  ok('631：TEST_RUN 记录 exit_code 与 duration_ms', r.status === 0 && led.exit_code === 0 && led.duration_ms === 1200, JSON.stringify(led));
  r = rec('--event', 'VERIFIED', '--by', 'hark');
  ok('631：执行者自己标 VERIFIED 被拒', r.status !== 0 && /不能自己标 VERIFIED/.test(r.stderr), r.stderr);
  r = rec('--event', 'VERIFIED', '--by', 'tester1');
  ok('631：只有执行者自己的 PASS 时，他人也不能标 VERIFIED', r.status !== 0 && /非执行者/.test(r.stderr), r.stderr);
  r = rec('--event', 'NEEDS_VALIDATION', '--by', 'hark');
  ok('631：NEEDS_VALIDATION 缺 --missing 被拒', r.status !== 0 && /--missing/.test(r.stderr), r.stderr);
  r = rec('--event', 'NEEDS_VALIDATION', '--by', 'hark', '--missing', '预发环境与 SMTP', '--evidence', 'logs/local.txt', '--where', 'local');
  ok('631：NEEDS_VALIDATION 写入，状态非完成且记录缺失条件与证据位置', r.status === 0 && idx().status === 'NEEDS_VALIDATION' && idx().execution.missing_validation === '预发环境与 SMTP' && idx().execution.evidence_where['logs/local.txt'] === 'local', JSON.stringify(idx()));
  r = run(d, 'health', '.');
  ok('631：health 接受 NEEDS_VALIDATION 状态', !/未知状态|NEEDS_VALIDATION.*不合法/.test(r.stdout + r.stderr), r.stdout);
}
