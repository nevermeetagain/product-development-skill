// PDS-653：--not-checked / --risks / deferral 必须带 --trigger
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const log = () => fs.readFileSync(path.join(d, 'docs/plan/runs/T001-02.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  let r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'NOTE', '--not-checked', 'Windows 未测', '--risks', '大文件性能未知');
  ok('653：NOTE 记录 not_checked 与 risks', r.status === 0 && log().at(-1).not_checked === 'Windows 未测' && log().at(-1).risks === '大文件性能未知', JSON.stringify(log().at(-1)));
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'NOTE', '--type', 'deferral', '--note', '邮件推迟');
  ok('653：deferral 缺 --trigger 被拒', r.status !== 0 && /--trigger/.test(r.stderr), r.stderr);
  r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'NOTE', '--type', 'deferral', '--trigger', '用户提供 SMTP 后', '--note', '邮件推迟');
  ok('653：deferral 带 --trigger 写入', r.status === 0 && log().at(-1).trigger === '用户提供 SMTP 后', JSON.stringify(log().at(-1)));
}
