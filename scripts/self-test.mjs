#!/usr/bin/env node
// 自测：在临时副本上验证 pd.mjs 的各项行为，不修改随包样例
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

console.log('15. 状态汇报');
r = run(d, 'status', '.');
ok('大白话汇总可输出', r.status === 0 && /待裁决决策：DEC-002/.test(r.stdout), r.stdout);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exitCode = fail ? 1 : 0;
