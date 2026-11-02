// PDS-651：私钥/记忆目录泄露检测与 secret_allowlist
export default async function ({ ok, run, fresh, edit, git, fs, path }) {
  const G = (d, ...a) => git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a);
  const add = (d, rel, txt) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), txt); G(d, 'add', '-f', rel); G(d, 'commit', '-qm', rel); };
  let d = fresh();
  add(d, 'deploy/server.pem', '-----BEGIN PRIVATE KEY-----\nabc\n');
  let r = run(d, 'health', '.');
  ok('651：跟踪 .pem → 错误', r.status === 1 && /deploy\/server\.pem/.test(r.stdout), r.stdout);
  edit(d, '.product-development/config.json', (j) => { j.secret_allowlist = [{ path: 'deploy/server.pem', reason: '测试用自签证书，无生产用途' }]; });
  r = run(d, 'health', '.');
  ok('651：整文件白名单（带理由）→ 降为提醒', r.status === 0 && /在 secret_allowlist 中/.test(r.stdout), r.stdout);
  d = fresh();
  const pat = 'ghp_' + 'A'.repeat(36);
  add(d, '.workbuddy-ai/memory/2026-10-30.md', `第 69 行提到 ${pat}\n`);
  r = run(d, 'health', '.');
  const fp = (r.stdout.match(/指纹 ([0-9a-f]{12})/) || [])[1];
  ok('651：助手记忆目录含 PAT → 错误并给出指纹（不回显秘密）', r.status === 1 && fp && !r.stdout.includes(pat), r.stdout);
  edit(d, '.product-development/config.json', (j) => { j.secret_allowlist = [{ path: '.workbuddy-ai/memory/2026-10-30.md', fingerprint: fp, reason: 'D-EXEC-019 误报：示例串' }]; });
  r = run(d, 'health', '.');
  ok('651：按指纹白名单 → 通过', r.status === 0, r.stdout);
  edit(d, '.product-development/config.json', (j) => { j.secret_allowlist = [{ path: 'x' }]; });
  r = run(d, 'health', '.');
  ok('651：白名单缺理由 → 错误', r.status === 1 && /缺 path 或 reason/.test(r.stdout), r.stdout);
}
