// ═══════════════════════════════════════════════════
// app.js —— 前端逻辑（数据流：前端 fetch → 后端 API → SQLite）
// 页面切换 + 文章渲染 + 写文章 + 点赞，全在这里。
// ═══════════════════════════════════════════════════

// ── 工具函数：发请求 ──
async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ── Toast 提示 ──
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ── 页面切换 ──
function go(view) {
  ['home', 'about', 'admin', 'detail'].forEach(v => {
    document.getElementById('view-' + v).hidden = v !== view;
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === view || (view === 'detail' && b.dataset.nav === 'home'));
  });
  window.scrollTo(0, 0);
}

function scrollToPosts() {
  document.getElementById('posts').scrollIntoView({ behavior: 'smooth' });
}

// ── 首页：统计 + 文章列表 ──
async function loadStats() {
  try {
    const s = await api('/api/stats');
    document.getElementById('stat-posts').textContent = s.postCount;
    document.getElementById('stat-chars').textContent = s.totalChars;
    document.getElementById('stat-likes').textContent = s.totalLikes;
    document.getElementById('stat-views').textContent = s.totalViews;
  } catch (e) { toast('统计加载失败：' + e.message); }
}

async function loadPosts() {
  try {
    const { posts } = await api('/api/posts');
    const grid = document.getElementById('post-grid');
    grid.innerHTML = '';

    if (posts.length === 0) {
      document.getElementById('empty-state').hidden = false;
      return;
    }
    document.getElementById('empty-state').hidden = true;

    posts.forEach(p => {
      const card = document.createElement('button');
      card.className = 'post-card';
      card.innerHTML =
        '<div class="post-cover cover-' + p.cover + '">' +
          '<span class="pill">' + escapeHtml(p.tag || '未分类') + '</span>' +
        '</div>' +
        '<div class="post-body">' +
          '<div class="post-date">' + escapeHtml(p.date) + '</div>' +
          '<div class="post-title">' + escapeHtml(p.title) + '</div>' +
          '<div class="post-excerpt">' + escapeHtml(p.excerpt || '') + '</div>' +
        '</div>' +
        '<div class="post-meta"><span>♥ ' + p.likes + '</span><span>阅读 ' + p.views + '</span></div>';
      card.addEventListener('click', () => openPost(p.id));
      grid.appendChild(card);
    });
  } catch (e) {
    toast('文章加载失败：' + e.message);
    document.getElementById('empty-state').hidden = false;
    document.getElementById('empty-state').innerHTML =
      '<p>加载失败：' + escapeHtml(e.message) + '</p><button class="btn-primary" onclick="loadPosts()">重试</button>';
  }
}

// ── 文章详情 ──
let currentPostId = null;

async function openPost(id) {
  currentPostId = id;
  const box = document.getElementById('detail-box');
  box.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  go('detail');
  try {
    const { post } = await api('/api/posts/' + id);
    const paras = (post.content || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    box.innerHTML =
      '<article class="detail-card">' +
        '<div class="detail-meta">' +
          '<span>' + escapeHtml(post.date) + '</span>' +
          '<span>' + escapeHtml(post.tag || '未分类') + '</span>' +
          '<span>阅读 ' + post.views + '</span>' +
        '</div>' +
        '<h1 class="detail-title">' + escapeHtml(post.title) + '</h1>' +
        '<div class="detail-body">' +
          paras.map(p => '<p>' + escapeHtml(p) + '</p>').join('') +
        '</div>' +
        '<div class="like-row">' +
          '<button class="like-btn" id="like-btn" onclick="likePost(' + post.id + ')">' +
            '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.3 8.3 2.4 4.5 6.2 4.5c2.2 0 4.3 1.2 5.8 3.1 1.5-1.9 3.6-3.1 5.8-3.1 3.8 0 5.9 3.8 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>' +
            '<span id="like-count">' + post.likes + '</span>' +
          '</button>' +
        '</div>' +
        '<div class="comments">' +
          '<h3 class="comments-title">评论 <span class="comments-count" id="comment-count"></span></h3>' +
          '<div class="comment-list" id="comment-list"><div class="skeleton" style="height:60px"></div></div>' +
          '<div class="comment-form">' +
            '<input id="c-author" placeholder="昵称（可留空，默认匿名）" maxlength="20">' +
            '<textarea id="c-content" rows="3" placeholder="说点什么……（最多 500 字）" maxlength="500"></textarea>' +
            '<button class="btn-primary" id="c-submit" onclick="submitComment(' + post.id + ')">发表评论</button>' +
          '</div>' +
        '</div>' +
        '<div class="detail-admin">' +
          '<button onclick="deletePost(' + post.id + ')">删除这篇文章</button>' +
        '</div>' +
      '</article>';
    loadComments(post.id);
  } catch (e) {
    box.innerHTML = '<p class="empty-state" style="padding:40px 0">文章不存在或加载失败：' + escapeHtml(e.message) + '</p>';
  }
}

// ── 点赞：前端 → POST /api/posts/:id/like → 数据库 +1 → 更新数字 ──
async function likePost(id) {
  try {
    const r = await api('/api/posts/' + id + '/like', { method: 'POST' });
    document.getElementById('like-count').textContent = r.likes;
    const btn = document.getElementById('like-btn');
    btn.classList.add('liked');
    setTimeout(() => btn.classList.remove('liked'), 400);
  } catch (e) { toast('点赞失败：' + e.message); }
}

// ── 删文章（需令牌） ──
async function deletePost(id) {
  if (!confirm('确定删除这篇文章吗？删了就没了。')) return;
  try {
    await api('/api/posts/' + id, { method: 'DELETE', headers: authHeaders() });
    toast('已删除');
    go('home');
    loadPosts();
    loadStats();
  } catch (e) {
    if (e.message.includes('令牌')) { askToken(() => deletePost(id)); }
    else toast('删除失败：' + e.message);
  }
}

// ── 写文章：前端 → POST /api/posts → 数据库插入 → 回首页刷新 ──
async function submitPost() {
  const title = document.getElementById('f-title').value.trim();
  const content = document.getElementById('f-content').value.trim();
  const err = document.getElementById('form-error');

  // 表单校验：标题、正文必填
  if (!title || !content) {
    err.textContent = '标题和正文不能为空';
    err.hidden = false;
    return;
  }
  err.hidden = true;

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '发布中…';

  const body = {
    title,
    tag: document.getElementById('f-tag').value.trim(),
    date: document.getElementById('f-date').value.trim(),
    excerpt: document.getElementById('f-excerpt').value.trim(),
    content
  };

  try {
    await api('/api/posts', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    toast('发布成功！');
    clearForm();
    btn.disabled = false;
    btn.textContent = '发布';
    go('home');
    loadPosts();
    loadStats();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '发布';
    if (e.message.includes('令牌')) {
      err.textContent = '';
      askToken(submitPost);   // 没令牌 → 弹窗要令牌 → 拿到后重试
    } else {
      err.textContent = '发布失败：' + e.message;
      err.hidden = false;
    }
  }
}

function clearForm() {
  ['f-title', 'f-tag', 'f-date', 'f-excerpt', 'f-content'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const err = document.getElementById('form-error');
  err.hidden = true;
}

// ── 管理员令牌管理（存在浏览器 localStorage） ──
const TOKEN_KEY = 'blog_admin_token';

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-token': getToken() };
}

function askToken(retry) {
  document.getElementById('token-modal').hidden = false;
  document.getElementById('token-input').value = '';
  window.__tokenRetry = retry;
  setTimeout(() => document.getElementById('token-input').focus(), 50);
}

function saveToken() {
  const v = document.getElementById('token-input').value.trim();
  if (!v) { toast('令牌不能为空'); return; }
  localStorage.setItem(TOKEN_KEY, v);
  closeTokenModal();
  toast('令牌已保存');
  if (typeof window.__tokenRetry === 'function') window.__tokenRetry();
}

function closeTokenModal() { document.getElementById('token-modal').hidden = true; }

// ── 防 XSS：把用户输入的 < > & 转义，避免内容破坏页面 ──
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ── 评论：列表 / 发表 / 删除 ──
async function loadComments(postId) {
  const list = document.getElementById('comment-list');
  if (!list) return;
  try {
    const { comments } = await api('/api/posts/' + postId + '/comments');
    document.getElementById('comment-count').textContent = comments.length ? '(' + comments.length + ')' : '';
    list.innerHTML = '';

    if (comments.length === 0) {
      list.innerHTML = '<p class="comment-empty">还没有评论，来抢沙发。</p>';
      return;
    }

    const isAdmin = !!getToken();   // 记住过令牌才显示删除按钮
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML =
        '<div class="comment-head">' +
          '<span class="comment-author">' + escapeHtml(c.author || '匿名') + '</span>' +
          '<span class="comment-time">' + escapeHtml(fmtTime(c.created_at)) + '</span>' +
          (isAdmin ? '<button class="comment-del" onclick="deleteComment(' + c.id + ',' + postId + ')">删除</button>' : '') +
        '</div>' +
        '<div class="comment-body">' + escapeHtml(c.content) + '</div>';
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = '<p class="comment-empty">评论加载失败：' + escapeHtml(e.message) + '</p>';
  }
}

async function submitComment(postId) {
  const content = document.getElementById('c-content').value.trim();
  const author = document.getElementById('c-author').value.trim();

  // 前端校验
  if (!content) { toast('评论内容不能为空'); return; }

  const btn = document.getElementById('c-submit');
  btn.disabled = true;
  btn.textContent = '发表中…';
  try {
    await api('/api/posts/' + postId + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content })
    });
    document.getElementById('c-content').value = '';
    toast('评论已发布');
    loadComments(postId);
  } catch (e) {
    toast('发表失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '发表评论';
  }
}

async function deleteComment(commentId, postId) {
  if (!confirm('删除这条评论？')) return;
  try {
    await api('/api/comments/' + commentId, { method: 'DELETE', headers: authHeaders() });
    toast('评论已删除');
    loadComments(postId);
  } catch (e) {
    if (e.message.includes('令牌')) { askToken(() => deleteComment(commentId, postId)); }
    else toast('删除失败：' + e.message);
  }
}

// 时间格式化：数据库给的是 "2026-08-12 22:41:00" 或 ISO 格式，统一取前 16 位
function fmtTime(t) {
  if (!t) return '';
  return String(t).slice(0, 16).replace('T', ' ');
}

// ── 启动 ──
document.getElementById('admin-form').addEventListener('submit', e => {
  e.preventDefault();
  submitPost();
});
loadStats();
loadPosts();
