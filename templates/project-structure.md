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

## 2. 目录树（只到稳定层级；★ = 首刀 T000-01 创建）
```text
<project-root>/
├── apps/
│   ├── web/src/{app,pages,features,shared,styles,i18n,assets} ★
│   └── api/src/{bootstrap,modules/<域>/{domain,application,interfaces,infrastructure},shared,core} ★
├── packages/contracts/ ★
├── <migrations 目录> ★
├── docs/   scripts/   infra/   tests/
├── .local/                     # gitignore
└── AGENTS.md README.md Makefile .env.example .gitignore
```

## 3. 模块所有权
| 路径模式 | 层/类型 | 所有者（角色/助手） | 公开入口 | 修改须知 |
|---|---|---|---|---|
| `packages/contracts/**` | 契约唯一源 | planner | `src/index.ts` | 变更 = 新 DEC |
| `<migrations>/**` | 迁移 | 按卡分配版本号，串行 | — | 已合并不改 |
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
- shared/ui、lib → features ✓
- 访问他域 internal / 私有模型 ✓
- 循环依赖 ✓

## 5. 十五维度决定
| 维度 | 决定 | 依据（REQ/DEC） | 位置 |
|---|---|---|---|
| 需求 | | | |
| 前端 | | | |
| 后端 | | | |
| 数据 | schema 唯一源=<>；迁移=<工具/目录/编号规则>；seed=<> | | |
| 交互 | UX 五态清单位置=<>；校验同源=<> | | |
| 逻辑 | | | |
| 组件 | | | |
| 复用 | packages 准入：≥2 消费者+语义稳定+无单一业务 | | |
| 拓展 | ports/adapters=<>；flag 位置=<> | | |
| 性能 | 缓存层=<>；分页=<>；拆包=<>；查询预算=<数字 或【指标缺失】> | | |
| 配置 | 构建=<>；运行时 env=<清单见 .env.example>；业务配置=<> | | |
| 知识库 | docs 档位=<>；ADR=DEC | | |
| 响应 | 响应体=<>；错误码源=<>；i18n 键=<> | | |
| 存储 | DB=<>；缓存键=<>；对象存储路径=<>；上传限制=<> | | |
| 资源 | assets=<>；public=<>；生成物=<> | | |
| 安全 | 鉴权位置=<>；秘密=环境变量/密钥管理 | | |
| 测试 | 测试目录=<>；守卫在阶段体检运行 | | |

## 6. 守卫配置
| 工具 | 配置文件 | 检查内容 | 命令 | 运行时机 |
|---|---|---|---|---|
| <dependency-cruiser / import-linter / ArchUnit> | <> | 层级、跨域、循环 | <> | 阶段体检（测试助手） |
| 文件卫生 | Makefile | 根目录污染、禁止命名、生成物进 Git | `make guard` | 阶段体检 |
CI 门禁：<不启用 / 项目规则要求时启用>

## 7. 现状与偏离（已有项目必填）
| 路径/规则 | 现状 | 判定 MATCH/PARTIAL/DIVERGED | 处理（保留+DEC / 迁移卡 ID / 触碰即迁移） |
|---|---|---|---|

## 8. 变更记录
| 日期 | 变更 | DEC | 影响卡 |
|---|---|---|---|
