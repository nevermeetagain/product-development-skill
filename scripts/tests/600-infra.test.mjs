// PDS-600 / PDS-602：过滤运行、模块化命令分发、提示词路由标记
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  const r = run(d, 'prompt', '.', '--task', 'T001-02');
  const head = r.stdout.split('\n').slice(0, 4).join('\n');
  ok('602：prompt 前 4 行含“已路由，勿再路由”', r.status === 0 && /已路由，勿再路由/.test(head), r.stdout.slice(0, 400));
  const x = run(d, 'no-such-cmd', '.');
  ok('600：未知命令列出可用命令并退出 2', x.status === 2 && /health\|next/.test(x.stderr), x.stderr);
}
