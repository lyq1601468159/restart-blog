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
// 当前默认关闭验证（DISABLE_AUTH=1），先不设防；想重新开启：
// 把 .env 里的 DISABLE_AUTH 改成 0（或删掉），并设好 ADMIN_TOKEN。
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'restart2026';
const AUTH_DISABLED = process.env.DISABLE_AUTH === '1';

if (AUTH_DISABLED) console.log('[server] 注意：令牌验证已关闭，管理接口当前不设防');

app.use(express.json());
app.use(express.static('public'));

// 防崩：未捕获的 Promise 错误只记日志，不让服务退出（家里跑的博客，重启一次代价太大）
process.on('unhandledRejection', e => {
  console.error('[server] 未处理错误：', e && e.message);
});

function requireAdmin(req, res, next) {
  if (AUTH_DISABLED) return next();
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) return next();
  res.status(401).json({ error: '令牌不对，无权操作' });
}

// ── 文章列表（支持分页：?limit=6&offset=0；不带参数返回全部）──
app.get('/api/posts', async (req, res) => {
  const limit = Number(req.query.limit) || 0;
  if (!limit) {
    res.json({ posts: await db.listPosts(), total: await db.countPosts(), hasMore: false });
    return;
  }
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const posts = await db.listPostsPage(limit, offset);
  const total = await db.countPosts();
  res.json({ posts, total, hasMore: offset + posts.length < total });
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
  const { title, tag, date, excerpt, content, coverUrl } = req.body || {};
  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: '标题和正文不能为空' });
  }
  const id = await db.insertPost({
    title: title.trim(),
    tag: (tag || '').trim(),
    date: (date || new Date().toISOString().slice(0, 10)).trim(),
    excerpt: (excerpt || content.trim().slice(0, 60)).trim(),
    content: content.trim(),
    cover: Math.floor(Math.random() * 4),
    coverUrl: (coverUrl || '').trim()
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

// ── 发表评论（公开，支持回复，长度限制）──
app.post('/api/posts/:id/comments', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const author = ((req.body || {}).author || '').trim().slice(0, 20);
  const content = ((req.body || {}).content || '').trim().slice(0, 500);
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  // 回复校验：只能回复同文章的顶级评论，且只允许一层嵌套
  const parentId = Math.max(0, Number((req.body || {}).parentId) || 0);
  if (parentId) {
    const parent = await db.getComment(parentId);
    if (!parent || parent.post_id !== Number(req.params.id) || Number(parent.parent_id) !== 0) {
      return res.status(400).json({ error: '回复目标无效' });
    }
  }
  const id = await db.insertComment(req.params.id, author || '匿名', content, parentId);
  res.json({ ok: true, id });
});

// ── 最新评论（侧栏）──
app.get('/api/recent-comments', async (req, res) => {
  res.json({ comments: await db.recentComments(5) });
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
  const { title, tag, date, excerpt, content, cover, coverUrl } = req.body || {};
  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: '标题和正文不能为空' });
  }
  const ok = await db.updatePost(req.params.id, {
    title: title.trim(),
    tag: (tag || '').trim(),
    date: (date || post.date || new Date().toISOString().slice(0, 10)).trim(),
    excerpt: (excerpt || content.trim().slice(0, 60)).trim(),
    content: content.trim(),
    cover: cover === undefined ? post.cover : Number(cover),
    coverUrl: coverUrl === undefined ? (post.cover_url || '') : (coverUrl || '').trim()
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

// ── 上一篇 / 下一篇 ──
app.get('/api/posts/:id/neighbors', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  res.json(await db.neighbors(req.params.id));
});

// ── 相关文章（同标签）──
app.get('/api/posts/:id/related', async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const posts = await db.relatedPosts(req.params.id, post.tag, 3);
  res.json({ posts });
});

// ── 站点设置 ──
app.get('/api/settings', async (req, res) => {
  res.json(await db.getSettings());
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  await db.setSettings(req.body || {});
  res.json(await db.getSettings());
});

// ── 站点地图（SEO）──
app.get('/sitemap.xml', async (req, res) => {
  const posts = await db.listPosts();
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const base = 'https://' + (req.headers.host || 'localhost');
  const urls = [
    '  <url><loc>' + base + '/</loc></url>',
    ...posts.map(p => '  <url><loc>' + base + '/#post-' + p.id + '</loc></url>')
  ].join('\n');
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>'
  );
});

// ── 统计 ──
app.get('/api/stats', async (req, res) => {
  res.json(await db.stats());
});

// 心跳保活：每 60 秒 ping 一次云数据库，防止它休眠导致接口挂起
setInterval(() => db.ping(), 60000);

app.listen(PORT, () => {
  console.log(`[server] 博客已启动： http://localhost:${PORT}`);
  console.log(`[server] 数据驱动：${process.env.DATABASE_URL ? '云端 Postgres' : '本地 SQLite'}`);
  console.log(`[server] 管理员令牌默认 restart2026（可用 ADMIN_TOKEN 环境变量改）`);
});
