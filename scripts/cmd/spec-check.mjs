// PDS-622：卡面自洽检查（规划者的“发卡前体检”）。只读；退出码 0 干净 / 1 仅提醒 / 3 有 BLOCKING
import fs from 'node:fs';
import path from 'node:path';
import { cardFiles, allowedOf, pathMatch, pathsOverlap, DONE_LIKE, readText, git } from '../lib.mjs';
import { ownerOf } from '../stall.mjs';

// 只有双方 owner 都已分配且不同才算“跨 owner”；未分配无法判断是否并行，只提醒
const crossOwner = (oa, ob) => oa !== ob && oa !== '未分配' && ob !== '未分配';
const PLACEHOLDER = /\bTBD\b|待定|待补|handle edge cases|适当处理|视情况|TODO[:：]|\?\?\?/i;

export function specCheck(ws) {
  const B = []; const W = [];
  const all = (ws.tasks.tasks || []).filter((t) => t.status !== 'SUPERSEDED');
  const live = all.filter((t) => !DONE_LIKE.includes(t.status));
  const decIds = new Set((ws.decisions.decisions || []).map((d) => d.id));
  const tracked = new Set((git(ws.root, ['ls-files']) || '').split(/\r?\n/).filter(Boolean));
  const exists = (p) => tracked.has(p) || fs.existsSync(path.join(ws.root, p));
  const byId = new Map(all.map((t) => [t.id, t]));
  const cardText = (t) => (t.card && fs.existsSync(path.join(ws.root, t.card)) ? readText(path.join(ws.root, t.card)) : '');

  for (const t of live) {
    const f = cardFiles(t);
    const allowed = allowedOf(t);
    // ① 测试文件必须在本卡允许路径内，且不属于别的 owner 的卡
    for (const p of f ? f.test : (t.tests?.paths || [])) {
      if (!allowed.some((a) => pathMatch(a, p))) B.push(`① ${t.id}：测试文件 ${p} 不在本卡允许路径内`);
      for (const o of live) if (o !== t && crossOwner(ownerOf(ws, o), ownerOf(ws, t)) && allowedOf(o).some((a) => pathMatch(a, p))) B.push(`① ${t.id}：测试文件 ${p} 归 ${o.id}（owner=${ownerOf(ws, o)}）所有，跨 owner 共用`);
    }
    // ③ 只读输入必须已存在，或由前置卡新建/修改
    for (const p of f?.read || []) {
      const fromDep = (t.depends_on || []).some((d) => { const df = byId.get(d) && cardFiles(byId.get(d)); return df && [...df.create, ...df.modify].some((a) => pathMatch(a, p)); });
      if (!exists(p) && !fromDep) B.push(`③ ${t.id}：只读输入 ${p} 既不存在，也不由前置卡产出`);
    }
    // ④ 引用的决策必须存在（字段 + 卡面正文）
    const refs = new Set([...(t.decisions || []), ...(`${t.objective || ''} ${cardText(t)}`.match(/\bDEC-\d+\b/g) || [])]);
    for (const d of refs) if (!decIds.has(d)) B.push(`④ ${t.id}：引用的决策 ${d} 不存在`);
    // ⑥ 占位语
    const text = [t.title, t.objective, ...(t.acceptance || []).map((a) => a.desc), cardText(t)].join('\n');
    const m = text.match(PLACEHOLDER);
    if (m) W.push(`⑥ ${t.id}：含占位语「${m[0]}」，执行者无法判定`);
  }
  // ② 跨 owner 的允许路径重叠（同 owner 或有未分配只提醒）
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]; const b = live[j];
    const hit = pathsOverlap(allowedOf(a), allowedOf(b));
    if (!hit.length) continue;
    const oa = ownerOf(ws, a); const ob = ownerOf(ws, b);
    (crossOwner(oa, ob) ? B : W).push(`② ${a.id}（${oa}）与 ${b.id}（${ob}）允许路径重叠：${hit.join('，')}${oa === ob ? '（同 owner，须串行）' : crossOwner(oa, ob) ? '' : '（有卡未分配 owner，分配前须确认不并行）'}`);
  }
  // ⑤ 迁移号唯一（含已完成卡：号一旦用过就不能再用）
  const mig = new Map();
  for (const t of all) for (const p of cardFiles(t)?.create || []) {
    const m = p.match(/migrations?\/(\d{3,})[_-]/);
    if (m) { if (!mig.has(m[1])) mig.set(m[1], []); mig.get(m[1]).push(t.id); }
  }
  for (const [n, ids] of mig) if (ids.length > 1) B.push(`⑤ 迁移号 ${n} 被 ${ids.join('、')} 重复使用`);
  return { blocking: B, warnings: W };
}

export function run({ ws }) {
  const r = specCheck(ws);
  for (const l of r.blocking) console.log(`BLOCKING ${l}`);
  for (const l of r.warnings) console.log(`提醒 ${l}`);
  console.log(`spec-check：BLOCKING ${r.blocking.length}，提醒 ${r.warnings.length}`);
  process.exitCode = r.blocking.length ? 3 : r.warnings.length ? 1 : 0;
}
