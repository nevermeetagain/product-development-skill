// PDS-654：下游计数一次建图；sync 推送后不重复 fetch
export default async function ({ ok, run, fresh, edit, git, fs, path, os, pd, spawnSync }) {
  const d = fresh();
  // 600 张：20 张根卡，每张根下挂 29 张链式卡；根 i 的下游 = 29
  edit(d, 'docs/plan/task-index.json', (j) => {
    j.tasks = j.tasks.filter((t) => t.status !== 'TODO' || !t.depends_on?.length);
    for (let r = 0; r < 20; r++) {
      const root = `R${String(r).padStart(2, '0')}`;
      j.tasks.push({ id: root, title: root, status: 'TODO', role: 'executor', priority: 1, depends_on: [], requirements: ['REQ-1'], acceptance: [{ id: 'A1', desc: 'x', check: { type: 'manual', evidence: 'y' } }] });
      let prev = root;
      for (let k = 0; k < (r === 7 ? 40 : 29); k++) { const id = `${root}-${String(k).padStart(2, '0')}`; j.tasks.push({ id, title: id, status: 'TODO', role: 'executor', depends_on: [prev], requirements: ['REQ-1'], acceptance: [{ id: 'A1', desc: 'x', check: { type: 'manual', evidence: 'y' } }] }); prev = id; }
    }
  });
  const t0 = Date.now();
  const r = run(d, 'next', '.');
  const ms = Date.now() - t0;
  ok('654：600+ 卡 next 选中下游最多的根（R07，下游 40）', r.status === 0 && /R07/.test(r.stdout.split('\n').slice(0, 3).join('\n')), r.stdout.slice(0, 300));
  ok(`654：600+ 卡 next 耗时 ${ms} ms（< 5000）`, ms < 5000, String(ms));
  // sync：推送一次只 fetch 一次
  const G = (cwd, ...a) => git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-bare-')); git(bare, 'init', '-q', '--bare', '-b', 'main');
  const d2 = fresh();
  edit(d2, '.product-development/config.json', (j) => { j.git = { ...(j.git || {}), push_main: true }; }); G(d2, 'commit', '-qam', 'cfg');
  git(d2, 'remote', 'add', 'origin', bare); git(d2, 'push', '-q', '-u', 'origin', 'main');
  fs.writeFileSync(path.join(d2, 'n.txt'), 'n'); G(d2, 'add', '-A'); G(d2, 'commit', '-qm', 'n');
  const s = spawnSync(process.execPath, [pd, 'sync', '.', '--push'], { cwd: d2, encoding: 'utf8', env: { ...process.env, PD_DEBUG: '1' } });
  ok('654：sync --push 只 fetch 1 次', s.status === 0 && /PD_DEBUG fetch 次数 1/.test(s.stdout), s.stdout + s.stderr);
}
