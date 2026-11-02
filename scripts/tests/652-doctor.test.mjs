// PDS-652：doctor 档位
export default async function ({ ok, run, fresh }) {
  const d = fresh();
  let r = run(d, 'doctor', '.');
  ok('652：dev 档位（样例有未完成卡）→ 通过，退出码 0', r.status === 0 && /dev 档位通过/.test(r.stdout), r.stdout + r.stderr);
  r = run(d, 'doctor', '.', '--profile', 'release');
  ok('652：release 档位 → 未完成卡导致失败，退出码 1', r.status === 1 && /✗ 未完成卡/.test(r.stdout), r.stdout);
  run(d, 'record', '.', '--task', 'T001-02', '--event', 'NOTE', '--note', '无身份');
  r = run(d, 'doctor', '.', '--profile', 'release');
  ok('652：release 档位拦截身份未知的执行日志（闭环 631 的兼容让步）', /✗ 执行日志身份未知.*：1/.test(r.stdout), r.stdout);
}
