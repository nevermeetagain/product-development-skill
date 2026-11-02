// PDS-612：停滞检测（只读、确定性、只用执行日志时间戳，不看文件 mtime）
import fs from 'node:fs';
import path from 'node:path';
import { readText, git, toPosix } from './lib.mjs';

/** 当前时间：测试可用 PD_NOW 注入（ISO 字符串） */
export function nowMs() {
  const v = process.env.PD_NOW;
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

/** 读取某卡执行日志的事件列表（坏行跳过） */
export function readEvents(ws, id) {
  const dir = ws.runLogDir || path.join(ws.root, '.product-development', 'runs');
  const f = path.join(dir, `${id}.jsonl`);
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const l of readText(f).split(/\r?\n/)) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch { /* 坏行跳过 */ } }
  return out;
}

/** owner 优先级：task.owner → execution.owner → config.owners[role] → 未分配 */
export function ownerOf(ws, t) {
  return t.owner || t.execution?.owner || ws.config.owners?.[t.role || 'executor'] || '未分配';
}

let indexTimeCache;
/** 无事件时的参照时间：task.ready_since → 任务索引最后一次提交时间（git） */
function referenceMs(ws, t) {
  if (t.ready_since && Number.isFinite(Date.parse(t.ready_since))) return Date.parse(t.ready_since);
  if (indexTimeCache === undefined) {
    const rel = ws.taskIndexFile ? toPosix(path.relative(ws.root, ws.taskIndexFile)) : null;
    const iso = rel ? git(ws.root, ['log', '-1', '--format=%cI', '--', rel]) : null;
    indexTimeCache = iso ? Date.parse(iso) : null;
  }
  return indexTimeCache;
}

/**
 * 返回 { minutes, stalls:[{kind,id,owner,idleMin,last}], byOwner:Map }
 * UNCLAIMED_STALL：就绪卡超过阈值没有任何事件（或只有很久以前的事件）
 * SILENT_STALL：IN_PROGRESS 卡超过阈值没有任何事件
 */
export function detectStalls(ws, readyList) {
  const minutes = Number(ws.config.stall_minutes ?? 10);
  const now = nowMs();
  const stalls = [];
  const readyIds = new Set(readyList.map((t) => t.id));
  for (const t of ws.tasks.tasks || []) {
    const ready = readyIds.has(t.id);
    if (!ready && t.status !== 'IN_PROGRESS') continue;
    const ev = readEvents(ws, t.id);
    const lastAt = ev.length ? Date.parse(ev[ev.length - 1].at) : NaN;
    const ref = Number.isFinite(lastAt) ? lastAt : referenceMs(ws, t);
    if (!Number.isFinite(ref)) continue; // 无法判断时间，不猜
    const idleMin = Math.floor((now - ref) / 60000);
    if (idleMin <= minutes) continue;
    const claimed = ev.some((e) => e.event === 'CLAIM' || e.event === 'STARTED');
    stalls.push({ kind: t.status === 'IN_PROGRESS' ? 'SILENT_STALL' : (claimed ? 'CLAIMED_IDLE' : 'UNCLAIMED_STALL'), id: t.id, owner: ownerOf(ws, t), idleMin, events: ev.length });
  }
  const byOwner = new Map();
  for (const s of stalls) { const k = `${s.owner}|${s.kind}`; if (!byOwner.has(k)) byOwner.set(k, []); byOwner.get(k).push(s); }
  return { minutes, stalls, byOwner };
}

/** 一行一 owner 的汇总文本 */
export function stallLines(r) {
  const label = { UNCLAIMED_STALL: '就绪无人认领', CLAIMED_IDLE: '已认领未动', SILENT_STALL: '进行中无事件' };
  return [...r.byOwner.entries()].map(([k, list]) => {
    const [owner, kind] = k.split('|');
    const max = Math.max(...list.map((x) => x.idleMin));
    return `停滞 ${kind}：owner=${owner} 有 ${list.length} 张${label[kind]}，最长 ${max} 分钟无事件（阈值 ${r.minutes}）：${list.map((x) => x.id).join(', ')}`;
  });
}
