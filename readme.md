# 重启日志 · 全栈博客

个人博客，前端 + Node.js 后端 + SQLite 数据库，完整闭环。

## 怎么运行

**方式一（推荐）：双击 `start-blog.bat`**
会自动打开浏览器并启动服务器。关掉黑色命令行窗口 = 关闭博客。

**方式二（命令行）：**
```bash
cd my-blog
npm install        # 第一次运行才需要
npm start
```
然后浏览器打开 <http://localhost:3000>

## 目录结构

| 文件 | 作用 |
|---|---|
| `server.js` | 后端入口：接口路由 + 权限校验 + 静态文件 |
| `db.js` | 数据层：双驱动（本地 SQLite / 云端 Postgres 自动切换）+ 建表 + 种子文章 |
| `blog.db` | SQLite 数据文件（首次启动自动生成，删掉它 = 清空数据） |
| `public/index.html` | 前端页面结构 |
| `public/style.css` | 全部样式（主题色搜 `--c1` `--c2` `--c3`） |
| `public/app.js` | 前端逻辑：渲染、点赞、发布、页面切换 |
| `start-blog.bat` | 一键启动脚本 |

## 数据流（一次"发布文章"的完整旅程）

1. 你在"写文章"页填表 → 点发布
2. `app.js` 发 `POST /api/posts`（带 `x-admin-token` 令牌）
3. `server.js` 校验令牌 → 调 `db.js` 写入 SQLite
4. 返回首页 → `GET /api/posts` → 数据库读出来 → 前端渲染成卡片

## 接口清单

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/posts` | 文章列表 | 公开 |
| GET | `/api/posts/:id` | 文章详情（阅读数 +1） | 公开 |
| GET | `/api/posts/:id/comments` | 评论列表 | 公开 |
| POST | `/api/posts/:id/comments` | 发表评论（昵称≤20字，内容≤500字） | 公开 |
| POST | `/api/posts` | 发布文章 | 需令牌 |
| POST | `/api/posts/:id/like` | 点赞 +1 | 公开 |
| DELETE | `/api/posts/:id` | 删除文章（连带评论） | 需令牌 |
| DELETE | `/api/comments/:id` | 删除评论 | 需令牌 |
| GET | `/api/stats` | 首页统计 | 公开 |

## 管理员令牌

默认 `restart2026`。在"写文章"页首次发布会弹出输入窗，浏览器会记住。

**修改令牌**（PowerShell）：
```powershell
$env:ADMIN_TOKEN="你的新密码"; node --experimental-sqlite server.js
```

## 安全说明（学习项目 → 上线前必须做的事）

- 本项目面向本机学习，令牌是明文默认值。**若部署到公网**：必须换强令牌、加 HTTPS、限制管理接口来源，并把令牌放到服务端环境变量。
- SQL 全部使用参数化查询（? 占位符），天然防 SQL 注入。
- 前端渲染时对用户输入做了 HTML 转义（escapeHtml），防 XSS。

## 部署

见 [DEPLOY.md](DEPLOY.md)：免费把博客发布到公网（Neon + Render，或 Glitch）。

## 下一步可以自己动手的扩展

- 文章分页 / 搜索框
- 评论（新表 comments，外键 post_id）
- 图片上传
- 部署到云服务器 / 免费托管（Render、Railway、Vercel + 独立数据库）
