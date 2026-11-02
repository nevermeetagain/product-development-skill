// PDS-643：index / outline / show
export default async function ({ ok, run, fresh, fs, path }) {
  const d = fresh();
  let r = run(d, 'index', '.');
  ok('643：index 列出 docs 下文档与首标题', r.status === 0 && /docs\/plan\/master-plan\.md\t\d+\t/.test(r.stdout) && /共 \d+ 个文档/.test(r.stdout), r.stdout + r.stderr);
  r = run(d, 'outline', '.', '--file', 'docs/plan/master-plan.md');
  ok('643：小文件不出大纲，提示直接读', /<32 KB/.test(r.stdout), r.stdout);
  const big = ['# 总纲', '```', '# 代码里的井号不算标题', '```', '## 第一节', 'x'.repeat(20000), '## 第二节', '只要这一段', '### 第二节子项', '子内容', '## 第三节', 'y'.repeat(20000)].join('\n');
  fs.writeFileSync(path.join(d, 'big.md'), big);
  r = run(d, 'outline', '.', '--file', 'big.md');
  ok('643：≥32 KB 出大纲（带行号，忽略代码块内井号）', /L5 第一节/.test(r.stdout) && !/代码里的井号/.test(r.stdout), r.stdout);
  r = run(d, 'outline', '.', '--file', 'big.md', '--section', '第二节');
  ok('643：--section 只输出该章（含子章，不含下一章）', /只要这一段/.test(r.stdout) && /子内容/.test(r.stdout) && !/第三节/.test(r.stdout) && Buffer.byteLength(r.stdout) < 200, r.stdout.slice(0, 300));
}
