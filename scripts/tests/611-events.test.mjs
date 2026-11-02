// PDS-611：新事件 CLAIM/HEARTBEAT/CHECKPOINT/RULING/REASSIGN 的写入、必填校验、秘密拦截
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const idx = () => JSON.parse(fs.readFileSync(path.join(d, 'docs/plan/task-index.json'), 'utf8')).tasks.find((t) => t.id === 'T001-02');
  const log = () => fs.readFileSync(path.join(d, 'docs/plan/runs/T001-02.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  let r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'CLAIM', '--by', 'hark');
  ok('611：CLAIM 写入并记录 owner', r.status === 0 && idx().execution.owner === 'hark' && idx().status === 'TODO', r.stdout + r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'CLAIM');
  ok('611：CLAIM 无 --by 被拒', r.status !== 0 && /CLAIM 必须带 --by/.test(r.stderr), r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'HEARTBEAT', '--by', 'hark');
  ok('611：HEARTBEAT 写入', r.status === 0 && log().at(-1).event === 'HEARTBEAT', r.stdout + r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'CHECKPOINT', '--learned', 'toCents 需四舍五入');
  ok('611：CHECKPOINT 缺 --next-steps 被拒', r.status !== 0 && /--next-steps/.test(r.stderr), r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'CHECKPOINT', '--learned', 'toCents 需四舍五入', '--next-steps', '补边界用例');
  const last = log().at(-1);
  ok('611：CHECKPOINT 合法写入（learned/next_steps 落盘）', r.status === 0 && last.learned && last.next_steps === '补边界用例', JSON.stringify(last));
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'RULING', '--decision', '用 Math.round', '--reason', '与后端一致');
  ok('611：RULING 缺 --cost 被拒', r.status !== 0 && /--cost/.test(r.stderr), r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'RULING', '--decision', '用 Math.round', '--reason', '与后端一致', '--cost', '若错需改 3 处');
  ok('611：RULING 合法写入', r.status === 0 && log().at(-1).cost === '若错需改 3 处', r.stdout + r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'RULING', '--decision', 'x', '--reason', 'ghp_abcdefghijklmnopqrstuvwxyz0123', '--cost', 'y');
  ok('611：RULING 内含 PAT 被拒', r.status !== 0 && /秘密/.test(r.stderr), r.stderr);
}
