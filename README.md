# SilkReel-01 · 江口缫丝坞

缫丝盆环状作业台。登录后看到的是沿汤池围成一圈的盆位，点盆登记汤温并改状态——不是侧栏双列表 CRUD。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Quart（异步 Flask 族）· Hypercorn |
| 结构 | `repositories.py` 仓储 + `services.py` 门槛，路由不直接拼 SQL |
| 数据 | SQLAlchemy 2 async · asyncpg · PostgreSQL 15 |
| 前端 | Preact 10 · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4760
- API：http://localhost:8760
- PostgreSQL：localhost:6160

## 演示账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 管理员 |
| `worker` | `123456` | 缫丝工 |

## 业务规则

盆状态不可标成「已缫完」，除非该盆**最近一条**汤温记录落在 **38～42℃**。规则在 `backend/app/services.py`。

「已缫完」拨回「浸茧」时，该盆须有一张**未作废**的茧层回潮卡，且含水百分落在 **11～13%**；无卡或含水出区间都会被中文拦下。回潮卡不参与已缫完判定，登记汤温、标已缫完都不看它。同一盆未作废卡最多一张（数据库部分唯一索引兜底，并发双交只入库一张）。缫丝工可建卡，作废仅管理员。种子数据：一盆已缫完、零张卡。

## 快速启动

```bash
cd SilkReel/SilkReel-01
docker compose up --build
```
