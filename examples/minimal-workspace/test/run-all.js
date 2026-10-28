// 阶段体检入口：依次运行 test/ 下所有 *.test.js（不存在的测试文件不会被假装通过）
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.js'));
let failed = 0;
for (const f of files) if (spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' }).status !== 0) failed++;
console.log(`run-all: ${files.length - failed}/${files.length} 通过`);
process.exit(failed ? 1 : 0);
