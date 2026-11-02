// PDS-644：ask-check 检索 RULING / CHECKPOINT
export default async function ({ ok, run, fresh }) {
  const d = fresh();
  run(d, 'record', '.', '--task', 'T001-02', '--event', 'RULING', '--decision', '退款金额按整数分计算', '--reason', '与支付网关一致', '--cost', '改 2 处');
  run(d, 'record', '.', '--task', 'T001-02', '--event', 'CHECKPOINT', '--learned', '汇率接口限流每分钟 60 次', '--next-steps', '加缓存');
  let r = run(d, 'ask-check', '.', '退款 整数分');
  ok('644：命中 RULING 视同已决定，退出码 5', r.status === 5 && /裁决 T001-02@/.test(r.stdout), r.stdout + r.stderr);
  r = run(d, 'ask-check', '.', '汇率 限流');
  ok('644：命中 CHECKPOINT 列出但不算决定', r.status !== 5 && /断点 T001-02@/.test(r.stdout), r.stdout);
}
