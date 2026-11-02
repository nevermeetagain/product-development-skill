// PDS-614：sync --push 在远程领先时不 rebase（本地提交号不变）；冲突时中止合并并失败
export default async function ({ ok, run, fresh, edit, git, fs, path, os }) {
  const G = (cwd, ...a) => git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a);
  const setup = () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-bare-'));
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    const d = fresh();
    edit(d, '.product-development/config.json', (j) => { j.git = { ...(j.git || {}), push_main: true }; });
    G(d, 'commit', '-qam', 'push_main');
    git(d, 'remote', 'add', 'origin', bare);
    git(d, 'push', '-q', '-u', 'origin', 'main');
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-other-'));
    git(other, 'clone', '-q', bare, '.');
    return { bare, d, other };
  };
  {
    const { d, other } = setup();
    fs.writeFileSync(path.join(other, 'remote.txt'), 'r\n'); G(other, 'add', '-A'); G(other, 'commit', '-qm', 'remote ahead'); git(other, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(d, 'local.txt'), 'l\n'); G(d, 'add', '-A'); G(d, 'commit', '-qm', 'local');
    const local = git(d, 'rev-parse', 'HEAD');
    const r = run(d, 'sync', '.', '--push');
    let anc = true; try { git(d, 'merge-base', '--is-ancestor', local, 'HEAD'); } catch { anc = false; }
    const remoteHead = git(d, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
    ok('614：远程领先 → 合并后推送，本地提交号保留（未 rebase）', r.status === 0 && anc && remoteHead === git(d, 'rev-parse', 'HEAD'), r.stdout + r.stderr);
  }
  {
    const { d, other } = setup();
    fs.appendFileSync(path.join(other, 'src/price.js'), '// remote\n'); G(other, 'commit', '-qam', 'remote edit'); git(other, 'push', '-q', 'origin', 'main');
    fs.appendFileSync(path.join(d, 'src/price.js'), '// local\n'); G(d, 'commit', '-qam', 'local edit');
    const r = run(d, 'sync', '.', '--push');
    const merging = fs.existsSync(path.join(d, '.git', 'MERGE_HEAD'));
    ok('614：冲突 → 中止合并、退出码 3、无残留 MERGE_HEAD', r.status === 3 && /合并有冲突/.test(r.stdout) && !merging, r.stdout + r.stderr);
  }
}
