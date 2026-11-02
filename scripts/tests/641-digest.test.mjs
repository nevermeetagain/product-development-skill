// PDS-641：日志摘要五种格式 + 未知格式 + 1 KB 上限
export default async function ({ ok }) {
  const { digestText } = await import('../cmd/digest.mjs');
  let r = digestText('  ✓ a\n  ✗ 金额四舍五入\n\n结果：12 通过，1 失败');
  ok('641：pd self-test', r.fmt === 'pd-self-test' && r.pass === 12 && r.fail === 1 && /金额四舍五入/.test(r.text), r.text);
  r = digestText('TAP version 13\nok 1 - a\nnot ok 2 - cart empty\n# tests 2\n# pass 1\n# fail 1');
  ok('641：node:test / TAP', r.fmt === 'tap' && r.pass === 1 && r.fail === 1 && /cart empty/.test(r.text), r.text);
  r = digestText('FAIL src/a.test.ts\n  ● sum › adds\nTests:       1 failed, 9 passed, 10 total');
  ok('641：jest', r.fmt === 'jest/vitest' && r.pass === 9 && r.fail === 1 && /adds/.test(r.text), r.text);
  r = digestText('FAILED tests/test_a.py::test_x - AssertionError\n==== 1 failed, 4 passed in 0.31s ====');
  ok('641：pytest', r.fmt === 'pytest' && r.fail === 1 && r.pass === 4 && /test_x/.test(r.text), r.text);
  r = digestText('src/a.ts(3,5): error TS2322: Type string\nsrc/b.ts(1,1): error TS2304: Cannot find name');
  ok('641：tsc', r.fmt === 'tsc' && r.fail === 2, r.text);
  r = digestText(Array.from({ length: 400 }, (_, i) => `  ✗ 很长很长的失败用例名称 ${i} `.repeat(3)).join('\n') + '\n结果：0 通过，400 失败');
  ok('641：摘要 ≤1 KB，未知格式给末 5 行', Buffer.byteLength(r.text) <= 1024 && digestText('hello\nworld').fmt === 'unknown', String(Buffer.byteLength(r.text)));
}
