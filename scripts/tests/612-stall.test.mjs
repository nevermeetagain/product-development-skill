// PDS-612：停滞检测（复现 BotHot V0.35：owner=hark 5 张就绪卡 0 事件）
export default async function ({ ok, fresh, edit, git, fs, path, pd, spawnSync }) {
  const T0 = '2026-11-02T08:00:00Z';
  const at = (min) => new Date(Date.parse(T0) + min * 60000).toISOString();
  const runAt = (d, min, ...a) => spawnSync(process.execPath, [pd, ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, PD_NOW: at(min) } });
  const d = fresh();
  edit(d, 'docs/plan/task-index.json', (j) => {
    for (let i = 1; i <= 5; i++) j.tasks.push({ id: `T900-0${i}`, title: `hark 卡 ${i}`, status: 'TODO', role: 'executor', owner: 'hark', phase: 'P9', ready_since: T0, depends_on: [], requirements: ['REQ-1'], acceptance: [{ id: 'A1', desc: 'x', check: { type: 'manual', evidence: 'y' } }] });
  });
  git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'add hark cards');
  let r = runAt(d, 11, 'status', '.');
  const first = r.stdout.split('\n')[0];
  ok('612：+11 分钟 → 首行报 owner=hark 5 张就绪无人认领', /UNCLAIMED_STALL：owner=hark 有 5 张/.test(first), r.stdout);
  r = runAt(d, 9, 'status', '.');
  ok('612：+9 分钟（未超阈值 10）不报', !/停滞/.test(r.stdout), r.stdout);
  spawnSync(process.execPath, [pd, 'record', '.', '--task', 'T900-01', '--event', 'STARTED', '--by', 'hark'], { cwd: d, encoding: 'utf8' });
  const logf = path.join(d, 'docs/plan/runs/T900-01.jsonl');
  fs.writeFileSync(logf, fs.readFileSync(logf, 'utf8').replace(/"at":"[^"]+"/, `"at":"${at(0)}"`));
  r = runAt(d, 30, 'status', '.');
  ok('612：IN_PROGRESS 30 分钟无事件 → SILENT_STALL', /SILENT_STALL：owner=hark 有 1 张/.test(r.stdout) && /UNCLAIMED_STALL：owner=hark 有 4 张/.test(r.stdout), r.stdout);
  r = runAt(d, 30, 'replan-check', '.');
  ok('612：replan-check 第 1 项为停滞', /^1\. \[停滞\]/m.test(r.stdout), r.stdout);
  r = runAt(d, 30, 'health', '.');
  ok('612：health 只提醒不报错（退出码不变）', r.status === 0 && /提醒：停滞/.test(r.stdout), r.stdout);
}
