---
id: ARCH-STRUCTURE
type: architecture
status: draft            # draft | approved | superseded
tier: standard           # lean | standard | full（与 doc-system 最小/标准/完整对齐）
stack: <如 Next.js + Node/Prisma>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
related: [DEC-<技术栈>, DEC-<分层>, T000-01]
---
# 项目结构（project-structure）

> 规则见 `references/project-structure.md`。不适用的节直接删除。目标：每个文件只有一个显而易见的正确位置。

## 1. 业务域与应用边界
| 域 | 职责一句话 | 来源需求 | 所在 app |
|---|---|---|---|
| <identity> | <> | REQ-F-<> | api, web |

NFR 落点：<REQ-NF-xxx → 位置（如 core/middleware/rate_limit）>

## 2. 目录树（只到稳定层级）
★ = T000-01 完成后必须存在（真实文件，或暂无文件时只放 `.gitkeep`，有文件后删）；无 ★ = 首次用到的卡创建，不预建、不放 `.gitkeep`。只保留与本档位相符的变体，其余删除。

**standard（全栈，默认）**
```text
<project-root>/
├── apps/
│   ├── web/src/{app,features,shared/api(typed client)} ★   pages/ entities/ styles/ i18n/ assets/
│   └── api/
│       ├── prisma/{schema.prisma,migrations/} ★          # 非 Prisma 栈改为对应迁移目录；无持久 schema 删除
│       └── src/
│           ├── bootstrap/{main,scheduler} ★               # scheduler 仅有后台任务时
│           ├── modules/<首个域>/{domain/ports,application,interfaces/http,infrastructure/persistence} ★
│           ├── jobs/                                      # 后台任务第二入口（有任务时）
│           ├── i18n/mail-templates/                        # 后端模板（有邮件/通知时）
│           └── core/ shared/
├── packages/contracts/src/{common,<域>/{http,events}} ★
├── docs/architecture/project-structure.md ★   scripts/   infra/   tests/
├── .local/                     # gitignore
└── AGENTS.md README.md Makefile .env.example .gitignore ★
```

**lean（单 app / 纯前端）**
```text
<project-root>/
├── src/{app,features/<首个能力>,shared,storage(适配器)} ★   jobs/（有任务时）
├── <迁移目录>                   # 仅有持久 schema 时
├── tests/ ★
└── README.md AGENTS.md .gitignore .env.example ★
```
首刀垂直切片：<有后端：UI→API→用例→repository→DB ｜ 纯前端：UI→状态→存储适配器>

## 3. 模块所有权
| 路径模式 | 层/类型 | 所有者（角色/助手） | 公开入口 | 修改须知 |
|---|---|---|---|---|
| `packages/contracts/**` | 契约唯一源 | planner | `src/index.ts` | 变更 = 新 DEC |
| `<migrations>/**`（如 `apps/api/prisma/migrations`） | 迁移 | 按卡分配版本号，串行 | — | 已合并不改 |
| `apps/api/src/jobs/**` | 后台任务入口 | <> | 调度表 | 处理器只调用例 |
| `apps/api/src/modules/<域>/**` | 后端域 | <> | `<域>/index` | |
| `apps/web/src/features/<域>/**` | 前端域 | <> | `index.ts` | |
| `apps/web/src/shared/ui/**` | 公共组件 | <> | | 改动需上报 |
| 守卫配置、CI | 公共 | planner | | 不与实现并行改 |

重叠检查：<无 / 列出并消除>

## 4. 依赖规则
允许：
- 后端 `interfaces → application → domain`；`infrastructure → domain/ports`
- 前端 `app/pages → features → entities → shared`
- 跨域：公开入口 / 领域事件 / contracts

禁止（可机器检查的标 ✓守卫）：
- domain → ORM/HTTP/缓存/SDK ✓
- controller → repository/ORM ✓
- web（含 server components/route handlers）→ ORM/Prisma/Redis/DB ✓（只经 typed client 调 API）
- application/domain 签名出现 ORM 生成类型 ✓
- shared/ui、lib → features ✓
- 访问他域 internal / 私有模型 ✓
- 循环依赖 ✓

## 5. 维度决定（16 个核心 + 安全、测试 2 个横切）
| 维度 | 决定 | 依据（REQ/DEC） | 位置 |
|---|---|---|---|
| 需求 | | | |
| 前端 | | | |
| 后端 | 事务=UnitOfWork port（domain/ports）+ 实现（infrastructure）；事件载荷=<packages/contracts/…/events 或 apps/api/src/contracts/events> | | |
| 数据 | schema 唯一源=<如 apps/api/prisma/schema.prisma>；迁移=<工具/目录/编号规则 或 无持久 schema>；seed=<> | | |
| 交互 | UX 五态清单位置=<>；校验同源=<> | | |
| 逻辑 | | | |
| 组件 | | | |
| 复用 | packages 准入：≥2 消费者+语义稳定+无单一业务 | | |
| 拓展 | ports/adapters=<>；flag 位置=<> | | |
| 性能 | 缓存层=<>；分页=<>；拆包=<>；查询预算=<数字 或【指标缺失】> | | |
| 配置 | 构建=<>；运行时 env=<清单见 .env.example>；业务配置=<> | | |
| 知识库 | docs 档位=<>；ADR=<DEC 或沿用现有 ADR 系列> | | |
| 响应 | 响应体=<>；错误码源=<>；i18n 键=<>；后端模板 i18n=<apps/api/src/i18n 或 无> | | |
| 存储 | DB=<>；缓存键=<>；对象存储路径=<>；上传限制=<> | | |
| 资源 | assets=<>；public=<>；生成物=<> | | |
| 后台任务 | 入口=<无 / api 第二入口 / apps/worker>；每类任务：触发/幂等键/重试/死信/超时 | | |
| 安全 | 鉴权位置=<>；秘密=环境变量/密钥管理；.gitignore 拦 .env*、*.dump、*_dump.sql、*.sql.gz | | |
| 测试 | 测试目录=<>；守卫在阶段体检运行 | | |

## 6. 守卫配置
| 工具 | 配置文件 | 检查内容 | 命令 | 运行时机 |
|---|---|---|---|---|
| <dependency-cruiser / import-linter / ArchUnit> | <> | 层级、跨域、循环 | <> | 阶段体检（测试助手） |
| 文件卫生 | Makefile | 根目录污染、禁止命名、生成物进 Git、.env/数据导出被跟踪 | `make guard` + `pd.mjs health` | 阶段体检 |
CI 门禁：<不启用 / 项目规则要求时启用>

## 7. 现状与偏离（已有项目必填）
真实入口（探测所得，不假设 apps/api）：HTTP=<>；任务=<>；schema=<>。已有 ADR/结构文档=<路径，config 已指向>
| 路径/规则 | 现状 | 判定 MATCH/PARTIAL/DIVERGED | 处理（保留+DEC / 迁移卡 ID / 触碰即迁移） |
|---|---|---|---|

## 8. 变更记录
| 日期 | 变更 | DEC | 影响卡 |
|---|---|---|---|
