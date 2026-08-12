# 部署指南：把博客放到公网

两种免费方案，**推荐方案 A**（数据永久保存）；方案 B 更快但数据有丢失风险。

---

## 方案 A（推荐）：Neon 云数据库 + Render 托管

原理：代码跑在 Render（免费），数据库放 Neon（免费 Postgres，数据永久保存）。
你的项目已经支持这个组合——只要设置了 `DATABASE_URL` 环境变量，就会自动用云数据库。

### 第 1 步：注册 GitHub（如果还没有）

1. 打开 <https://github.com> → Sign up → 邮箱注册（QQ 邮箱即可）
2. 登录后，右上角 **+** → **New repository**
   - Repository name 填 `restart-blog`，选 **Public**，其他不用动 → **Create repository**
   - 创建完会显示一个页面，先别关

### 第 2 步：把本地代码推上去

在项目文件夹打开命令行（或在 VS Code 里打开 my-blog 文件夹 → 终端），执行：

```bash
git init
git add .
git commit -m "全栈博客：玻璃拟态前端 + Express + SQLite/Postgres + 评论"
git branch -M main
git remote add origin https://github.com/<你的用户名>/restart-blog.git
git push -u origin main
```

推送时会弹出浏览器让你登录授权 GitHub，点同意即可。

### 第 3 步：注册 Neon，创建免费数据库

1. 打开 <https://neon.tech> → Sign up（可以用刚才的 GitHub 账号登录）
2. 创建一个 Project，**Region 选 Singapore（新加坡，离你近）**
3. 创建后页面会显示连接串，形如：
   `postgresql://用户名:密码@主机/数据库名?sslmode=require`
4. 复制这条 **Connection string**，这就是你的 `DATABASE_URL`

### 第 4 步：注册 Render，部署

1. 打开 <https://render.com> → Sign up → **用 GitHub 账号登录**（免费套餐不用绑卡）
2. Dashboard → **New** → **Web Service** → 授权并选择 `restart-blog` 仓库
3. 配置（其余全默认）：
   - **Build Command**：`npm install`
   - **Start Command**：`node --experimental-sqlite server.js`
4. 往下找到 **Environment Variables**，添加两条：
   - `DATABASE_URL` = 第 3 步复制的连接串
   - `ADMIN_TOKEN` = 换成你自己的强密码（比如 `wo2026chongqi!`）
5. 点 **Create Web Service**，等 2–3 分钟
6. 完成后会给你一个网址：`https://restart-blog-xxxx.onrender.com` —— **这就是你的公网博客**

### 部署后注意

- 免费实例空闲 15 分钟会休眠，第一次访问要等约 30 秒冷启动（正常现象）
- 发文章/删文章用的令牌 = 你在 ADMIN_TOKEN 里设的那个
- 本地开发继续用 SQLite，互不影响

---

## 方案 B（最快，但有数据风险）：Glitch

Glitch 免费、不用绑卡、一步导入，但免费容器的文件存储**可能被重置**，SQLite 数据可能丢。

1. 打开 <https://glitch.com> → Sign in with GitHub
2. **New project** → **Import from GitHub** → 填 `https://github.com/<你的用户名>/restart-blog`
3. 等它自动 `npm install` 完成，项目直接上线，网址形如 `https://xxx.glitch.me`
4. 记得定期在本地备份数据

> 结论：想认真长期用 → 方案 A；只想让朋友快速看一眼 → 方案 B。

---

## 常见问题

**Q：中国访问这些网址会慢吗？**
Render 和 Neon（新加坡节点）在国内基本可用，速度一般但能打开。

**Q：部署后我怎么更新代码？**
本地改完 → `git add . && git commit -m "改了xxx" && git push` → Render 自动重新部署。这个流程以后就是你的日常。

**Q：不想用 GitHub 行不行？**
Render 只支持从 Git 仓库部署。GitHub 账号是必须的，注册一次永久用。
