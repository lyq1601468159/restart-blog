// ═══════════════════════════════════════════════════
// db.js —— 数据层（双驱动）
//
//   没有 DATABASE_URL 环境变量 → 本地 SQLite（学习/开发用，零配置）
//   有 DATABASE_URL 环境变量   → 云端 Postgres（部署用，数据永久保存）
//
// 这就是真实项目的常见做法：同一套业务代码，
// 开发环境和生产环境用不同的数据库。
// ═══════════════════════════════════════════════════

const path = require('path');
const DATABASE_URL = process.env.DATABASE_URL;
const isPg = !!DATABASE_URL;

// ── 建表 SQL（SQLite 和 Postgres 方言不同，内容一致）──
const SCHEMA = {
  posts: isPg
    ? `CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL, tag TEXT DEFAULT '', date TEXT DEFAULT '',
        excerpt TEXT DEFAULT '', content TEXT NOT NULL,
        likes INTEGER DEFAULT 0, views INTEGER DEFAULT 0, cover INTEGER DEFAULT 0,
        cover_url TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT now()
      )`
    : `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, tag TEXT DEFAULT '', date TEXT DEFAULT '',
        excerpt TEXT DEFAULT '', content TEXT NOT NULL,
        likes INTEGER DEFAULT 0, views INTEGER DEFAULT 0, cover INTEGER DEFAULT 0,
        cover_url TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
  comments: isPg
    ? `CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        author TEXT DEFAULT '匿名',
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`
    : `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT DEFAULT '匿名',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`
};

// ── 种子文章（首次启动且库为空时写入）──
const SEED = [
  {
    title: '便装', tag: '退伍日记', date: '2026.03', cover: 0,
    excerpt: '我脱下穿了730天的军装，换回自己的衣服。站在营区门口等了很久——不是因为不舍，是因为不知道往哪边走。',
    content: [
      '我脱下穿了730天的军装，换回自己的衣服。站在营区门口等了很久——不是因为不舍，是因为不知道往哪边走。',
      '两年前上同一辆运兵车的时候，我觉得退伍那天会是一个答案：学了本事、攒了钱、回家有底气。结果那天是一个问号。',
      '回家的高铁上，我在备忘录里打了六个字：接下来怎么办。',
      '行李箱里有两套便装、一本军人退役证、一张银行卡。卡里是退役金和补助——不多不少，刚好够一个人什么都不干也能活几个月。后来证明，"什么都不干也能活"是个陷阱。它让你可以躺着，然后就真的躺下去了。',
      '回到家第一天我妈做了很多菜。第二天的菜少了两个。第三天她开始问我"打算找什么工作"。第六天她不问了——不是不想问，是怕问了我不高兴。',
      '那种安静比问话更让人难受。'
    ].join('\n\n')
  },
  {
    title: '躺了六个月之后', tag: '重启', date: '2026.08', cover: 1,
    excerpt: '从三月到八月，几乎没怎么出过门。有一天晚上看到一份退伍重启手册，里面说"先动起来，动作会带着感觉走"。',
    content: [
      '从三月到八月，我几乎没怎么出过门。手机刷到没电，充了再刷，刷刷停停又是一天。有时候一天只吃一顿。',
      '不是不想动。是动不起来的那个感觉——你觉得自己什么都不会。简历写不出来。外面企业写的条件你一条都对不上。大专学历拿不出手，当了两年兵唯一学会的是炒大灶。炒大灶能写进简历吗？你自己都觉得好笑。',
      '八月的一个晚上，我打开了一个叫 OpenClaw 的桌面程序。不是朋友推荐的——朋友早就不怎么联系了。就是在网上瞎逛看到的。',
      '我打了一段话："我刚退伍，在家躺了六个月，什么都不会，外面没人要我，我怎么办？"',
      '然后对面回了一大段。不是"加油你行的"那种废话，是一份实打实的东西：我的政策红利（免费技能培训、税收优惠到2027年底、退役大学生士兵专升本免试）、90天路线图、能投的岗位清单。它甚至查了汕头的具体产业——澄海的玩具电商产业带在招人，本地岗位 4–8k。',
      '那个晚上我没睡着，不是因为焦虑，是因为发现自己手里其实有牌。'
    ].join('\n\n')
  },
  {
    title: 'Ctrl+S 之后的世界', tag: '编程第一课', date: '2026.08.09', cover: 2,
    excerpt: '事情是从一个叫 index.html 的文件开始变的。改完之后按了 Ctrl+S，再刷新浏览器——它变了。',
    content: [
      '事情是从一个叫 index.html 的文件开始变的。',
      '那个程序在我桌面上放了一个快捷方式。我双击打开，浏览器里出现一个网页——干净的白底、一条军绿色的顶边、"你的名字"四个字在正中央。下面写满了中文注释，告诉我这段代码是干什么的。',
      '我下载了 VS Code，照着注释一条一条改。把"你的名字"换成真名。把"138xxxx0000"换成自己的手机号。然后在服役经历那一栏停住了——"负责全连近百人伙食保障：食材计划、烹饪、卫生安全全流程，两年如一日，练出高强度下的条理、责任心与抗压能力。"',
      '我在部队的时候从来没想过能把"炒大灶"写成这样。但它确实是事实。',
      '改完之后按 Ctrl+S——这是个新学的手势——回到浏览器，按下 F5。翻新的瞬间，整页变了。名字是我的。经历是我的。这张网页是活的。',
      '那是我半个月来第一次觉得，好像有什么东西是我能做出来的。不是别人替我做的，是我。'
    ].join('\n\n')
  },
  {
    title: '汕头不是天花板', tag: '城市与选择', date: '2026.08.12', cover: 3,
    excerpt: '有人说你要去深圳才有前途。我想了下：代码不会因为你在汕头就不好用。先把手艺练好，互联网又不管你坐哪条马路。',
    content: [
      '本地人说澄海的玩具能卖到全世界，一条街连着一条街都是工厂和档口。但你要是搜"汕头 程序员"，出来的结果一只手数得过来。',
      '有人说你要去深圳才有前途。深圳程序员起薪七八千，干两年能过一万五，汕头的天花板连别人的地板都不一定够得到。',
      '我想了下。深圳不是目的地，是一个后手。',
      '先把手艺练好。HTML、CSS 先学扎实，然后是 JavaScript，然后是框架。代码不会因为你在汕头就不好用——互联网又不管你坐哪条马路。世界上的客户端都在用户的浏览器里，不在你的城市里。',
      '而且汕头有它自己的好处：安静。不催你。一条金砂路走到底就到海边，你坐在家里写代码，没人逼你做 996，没人跟你说"学历不够"。这座小城市不急，你也不用急。',
      '但不是永远不急。三年后我要么带着本科文凭和作品集去深圳，要么就是在本地把电商技术岗做出自己的路。这两个选项，现在都还不算晚。'
    ].join('\n\n')
  }
];

// ── 创建对应驱动 ──
let driver;   // 'sqlite' | 'pg'
let db;       // 底层连接对象

if (isPg) {
  const { Client } = require('pg');
  db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    keepAlive: true,                       // 保持 TCP 连接活跃
    connectionTimeoutMillis: 15000,        // 连不上 15 秒内报错，不无限等待
    query_timeout: 20000,                  // 单条查询 20 秒超时，防挂死
    statement_timeout: 20000
  });
  db.connect();
  // 防崩 + 自动重连：连接异常时记日志，5 秒后自动重连（云数据库休眠唤醒时会断连）
  db.on('error', e => {
    console.error('[db] Postgres 连接异常：', e.message);
    setTimeout(() => {
      db.connect().then(() => console.log('[db] 已自动重连')).catch(err => console.error('[db] 重连失败：', err.message));
    }, 5000);
  });
  driver = 'pg';
  console.log('[db] 使用云端 Postgres');
} else {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(__dirname, 'blog.db'));
  driver = 'sqlite';
  console.log('[db] 使用本地 SQLite（blog.db）');
}

// ── 建表 ──
if (driver === 'sqlite') {
  db.exec(SCHEMA.posts);
  db.exec(SCHEMA.comments);
} else {
  db.query(SCHEMA.posts);
  db.query(SCHEMA.comments);
}

// ── 旧库升级：给已有 posts 表补 cover_url 字段（已存在则跳过）──
if (driver === 'sqlite') {
  try { db.exec("ALTER TABLE posts ADD COLUMN cover_url TEXT DEFAULT ''"); } catch (e) { /* 字段已存在 */ }
} else {
  db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT ''");
}

// ── 种子：库为空时写入 ──
if (driver === 'sqlite') {
  const n = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
  if (n === 0) {
    const ins = db.prepare(
      'INSERT INTO posts (title, tag, date, excerpt, content, cover) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const p of SEED) ins.run(p.title, p.tag, p.date, p.excerpt, p.content, p.cover);
    console.log('[db] 已写入 4 篇种子文章');
  }
} else {
  db.query('SELECT COUNT(*) AS n FROM posts').then(r => {
    if (Number(r.rows[0].n) === 0) {
      const jobs = SEED.map(p =>
        db.query(
          'INSERT INTO posts (title, tag, date, excerpt, content, cover) VALUES ($1,$2,$3,$4,$5,$6)',
          [p.title, p.tag, p.date, p.excerpt, p.content, p.cover]
        )
      );
      return Promise.all(jobs).then(() => console.log('[db] 已写入 4 篇种子文章'));
    }
  }).catch(e => console.error('[db] 种子失败：', e.message));
}

// ═══════════════════════════════════════════════════
// 对外统一接口（server.js 只用这些函数，不碰 SQL）
// ═══════════════════════════════════════════════════

// 文章列表（不含正文）
async function listPosts() {
  const sql =
    'SELECT id, title, tag, date, excerpt, likes, views, cover, cover_url FROM posts ORDER BY id DESC';
  if (driver === 'sqlite') return db.prepare(sql).all();
  const r = await db.query(sql);
  return r.rows;
}

// 文章详情
async function getPost(id) {
  if (driver === 'sqlite') return db.prepare('SELECT * FROM posts WHERE id = ?').get(id) || null;
  const r = await db.query('SELECT * FROM posts WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// 阅读数 +1
async function incrementViews(id) {
  if (driver === 'sqlite') db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
  else await db.query('UPDATE posts SET views = views + 1 WHERE id = $1', [id]);
}

// 发布文章
async function insertPost(p) {
  if (driver === 'sqlite') {
    const info = db.prepare(
      'INSERT INTO posts (title, tag, date, excerpt, content, cover, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(p.title, p.tag, p.date, p.excerpt, p.content, p.cover, p.coverUrl || '');
    return Number(info.lastInsertRowid);
  }
  const r = await db.query(
    'INSERT INTO posts (title, tag, date, excerpt, content, cover, cover_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [p.title, p.tag, p.date, p.excerpt, p.content, p.cover, p.coverUrl || '']
  );
  return Number(r.rows[0].id);
}

// 删除文章（连带删除它的评论）
async function deletePost(id) {
  if (driver === 'sqlite') {
    const info = db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    if (Number(info.changes) === 0) return false;
    db.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
    return true;
  }
  const r = await db.query('DELETE FROM posts WHERE id = $1', [id]);
  if (r.rowCount === 0) return false;
  await db.query('DELETE FROM comments WHERE post_id = $1', [id]);
  return true;
}

// 点赞 +1
async function incrementLikes(id) {
  if (driver === 'sqlite') {
    db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(id);
    return db.prepare('SELECT likes FROM posts WHERE id = ?').get(id).likes;
  }
  await db.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [id]);
  const r = await db.query('SELECT likes FROM posts WHERE id = $1', [id]);
  return Number(r.rows[0].likes);
}

// 统计
async function stats() {
  const rows = driver === 'sqlite'
    ? db.prepare('SELECT content, likes, views FROM posts').all()
    : (await db.query('SELECT content, likes, views FROM posts')).rows;
  return {
    postCount: rows.length,
    totalLikes: rows.reduce((s, r) => s + Number(r.likes), 0),
    totalViews: rows.reduce((s, r) => s + Number(r.views), 0),
    totalChars: rows.reduce((s, r) => s + (r.content || '').length, 0)
  };
}

// ── 评论 ──
async function listComments(postId) {
  if (driver === 'sqlite') {
    return db.prepare(
      'SELECT id, author, content, created_at FROM comments WHERE post_id = ? ORDER BY id DESC'
    ).all(postId);
  }
  const r = await db.query(
    'SELECT id, author, content, created_at FROM comments WHERE post_id = $1 ORDER BY id DESC',
    [postId]
  );
  return r.rows;
}

async function insertComment(postId, author, content) {
  if (driver === 'sqlite') {
    const info = db.prepare(
      'INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)'
    ).run(postId, author, content);
    return Number(info.lastInsertRowid);
  }
  const r = await db.query(
    'INSERT INTO comments (post_id, author, content) VALUES ($1,$2,$3) RETURNING id',
    [postId, author, content]
  );
  return Number(r.rows[0].id);
}

async function deleteComment(id) {
  if (driver === 'sqlite') {
    const info = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return Number(info.changes) > 0;
  }
  const r = await db.query('DELETE FROM comments WHERE id = $1', [id]);
  return r.rowCount > 0;
}

// 编辑文章
async function updatePost(id, p) {
  if (driver === 'sqlite') {
    const info = db.prepare(
      'UPDATE posts SET title=?, tag=?, date=?, excerpt=?, content=?, cover=?, cover_url=? WHERE id=?'
    ).run(p.title, p.tag, p.date, p.excerpt, p.content, p.cover, p.coverUrl || '', id);
    return Number(info.changes) > 0;
  }
  const r = await db.query(
    'UPDATE posts SET title=$1, tag=$2, date=$3, excerpt=$4, content=$5, cover=$6, cover_url=$7 WHERE id=$8',
    [p.title, p.tag, p.date, p.excerpt, p.content, p.cover, p.coverUrl || '', id]
  );
  return r.rowCount > 0;
}

// 热门 TOP（按点赞）
async function hotPosts(limit) {
  const sql = 'SELECT id, title, likes, views FROM posts ORDER BY likes DESC, views DESC LIMIT ' + Number(limit || 5);
  if (driver === 'sqlite') return db.prepare(sql).all();
  const r = await db.query(sql);
  return r.rows;
}

// 月度归档（date 字段形如 2026.08.09，取前 7 位分组）
async function archive() {
  const sql = "SELECT substr(date,1,7) AS month, COUNT(*) AS n FROM posts GROUP BY month ORDER BY month DESC";
  const rows = driver === 'sqlite' ? db.prepare(sql).all() : (await db.query(sql)).rows;
  return rows.map(r => ({ month: r.month || '未知', n: Number(r.n) }));
}

// 管理端：每篇文章明细 + 全站评论数
async function adminStats() {
  const rows = driver === 'sqlite'
    ? db.prepare('SELECT id, title, date, likes, views, created_at FROM posts ORDER BY id DESC').all()
    : (await db.query('SELECT id, title, date, likes, views, created_at FROM posts ORDER BY id DESC')).rows;
  const totalComments = driver === 'sqlite'
    ? db.prepare('SELECT COUNT(*) AS n FROM comments').get().n
    : Number((await db.query('SELECT COUNT(*) AS n FROM comments')).rows[0].n);
  const totalChars = rows.reduce((s, r) => s + (r.content ? 0 : 0), 0); // 兼容：下面单独算
  const contentRows = driver === 'sqlite'
    ? db.prepare('SELECT content FROM posts').all()
    : (await db.query('SELECT content FROM posts')).rows;
  const chars = contentRows.reduce((s, r) => s + (r.content || '').length, 0);
  return { rows, totalComments, totalChars: chars };
}

// 全站评论（管理用，最新在前）
async function allComments() {
  const sql =
    'SELECT c.id, c.author, c.content, c.created_at, p.title AS post_title FROM comments c LEFT JOIN posts p ON c.post_id = p.id ORDER BY c.id DESC';
  if (driver === 'sqlite') return db.prepare(sql).all();
  const r = await db.query(sql);
  return r.rows;
}

// 心跳：每 60 秒 ping 一次数据库（防止云数据库休眠，也让服务及时发现连接断开）
async function ping() {
  if (driver === 'sqlite') return;
  try { await db.query('SELECT 1'); } catch (e) { console.error('[db] 心跳失败：', e.message); }
}

// 相关文章：同标签的其他文章
async function relatedPosts(id, tag, limit) {
  const n = Number(limit || 3);
  const sql = "SELECT id, title, tag, date, cover, cover_url FROM posts WHERE tag = ? AND id != ? ORDER BY id DESC LIMIT " + n;
  if (driver === 'sqlite') return db.prepare(sql).all(tag, id);
  const r = await db.query(
    'SELECT id, title, tag, date, cover, cover_url FROM posts WHERE tag = $1 AND id != $2 ORDER BY id DESC LIMIT ' + n,
    [tag, id]
  );
  return r.rows;
}

// 上一篇 / 下一篇（按 id 相邻）
async function neighbors(id) {
  const get = async (sqliteSql, pgSql, args) =>
    driver === 'sqlite'
      ? db.prepare(sqliteSql).get(...args) || null
      : (await db.query(pgSql, args)).rows[0] || null;
  const prev = await get(
    'SELECT id, title, date FROM posts WHERE id < ? ORDER BY id DESC LIMIT 1',
    'SELECT id, title, date FROM posts WHERE id < $1 ORDER BY id DESC LIMIT 1',
    [id]);
  const next = await get(
    'SELECT id, title, date FROM posts WHERE id > ? ORDER BY id ASC LIMIT 1',
    'SELECT id, title, date FROM posts WHERE id > $1 ORDER BY id ASC LIMIT 1',
    [id]);
  return { prev, next };
}

module.exports = {
  listPosts, getPost, incrementViews, insertPost, updatePost, deletePost, incrementLikes, stats,
  listComments, insertComment, deleteComment, hotPosts, archive, adminStats, allComments, ping,
  relatedPosts, neighbors
};
