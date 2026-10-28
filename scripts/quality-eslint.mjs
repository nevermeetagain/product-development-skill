#!/usr/bin/env node
// pd quality 的复杂度助手：由 `npx -p eslint@X [-p @typescript-eslint/parser@8 -p typescript@5] node quality-eslint.mjs <job.json>` 调用。
// 从 PATH 中 npx 临时目录的 node_modules/.bin 找到 eslint，用内置 complexity 规则逐函数取圈复杂度与起止行。
// 输出 job.out：{ tool, version, functions:[{file,name,line,endLine,complexity}], skipped:[{file,reason}] }
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const binDir = (process.env.PATH || process.env.Path || '').split(path.delimiter)
  .find((d) => d && fs.existsSync(path.join(d, '..', 'eslint', 'package.json')));
if (!binDir) { console.error('找不到 eslint（npx 未把包加入 PATH）'); process.exit(3); }
const req = createRequire(path.join(binDir, '..', 'pd-anchor.js'));
const load = async (id) => import(pathToFileURL(req.resolve(id)).href);
const { ESLint } = await load('eslint');
const { builtinRules } = await load('eslint/use-at-your-own-risk');
const base = builtinRules.get('complexity');
let parser;
if (job.typescript) { try { parser = await load('@typescript-eslint/parser'); parser = parser.default || parser; } catch (e) { parser = undefined; } }

const functions = [];
// 包一层内置 complexity：max 0 让每个函数都上报，截获 node 的起止行（规则消息本身只给函数头位置）
const rule = {
  meta: base.meta,
  create(context) {
    const proxy = Object.create(context, {
      report: {
        value(d) {
          const n = d.node;
          let name = String(d.data?.name ?? '').replace(/^((async|generator|static|private) )*(function|method|arrow function|getter|setter|constructor|static block|class field initializer)\s*/i, '').replace(/^'|'$/g, '');
          if (!name && n?.parent?.type === 'VariableDeclarator' && n.parent.id?.name) name = n.parent.id.name;
          if (!name && /constructor/i.test(String(d.data?.name))) name = 'constructor';
          functions.push({
            file: context.filename,
            name: name || `(anonymous@${n?.loc?.start.line})`,
            line: n?.loc?.start.line, endLine: n?.loc?.end.line,
            complexity: Number(d.data?.complexity),
          });
        },
      },
    });
    return base.create(proxy);
  },
};
const exts = '{js,jsx,mjs,cjs,ts,tsx,mts,cts}';
const eslint = new ESLint({
  cwd: job.root,
  overrideConfigFile: true,
  errorOnUnmatchedPattern: false,
  overrideConfig: [{
    files: [`**/*.${exts}`],
    plugins: { pd: { rules: { complexity: rule } } },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, ...(parser ? { parser } : {}) },
    linterOptions: { reportUnusedDisableDirectives: 'off', noInlineConfig: true },
    rules: { 'pd/complexity': ['warn', { max: 0 }] },
  }],
});
const skipped = [];
const results = await eslint.lintFiles(job.files.map((f) => path.join(job.root, f)));
for (const r of results) {
  const fatal = r.messages.find((m) => m.fatal);
  if (fatal) skipped.push({ file: r.filePath, reason: `解析失败：${String(fatal.message).slice(0, 160)}` });
}
fs.writeFileSync(job.out, JSON.stringify({ tool: 'eslint', version: ESLint.version, typescript: !!parser, functions, skipped }));
