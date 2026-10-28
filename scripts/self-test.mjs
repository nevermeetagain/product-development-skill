#!/usr/bin/env node
// 自测：在临时副本上验证 pd.mjs 的各项行为，不修改随包样例
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toPosix, pathList, fingerprint, writeJson, readJson, expandPath, globFirst, which, detectCandidates, existsExactCase, detectEol } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pd = path.join(here, 'pd.mjs');
const sample = path.join(here, '..', 'examples', 'minimal-workspace');
let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n${detail}`); } };
const run = (cwd, ...a) => spawnSync(process.execPath, [pd, ...a], { cwd, encoding: 'utf8' });
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-selftest-'));
  fs.cpSync(sample, dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  const sha = git(dir, 'rev-parse', 'HEAD');
  const idx = path.join(dir, 'docs/plan/task-index.json');
  const j = JSON.parse(fs.readFileSync(idx, 'utf8'));
  j.tasks[0].execution.commits = [sha];
  fs.writeFileSync(idx, JSON.stringify(j, null, 2));
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'record sha');
  return dir;
}
const edit = (dir, rel, fn) => { const f = path.join(dir, rel); const j = JSON.parse(fs.readFileSync(f, 'utf8')); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2)); };

console.log('1. 体检');
let d = fresh();
let r = run(d, 'health', '.');
ok('样例体检通过', r.status === 0, r.stdout + r.stderr);

console.log('2. 选择下一任务');
r = run(d, 'next', '.');
ok('选中 T001-02（依赖已满足）', /就绪任务 1 张：T001-02/.test(r.stdout), r.stdout);
ok('不选 T001-03（依赖未完成且决策 OPEN）', !/T001-03\b.*-----/.test(r.stdout) && !/就绪任务.*T001-03/.test(r.stdout), r.stdout);
ok('提示词含定向测试与禁止全量回归', /定向测试/.test(r.stdout) && /不跑全量回归/.test(r.stdout), r.stdout);
ok('提示词带决策 DEC-001 与执行前细化', /DEC-001/.test(r.stdout) && /执行前细化/.test(r.stdout), r.stdout);
r = run(d, 'next', '.', '--role', 'tester');
ok('测试助手此时无就绪任务（阶段体检等待前置）', r.status === 3, r.stdout);

console.log('3. 留痕');
r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'STARTED', '--by', 'deepseek');
ok('STARTED 写入日志', r.status === 0 && fs.existsSync(path.join(d, 'docs/plan/runs/T001-02.jsonl')), r.stdout + r.stderr);
let idx = JSON.parse(fs.readFileSync(path.join(d, 'docs/plan/task-index.json'), 'utf8'));
ok('STARTED 把状态改为 IN_PROGRESS', idx.tasks[1].status === 'IN_PROGRESS');
r = run(d, 'record', '.', '--task', 'T001-02', '--event', 'NOTE', '--note', 'token ghp_abcdefghijklmnopqrstuvwxyz0123');
ok('含 PAT 的事件被拒绝', r.status !== 0 && /秘密/.test(r.stderr), r.stdout + r.stderr);

console.log('4. 测试台账与复用');
r = run(d, 'test-record', '.', '--target', 'T001-01', '--scope', 'task', '--kind', 'targeted', '--result', 'PASS', '--paths', 'src/price.js,test/price.test.js', '--cmd', 'node test/price.test.js');
ok('登记 T001-01 PASS', r.status === 0, r.stdout + r.stderr);
git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'ledger');
r = run(d, 'test-plan', '.');
ok('代码未变 → T001-01 可复用', /可复用.*T001-01/.test(r.stdout), r.stdout);
fs.appendFileSync(path.join(d, 'src/price.js'), '// change\n');
git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'touch price');
r = run(d, 'test-plan', '.');
ok('代码改动 → T001-01 必须重测', /必须重测.*T001-01/.test(r.stdout), r.stdout);
fs.appendFileSync(path.join(d, 'docs/plan/master-plan.md'), '\n无关文档改动\n');
git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'doc');

console.log('5. 体检能抓住的错误');
const cases = [
  ['依赖环', (j) => { j.tasks[0].depends_on = ['T001-02']; }, /依赖环/],
  ['重复 ID', (j) => { j.tasks.push({ ...j.tasks[0] }); }, /ID 重复/],
  ['缺验收', (j) => { j.tasks[1].acceptance = []; }, /缺少验收条件/],
  ['VERIFIED 无台账', (j) => { j.tasks[0].status = 'VERIFIED'; }, /台账没有对应 PASS/],
  ['执行中依赖未决决策', (j) => { j.tasks[2].status = 'IN_PROGRESS'; }, /未决决策 DEC-002/],
  ['DONE 无提交', (j) => { j.tasks[1].status = 'DONE'; }, /没有提交记录/],
  ['依赖不存在', (j) => { j.tasks[1].depends_on = ['T999']; }, /不存在的任务 T999/],
  ['BLOCKED 无原因', (j) => { j.tasks[1].status = 'BLOCKED'; }, /blocked_reason/],
];
for (const [name, mut, re] of cases) {
  const w = fresh();
  edit(w, 'docs/plan/task-index.json', mut);
  const x = run(w, 'health', '.');
  ok(`抓到：${name}`, x.status === 1 && re.test(x.stdout), x.stdout);
}
{
  const w = fresh();
  fs.appendFileSync(path.join(w, 'docs/plan/tasks/T001-02.md'), '\n远程：https://user:github_pat_ABCDEFGHIJKLMNOPQRSTUV123@github.com/x/y.git\n');
  const x = run(w, 'health', '.');
  ok('抓到：任务卡里的 PAT', x.status === 1 && /疑似秘密/.test(x.stdout), x.stdout);
}
{
  const w = fresh();
  edit(w, 'docs/plan/task-index.json', (j) => { j.tasks[1].acceptance[0].check = { type: 'command', cmd: 'grep -q toCents src/cart.js' }; });
  const x = run(w, 'health', '.');
  ok('提醒：grep 冒充测试', /grep 检查源码/.test(x.stdout), x.stdout);
}

console.log('6. 防伪造与就绪拦截');
{
  const w = fresh();
  let x = run(w, 'record', '.', '--task', 'T001-02', '--event', 'COMMITTED', '--commit', '');
  ok('空 --commit 被拒绝', x.status !== 0 && /缺少值/.test(x.stderr), x.stderr);
  x = run(w, 'record', '.', '--task', 'T001-02', '--event', 'COMMITTED', '--commit', 'deadbeef1');
  ok('不存在的提交被拒绝', x.status !== 0 && /不存在/.test(x.stderr), x.stderr);
  x = run(w, 'record', '.', '--task', 'T001-02', '--event', 'DONE');
  ok('无提交标 DONE 被拒绝', x.status !== 0 && /需要真实提交/.test(x.stderr), x.stderr);
  x = run(w, 'record', '.', '--task', 'T001-02', '--event', 'VERIFIED');
  ok('无台账标 VERIFIED 被拒绝', x.status !== 0 && /测试台账/.test(x.stderr), x.stderr);
  x = run(w, 'prompt', '.', '--task', 'T001-03');
  ok('未就绪卡不生成执行提示词（exit 4）', x.status === 4 && /DEC-002/.test(x.stdout) && /T001-02/.test(x.stdout), x.stdout);
  x = run(w, 'record', '.', '--task', 'T001-03', '--event', 'BLOCKED', '--note', '等待 DEC-002 裁决', '--needs', 'DEC-002', '--escalate', 'user');
  const j = JSON.parse(fs.readFileSync(path.join(w, 'docs/plan/task-index.json'), 'utf8'));
  ok('BLOCKED 结构化上报写入索引', x.status === 0 && j.tasks[2].status === 'BLOCKED' && j.tasks[2].escalation?.needs === 'DEC-002', x.stdout + x.stderr);
  const ev = fs.readFileSync(path.join(w, 'docs/plan/runs/T001-03.jsonl'), 'utf8');
  ok('事件时间是 ISO UTC', /"at":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/.test(ev), ev);
  x = run(w, 'test-record', '.', '--target', 'T001-01', '--scope', 'task', '--kind', 'targeted', '--result', 'PASS', '--paths', 'src/price.js');
  ok('PASS 不写命令被拒绝', x.status !== 0 && /--cmd/.test(x.stderr), x.stderr);
}
console.log('7. 复用登记');
{
  const w = fresh();
  run(w, 'test-record', '.', '--target', 'T001-01', '--scope', 'task', '--kind', 'targeted', '--result', 'PASS', '--paths', 'src/price.js,test/price.test.js', '--cmd', 'node test/price.test.js');
  git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'l');
  const led = JSON.parse(fs.readFileSync(path.join(w, 'docs/evidence/test-ledger.json'), 'utf8'));
  let x = run(w, 'test-record', '.', '--target', 'T001', '--scope', 'phase', '--kind', 'phase_review', '--result', 'PASS', '--reused-from', led.entries[0].id);
  ok('指纹未变可登记复用', x.status === 0 && /复用/.test(x.stdout), x.stdout + x.stderr);
  fs.appendFileSync(path.join(w, 'src/price.js'), '//x\n');
  git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'c');
  x = run(w, 'test-record', '.', '--target', 'T001', '--scope', 'phase', '--kind', 'phase_review', '--result', 'PASS', '--reused-from', led.entries[0].id);
  ok('指纹变化拒绝复用', x.status !== 0 && /必须重测/.test(x.stderr), x.stderr);
}
console.log('8. 老项目 markdown 兼容');
{
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-md-'));
  fs.mkdirSync(path.join(w, '.product-development'));
  fs.mkdirSync(path.join(w, 'docs'));
  fs.writeFileSync(path.join(w, 'docs/task-index.md'), [
    '# 任务索引', '', '| 卡 | 名称 | 依赖 | 层级 | 状态 |', '|---|---|---|---|---|',
    '| T140-02 | 夹具 | — | L1 | 已合并 1e7f2b77：说明 |',
    '| T140-05 | 色板 | T140-02 | L1 | 待开工 |',
    '| T140-07 | 文档规则 | T140-02 | 条件:Q-14-04 | 待开工 |',
    '| T140-01 | 收口 | — | L1 | blocked（门 12 未绿） |', '',
  ].join('\n'));
  fs.writeFileSync(path.join(w, 'docs/ledger.md'), '| ID | 结论 | 日期 / 拍板 |\n|---|---|---|\n| D-001 | 主线 main | 用户 |\n| Q-14-04 | 待定 | — |\n');
  fs.writeFileSync(path.join(w, '.product-development/config.json'), JSON.stringify({
    paths: { task_index: 'docs/task-index.md', decision_index: 'docs/ledger.md', test_ledger: 'docs/test-ledger.json' },
    formats: {
      task_index: { type: 'markdown-table', columns: { id: '卡', title: '名称', depends_on: '依赖', status: '状态', condition: '层级' },
        status_map: { '待开工': 'TODO', '进行中': 'IN_PROGRESS', '已合并': 'DONE', 'blocked': 'BLOCKED', '取消': 'SUPERSEDED' },
        status_write: { IN_PROGRESS: '进行中', DONE: '已合并 {commit}', BLOCKED: 'blocked（{reason}）' } },
      decision_index: { type: 'markdown-table', columns: { id: 'ID', title: '结论' }, default_status: 'DECIDED' },
    },
  }));
  git(w, 'init', '-q', '-b', 'main'); git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'); git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i');
  let x = run(w, 'health', '.');
  ok('markdown 索引可体检', /任务 4 张，决策 2 条/.test(x.stdout), x.stdout + x.stderr);
  x = run(w, 'next', '.');
  ok('markdown 索引可选下一张（T140-05）', /就绪任务 2 张：T140-05, T140-07|就绪任务 2 张：T140-07, T140-05/.test(x.stdout), x.stdout);
  x = run(w, 'record', '.', '--task', 'T140-05', '--event', 'STARTED', '--by', 'ds');
  const md = fs.readFileSync(path.join(w, 'docs/task-index.md'), 'utf8');
  ok('只改本卡状态单元格', /\| T140-05 \| 色板 \| T140-02 \| L1 \| 进行中 \|/.test(md) && /已合并 1e7f2b77：说明/.test(md), md);
  x = run(w, 'scan', '.');
  ok('scan 盘点可运行且统计编号前缀', x.status === 0 && /T140-\*/.test(x.stdout), x.stdout + x.stderr);
}

console.log('9. 推送与同步');
{
  const w = fresh();
  let x = run(w, 'sync', '.', '--task', 'T001-01', '--push');
  ok('无远程时 sync 失败并记 PUSH_FAILED', x.status === 3 && /PUSH_FAILED/.test(x.stdout), x.stdout + x.stderr);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-remote-'));
  git(bare, 'init', '-q', '--bare');
  git(w, 'remote', 'add', 'origin', bare);
  git(w, 'checkout', '-q', '-b', 'task/T001-01');
  x = run(w, 'record', '.', '--task', 'T001-01', '--event', 'PUSHED');
  ok('未推送就写 PUSHED 被拒绝', x.status !== 0 && /拒绝写 PUSHED/.test(x.stderr), x.stderr);
  x = run(w, 'sync', '.', '--task', 'T001-01', '--push');
  ok('sync --push 推送成功、核对一致并记 PUSHED', x.status === 0 && /一致/.test(x.stdout) && /PUSHED/.test(x.stdout), x.stdout + x.stderr);
  git(w, 'checkout', '-q', 'main');
  x = run(w, 'sync', '.', '--push');
  ok('push_main=false 时拒绝推 main', x.status === 3 && /push_main/.test(x.stdout), x.stdout);
}
console.log('10. 规划者主动更新');
{
  const w = fresh();
  run(w, 'record', '.', '--task', 'T001-03', '--event', 'BLOCKED', '--note', '等待 DEC-002', '--needs', 'DEC-002', '--escalate', 'planner');
  const x = run(w, 'replan-check', '.');
  ok('replan-check 列出阻塞与未决决策并生成规划者提示词', /待规划者裁决/.test(x.stdout) && /未决决策阻挡任务/.test(x.stdout) && /规划者提示词/.test(x.stdout), x.stdout);
}
console.log('11. 提问前查记录');
{
  const w = fresh();
  const d = JSON.parse(fs.readFileSync(path.join(w, 'docs/decisions/decision-index.json'), 'utf8')).decisions.find((z) => z.status === 'DECIDED');
  const kw = (d.title || d.id).slice(0, 6);
  let x = run(w, 'ask-check', '.', kw);
  ok('已决定的问题返回 exit 5 并禁止再问用户', x.status === 5 && new RegExp(d.id).test(x.stdout), x.stdout + x.stderr);
  x = run(w, 'ask-check', '.', '完全无关的火星话题');
  ok('没记录的问题允许提问', x.status === 0 && /可以提问/.test(x.stdout), x.stdout);
}

console.log('12. 外部 Skill 检查');
{
  const x = run(os.tmpdir(), 'skills', '.');
  ok('skills 列出缺失项并给出官方仓库安装命令', x.status === 0 && /github\.com\/obra\/superpowers/.test(x.stdout) && /IDE\/CLI 自行安装/.test(x.stdout), x.stdout + x.stderr);
}

console.log('13. 依赖未完成不能收尾 / 定向测试进台账可复用');
{
  const w = fresh();
  let x = run(w, 'test-record', '.', '--target', 'T001', '--scope', 'phase', '--kind', 'phase_review', '--result', 'PASS', '--paths', 'src', '--cmd', 'node test/run-all.js');
  x = run(w, 'record', '.', '--task', 'T001-90', '--event', 'VERIFIED');
  ok('前置未完成的体检卡不能标 VERIFIED', x.status !== 0 && /前置任务未完成/.test(x.stderr), x.stderr);
  x = run(w, 'record', '.', '--task', 'T001-01', '--event', 'TEST_RUN', '--cmd', 'node test/price.test.js', '--paths', 'src/price.js,test/price.test.js', '--result', 'PASS');
  ok('TEST_RUN 带命令/路径/结果时写入测试台账', x.status === 0 && /已登记测试台账/.test(x.stdout), x.stdout + x.stderr);
  git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'trace');
  x = run(w, 'test-plan', '.', '--phase', 'T001');
  ok('阶段体检直接复用执行助手的定向测试', /可复用[^\n]*T001-01/.test(x.stdout), x.stdout);
}

console.log('14. v04 评测缺陷回归');
{
  const w = fresh();
  let x = run(w, 'ask-check', '.', '退款 时 券 是否 退回');
  ok('ask-check 单词弱命中不判为已决定', x.status === 0 && !/不得再向用户提问/.test(x.stdout), x.stdout);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-remote-'));
  git(bare, 'init', '-q', '--bare'); git(w, 'remote', 'add', 'origin', bare);
  fs.writeFileSync(path.join(w, 'src/cart.js'), 'export const x = 1;\n');
  git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'); git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'T001-02 cart');
  const sha = git(w, 'rev-parse', 'HEAD');
  run(w, 'record', '.', '--task', 'T001-02', '--event', 'STARTED');
  run(w, 'record', '.', '--task', 'T001-02', '--event', 'COMMITTED', '--commit', sha);
  x = run(w, 'record', '.', '--task', 'T001-02', '--event', 'DONE');
  ok('有远程时未推送不能标 DONE', x.status !== 0 && /还没推送/.test(x.stderr), x.stderr);
  git(w, 'remote', 'set-url', 'origin', '/nonexistent/repo.git');
  edit(w, '.product-development/config.json', (c) => { c.git.push_main = true; });
  x = run(w, 'sync', '.', '--task', 'T001-02', '--push');
  ok('推送失败保留 git 报错原文', x.status === 3 && /失败：.+/.test(x.stdout) && /PUSH_FAILED/.test(x.stdout), x.stdout);
  x = run(w, 'status', '.');
  ok('status 显示推送失败', /未同步 T001-02：推送失败/.test(x.stdout), x.stdout);
}

console.log('16. 防泄露守卫（.env / 数据导出）');
{
  const w = fresh();
  let x = run(w, 'health', '.');
  ok('样例 .gitignore 齐全无防泄露提醒', x.status === 0 && !/防泄露/.test(x.stdout), x.stdout);
  fs.mkdirSync(path.join(w, 'db/migrations'), { recursive: true });
  fs.writeFileSync(path.join(w, 'db/migrations/001_init.sql'), 'create table t(id int);');
  fs.writeFileSync(path.join(w, '.env.example'), 'DB_URL=');
  git(w, 'add', '-A'); git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'mig');
  x = run(w, 'health', '.');
  ok('迁移 .sql 与 .env.example 不误报', x.status === 0 && !/不应提交/.test(x.stdout), x.stdout + x.stderr);
  fs.writeFileSync(path.join(w, 'prod_dump.sql'), 'x'); fs.writeFileSync(path.join(w, '.env.local'), 'K=1');
  git(w, 'add', '-f', 'prod_dump.sql', '.env.local'); git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'leak');
  x = run(w, 'health', '.');
  ok('跟踪 *_dump.sql 报错', x.status === 1 && /不应提交的文件：prod_dump\.sql/.test(x.stdout), x.stdout);
  ok('跟踪 .env.local 报错', /不应提交的文件：\.env\.local/.test(x.stdout), x.stdout);
  fs.writeFileSync(path.join(w, '.gitignore'), 'node_modules/\n');
  x = run(w, 'health', '.');
  ok('.gitignore 缺规则时提醒', /防泄露规则：\.env \*\.dump \*_dump\.sql/.test(x.stdout), x.stdout);
}

console.log('17. 跨平台（Windows / Ubuntu）');
{
  ok('toPosix 把反斜杠与 ./ 归一', toPosix('.\\src\\a.js') === 'src/a.js' && toPosix('src/a.js') === 'src/a.js' && toPosix('a\\\\b') === 'a/b');
  ok('pathList 去空格去重并转 POSIX', JSON.stringify(pathList('src\\a.js, ./src/a.js ,test\\b.js')) === '["src/a.js","test/b.js"]');
  const w = fresh();
  ok('指纹与分隔符无关（\\ 与 / 相同）', fingerprint(w, ['src\\price.js', 'test\\price.test.js']) === fingerprint(w, ['src/price.js', 'test/price.test.js']));
  let x = run(w, 'test-record', '.', '--target', 'T001-01', '--scope', 'task', '--kind', 'targeted', '--result', 'PASS', '--paths', 'src\\price.js,test\\price.test.js', '--cmd', 'npm test', '--evidence', 'docs\\evidence\\x.txt');
  const led = JSON.parse(fs.readFileSync(path.join(w, 'docs/evidence/test-ledger.json'), 'utf8'));
  const e = led.entries.at(-1);
  ok('台账 covers_paths / evidence 存为 POSIX', x.status === 0 && JSON.stringify(e.covers_paths) === '["src/price.js","test/price.test.js"]' && e.evidence === 'docs/evidence/x.txt', JSON.stringify(e) + x.stderr);
  ok('台账写入不残留临时文件', !fs.readdirSync(path.join(w, 'docs/evidence')).some((f) => f.endsWith('.tmp')));
  git(w, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'l');
  x = run(w, 'test-plan', '.');
  ok('反斜杠登记的测试可被复用', /可复用.*T001-01/.test(x.stdout), x.stdout);
  x = run(w, 'test-record', '.', '--target', 'T001-01', '--scope', 'task', '--kind', 'targeted', '--result', 'PASS', '--paths', 'SRC/Price.js', '--cmd', 'node t');
  ok('覆盖路径大小写与 Git 不一致时提醒', /HEAD 中不存在：SRC\/Price\.js/.test(x.stdout), x.stdout);
  ok('existsExactCase 区分大小写', existsExactCase(w, 'src/price.js') && !existsExactCase(w, 'SRC/price.js'));

  // autocrlf：同一内容在 CRLF 工作区（autocrlf=true）与 LF 工作区提交，指纹一致
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-crlf-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-crlf-b-'));
  for (const [dir, crlf, eolv] of [[a, 'true', '\r\n'], [b, 'false', '\n']]) {
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'core.autocrlf', crlf);
    fs.mkdirSync(path.join(dir, 'src')); fs.writeFileSync(path.join(dir, 'src/a.js'), ['export const a = 1;', 'export const b = 2;', ''].join(eolv));
    git(dir, 'add', '-A'); git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i');
  }
  ok('指纹基于 Git 对象，CRLF/autocrlf 不影响', fingerprint(a, ['src/a.js']) === fingerprint(b, ['src/a.js']) && !/missing/.test(fingerprint(a, ['src/a.js'])));

  // JSON：BOM + CRLF 可读，写回保持 CRLF
  const v = fresh();
  for (const rel of ['docs/plan/task-index.json', '.product-development/config.json']) {
    const f = path.join(v, rel); fs.writeFileSync(f, '\uFEFF' + fs.readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  x = run(v, 'health', '.');
  ok('BOM + CRLF 的 JSON 可体检', x.status === 0, x.stdout + x.stderr);
  x = run(v, 'record', '.', '--task', 'T001-02', '--event', 'STARTED');
  const ti = fs.readFileSync(path.join(v, 'docs/plan/task-index.json'), 'utf8');
  ok('JSON 写回保持 CRLF 且可解析', x.status === 0 && detectEol(ti) === '\r\n' && readJson(path.join(v, 'docs/plan/task-index.json')).tasks[1].status === 'IN_PROGRESS', x.stderr);

  // Markdown 表格：CRLF + BOM，只改目标单元格，换行与 BOM 原样保留
  const m = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-mdcrlf-'));
  fs.mkdirSync(path.join(m, '.product-development')); fs.mkdirSync(path.join(m, 'docs'));
  fs.writeFileSync(path.join(m, 'docs/task-index.md'), '\uFEFF' + ['# 任务', '', '| ID | title | depends_on | status |', '|---|---|---|---|', '| T1-01 | 甲 | — | TODO |', '| T1-02 | 乙 | T1-01 | TODO |', ''].join('\r\n'));
  fs.writeFileSync(path.join(m, 'docs/ledger.md'), '| ID | title |\r\n|---|---|\r\n| D-001 | 主线 |\r\n');
  writeJson(path.join(m, '.product-development/config.json'), { paths: { task_index: 'docs\\task-index.md', decision_index: 'docs/ledger.md', test_ledger: 'docs/test-ledger.json' },
    formats: { task_index: { type: 'markdown-table' }, decision_index: { type: 'markdown-table' } } });
  git(m, 'init', '-q', '-b', 'main'); git(m, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'); git(m, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i');
  x = run(m, 'record', '.', '--task', 'T1-01', '--event', 'STARTED');
  const mdTxt = fs.readFileSync(path.join(m, 'docs/task-index.md'), 'utf8');
  ok('CRLF+BOM 的 Markdown 索引回写保留换行与 BOM', x.status === 0 && mdTxt.startsWith('\uFEFF') && !/[^\r]\n/.test(mdTxt) && /\| T1-01 \| 甲 \| — \| IN_PROGRESS \|\r\n/.test(mdTxt) && /\| T1-02 \| 乙 \| T1-01 \| TODO \|\r\n/.test(mdTxt), JSON.stringify(mdTxt) + x.stderr);
  ok('config 中反斜杠路径可用', /T1-01 当前状态 IN_PROGRESS/.test(x.stdout), x.stdout);

  // 中文路径：git core.quotepath=false，防泄露守卫能识别中文目录下的导出文件
  const c = fresh();
  fs.mkdirSync(path.join(c, '数据')); fs.writeFileSync(path.join(c, '数据/prod_dump.sql'), 'x');
  git(c, 'add', '-f', '数据/prod_dump.sql'); git(c, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'cn');
  x = run(c, 'health', '.');
  ok('中文路径下的导出文件被识别（quotepath）', x.status === 1 && /不应提交的文件：数据\/prod_dump\.sql/.test(x.stdout), x.stdout);

  // 检测路径展开：~ / %VAR% / $VAR / ** / PATH 查找 / CLAUDE_CONFIG_DIR
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-home-'));
  ok('~ 展开为 os.homedir()', expandPath('~/.agents/skills') === path.join(os.homedir(), '.agents', 'skills'));
  process.env.PD_SELFTEST_DIR = h;
  ok('%VAR% / $VAR / ${VAR} 展开', expandPath('%PD_SELFTEST_DIR%/x') === path.join(h, 'x') && expandPath('$PD_SELFTEST_DIR/x') === path.join(h, 'x') && expandPath('${PD_SELFTEST_DIR}\\x') === path.join(h, 'x'));
  ok('./ 相对项目根用 path.join 拼接', expandPath('./.agents/skills', h) === path.join(h, '.agents', 'skills'));
  fs.mkdirSync(path.join(h, 'plugins', 'cache', 'm', 'superpowers'), { recursive: true });
  ok('** 通配可检测插件目录', globFirst(path.join(h, 'plugins', '**', 'superpowers')) !== null && globFirst(path.join(h, 'plugins', '**', 'nope')) === null);
  ok('which 按 PATH（Windows 含 PATHEXT）找到 node', which('node') !== null);
  ok('CLAUDE_CONFIG_DIR 作为 ~/.claude 的候选', (() => { process.env.CLAUDE_CONFIG_DIR = h; const r = detectCandidates('~/.claude/plugins/x', '.'); delete process.env.CLAUDE_CONFIG_DIR; return r.includes(path.join(h, 'plugins', 'x')); })());
  fs.mkdirSync(path.join(h, '.agents', 'skills', 'brainstorming'), { recursive: true });
  fs.writeFileSync(path.join(h, '.agents', 'skills', 'brainstorming', 'SKILL.md'), '#');
  fs.mkdirSync(path.join(h, 'cc', 'plugins', 'cache', 'code-review'), { recursive: true });
  x = spawnSync(process.execPath, [pd, 'skills', '.'], { cwd: h, encoding: 'utf8', env: { ...process.env, HOME: h, USERPROFILE: h, CLAUDE_CONFIG_DIR: path.join(h, 'cc') } });
  ok('skills 在 HOME/USERPROFILE 下检测到已装 Skill，CLAUDE_CONFIG_DIR 生效', x.status === 0 && /✓ superpowers\/brainstorming/.test(x.stdout) && /✓ code-review/.test(x.stdout) && /✗ openspec/.test(x.stdout), x.stdout + x.stderr);
  ok('skills 按平台输出安装命令', process.platform === 'win32' ? /Copy-Item/.test(x.stdout) : /cp -r/.test(x.stdout), x.stdout);
}

console.log('15. 状态汇报');
r = run(d, 'status', '.');
ok('大白话汇总可输出', r.status === 0 && /待裁决决策：DEC-002/.test(r.stdout), r.stdout);

console.log('16. /pds 快捷命令（跨工具 commands）');
{
  const root = path.join(here, '..');
  const tStd = path.join(root, 'templates', 'commands', 'pds.md');
  const tCur = path.join(root, 'templates', 'commands', 'cursor', 'pds.md');
  const std = fs.existsSync(tStd) ? fs.readFileSync(tStd, 'utf8') : '';
  const cur = fs.existsSync(tCur) ? fs.readFileSync(tCur, 'utf8') : '';
  ok('pds.md 模板存在（Claude/Codex 版 + Cursor 版）', std !== '' && cur !== '');
  ok('Claude/Codex 版有 frontmatter description/argument-hint 并传 $ARGUMENTS', /^---\n[\s\S]*?description:[\s\S]*?argument-hint:[\s\S]*?\n---\n/.test(std) && std.includes('$ARGUMENTS'), std.slice(0, 300));
  const toks = (std.match(/\$[A-Za-z0-9_]+/g) || []).filter((t) => t !== '$ARGUMENTS');
  ok('不含其他 $占位符（Codex 会把 $大写词 当命名参数、Claude 会替换 $数字）', toks.length === 0, toks.join(','));
  ok('Cursor 版不依赖 $ARGUMENTS（官方未定义参数占位符）', !cur.includes('$'), cur.slice(0, 200));
  ok('两版都指向 product-development 并列出子命令', [std, cur].every((t) => /product-development/.test(t) && ['规划', '执行 <任务ID>', '体检', '状态', '重规划'].every((k) => t.includes(k))));
  const h2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-cmdhome-'));
  const env = { ...process.env, HOME: h2, USERPROFILE: h2 }; delete env.CLAUDE_CONFIG_DIR; delete env.CODEX_HOME;
  const isWin = process.platform === 'win32';
  const inst = (...a) => isWin
    ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'install.ps1'), ...a.map((x) => ({ all: 'All', '--force': '-Force' }[x] || x))], { env, encoding: 'utf8' })
    : spawnSync('bash', [path.join(here, 'install.sh'), ...a], { env, encoding: 'utf8' });
  let ir = inst('all');
  if (ir.error) { console.log(`  - 跳过安装检查：找不到 ${isWin ? 'powershell' : 'bash'}`); } else {
    const dests = { claude: path.join(h2, '.claude', 'commands', 'pds.md'), codex: path.join(h2, '.codex', 'prompts', 'pds.md'), cursor: path.join(h2, '.cursor', 'commands', 'pds.md') };
    const same = (a, b) => fs.existsSync(a) && fs.readFileSync(a).equals(fs.readFileSync(b));
    ok('all：Skill 装到 .claude/skills 与 .agents/skills', ir.status === 0 && fs.existsSync(path.join(h2, '.claude', 'skills', 'product-development', 'SKILL.md')) && fs.existsSync(path.join(h2, '.agents', 'skills', 'product-development', 'SKILL.md')), ir.stdout + ir.stderr);
    ok('all：pds.md 装到 ~/.claude/commands、~/.codex/prompts、~/.cursor/commands（内容与模板一致）', same(dests.claude, tStd) && same(dests.codex, tStd) && same(dests.cursor, tCur), ir.stdout + ir.stderr);
    fs.writeFileSync(dests.codex, 'my own pds\n');
    ir = inst('codex');
    ok('已存在不同的 pds.md 时不加 force 不覆盖', ir.status === 0 && fs.readFileSync(dests.codex, 'utf8') === 'my own pds\n', ir.stdout + ir.stderr);
    ir = inst('codex', '--force');
    const baks = fs.readdirSync(path.dirname(dests.codex)).filter((f) => f.startsWith('pds.md.bak.'));
    ok('加 force 时先备份再覆盖', ir.status === 0 && same(dests.codex, tStd) && baks.length === 1 && fs.readFileSync(path.join(path.dirname(dests.codex), baks[0]), 'utf8') === 'my own pds\n', ir.stdout + ir.stderr + baks.join(','));
  }
}

console.log('Q. 可选质量信号 pd quality（不联网：PD_QUALITY_NO_NPX=1）');
{
  const Q = await import('./quality.mjs');
  ok('CRAP 公式：comp²×(1−cov)³+comp', Q.crap(5, 0) === 30 && Q.crap(5, 1) === 5 && Q.crap(5, 0.6) === 6.6 && Q.crap(1, 0) === 2, `${Q.crap(5, 0)} ${Q.crap(5, 1)} ${Q.crap(5, 0.6)}`);
  ok('覆盖率未知 → CRAP 为 null（不当 0 算）', Q.crap(3, null) === null && Q.crap(NaN, 0.5) === null);
  const root = path.resolve(os.tmpdir(), 'pdq-root');
  const lcov = Q.parseCoverage('SF:src/a.js\nDA:1,1\nDA:2,0\nDA:3,1\nDA:4,0\nDA:5,1\nend_of_record\n', root, 'lcov.info');
  const fns = [{ file: 'src/a.js', name: 'outer', line: 1, endLine: 5, complexity: 3 }, { file: 'src/a.js', name: 'inner', line: 2, endLine: 3, complexity: 1 }];
  const tab = Q.crapTable(fns, lcov, root);
  const outer = tab.find((t) => t.name === 'outer'); const inner = tab.find((t) => t.name === 'inner');
  ok('lcov 逐函数覆盖率扣除嵌套子函数行', Math.abs(outer.coverage - 2 / 3) < 0.001 && inner.coverage === 0.5, JSON.stringify(tab));
  ok('逐函数 CRAP 计算并按最差排序', tab[0].name === 'outer' && outer.crap === Q.crap(3, 2 / 3), JSON.stringify(tab));
  const ist = Q.parseCoverage(JSON.stringify({ [path.join(root, 'src', 'b.js')]: { path: path.join(root, 'src', 'b.js'), statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 2 } } }, s: { 0: 3, 1: 0 }, fnMap: {}, f: {} } }), root, 'coverage-final.json');
  ok('istanbul coverage-final.json 解析', Q.crapTable([{ file: 'src/b.js', name: 'b', line: 1, endLine: 2, complexity: 2 }], ist, root)[0].coverage === 0.5);
  ok('报告里没有的文件：覆盖率/CRAP 为 null 并注明', Q.crapTable([{ file: 'src/z.js', name: 'z', line: 1, endLine: 2, complexity: 2 }], ist, root)[0].crap === null);
  const v18 = Q.pickVersions('18.20.4'); const v22 = Q.pickVersions('22.13.0'); const v20 = Q.pickVersions('20.19.0'); const v2210 = Q.pickVersions('22.10.0');
  ok('按 Node 版本锁主版本（18→eslint9/c8 10/stryker8；22.13→10/12/10）', v18.eslint === '9' && v18.c8 === '10' && v18.stryker === '8' && v22.eslint === '10' && v22.c8 === '12' && v22.stryker === '10' && v20.eslint === '10' && v20.stryker === '9' && v2210.eslint === '9' && v18.jscpd === '5', JSON.stringify({ v18, v22, v20, v2210 }));
  const ms = Q.mutationScore({ files: { a: { mutants: [{ status: 'Killed' }, { status: 'Survived' }, { status: 'Timeout' }, { status: 'NoCoverage' }, { status: 'CompileError' }] } } });
  ok('变异分数 =（杀死+超时）/（杀死+超时+幸存+未覆盖）', ms.score === 50 && ms.errors === 1, JSON.stringify(ms));
  ok('区间并集行数', Q.unionLines([[1, 5], [3, 8], [10, 10]]) === 9);
  const inv = Q.npxInvocation(['eslint@10'], ['node', 'C:\\Program Files\\x\\h.mjs', 'C:\\Temp Dir\\job.json'], { isWin: true, npxCli: null, npxBin: 'C:\\npx.cmd' });
  ok('Windows 无 npx-cli.js 时经 shell 调 npx 并给含空格参数加引号', inv.shell === true && /^npx --yes -p eslint@10 node "C:\\Program Files\\x\\h\.mjs" "C:\\Temp Dir\\job\.json"$/.test(inv.file), inv.file);
  const inv2 = Q.npxInvocation(['jscpd@5'], ['jscpd', '.'], { isWin: false, npxCli: '/n/npx-cli.js', npxBin: null });
  ok('有 npx-cli.js 时直接用 node 调（不经 shell）', inv2.shell === false && inv2.file === process.execPath && inv2.args[0] === '/n/npx-cli.js' && inv2.args.includes('-p'));
  ok('输出里的代理凭据被抹掉', Q.scrub('ECONNREFUSED http://user:tok3n@proxy:8080') === 'ECONNREFUSED http://***@proxy:8080');
  ok('联网失败归类为离线/代理原因', /离线/.test(Q.failReason({ status: 1, stderr: 'npm error code ENOTFOUND\nnpm error request to https://registry.npmjs.org failed' })));

  // 改动范围：阶段基线 = 该阶段最早提交的父提交
  const qd = fresh();
  const gc = (...a) => git(qd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a);
  const before = git(qd, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(qd, 'src', 'price.js'), 'export const toCents = (yuan) => {\n  if (yuan < 0) return 0;\n  return Math.round(yuan * 100);\n};\n');
  fs.writeFileSync(path.join(qd, 'src', 'extra.js'), 'export const one = () => 1;\n');
  gc('add', '-A'); gc('commit', '-qm', 'phase work');
  const sha2 = git(qd, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(qd, 'src', 'wip.js'), 'export const w = 1;\n');
  const b = Q.resolveBase(qd, { phase: 'P9', tasks: [{ phase: 'P9', execution: { commits: [sha2] } }, { phase: 'P8', execution: { commits: [before] } }] });
  const ch = Q.changedFiles(qd, b.base);
  ok('--phase 基线取阶段最早提交的父提交', b.base === before, JSON.stringify(b));
  ok('--changed 只含阶段改动 + 未提交/未跟踪文件', JSON.stringify(ch) === JSON.stringify(['src/extra.js', 'src/price.js', 'src/wip.js']), JSON.stringify(ch));
  ok('--base 无效时报告原因', Q.resolveBase(qd, { base: 'nope-rev' }).base === null);
  fs.rmSync(path.join(qd, 'src', 'wip.js'));

  // 端到端：离线（工具不可用）→ UNKNOWN + 原因，退出码 0，台账写 quality_signal
  const env = { ...process.env, PD_QUALITY_NO_NPX: '1' };
  const runQ = (...a) => spawnSync(process.execPath, [pd, 'quality', '.', ...a], { cwd: qd, encoding: 'utf8', env });
  let x = runQ('--changed', '--base', before, '--phase', 'T001');
  let led = JSON.parse(fs.readFileSync(path.join(qd, 'docs/evidence/test-ledger.json'), 'utf8')).entries.filter((e) => e.kind === 'quality_signal');
  ok('工具不可用 → 退出码 0、CRAP/重复 UNKNOWN 附原因', x.status === 0 && /CRAP：UNKNOWN/.test(x.stdout) && /重复：UNKNOWN/.test(x.stdout) && /PD_QUALITY_NO_NPX/.test(x.stdout), x.stdout + x.stderr);
  ok('台账登记 quality_signal（UNKNOWN + reason，覆盖路径 = 改动文件）', led.length === 2 && led.every((e) => e.result === 'UNKNOWN' && e.reason && e.target === 'T001' && e.scope === 'phase' && e.commit && e.fingerprint) && JSON.stringify(led[0].covers_paths) === JSON.stringify(['src/extra.js', 'src/price.js']), JSON.stringify(led, null, 1));
  ok('变异默认不跑（无 Stryker 配置、未加 --mutation），不登记', /变异：SKIPPED/.test(x.stdout) && !led.some((e) => e.signal === 'mutation'), x.stdout);
  ok('.metrics/ 自带 .gitignore，不污染工作区', fs.existsSync(path.join(qd, '.metrics', '.gitignore')) && !/\.metrics/.test(git(qd, 'status', '--porcelain')));

  // 端到端：自定义复杂度命令 + lcov 报告 → 真实 CRAP，PASS 不当阶段体检复用
  fs.writeFileSync(path.join(qd, 'qc.cjs'), "const fs=require('fs');const files=JSON.parse(fs.readFileSync(process.env.PD_QUALITY_FILES,'utf8'));fs.writeFileSync(process.env.PD_QUALITY_OUT,JSON.stringify(files.filter(f=>f==='src/price.js').map(f=>({file:f,name:'toCents',line:1,endLine:4,complexity:2}))));\n");
  fs.writeFileSync(path.join(qd, 'cov.info'), 'SF:src/price.js\nDA:1,1\nDA:2,1\nDA:3,0\nend_of_record\n');
  edit(qd, '.product-development/config.json', (j) => { j.quality = { tools: { complexity: { command: 'node qc.cjs' }, duplication: false }, coverage_report: 'cov.info' }; });
  gc('add', '-A'); gc('commit', '-qm', 'quality cfg');
  x = runQ('--changed', '--base', before, '--phase', 'T001');
  led = JSON.parse(fs.readFileSync(path.join(qd, 'docs/evidence/test-ledger.json'), 'utf8')).entries.filter((e) => e.kind === 'quality_signal');
  const c2 = led.filter((e) => e.signal === 'crap').pop();
  ok('自定义命令 + lcov → CRAP 计算并登记 PASS', x.status === 0 && c2?.result === 'PASS' && c2.metrics.worst.crap === Q.crap(2, 2 / 3) && c2.metrics.worst.name === 'toCents', x.stdout + JSON.stringify(c2));
  ok('配置关闭的信号记 UNKNOWN 并说明', led.filter((e) => e.signal === 'duplication').pop()?.reason?.includes('quality.tools.duplication=false'));
  ok('摘要证据文件写入 evidence 目录', c2?.evidence && fs.existsSync(path.join(qd, c2.evidence)), c2?.evidence);
  x = run(qd, 'test-plan', '.', '--phase', 'T001');
  ok('quality_signal 的 PASS 不出现在阶段可复用列表', x.status === 0 && !/quality_signal|qcrap/.test(x.stdout), x.stdout);
  x = run(qd, 'record', '.', '--task', 'T001-01', '--event', 'VERIFIED');
  ok('quality_signal 的 PASS 不能让卡转 VERIFIED', x.status !== 0 && /测试台账/.test(x.stderr), x.stdout + x.stderr);
  x = run(qd, 'health', '.');
  ok('写入 quality_signal 后体检仍通过', x.status === 0, x.stdout + x.stderr);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'pdq-plain-'));
  fs.writeFileSync(path.join(plain, 'a.py'), 'def f(x):\n    return x\n');
  x = spawnSync(process.execPath, [pd, 'quality', plain, '--changed'], { encoding: 'utf8', env });
  ok('无 config、非 git 仓库、非 JS 项目：UNKNOWN 附原因，退出码 0', x.status === 0 && /不是 JS\/TS/.test(x.stdout) && /未写测试台账/.test(x.stdout), x.stdout + x.stderr);
  x = spawnSync(process.execPath, [pd, 'quality', path.join(plain, 'nope')], { encoding: 'utf8', env });
  ok('目录不存在也退出码 0', x.status === 0 && /UNKNOWN/.test(x.stdout), x.stdout + x.stderr);
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exitCode = fail ? 1 : 0;
