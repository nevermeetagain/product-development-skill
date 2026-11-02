// PDS-613：重派写 REASSIGN、改 owner、提示词携带前任失败计数与裁决
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const rec = (...a) => run(d, 'record', '.', '--task', 'T001-02', ...a);
  rec('--event', 'STARTED', '--by', 'hark');
  rec('--event', 'RULING', '--decision', '金额用整数分', '--reason', '避免浮点', '--cost', '改 2 处');
  rec('--event', 'BLOCKED', '--note', '缺汇率接口');
  rec('--event', 'UNBLOCKED');
  rec('--event', 'FAILED', '--status', 'TODO');
  let r = run(d, 'reassign', '.', '--task', 'T001-02', '--to', 'deepseek', '--note', 'hark 停滞');
  const t = JSON.parse(fs.readFileSync(path.join(d, 'docs/plan/task-index.json'), 'utf8')).tasks.find((x) => x.id === 'T001-02');
  ok('613：reassign 写入并改 owner', r.status === 0 && t.owner === 'deepseek' && /REASSIGN/.test(r.stdout), r.stdout + r.stderr);
  r = run(d, 'prompt', '.', '--task', 'T001-02');
  ok('613：提示词含前任失败 2 次与已裁决项', /前任失败\/阻塞 2 次/.test(r.stdout) && /金额用整数分/.test(r.stdout) && /不得原样重试/.test(r.stdout), r.stdout);
  r = run(d, 'reassign', '.', '--task', 'T001-02', '--to', 'deepseek');
  ok('613：重复重派给同一 owner 被拒', r.status !== 0, r.stdout + r.stderr);
}
