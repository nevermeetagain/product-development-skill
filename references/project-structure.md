# 项目结构设计（project-structure）——规划者以架构师身份执行

> 提炼自用户的两份规范：《PROJECT-STRUCTURE-SPEC 项目工程结构规范 v2.0》（目录、分层、依赖方向、根目录治理、守卫）与《PROJECT DOCUMENTATION SPEC 项目文档规范 v1.1》（docs 体系、ADR、project-map）。本文只保留规划时要做的决定；原文细节以两份规范为准。

**时机**：PLAN 中，与用户（产品经理视角）把需求拆解完、关键决策落 DEC 之后，**冻结契约与写任务卡之前**。目标不是“看起来企业级”，而是**一个文件有且只有一个显而易见的正确位置**，并让执行助手凭卡面就知道文件放哪、能依赖谁。

## 1. 五条底层原则
1. **文件生命周期分类**（每个文件必属一类，答不出不创建）：

| 类 | 例 | 进 Git |
|---|---|---|
| Source | 源码、配置源码、迁移、测试 | 必须 |
| Specification | 文档、ADR/DEC、契约、规范 | 必须 |
| Reproducible Input | schema、seed、fixtures、模板 | 通常 |
| Generated | dist、build、coverage、生成的客户端/类型、缓存 | 默认不进（生成的契约类型若要进，写 DEC 说明） |
| Local/Temporary | 调试日志、截图、草稿、AI 会话产物 | 绝不进 → `.local/` |

   归属判断顺序：生命周期类 → 业务域 → 域内层级。
2. **依赖单向不可逆**
   - 后端：`interfaces(route/controller) → application(用例/service) → domain`；`infrastructure(repository/外部适配) → domain 的 ports`。domain 不依赖 ORM、HTTP 框架、缓存、第三方 SDK；controller 不越过 application 直连 repository/ORM。
   - 前端：`app/pages → features → entities → shared(ui/lib/api)`。ui 不依赖 features；utils 不依赖业务；pages 只组合不含业务。
   - 模块间只经：对方公开入口（`index.ts`/`__init__`/public API）、领域事件、共享 contracts。禁止访问他域 `internal/`、他域 domain 私有模型、他域 infrastructure。
3. **按业务边界组织**：`modules/<域>/{domain,application,interfaces,infrastructure}`，不按 `controllers/ services/ models/` 平铺。改一个功能只进一个目录。
4. **根目录白名单**：README、AGENTS.md、CHANGELOG、LICENSE、Makefile、docker-compose.yml、.gitignore、.editorconfig、.env.example、根包配置（package.json/pnpm-workspace.yaml/turbo.json/pyproject.toml）。截图、日志、`*.bak`、`*_final*`、`*_v2*`、`debug*`、`tmp/ old/ backup/` 永不出现在根；新增顶层目录须答清：生命周期类、为何现有目录装不下、是否属某 app/模块、是否生成物/临时、是否需 Git、是否长期稳定。
5. **共享要有门槛**：进 `shared/`、`packages/` 必须同时满足 ≥2 个真实消费者 + 语义稳定 + 无单一业务归属 + 有稳定导出边界。否则留在模块内。不为“将来可能用”建目录。

**.gitignore 要点**：`node_modules/ dist/ build/ out/ .next/ coverage/ .turbo/ __pycache__/ .*_cache/ logs/ *.log .local/ .env .env.* !.env.example *.pem *.key secrets/ *.bak *_final* *_copy.* *.dump .idea/ .DS_Store`。

## 2. 参考树（全栈 monorepo，完整级；按 §4 裁剪）
```text
apps/
  web/src/  app/(router,providers,config) pages/<域>/ features/<域>/{components,hooks,store,api,schemas,types,index.ts}
            entities/<实体>/(可选) shared/{ui,lib/{hooks,utils},api/(client,interceptors)} styles/(tokens,themes) i18n/locales/ assets/
            public/  tests/{unit,e2e}
  api/src/  bootstrap/(main,app factory,container) modules/<域>/{domain/{entities,value_objects,services,ports,events},
            application/{commands,queries,dtos},interfaces/{http,events,cli},infrastructure/{persistence/{models,repositories,mappers},cache,external}}
            shared/(基类,bus,无业务 utils) core/(config,security,logging,errors,responses,middleware)  tests/{unit,integration,factories,fixtures}
packages/   contracts/src/<域>/ + common/{pagination,response,error}   ui/(tokens,primitives,components)   config/(eslint,tsconfig base)
database/   migrations/(有序、只前进) seeds/ fixtures/          ← 或放 apps/api 内，二选一写进结构文档
infra/      docker/ nginx/ deployment/ ci/(或 .github/workflows/)
scripts/    setup/ database/ release/ maintenance/          ← 只放长期有效脚本
tests/      integration/(跨服务) e2e/
docs/       见 §3.12
.local/     ai/ logs/ screenshots/ scratch/ runtime/        ← 整体 gitignore
AGENTS.md  README.md  Makefile  .env.example  .gitignore
```
子目录可放更具体的 `apps/*/AGENTS.md`。

## 3. 十五个维度的架构决定
每个维度只做“本项目真涉及”的决定；不涉及写一句理由。决定写进结构文档对应节，影响面大的另落 DEC。

**3.1 需求→结构**：业务域清单来自需求（每个域对应 REQ 集合）；NFR（性能、安全、可用性、合规）映射到具体位置（如缓存层、审计模块、限流中间件）。拆域依据：变化原因不同、外部依赖不同、团队/部署边界不同；不按文件数拆。

**3.2 后端分层**：route/controller 只做 解析→调用用例→呈现；application 编排、事务边界、鉴权调用；domain 纯规则；repository 接口在 domain/ports，实现在 infrastructure。ORM model 只出现在 infrastructure，经 mapper 转实体。

**3.3 前端分层**：app/pages 路由与组合 → features（一个用户能力，含组件/hooks/状态/API/表单 schema）→ entities（可选，跨 feature 的业务实体展示与模型）→ shared（ui 原子组件、layout、lib hooks/utils、HTTP client）。design tokens 在 `styles/` 或 `packages/ui/tokens`，组件不写魔法值；全局状态只放主题/语言/会话，业务状态留在 feature；服务端状态用查询缓存库，不复制到全局 store。

**3.4 数据**：schema 唯一源（Prisma schema / SQLAlchemy+Alembic / JPA+Flyway 选一）；迁移**只前进**、按版本号串行、已合并不改；seed 只用于开发/测试；索引按查询路径定义并写进 Data 契约；软删除、审计字段、时间（UTC 存储）、金额（最小单位整数）全项目统一。

**3.5 交互**：每个核心界面登记 UX 五态（空/加载/错误/无权限/成功）；表单校验规则同源（共享 schema，如 zod 放 contracts），前端校验不替代后端；错误码→文案→操作（重试/登录/返回）映射表。

**3.6 逻辑**：业务规则是 domain 内纯函数/规则表/状态机，无 IO、时间与随机注入；前端不复制业务规则，只做展示用的派生计算。

**3.7 组件**：ui 原子组件（零业务）/ layout / feature 组件三层；每个组件目录含实现、测试、（可选）stories、`index`。

**3.8 复用**：复用 > 扩展 > 新建。建 `packages/<x>` 的条件 = §1 第 5 条 + 至少两个 app 消费 + 有独立版本节奏；单 app 项目不建 packages，用 `shared/`。

**3.9 拓展**：外部依赖一律 ports/adapters（支付、邮件、存储、LLM 等可替换）；功能开关集中在一处（config 或 flag 服务），带清理期限；预留的扩展点（插件注册表、事件钩子、策略表）必须有当前真实用途，否则不建。

**3.10 性能**：缓存分层（HTTP/CDN → 应用缓存 → 查询缓存）并写明失效策略与归属目录；列表一律分页（游标或页码，默认值与上限进契约）；前端按路由拆包、重依赖懒加载；查询预算（每请求查询数、N+1 禁止、慢查询阈值）写成可测指标——没数字标【指标缺失】，不编。

**3.11 配置**（三类，分开放）：
| 类 | 例 | 位置 | Git |
|---|---|---|---|
| 构建/工具 | tsconfig、eslint、vite/next、pyproject | 工具约定路径，可抽 `packages/config` | 是 |
| 运行时环境 | 端口、DB URL、密钥、第三方 Key | 环境变量；`.env.example` 只列名与说明；读取集中在 `core/config` 并启动时校验 | 仅示例 |
| 业务配置 | 费率、限额、开关、文案 | `config/` 或 DB 表，有 schema、有默认值 | 是（敏感值除外） |
秘密永不进 Git、日志、提示词；配置历史靠 Git，禁止 `*.bak`/`config_new`。

**3.12 知识库**：`docs/` 与 doc-system 分级对齐：
```text
docs/architecture/project-structure.md   本步骤产出（结构+所有权+依赖规则）
docs/decisions/DEC-xxxx.md               ADR（用 DEC 编号，不另起 ADR 系列）
docs/requirements/  docs/solutions/  docs/contracts/(或契约唯一源目录)
docs/plan/  docs/evidence/  docs/knowledge/(完整级)  docs/project-map.md(完整级)
```
结构变化 → 更新 project-structure.md（完整级同步 project-map）。

**3.13 响应**：统一响应体（成功 `data`+`meta`(分页)；失败 `error{code,message,details,request_id}`）定义在 contracts/common；错误码枚举 + HTTP 映射单一来源；用户可见消息走 i18n 键（后端返回 code，前端按 code 取文案），不在后端拼最终文案。

**3.14 存储**：DB（主数据）/ 缓存（可丢失，键命名规范 `<域>:<实体>:<id>`）/ 对象存储（上传文件，路径规则如 `<env>/<域>/<owner_id>/<uuid>.<ext>`，访问用签名 URL）/ 本地磁盘只用于临时，不作持久层。上传：大小与类型白名单、鉴权、生命周期写进 Resources 契约。

**3.15 资源**：源资产在 `apps/web/src/assets/{images,icons,fonts}`（经构建）；不经编译的放 `public/`；跨 app 共享的图标/字体进 `packages/ui`；生成物（压缩图、sprite、生成客户端）进构建产物不进 Git；字体与图片有许可说明。

## 4. 栈适配与分级
分级与 doc-system 对齐：**精简 lean = 最小级**，**标准 standard = 标准级**，**完整 full = 完整级**。

| 部分 | Next.js + Node/Prisma | Python FastAPI | Java Spring | 单应用小项目 |
|---|---|---|---|---|
| 后端位置 | `apps/api`（或 Next route handlers 仅薄 BFF） | `apps/api/src/modules` | `src/main/java/<pkg>/<域>/{domain,application,adapter/in/web,adapter/out/persistence}` | `src/server/<域>/` |
| schema/迁移 | `prisma/schema.prisma` + `prisma/migrations` | SQLAlchemy + `alembic/versions` | JPA + `db/migration`(Flyway) | 同栈默认 |
| 契约唯一源 | `packages/contracts`(zod/TS) | Pydantic → 导出 OpenAPI → 前端生成类型 | OpenAPI 文件 → 生成两端 | 单文件类型模块 |
| 守卫工具 | eslint-plugin-boundaries / dependency-cruiser | import-linter | ArchUnit | 可省或一条 lint 规则 |

| 档位 | 保留 | 去掉 |
|---|---|---|
| lean（个人/小工具，1 执行助手） | 单 app；`src/{modules 或 features, shared, core}`；迁移目录；`.local/`；根白名单；`.gitignore` | packages/、infra/k8s、独立 database/、domain/application 可合并为一层、entities 层、守卫工具 |
| standard（默认，多助手并行） | lean + 契约唯一源（`packages/contracts` 或 OpenAPI）+ 四层分层 + 依赖规则 + 一个守卫工具 | packages/ui、worker、完整 infra |
| full（多人/长期/高风险） | 全部 §2 + packages/ui + 完整守卫 + project-map | — |
升级档位只新增目录，不搬迁已有文件。

## 5. 架构守卫（可选，按档位）
- JS/TS：`eslint-plugin-boundaries` 或 `@nx/enforce-module-boundaries`（层级/域标签约束）；`dependency-cruiser`（domain→infrastructure 禁止、禁止循环、禁止跨域 internal）。
- Python：`import-linter`（layers / forbidden contracts）。Java：ArchUnit 测试。
- 文件卫生：`make guard` = 根目录污染 + 禁止命名（`*_final* *_old* *.bak *副本*`）+ 生成物进 Git 检查。
- CI 接入**是建议不是强制**：遵循 SKILL.md 测试分工——执行助手不跑守卫当门禁，守卫在**阶段体检**由测试助手跑（只覆盖本阶段改动模块）；项目自己要求 CI 门禁时按项目规则。
- 守卫配置属公共文件：与实现不并行修改，变更走 DEC。

## 6. STRUCTURE 步骤（PLAN 内）
**输入**：需求基线（REQ-F/NF/C 或 master_plan 需求节）、已定 DEC（尤其技术栈）、NFR 指标、现有代码现实（§1.3 事实基线）、项目 AGENTS.md 已有目录规则（优先）。

**做**：
1. 定档位（lean/standard/full）与栈适配行；栈未定 → 技术选型 DEC（多方案按 solution-review）。
2. 从需求导出业务域清单与每个域的 REQ 映射；定 app 边界。
3. 逐项走 §7 清单，记录决定。
4. 画树（只到稳定层级，不预建空目录）+ 所有权表（路径 × 角色/助手，供 planner-protocol §7 所有权矩阵使用）+ 依赖规则（允许/禁止，能机器检查的写成守卫规则）。

**输出**：
- `docs/architecture/project-structure.md`（按 `templates/project-structure.md` 填写）。
- DEC：技术栈、分层方式（及偏离本参考的理由）。ADR 即 DEC，写入 `decision_dir`。
- `.product-development/config.json`：`paths.project_structure`（必加）；涉及时加 `paths.contracts`、`paths.migrations`。只放字符串路径（`pd.mjs health` 会检查存在性，不存在仅警告）。
- 任务卡 `T000-01 步行骨架+结构`：建立骨架目录（只建首刀用到的）、根白名单文件、`.gitignore`、`.env.example`、契约唯一源入口、迁移目录与首个迁移、守卫配置（standard/full）、子目录 AGENTS.md 片段；验收用命令判定（如 `tree -L 3` 与文档一致、守卫命令退出码 0、空库迁移成功、健康检查返回 200）。它与 planner-protocol §4 的首刀步行骨架合并，不另起一张。后续卡的 `allowed_paths/forbidden_paths` 直接引用结构文档的所有权表。

**已有项目**：
- 先映射现状（实际树、实际分层、实际依赖方向），逐项标 `MATCH / PARTIAL / DIVERGED`，写进结构文档“现状与偏离”节。
- **绝不批量搬家**（不改大量 import、不一次性重排目录）。新代码按目标结构写；旧代码按“触碰即迁移”或独立的小迁移卡逐步收敛，每张迁移卡只动一个模块、有可回退点、有定向测试。
- 偏离若是有意保留，写 DEC 并列入“已接受偏离”；守卫先以 warn/基线白名单接入，只拦新增违规。

## 7. 十五维度清单（规划者自检；“去向”为默认，以 config 为准）
| 维度 | 要记录的决定 | 去向 |
|---|---|---|
| 需求 | 业务域清单、域↔REQ 映射、NFR→落点 | 结构文档 §域 |
| 前端 | 层级、目录、状态管理方式、路由组织 | 结构文档 + DEC（框架/状态库） |
| 后端 | 分层、模块边界、模块通信方式（公开 API/事件） | 结构文档 + DEC（分层） |
| 数据 | schema 唯一源、迁移工具与目录、编号规则、seed 位置、索引原则 | Data 契约 + 结构文档 |
| 交互 | UX 五态清单、表单校验同源位置、错误→文案映射位置 | UX States 契约 |
| 逻辑 | 规则放 domain 的形式（纯函数/规则表/状态机） | 结构文档 + 相关 DEC |
| 组件 | ui/layout/feature 三层、组件目录约定 | 结构文档 |
| 复用 | shared 与 packages 的准入、现有可复用清单 | 结构文档 |
| 拓展 | ports/adapters 清单、flag 位置与清理规则、扩展点及其真实用途 | 结构文档 + DEC |
| 性能 | 缓存层与失效、分页规则、拆包策略、查询预算指标 | NFR + 契约 + 性能卡 |
| 配置 | 三类配置位置、env 变量清单、启动校验 | 结构文档 + `.env.example` |
| 知识库 | docs 档位、结构文档路径、ADR=DEC | config.json + doc-system |
| 响应 | 响应体、错误码源、i18n 消息键 | API/Errors 契约 |
| 存储 | DB/缓存/对象存储职责、键与路径规则、上传限制 | Resources 契约 + 结构文档 |
| 资源 | assets/public/共享资源位置、生成物处理、许可 | 结构文档 |
另：安全（鉴权位置、秘密管理）与测试（测试目录、守卫档位）在结构文档各有一行。
