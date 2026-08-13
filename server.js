// ═══════════════════════════════════════════════════
// server.js —— 后端入口
// 职责：① 提供前端页面（public 文件夹）
//       ② 提供数据接口（/api/... 下面这些路由）
// 所有 SQL 都在 db.js 里，这里只做：校验 → 调函数 → 返回
// ═══════════════════════════════════════════════════

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 图片上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      // 随机文件名 + 原扩展名（防重名、防路径注入）
      const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },  // 单张最大 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('只能上传图片文件'));
  }
});

// 管理员令牌：发文章/删文章/删评论时需要。
// 本地默认 restart2026；部署时用平台的环境变量覆盖。
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'restart2026';

app.use(express.json());
app.use(express.static('public'));

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) return next();
  res.status(401).json({ error: '令牌不对，无权操作' });
}

// ── 文章列表 ──
app.get('/api/posts', async (req, res) => {
  const posts = await db.listPosts();
  res.json({ posts });
});

// ── 文章详情 + 阅读数 +1 ──
app.get('/api/posts/:id', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  await db.incrementViews(req.params.id);
  post.views = Number(post.views) + 1;
  res.json({ post });
});

// ── 发布文章（需令牌）──
app.post('/api/posts', requireAdmin, async (req, res) => {
  const { title, tag, date, excerpt, content } = req.body || {};
  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: '标题和正文不能为空' });
  }
  const id = await db.insertPost({
    title: title.trim(),
    tag: (tag || '').trim(),
    date: (date || new Date().toISOString().slice(0, 10)).trim(),
    excerpt: (excerpt || content.trim().slice(0, 60)).trim(),
    content: content.trim(),
    cover: Math.floor(Math.random() * 4)
  });
  res.json({ ok: true, id });
});

// ── 点赞 +1 ──
app.post('/api/posts/:id/like', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const likes = await db.incrementLikes(req.params.id);
  res.json({ ok: true, likes });
});

// ── 删除文章（需令牌，连带删评论）──
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  const ok = await db.deletePost(req.params.id);
  if (!ok) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
});

// ── 评论列表 ──
app.get('/api/posts/:id/comments', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const comments = await db.listComments(req.params.id);
  res.json({ comments });
});

// ── 发表评论（公开，但有长度限制）──
app.post('/api/posts/:id/comments', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const author = ((req.body || {}).author || '').trim().slice(0, 20);
  const content = ((req.body || {}).content || '').trim().slice(0, 500);
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  const id = await db.insertComment(req.params.id, author || '匿名', content);
  res.json({ ok: true, id });
});

// ── 删除评论（需令牌）──
app.delete('/api/comments/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteComment(req.params.id);
  if (!ok) return res.status(404).json({ error: '评论不存在' });
  res.json({ ok: true });
});

// ── 编辑文章（需令牌）──
app.put('/api/posts/:id', requireAdmin, async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const { title, tag, date, excerpt, content, cover } = req.body || {};
  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: '标题和正文不能为空' });
  }
  const ok = await db.updatePost(req.params.id, {
    title: title.trim(),
    tag: (tag || '').trim(),
    date: (date || post.date || new Date().toISOString().slice(0, 10)).trim(),
    excerpt: (excerpt || content.trim().slice(0, 60)).trim(),
    content: content.trim(),
    cover: cover === undefined ? post.cover : Number(cover)
  });
  if (!ok) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
});

// ── 图片上传（需令牌）──
app.post('/api/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' });
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

// ── 热门 TOP ──
app.get('/api/hot', async (req, res) => {
  res.json({ posts: await db.hotPosts(5) });
});

// ── 月度归档 ──
app.get('/api/archive', async (req, res) => {
  res.json({ months: await db.archive() });
});

// ── 管理端统计（需令牌）──
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const s = await db.adminStats();
  res.json({
    overview: {
      posts: s.rows.length,
      likes: s.rows.reduce((x, r) => x + Number(r.likes), 0),
      views: s.rows.reduce((x, r) => x + Number(r.views), 0),
      comments: s.totalComments,
      chars: s.totalChars
    },
    rows: s.rows
  });
});

// ── 全站评论（需令牌）──
app.get('/api/comments', requireAdmin, async (req, res) => {
  res.json({ comments: await db.allComments() });
});

// ── RSS 订阅（公开）──
app.get('/feed.xml', async (req, res) => {
  const posts = await db.listPosts();
  const escape = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = posts.map(p =>
    '  <item>\n' +
    '    <title>' + escape(p.title) + '</title>\n' +
    '    <link>http://localhost:' + PORT + '/#/post/' + p.id + '</link>\n' +
    '    <guid>post-' + p.id + '</guid>\n' +
    '    <pubDate>' + escape(p.date) + '</pubDate>\n' +
    '    <description>' + escape(p.excerpt || '') + '</description>\n' +
    '  </item>\n'
  ).join('');
  res.type('application/rss+xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>\n' +
    '  <title>重启日志</title>\n' +
    '  <description>从躺平到站直：一个退伍兵的编程日记</description>\n' +
    items +
    '</channel></rss>'
  );
});

// ── 上传文件静态访问 ──
app.use('/uploads', express.static('uploads'));

// ── 统计 ──
app.get('/api/stats', async (req, res) => {
  res.json(await db.stats());
});

app.listen(PORT, () => {
  console.log(`[server] 博客已启动： http://localhost:${PORT}`);
  console.log(`[server] 数据驱动：${process.env.DATABASE_URL ? '云端 Postgres' : '本地 SQLite'}`);
  console.log(`[server] 管理员令牌默认 restart2026（可用 ADMIN_TOKEN 环境变量改）`);
});
