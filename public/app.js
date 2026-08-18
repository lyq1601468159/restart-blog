// ═══════════════════════════════════════════════════
// app.js —— 重启日志 前端逻辑（全功能版）
// 数据流：前端 fetch → 后端 API → SQLite/Postgres → 渲染
// ═══════════════════════════════════════════════════

// ── 状态 ──
let POSTS = [];
let query = '';
let filterTag = '';
let sortMode = 'date';   // date | likes | views
let editId = null;       // 正在编辑的文章 id
let currentPostId = null;
let HEADINGS = [];       // 当前文章的目录结构（由正文标题生成）
let hasMorePosts = false;

// ── 工具 ──
async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function fmtTime(t) { return t ? String(t).slice(0, 16).replace('T', ' ') : ''; }

// ── 主题切换 ──
function initTheme() {
  const saved = localStorage.getItem('blog-theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  syncThemeIcons();
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('blog-theme', document.documentElement.dataset.theme);
  syncThemeIcons();
}
function syncThemeIcons() {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.getElementById('icon-moon').hidden = dark;
  document.getElementById('icon-sun').hidden = !dark;
}

// ── 页面切换 ──
function go(view, tab) {
  ['home', 'post', 'tag', 'timeline', 'checkin', 'guestbook', 'portfolio', 'about', 'admin'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.hidden = v !== view;
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === view || ((view === 'post' || view === 'tag') && b.dataset.nav === 'home'));
  });
  if (view === 'timeline') renderTimeline();
  if (view === 'checkin') renderCheckin();
  if (view === 'guestbook') renderGuestbook();
  if (view === 'portfolio') renderPortfolio();
  if (view === 'admin') adminTab(tab || 'write');
  if (view === 'home' && location.hash) location.hash = '';
  window.scrollTo(0, 0);
}
function scrollToPosts() {
  document.querySelector('.toolbar').scrollIntoView({ behavior: 'smooth' });
}

// ── 搜索 / 筛选 / 排序 ──
function setQuery(v) { query = v.trim(); renderFeed(); }
function setFilter(tag) { filterTag = tag; renderSidebar(); renderFeed(); }
function sortBy(mode) {
  sortMode = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === mode));
  renderFeed();
}

// ── 加载 ──
async function loadStats() {
  try {
    const s = await api('/api/stats');
    animateNum(document.getElementById('s-posts'), s.postCount);
    animateNum(document.getElementById('s-chars'), s.totalChars);
    animateNum(document.getElementById('s-likes'), s.totalLikes);
    animateNum(document.getElementById('s-views'), s.totalViews);
    document.getElementById('side-stats').innerHTML =
      '<span><b>' + s.postCount + '</b> 篇文章</span>' +
      '<span><b>' + s.totalChars + '</b> 字</span>' +
      '<span><b>' + s.totalLikes + '</b> 点赞 · <b>' + s.totalViews + '</b> 阅读</span>';
  } catch (e) { /* 忽略 */ }
}

// 数字滚动动画
function animateNum(el, n) {
  if (!el) return;
  const dur = 700, t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(n * (p * (2 - p)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function loadPosts() {
  try {
    const { posts, hasMore } = await api('/api/posts?limit=6&offset=0');
    POSTS = posts;
    hasMorePosts = hasMore;
    document.getElementById('load-more-wrap').hidden = !hasMore;
    // 动态填充筛选下拉框
    const tags = [...new Set(posts.map(p => p.tag).filter(Boolean))];
    const sel = document.getElementById('filter-select');
    sel.innerHTML = '<option value="">全部标签</option>' +
      tags.map(t => '<option' + (t === filterTag ? ' selected' : '') + '>' + escapeHtml(t) + '</option>').join('');
    renderFeed();
    renderSidebar();
  } catch (e) {
    document.getElementById('post-grid').innerHTML = '';
    document.getElementById('empty-state').hidden = false;
    document.getElementById('empty-state').innerHTML =
      '<p>加载失败：' + escapeHtml(e.message) + '</p><button class="btn-primary" onclick="loadPosts()">重试</button>';
  }
}

async function loadMore() {
  const btn = document.getElementById('load-more-btn');
  btn.disabled = true;
  btn.textContent = '加载中…';
  try {
    const { posts, hasMore } = await api('/api/posts?limit=6&offset=' + POSTS.length);
    POSTS = POSTS.concat(posts);
    hasMorePosts = hasMore;
    document.getElementById('load-more-wrap').hidden = !hasMore;
    renderFeed();
    observeReveals(document.getElementById('post-grid'));
  } catch (e) { toast('加载失败：' + e.message); }
  finally { btn.disabled = false; btn.textContent = '加载更多文章'; }
}

// ── 视图切换：卡片 / 列表 ──
function toggleView() {
  const grid = document.getElementById('post-grid');
  const listMode = grid.classList.toggle('list-view');
  localStorage.setItem('blog-view', listMode ? 'list' : 'card');
}

// ── 沉浸阅读 ──
function toggleImmersive() {
  document.body.classList.toggle('immersive');
  window.scrollTo(0, 0);
}

// ── 复制 Markdown 原文 ──
function copyMarkdown() {
  if (!window.__currentContent) { toast('没有可复制的内容'); return; }
  navigator.clipboard.writeText(window.__currentContent).then(
    () => toast('Markdown 原文已复制'),
    () => toast('复制失败，请手动选择复制')
  );
}

// 搜索高亮
function highlight(s) {
  let out = escapeHtml(s);
  if (query) {
    const re = new RegExp(escapeRegExp(escapeHtml(query)), 'gi');
    out = out.replace(re, m => '<mark>' + m + '</mark>');
  }
  return out;
}

// ── 渲染：文章列表 ──
function renderFeed() {
  const grid = document.getElementById('post-grid');
  grid.innerHTML = '';
  let list = POSTS.filter(p => {
    if (query && !(p.title + ' ' + (p.excerpt || '')).toLowerCase().includes(query.toLowerCase())) return false;
    if (filterTag && p.tag !== filterTag) return false;
    return true;
  });
  list = [...list].sort((a, b) =>
    sortMode === 'likes' ? b.likes - a.likes : sortMode === 'views' ? b.views - a.views : b.id - a.id
  );
  document.getElementById('empty-state').hidden = list.length > 0;
  if (!list.length) return;

  list.forEach((p, i) => {
    const card = document.createElement('button');
    card.className = 'post-card reveal';
    card.style.animationDelay = (i * 60) + 'ms';
    card.innerHTML =
      '<div class="post-cover cover-' + p.cover + (p.cover_url ? ' has-img' : '') + '"' + (p.cover_url ? ' style="background-image:url(\'' + p.cover_url + '\')"' : '') + '><span class="pill" onclick="event.stopPropagation();goTag(\'' + escapeHtml(p.tag || '未分类') + '\')">' + escapeHtml(p.tag || '未分类') + '</span>' + (p.cover_url ? '<span class="cover-inner-title">' + escapeHtml(p.title) + '</span>' : '') + '</div>' +
      '<div class="post-body">' +
        '<div class="post-date">' + escapeHtml(p.date) + ' · 阅读 ' + p.views + '</div>' +
        '<div class="post-title">' + highlight(p.title) + '</div>' +
        '<div class="post-excerpt">' + highlight(p.excerpt || '') + '</div>' +
        '<div class="post-meta">' +
          '<span><svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 14.5C4.6 12.2 1.5 9.8 1.5 6.6 1.5 4.6 3.1 3 5.1 3c1.2 0 2.3.6 2.9 1.6C8.6 3.6 9.7 3 10.9 3c2 0 3.6 1.6 3.6 3.6 0 3.2-3.1 5.6-6.5 7.9Z"/></svg>' + p.likes + '</span>' +
          '<span><svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 3.5C4.9 3.5 2.3 5.7 1.4 8c.9 2.3 3.5 4.5 6.6 4.5s5.7-2.2 6.6-4.5c-.9-2.3-3.5-4.5-6.6-4.5Zm0 7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>阅读 ' + p.views + '</span>' +
        '</div>' +
      '</div>';
    card.addEventListener('click', () => openPost(p.id));
    grid.appendChild(card);
  });
  observeReveals(grid);
}

// ── 渲染：侧边栏 ──
async function renderSidebar() {
  // 热门
  try {
    const { posts: hot } = await api('/api/hot');
    document.getElementById('side-hot').innerHTML = hot.length
      ? hot.map((p, i) =>
          '<div class="hot-item" onclick="openPost(' + p.id + ')">' +
            '<span class="hot-rank">' + (i + 1) + '</span>' +
            '<span class="hot-title">' + escapeHtml(p.title) + '</span>' +
            '<span class="hot-meta">♥' + p.likes + '</span>' +
          '</div>').join('')
      : '<p class="comment-empty">还没有数据</p>';
  } catch (e) { /* 忽略 */ }
  // 归档
  try {
    const { months } = await api('/api/archive');
    document.getElementById('side-archive').innerHTML = months.length
      ? months.map(m =>
          '<button class="tag-chip" onclick="setFilter(\'' + m.month + '\')">' + escapeHtml(m.month) + '（' + m.n + '）</button>'
        ).join('')
      : '<p class="comment-empty">暂无</p>';
  } catch (e) { /* 忽略 */ }
  // 最新评论
  try {
    const { comments } = await api('/api/recent-comments');
    const box = document.getElementById('side-recent');
    box.innerHTML = comments.length ? comments.map(c =>
      '<div class="rc-item" onclick="openPost(' + (c.post_id || 1) + ')">' +
        '<div class="rc-head"><b>' + escapeHtml(c.author || '匿名') + '</b> 评论了《' + escapeHtml(c.post_title || '文章') + '》</div>' +
        '<div class="rc-text">' + escapeHtml(c.content) + '</div>' +
      '</div>').join('') : '<p class="comment-empty">还没有评论</p>';
  } catch (e) { /* 忽略 */ }
  // 标签云（点击进独立标签页）
  const tags = [...new Set(POSTS.map(p => p.tag).filter(Boolean))];
  document.getElementById('side-tags').innerHTML = tags.map(t =>
    '<button class="tag-chip' + (t === filterTag ? ' active' : '') + '" onclick="goTag(\'' + t + '\')">' + escapeHtml(t) + '</button>'
  ).join('') || '<p class="comment-empty">暂无</p>';
}

// ── 标签独立页 ──
function goTag(tag) {
  filterTag = tag;
  renderTagView();
  go('tag');
}
function renderTagView() {
  const grid = document.getElementById('tag-grid');
  const list = POSTS.filter(p => p.tag === filterTag);
  document.getElementById('tag-title').textContent = filterTag;
  document.getElementById('tag-count').textContent = '共 ' + list.length + ' 篇';
  document.getElementById('tag-empty').hidden = list.length > 0;
  grid.innerHTML = '';
  list.forEach(p => {
    const card = document.createElement('button');
    card.className = 'post-card reveal';
    card.innerHTML =
      '<div class="post-cover cover-' + p.cover + (p.cover_url ? ' has-img' : '') + '"' + (p.cover_url ? ' style="background-image:url(\'' + p.cover_url + '\')"' : '') + '><span class="pill">' + escapeHtml(p.tag || '未分类') + '</span>' + (p.cover_url ? '<span class="cover-inner-title">' + escapeHtml(p.title) + '</span>' : '') + '</div>' +
      '<div class="post-body">' +
        '<div class="post-date">' + escapeHtml(p.date) + ' · 阅读 ' + p.views + '</div>' +
        '<div class="post-title">' + escapeHtml(p.title) + '</div>' +
        '<div class="post-excerpt">' + escapeHtml(p.excerpt || '') + '</div>' +
        '<div class="post-meta"><span>♥ ' + p.likes + '</span><span>阅读 ' + p.views + '</span></div>' +
      '</div>';
    card.addEventListener('click', () => openPost(p.id));
    grid.appendChild(card);
  });
  observeReveals(grid);
}

// ── 轻量 Markdown 渲染 ──
function inlineMd(s) {
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
function mdToHtml(text) {
  const lines = String(text).split(/\r?\n/);
  let out = [], i = 0, inCode = false, codeBuf = [], para = [];
  HEADINGS = [];   // 每次渲染重置目录
  const flushPara = () => {
    if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith('```')) {
      flushPara();
      if (!inCode) { inCode = true; codeBuf = []; }
      else { out.push('<div class="code-wrap"><button class="code-copy" onclick="copyCode(this)">复制</button><pre>' + escapeHtml(codeBuf.join('\n')) + '</pre></div>'); inCode = false; }
    } else if (inCode) {
      codeBuf.push(line);
    } else if (/^#{1,3}\s+/.test(t)) {
      flushPara();
      const level = t.match(/^#+/)[0].length;
      const tag = level > 2 ? 3 : 2;
      const text = inlineMd(t.replace(/^#+\s+/, ''));
      const id = 'sec-' + HEADINGS.length;
      HEADINGS.push({ id, text, level });
      out.push('<h' + tag + ' id="' + id + '">' + text + '</h' + tag + '>');
    } else if (/^>\s?/.test(t)) {
      flushPara();
      out.push('<blockquote>' + inlineMd(t.replace(/^>\s?/, '')) + '</blockquote>');
    } else if (/^-\s+/.test(t)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push('<li>' + inlineMd(lines[i].trim().replace(/^-\s+/, '')) + '</li>');
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>');
    } else if (/^!\[(.*?)\]\((.+?)\)$/.test(t)) {
      flushPara();
      const m = t.match(/^!\[(.*?)\]\((.+?)\)$/);
      out.push('<img src="' + m[2] + '" alt="' + m[1] + '" loading="lazy">');
    } else if (t === '') {
      flushPara();
    } else {
      para.push(inlineMd(line));
    }
    i++;
  }
  flushPara();
  if (inCode) out.push('<div class="code-wrap"><button class="code-copy" onclick="copyCode(this)">复制</button><pre>' + escapeHtml(codeBuf.join('\n')) + '</pre></div>');
  return out.join('');
}

// ── 文章详情 ──
async function openPost(id) {
  currentPostId = id;
  const box = document.getElementById('post-box');
  box.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  go('post');
  if (location.hash !== '#post-' + id) location.hash = 'post-' + id;
  try {
    const { post } = await api('/api/posts/' + id);
    const minutes = Math.max(1, Math.round((post.content || '').length / 400));
    const isAdmin = true; // 令牌验证已关闭，管理按钮常显
    box.innerHTML =
      '<article class="post-article">' +
        (post.cover_url ? '<img class="detail-cover" src="' + post.cover_url + '" alt="' + escapeHtml(post.title) + '" onerror="this.remove()">' : '') +
        '<div class="post-meta-row">' +
          '<span>' + escapeHtml(post.date) + '</span>' +
          '<span>' + escapeHtml(post.tag || '未分类') + '</span>' +
          '<span>约 ' + minutes + ' 分钟</span>' +
          '<span>阅读 ' + post.views + '</span>' +
        '</div>' +
        '<h1 class="post-title-big">' + escapeHtml(post.title) + '</h1>' +
        '<div class="post-content">' + mdToHtml(post.content) + '</div>' +
        '<div class="post-footer">' +
          '<button class="star-btn" id="star-btn" onclick="likePost(' + post.id + ')">' +
            '<svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>' +
            '<span id="star-count">点赞 ' + post.likes + '</span>' +
          '</button>' +
          '<button class="tool-btn" onclick="copyLink(' + post.id + ')">复制链接</button>' +
          '<button class="tool-btn" onclick="copyMarkdown()">复制原文</button>' +
          '<button class="tool-btn" onclick="downloadMd()">下载原文</button>' +
          '<button class="tool-btn" onclick="toggleSpeak()">听一听</button>' +
          '<button class="tool-btn" onclick="toggleImmersive()">沉浸阅读</button>' +
          '<button class="tool-btn" onclick="window.print()">打印本文</button>' +
          '<button class="tool-btn" onclick="fontSize(-1)" title="减小字号">A−</button>' +
          '<button class="tool-btn" onclick="fontSize(1)" title="增大字号">A+</button>' +
          (isAdmin
            ? '<button class="tool-btn" onclick="editPost(' + post.id + ')">编辑</button>' +
              '<button class="tool-btn" style="color:var(--accent-4)" onclick="deletePost(' + post.id + ')">删除</button>'
            : '') +
        '</div>' +
        '<div class="comments">' +
          '<h3 class="comments-title">评论 <span class="comments-count" id="comment-count"></span></h3>' +
          '<div id="comment-list"><div class="skeleton" style="height:50px"></div></div>' +
          '<div class="comment-form">' +
            '<input id="c-author" placeholder="昵称（可留空，默认匿名）" maxlength="20">' +
            '<textarea id="c-content" rows="3" placeholder="说点什么……（最多 500 字）" maxlength="500"></textarea>' +
            '<p class="replying-hint" id="replying-hint" hidden></p>' +
            '<button class="btn-primary" id="c-submit" style="align-self:flex-start" onclick="submitComment(' + post.id + ')">发表评论</button>' +
          '</div>' +
        '</div>' +
        '<div class="author-signoff">' +
          '<div class="as-avatar">R</div>' +
          '<div><div class="as-name">重启日志</div>' +
          '<div class="as-bio">Backend Developer · 退伍兵 · 自学全栈中</div></div>' +
          '<button class="follow-btn" onclick="go(\'guestbook\')">Follow Me</button>' +
        '</div>' +
      '</article>';
    window.__currentContent = post.content;
    // 段落共鸣按钮
    let pi = 0;
    box.querySelectorAll('.post-content p').forEach(p => {
      p.setAttribute('data-para', pi);
      const row = document.createElement('div');
      row.className = 'resonate-row';
      row.innerHTML = '<button class="resonate-btn" data-para="' + pi + '" onclick="resonate(' + post.id + ',' + pi + ',this)">共鸣 <span>0</span></button>';
      p.after(row);
      pi++;
    });
    loadResonances(post.id);
    loadComments(post.id);
    buildToc();
    loadNeighbors(post.id);
    loadRelated(post.id);
    bindLightbox();
    updateSEO(post);
    const fs = parseFloat(localStorage.getItem('blog-fontsize'));
    if (fs) box.querySelector('.post-content').style.fontSize = fs + 'px';
    loadStats();
  } catch (e) {
    box.innerHTML = '<div class="post-article"><p class="empty-state">文章不存在或加载失败：' + escapeHtml(e.message) + '</p></div>';
  }
}

async function likePost(id) {
  try {
    const r = await api('/api/posts/' + id + '/like', { method: 'POST' });
    document.getElementById('star-count').textContent = '点赞 ' + r.likes;
    const btn = document.getElementById('star-btn');
    btn.classList.add('starred');
    setTimeout(() => btn.classList.remove('starred'), 450);
    loadStats();
  } catch (e) { toast('点赞失败：' + e.message); }
}

function copyLink(id) {
  const url = location.origin + location.pathname + '#post-' + id;
  navigator.clipboard.writeText(url).then(
    () => toast('链接已复制：' + url),
    () => toast('复制失败，地址是：' + url)
  );
}

// ── 目录 / 上一篇下一篇 / 相关文章 ──
function buildToc() {
  const box = document.getElementById('toc-box');
  if (!box) return;
  if (!HEADINGS.length) { box.hidden = true; return; }
  box.innerHTML = '<div class="toc-title">目录</div>' +
    HEADINGS.map(h => '<a href="#' + h.id + '" class="' + (h.level > 2 ? 'lv3' : '') + '" data-toc="' + h.id + '">' + h.text + '</a>').join('');
  box.hidden = false;
  box.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(a.dataset.toc).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  // 滚动时高亮当前章节
  const links = [...box.querySelectorAll('a')];
  const onScrollToc = () => {
    let cur = null;
    HEADINGS.forEach(h => {
      const el = document.getElementById(h.id);
      if (el && el.getBoundingClientRect().top <= 130) cur = h.id;
    });
    links.forEach(l => l.classList.toggle('active', l.dataset.toc === cur));
  };
  window.removeEventListener('scroll', onScrollToc);
  window.addEventListener('scroll', onScrollToc, { passive: true });
}

async function loadNeighbors(id) {
  try {
    const nb = await api('/api/posts/' + id + '/neighbors');
    window.__neighbors = nb;   // 供键盘 ← → 快捷键使用
    const { prev, next } = nb;
    const box = document.getElementById('post-box');
    box.insertAdjacentHTML('beforeend',
      '<div class="prevnext">' +
      (prev ? '<a href="#" onclick="openPost(' + prev.id + ');return false"><div class="pn-label">← 上一篇</div><div class="pn-title">' + escapeHtml(prev.title) + '</div></a>' : '<span></span>') +
      (next ? '<a class="next" href="#" onclick="openPost(' + next.id + ');return false"><div class="pn-label">下一篇 →</div><div class="pn-title">' + escapeHtml(next.title) + '</div></a>' : '<span></span>') +
      '</div>');
  } catch (e) { /* 忽略 */ }
}

async function loadRelated(id) {
  try {
    const { posts } = await api('/api/posts/' + id + '/related');
    if (!posts.length) return;
    const box = document.getElementById('post-box');
    box.insertAdjacentHTML('beforeend',
      '<div class="related"><div class="related-title">相关阅读</div><div class="related-grid">' +
      posts.map(p =>
        '<button class="related-card" onclick="openPost(' + p.id + ')">' +
          '<div class="rc-date">' + escapeHtml(p.date) + '</div>' +
          '<div class="rc-title">' + escapeHtml(p.title) + '</div>' +
        '</button>').join('') +
      '</div></div>');
  } catch (e) { /* 忽略 */ }
}

// ── 阅读细节：灯箱 / 复制代码 / 字号 ──
function bindLightbox() {
  document.querySelectorAll('#post-box .post-content img').forEach(img => {
    img.addEventListener('click', () => showLightbox(img.src, img.alt));
  });
}
function showLightbox(src, alt) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<img src="' + src + '" alt="' + escapeHtml(alt || '') + '">' +
    (alt ? '<div class="lb-cap">' + escapeHtml(alt) + '</div>' : '');
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}
function copyCode(btn) {
  const pre = btn.parentElement.querySelector('pre');
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制'; }, 1500);
  }, () => toast('复制失败，请手动选择复制'));
}
function fontSize(d) {
  const el = document.querySelector('.post-content');
  if (!el) return;
  const cur = parseFloat(el.style.fontSize) || 15.5;
  const next = Math.min(18, Math.max(13.5, cur + d));
  el.style.fontSize = next + 'px';
  localStorage.setItem('blog-fontsize', String(next));
}

// ── 站点设置 ──
function applySettings(s) {
  window.__siteName = s.site_name;
  document.title = s.site_name + ' · ' + s.site_tagline;
  const sub = document.getElementById('hero-sub');
  if (sub) typewriter(sub, s.site_tagline);
  const nb = document.getElementById('notice-bar');
  if (nb) {
    if (s.site_notice && localStorage.getItem('blog-notice-closed') !== '1') {
      document.getElementById('notice-text').textContent = s.site_notice;
      nb.hidden = false;
    } else { nb.hidden = true; }
  }
  const ft = document.getElementById('footer-text');
  if (ft) ft.textContent = s.site_footer;
  // 重启天数计数器
  const dc = document.getElementById('day-counter');
  if (dc && s.start_date) {
    const d0 = new Date(s.start_date + 'T00:00:00');
    if (!isNaN(d0.getTime())) {
      const days = Math.max(1, Math.floor((Date.now() - d0.getTime()) / 86400000) + 1);
      dc.textContent = '重启第 ' + days + ' 天 · A VETERAN\'S CODING DIARY · 2026';
    }
  }
  document.documentElement.style.setProperty('--accent', s.site_accent);
}
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    window.__settings = s;
    applySettings(s);
    const g = id => document.getElementById(id);
    if (g('set-name')) g('set-name').value = s.site_name;
    if (g('set-tagline')) g('set-tagline').value = s.site_tagline;
    if (g('set-accent')) g('set-accent').value = s.site_accent;
    if (g('set-footer')) g('set-footer').value = s.site_footer;
    if (g('set-notice')) g('set-notice').value = s.site_notice || '';
    if (g('set-start-date')) g('set-start-date').value = s.start_date || '';
  } catch (e) { /* 忽略 */ }
}
async function saveSettings() {
  const body = {
    site_name: document.getElementById('set-name').value.trim() || '重启日志',
    site_tagline: document.getElementById('set-tagline').value.trim(),
    site_accent: document.getElementById('set-accent').value,
    site_footer: document.getElementById('set-footer').value.trim(),
    site_notice: document.getElementById('set-notice').value.trim(),
    start_date: document.getElementById('set-start-date').value.trim() || '2026-08-09'
  };
  try {
    const s = await api('/api/settings', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    applySettings(s);
    toast('设置已保存，全站生效');
  } catch (e) { toast('保存失败：' + e.message); }
}

// ── SEO：分享卡片 ──
function updateSEO(post) {
  document.title = post.title + ' · ' + (window.__siteName || '重启日志');
  document.querySelector('meta[name="description"]').setAttribute('content', post.excerpt || '');
  document.querySelector('meta[property="og:title"]').setAttribute('content', post.title);
  document.querySelector('meta[property="og:description"]').setAttribute('content', post.excerpt || '');
}

// ── 创新功能：时间线 / 打卡 / 留言簿 / 共鸣 / 朗读 / 下载 / 夜跑 ──
async function renderTimeline() {
  const box = document.getElementById('timeline-box');
  try {
    const { start_date, posts } = await api('/api/timeline');
    const d0 = new Date(start_date + 'T00:00:00');
    const dayN = Math.max(1, Math.floor((Date.now() - d0.getTime()) / 86400000) + 1);
    const milestones = [
      { day: 1, label: '拿到《重启手册》，写下第一行字' },
      { day: 7, label: '第一个网站上线，学会 Ctrl+S' },
      { day: 30, label: '坚持 30 天（尚未到达）' },
      { day: 100, label: '100 天挑战（尚未到达）' }
    ];
    const nodes = [];
    nodes.push('<div class="tl-node"><span class="tl-dot milestone"></span><div class="tl-card"><div class="tl-date">' + escapeHtml(start_date) + ' · 起点</div><div class="tl-title">从躺平到站直的第 0 天</div><div class="tl-desc">那一天，我决定不再躺下去。</div></div></div>');
    milestones.forEach(m => {
      if (m.day <= dayN) {
        nodes.push('<div class="tl-node"><span class="tl-dot milestone"></span><div class="tl-card"><div class="tl-date">重启第 ' + m.day + ' 天</div><div class="tl-title">' + escapeHtml(m.label) + '</div></div></div>');
      }
    });
    [...posts].sort((a, b) => (a.date > b.date ? 1 : -1)).forEach(p => {
      nodes.push('<div class="tl-node"><span class="tl-dot"></span><div class="tl-card"><div class="tl-date">' + escapeHtml(p.date) + ' · 文章</div><div class="tl-title" onclick="openPost(' + p.id + ')">' + escapeHtml(p.title) + '</div></div></div>');
    });
    nodes.push('<div class="tl-node"><span class="tl-dot milestone"></span><div class="tl-card"><div class="tl-date">今天 · 重启第 ' + dayN + ' 天</div><div class="tl-title">故事还在继续</div><div class="tl-desc">下一篇文章，等你来写。</div></div></div>');
    box.innerHTML = '<div class="timeline">' + nodes.join('') + '</div>';
    document.getElementById('tl-kicker').textContent = 'TIMELINE · 重启第 ' + dayN + ' 天';
  } catch (e) { box.innerHTML = '<p class="empty-state">加载失败：' + escapeHtml(e.message) + '</p>'; }
}

let ckState = { date: '', run: false, code: false, write: false };
async function renderCheckin() {
  const now = new Date();
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const today = month + '-' + String(now.getDate()).padStart(2, '0');
  try {
    const { days } = await api('/api/checkins?month=' + month);
    const map = {};
    days.forEach(d => { map[d.date] = (Number(d.run) ? 1 : 0) + (Number(d.code) ? 1 : 0) + (Number(d.write) ? 1 : 0); });
    const startPad = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < startPad; i++) cells += '<span></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const key = month + '-' + String(d).padStart(2, '0');
      cells += '<div class="ck-cell l' + (map[key] || 0) + (key === today ? ' today' : '') + '" title="' + key + '"></div>';
    }
    document.getElementById('checkin-grid').innerHTML = cells;
    const td = days.find(d => d.date === today) || { run: 0, code: 0, write: 0 };
    ckState = { date: today, run: !!Number(td.run), code: !!Number(td.code), write: !!Number(td.write) };
    syncCkButtons();
    const { streak } = await api('/api/checkins/streak');
    document.getElementById('streak-num').textContent = streak;
  } catch (e) { /* 忽略 */ }
}
function syncCkButtons() {
  ['run', 'code', 'write'].forEach(k => {
    const b = document.getElementById('ck-' + k);
    if (b) b.classList.toggle('on', ckState[k]);
  });
}
async function toggleCheckin(k) {
  ckState[k] = !ckState[k];
  syncCkButtons();
  try {
    await api('/api/checkins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ckState) });
    const { streak } = await api('/api/checkins/streak');
    document.getElementById('streak-num').textContent = streak;
    renderCheckin();
    toast(k === 'run' ? '夜跑打卡 ✓' : k === 'code' ? '编程打卡 ✓' : '写作打卡 ✓');
  } catch (e) { toast('打卡失败：' + e.message); }
}

async function renderGuestbook() {
  const list = document.getElementById('guestbook-list');
  try {
    const { messages } = await api('/api/messages');
    list.innerHTML = messages.length ? messages.map(m =>
      '<div class="gb-item"><div class="gb-head"><span class="gb-author">' + escapeHtml(m.author || '匿名') + '</span>' +
      (Number(m.is_veteran) ? '<span class="vet-badge">退伍兵</span>' : '') +
      '<span class="gb-time">' + fmtTime(m.created_at) + '</span>' +
      '<button class="gb-del" onclick="deleteGuestbook(' + m.id + ')">删除</button>' +
      '</div><div class="gb-content">' + escapeHtml(m.content) + '</div></div>'
    ).join('') : '<p class="comment-empty">还没有留言，来写下第一条吧。</p>';
  } catch (e) { list.innerHTML = '<p class="comment-empty">加载失败</p>'; }
}
async function submitGuestbook() {
  const content = document.getElementById('gb-content').value.trim();
  if (!content) { toast('留言内容不能为空'); return; }
  try {
    await api('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      author: document.getElementById('gb-author').value.trim(),
      content,
      is_veteran: document.getElementById('gb-vet').checked
    }) });
    document.getElementById('gb-content').value = '';
    document.getElementById('gb-vet').checked = false;
    toast('留言成功');
    renderGuestbook();
  } catch (e) { toast('留言失败：' + e.message); }
}
async function deleteGuestbook(id) {
  if (!confirm('删除这条留言？')) return;
  try { await api('/api/messages/' + id, { method: 'DELETE', headers: authHeaders() }); toast('已删除'); renderGuestbook(); }
  catch (e) { toast('删除失败：' + e.message); }
}

async function loadResonances(postId) {
  try {
    const { list } = await api('/api/resonances/' + postId);
    document.querySelectorAll('.resonate-btn').forEach(btn => {
      const p = Number(btn.dataset.para);
      if (list[p]) {
        btn.querySelector('span').textContent = list[p];
        if (localStorage.getItem('rs-' + postId + '-' + p)) btn.classList.add('on');
      }
    });
  } catch (e) { /* 忽略 */ }
}
async function resonate(postId, para, btn) {
  const key = 'rs-' + postId + '-' + para;
  if (localStorage.getItem(key)) { toast('这句话你已经共鸣过了'); return; }
  try {
    const r = await api('/api/resonances/' + postId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para }) });
    btn.querySelector('span').textContent = r.count;
    btn.classList.add('on');
    localStorage.setItem(key, '1');
    toast('共鸣 +1');
  } catch (e) { toast('操作失败：' + e.message); }
}

let __speaking = false;
function toggleSpeak() {
  const el = document.querySelector('.post-content');
  if (!el) return;
  if (__speaking) {
    speechSynthesis.cancel();
    __speaking = false;
    toast('已停止朗读');
    return;
  }
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持朗读'); return; }
  const u = new SpeechSynthesisUtterance(el.innerText);
  u.lang = 'zh-CN';
  u.rate = 0.95;
  u.onend = () => { __speaking = false; toast('朗读结束'); };
  speechSynthesis.speak(u);
  __speaking = true;
  toast('开始朗读，再点一次停止');
}

function downloadMd() {
  if (!window.__currentContent) { toast('没有可下载的内容'); return; }
  const title = (document.querySelector('.post-title-big') || {}).textContent || '文章';
  const blob = new Blob([window.__currentContent], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Markdown 已下载');
}

function toggleNightrun() {
  document.body.classList.toggle('nightrun');
  localStorage.setItem('blog-nightrun', document.body.classList.contains('nightrun') ? '1' : '0');
}

// ── 作品集 ──
function renderPortfolio() {
  const s = window.__settings || {};
  let skills = [];
  try { skills = JSON.parse(s.portfolio_skills || '[]'); } catch (e) {}
  if (!skills.length) skills = [
    { name: 'HTML / CSS', pct: 75 }, { name: 'JavaScript', pct: 55 }, { name: 'Node.js', pct: 50 },
    { name: 'SQL / 数据库', pct: 50 }, { name: 'Git / 版本控制', pct: 40 }, { name: '内网穿透 / 运维', pct: 55 }, { name: '炊事 / 后勤保障', pct: 70 }
  ];
  document.getElementById('skills-bars').innerHTML = skills.map(sk =>
    '<div class="skill-row"><span class="skill-name">' + escapeHtml(sk.name) + '</span>' +
    '<div class="skill-track"><div class="skill-fill" style="width:' + Number(sk.pct) + '%"></div></div>' +
    '<span class="skill-pct">' + Number(sk.pct) + '%</span></div>'
  ).join('');

  let projects = [];
  try { projects = JSON.parse(s.portfolio_projects || '[]'); } catch (e) {}
  if (!projects.length) projects = [
    { name: '重启日志', desc: '全栈博客：双主题UI + Express + SQLite/Postgres双驱动 + 14个API接口 + 40+项功能', tags: 'HTML/CSS,JS,Node.js,PostgreSQL,内网穿透' },
    { name: '自动化部署', desc: 'Cloudflare隧道/花生壳/cpolar三种内网穿透方案全流程实践', tags: '运维,Shell,Linux' },
    { name: '简历网页', desc: '第一个HTML/CSS作品，从零手写个人简历页面，响应式布局', tags: 'HTML,CSS' },
    { name: '数据库设计', desc: '6张业务表，SQLite/PG双驱动，参数化查询防注入', tags: 'SQL,数据库设计,PostgreSQL' }
  ];
  document.getElementById('pf-projects').innerHTML = projects.map(p =>
    '<div class="pf-pt"><h4>' + escapeHtml(p.name) + '</h4><p>' + escapeHtml(p.desc) + '</p>' +
    '<div class="pf-tags">' + (p.tags || '').split(',').map(t => '<span class="pf-tag">' + escapeHtml(t.trim()) + '</span>').join('') + '</div></div>'
  ).join('');

  // 动态更新联系邮箱
  const email = s.portfolio_email || '待补充';
  const emailEl = document.querySelector('#view-portfolio .pf-card:last-child p:last-child');
  if (emailEl) emailEl.innerHTML = '📧 ' + escapeHtml(email) + ' ｜ 📍 广东汕头（金平区）';
}

// ── 作品集后台管理 ──
function loadPortfolioSettings() {
  const s = window.__settings || {};
  const ids = { 'pf-skills': 'portfolio_skills', 'pf-projects': 'portfolio_projects', 'pf-bio': 'portfolio_bio', 'pf-email': 'portfolio_email' };
  for (const [id, key] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.value = s[key] || '';
  }
}
async function savePortfolio() {
  const body = {
    portfolio_skills: document.getElementById('pf-skills').value.trim(),
    portfolio_projects: document.getElementById('pf-projects').value.trim(),
    portfolio_bio: document.getElementById('pf-bio').value.trim(),
    portfolio_email: document.getElementById('pf-email').value.trim()
  };
  try {
    const s = await api('/api/settings', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    window.__settings = s;
    toast('作品集已保存，前台刷新即生效');
  } catch (e) { toast('保存失败：' + e.message); }
}

function scrollToPosts() {
  const mc = document.getElementById('main-content');
  if (mc) { mc.scrollIntoView({ behavior: 'smooth' }); return; }
  document.getElementById('post-grid')?.scrollIntoView({ behavior: 'smooth' });
}
function scrollPastHero() {
  const mc = document.getElementById('main-content');
  if (mc) { mc.scrollIntoView({ behavior: 'smooth' }); }
}

// ── 评论 ──
async function loadComments(postId) {
  const list = document.getElementById('comment-list');
  if (!list) return;
  try {
    const { comments } = await api('/api/posts/' + postId + '/comments');
    document.getElementById('comment-count').textContent = comments.length ? '(' + comments.length + ')' : '';
    list.innerHTML = '';
    if (!comments.length) { list.innerHTML = '<p class="comment-empty">还没有评论，来抢沙发。</p>'; return; }
    const isAdmin = true; // 令牌验证已关闭，管理按钮常显
    const authorMap = {};
    comments.forEach(c => { authorMap[c.id] = c.author || '匿名'; });
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item' + (Number(c.parent_id) ? ' reply' : '');
      const replyTo = Number(c.parent_id) ? authorMap[c.parent_id] : '';
      item.innerHTML =
        '<div class="comment-head">' +
          '<span class="comment-author">' + escapeHtml(c.author || '匿名') + '</span>' +
          (replyTo ? '<span class="reply-to">回复 @' + escapeHtml(replyTo) + '</span>' : '') +
          '<span class="comment-time">' + fmtTime(c.created_at) + '</span>' +
          (Number(c.parent_id) ? '<span class="reply-badge">回复</span>' : '') +
          '<button class="comment-reply-btn" onclick="setReplyTo(' + c.id + ',\'' + escapeHtml(c.author || '匿名').replace(/'/g, '\\\'') + '\',' + postId + ')">回复</button>' +
          (isAdmin ? '<button class="comment-del" onclick="deleteComment(' + c.id + ',' + postId + ')">删除</button>' : '') +
        '</div>' +
        '<div class="comment-body">' + escapeHtml(c.content) + '</div>';
      list.appendChild(item);
    });
  } catch (e) { list.innerHTML = '<p class="comment-empty">加载失败</p>'; }
}

// ── 评论回复 ──
function setReplyTo(id, author, postId) {
  window.__replyTo = { id, author, postId };
  const hint = document.getElementById('replying-hint');
  if (hint) {
    hint.hidden = false;
    hint.innerHTML = '正在回复 <b>@' + escapeHtml(author) + '</b> <a href="javascript:void(0)" onclick="cancelReply()" style="margin-left:10px">取消</a>';
  }
  const ta = document.getElementById('c-content');
  if (ta) ta.focus();
}
function cancelReply() {
  window.__replyTo = null;
  const h = document.getElementById('replying-hint');
  if (h) h.hidden = true;
}
async function submitComment(postId) {
  const content = document.getElementById('c-content').value.trim();
  const author = document.getElementById('c-author').value.trim();
  if (!content) { toast('评论内容不能为空'); return; }
  const btn = document.getElementById('c-submit');
  btn.disabled = true; btn.textContent = '发表中…';
  try {
    await api('/api/posts/' + postId + '/comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content, parentId: window.__replyTo ? window.__replyTo.id : 0 })
    });
    document.getElementById('c-content').value = '';
    cancelReply();
    toast('评论已发布');
    loadComments(postId);
    loadStats();
  } catch (e) { toast('发表失败：' + e.message); }
  finally { btn.disabled = false; btn.textContent = '发表评论'; }
}
async function deleteComment(commentId, postId) {
  if (!confirm('删除这条评论？')) return;
  try {
    await api('/api/comments/' + commentId, { method: 'DELETE', headers: authHeaders() });
    toast('评论已删除');
    loadComments(postId);
  } catch (e) {
    if (e.message.includes('令牌')) askToken(() => deleteComment(commentId, postId));
    else toast('删除失败：' + e.message);
  }
}

// ── 文章管理 ──
async function deletePost(id) {
  if (!confirm('确定删除这篇文章吗？删了就没了。')) return;
  try {
    await api('/api/posts/' + id, { method: 'DELETE', headers: authHeaders() });
    toast('已删除');
    go('home');
    loadPosts(); loadStats();
  } catch (e) {
    if (e.message.includes('令牌')) askToken(() => deletePost(id));
    else toast('删除失败：' + e.message);
  }
}

async function editPost(id) {
  try {
    const { post } = await api('/api/posts/' + id);
    editId = id;
    document.getElementById('f-id').value = id;
    document.getElementById('f-title').value = post.title;
    document.getElementById('f-tag').value = post.tag;
    document.getElementById('f-date').value = post.date;
    document.getElementById('f-excerpt').value = post.excerpt || '';
    document.getElementById('f-content').value = post.content;
    document.getElementById('f-cover').value = String(post.cover);
    document.getElementById('f-cover-url').value = post.cover_url || '';
    updateCoverPreview();
    document.getElementById('btn-submit').textContent = '保存修改';
    document.getElementById('edit-hint').textContent = '正在编辑：《' + post.title + '》';
    document.getElementById('form-error').hidden = true;
    go('admin', 'write');
    toast('已载入文章，改完点保存');
  } catch (e) { toast('载入失败：' + e.message); }
}

function resetForm() {
  editId = null;
  document.getElementById('f-id').value = '';
  ['f-title', 'f-tag', 'f-date', 'f-excerpt', 'f-content', 'f-cover-url'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-cover').value = '0';
  document.getElementById('btn-submit').textContent = '发布文章';
  document.getElementById('edit-hint').textContent = '';
  document.getElementById('form-error').hidden = true;
  document.getElementById('upload-status').textContent = '';
  document.getElementById('use-as-cover').hidden = true;
  updateCoverPreview();
}

async function submitPost() {
  const title = document.getElementById('f-title').value.trim();
  const content = document.getElementById('f-content').value.trim();
  const err = document.getElementById('form-error');
  if (!title || !content) { err.textContent = '标题和正文不能为空'; err.hidden = false; return; }
  err.hidden = true;
  const btn = document.getElementById('btn-submit');
  btn.disabled = true; btn.textContent = '保存中…';
  const body = {
    title,
    tag: document.getElementById('f-tag').value.trim(),
    date: document.getElementById('f-date').value.trim(),
    excerpt: document.getElementById('f-excerpt').value.trim(),
    content,
    cover: Number(document.getElementById('f-cover').value),
    coverUrl: document.getElementById('f-cover-url').value.trim()
  };
  try {
    if (editId) {
      await api('/api/posts/' + editId, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      toast('修改已保存');
    } else {
      await api('/api/posts', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      toast('发布成功！');
    }
    resetForm();
    btn.disabled = false; btn.textContent = '发布文章';
    go('home');
    loadPosts(); loadStats();
  } catch (e) {
    btn.disabled = false; btn.textContent = editId ? '保存修改' : '发布文章';
    if (e.message.includes('令牌')) askToken(submitPost);
    else { err.textContent = '保存失败：' + e.message; err.hidden = false; }
  }
}

// ── 图片上传 ──
async function uploadImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const st = document.getElementById('upload-status');
  st.textContent = '上传中…';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    window.__lastUploadUrl = data.url;
    document.getElementById('use-as-cover').hidden = false;
    const ta = document.getElementById('f-content');
    ta.value += (ta.value ? '\n' : '') + '![图片](' + data.url + ')\n';
    st.textContent = '已插入正文，可点"设为封面"';
    toast('图片已上传');
  } catch (e) {
    st.textContent = '';
    if (e.message.includes('令牌')) askToken(() => uploadImage(input));
    else toast('上传失败：' + e.message);
  } finally { input.value = ''; }
}
function insertImageUrl() {
  const url = prompt('粘贴图片网址（http 开头）');
  if (!url) return;
  const ta = document.getElementById('f-content');
  ta.value += (ta.value ? '\n' : '') + '![图片](' + url + ')\n';
}

// ── 封面实时预览 / 设为封面 ──
function updateCoverPreview() {
  const pv = document.getElementById('cover-preview');
  if (!pv) return;
  const url = document.getElementById('f-cover-url').value.trim();
  const cover = document.getElementById('f-cover').value;
  const tag = document.getElementById('f-tag').value.trim();
  const title = document.getElementById('f-title').value.trim();
  pv.className = 'cover-preview cover-' + cover + (url ? ' has-img' : '');
  pv.style.backgroundImage = url ? "url('" + url + "')" : '';
  pv.style.backgroundSize = 'cover';
  pv.style.backgroundPosition = 'center';
  pv.querySelector('.cp-pill').textContent = tag || '未分类';
  pv.querySelector('.cp-title').textContent = title || '封面预览';
}
function useAsCover() {
  if (!window.__lastUploadUrl) return;
  document.getElementById('f-cover-url').value = window.__lastUploadUrl;
  document.getElementById('use-as-cover').hidden = true;
  updateCoverPreview();
  toast('已设为封面');
}

// ── 管理后台各面板 ──
function adminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['write', 'manage', 'stats', 'comments', 'settings', 'portfolio'].forEach(p => {
    document.getElementById('p-' + p).hidden = p !== name;
  });
  if (name === 'manage') loadManage();
  if (name === 'stats') loadStatsPanel();
  if (name === 'comments') loadCommentsPanel();
  if (name === 'settings') loadSettings();
  if (name === 'portfolio') loadPortfolioSettings();
}

async function loadManage() {
  const tbody = document.getElementById('manage-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="comment-empty">加载中…</td></tr>';
  try {
    const { posts } = await api('/api/posts');
    tbody.innerHTML = posts.map(p =>
      '<tr>' +
        '<td class="t-title">' + escapeHtml(p.title) + '</td>' +
        '<td>' + escapeHtml(p.date) + '</td>' +
        '<td>' + p.views + '</td>' +
        '<td>' + p.likes + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="mini-btn" onclick="editPost(' + p.id + ')">编辑</button>' +
          '<button class="mini-btn danger" onclick="deletePost(' + p.id + ')">删除</button>' +
        '</div></td>' +
      '</tr>').join('');
  } catch (e) {
    if (e.message.includes('令牌')) { tbody.innerHTML = '<tr><td colspan="5" class="comment-empty">需要管理员令牌</td></tr>'; askToken(loadManage); }
    else tbody.innerHTML = '<tr><td colspan="5" class="comment-empty">加载失败：' + escapeHtml(e.message) + '</td></tr>';
  }
}

async function loadStatsPanel() {
  const m = document.getElementById('metrics');
  const tbody = document.getElementById('stats-tbody');
  try {
    const s = await api('/api/admin/stats');
    m.innerHTML =
      '<div class="metric-card"><div class="metric-num">' + s.overview.posts + '</div><div class="metric-label">文章</div></div>' +
      '<div class="metric-card"><div class="metric-num">' + s.overview.chars + '</div><div class="metric-label">总字数</div></div>' +
      '<div class="metric-card"><div class="metric-num">' + s.overview.views + '</div><div class="metric-label">总阅读</div></div>' +
      '<div class="metric-card"><div class="metric-num">' + s.overview.likes + '</div><div class="metric-label">总点赞</div></div>' +
      '<div class="metric-card"><div class="metric-num">' + s.overview.comments + '</div><div class="metric-label">总评论</div></div>';
    tbody.innerHTML = s.rows.map(r =>
      '<tr><td class="t-title">' + escapeHtml(r.title) + '</td><td>' + escapeHtml(r.date) + '</td><td>' + r.views + '</td><td>' + r.likes + '</td><td>' + fmtTime(r.created_at) + '</td></tr>'
    ).join('');
    // 阅读量分布条形图（纯 CSS 实现，无需图表库）
    const chart = document.getElementById('views-chart');
    const maxV = Math.max(1, ...s.rows.map(r => Number(r.views)));
    chart.innerHTML = s.rows.slice(0, 10).map(r => {
      const w = Math.max(2, Math.round(Number(r.views) / maxV * 100));
      return '<div class="vbar-row"><span class="vbar-label" title="' + escapeHtml(r.title) + '">' + escapeHtml(r.title) + '</span>' +
        '<div class="vbar-track"><div class="vbar-fill" style="width:' + w + '%"></div></div>' +
        '<span class="vbar-num">' + r.views + '</span></div>';
    }).join('') || '<p class="comment-empty">暂无数据</p>';
  } catch (e) {
    if (e.message.includes('令牌')) askToken(loadStatsPanel);
    else { m.innerHTML = '<p class="comment-empty">加载失败：' + escapeHtml(e.message) + '</p>'; }
  }
}

async function loadCommentsPanel() {
  const box = document.getElementById('admin-comments');
  try {
    const { comments } = await api('/api/comments');
    box.innerHTML = comments.length
      ? comments.map(c =>
          '<div class="comment-item">' +
            '<div class="comment-head">' +
              '<span class="comment-author">' + escapeHtml(c.author || '匿名') + '</span>' +
              '<span class="comment-time">' + fmtTime(c.created_at) + '</span>' +
              '<span class="comment-time">→ ' + escapeHtml(c.post_title || '已删除文章') + '</span>' +
              '<button class="comment-del" onclick="deleteCommentAdmin(' + c.id + ')">删除</button>' +
            '</div>' +
            '<div class="comment-body">' + escapeHtml(c.content) + '</div>' +
          '</div>').join('')
      : '<p class="comment-empty">还没有评论</p>';
  } catch (e) {
    if (e.message.includes('令牌')) askToken(loadCommentsPanel);
    else box.innerHTML = '<p class="comment-empty">加载失败：' + escapeHtml(e.message) + '</p>';
  }
}
async function deleteCommentAdmin(id) {
  if (!confirm('删除这条评论？')) return;
  try {
    await api('/api/comments/' + id, { method: 'DELETE', headers: authHeaders() });
    toast('已删除');
    loadCommentsPanel();
  } catch (e) { toast('删除失败：' + e.message); }
}

// ── 令牌 ──
const TOKEN_KEY = 'blog_admin_token';
let lastTokenAttempt = 0;
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { 'Content-Type': 'application/json', 'x-admin-token': getToken() }; }
function askToken(retry) {
  const now = Date.now();
  const tip = document.getElementById('modal-tip');
  if (now - lastTokenAttempt < 3000) {
    tip.style.color = 'var(--accent-4)';
    tip.textContent = '令牌不对：检查大小写、空格，确认输的是当前有效密码';
  } else {
    tip.style.color = '';
    tip.textContent = '当前密码 restart2026，输入一次即记住';
  }
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
  lastTokenAttempt = Date.now();
  if (typeof window.__tokenRetry === 'function') window.__tokenRetry();
}
function closeTokenModal() { document.getElementById('token-modal').hidden = true; }
// ── 滚动：进度条 + 回到顶部 ──
function onScroll() {
  const doc = document.documentElement;
  const pct = doc.scrollTop / (doc.scrollHeight - doc.clientHeight || 1);
  document.getElementById('progress-bar').style.width = (pct * 100) + '%';
  document.getElementById('back-top').classList.toggle('show', doc.scrollTop > 400);
  const ring = document.getElementById('ring-fg');
  if (ring) ring.style.strokeDashoffset = String(100.5 * (1 - pct));
  const tb = document.querySelector('.topbar');
  if (tb) tb.classList.toggle('scrolled', doc.scrollTop > 8);
}

// ── 特效：打字机 / 公告 / 光斑 / 滚动渐入 ──
let __twTimer = null;
function typewriter(el, text) {
  if (!el) return;
  clearTimeout(__twTimer);
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = text;
    return;
  }
  el.classList.add('typewriter');
  el.textContent = '';
  let i = 0;
  (function tick() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i++);
      __twTimer = setTimeout(tick, 55);
    } else {
      el.classList.remove('typewriter');
    }
  })();
}
function closeNotice() {
  localStorage.setItem('blog-notice-closed', '1');
  document.getElementById('notice-bar').hidden = true;
}
function initCursorGlow() {
  if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
  const g = document.createElement('div');
  g.className = 'cursor-glow';
  document.body.appendChild(g);
  document.body.classList.add('glow-on');
  let raf = null;
  window.addEventListener('mousemove', e => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      g.style.left = e.clientX + 'px';
      g.style.top = e.clientY + 'px';
      raf = null;
    });
  });
}
let __io = null;
function initReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    return;
  }
  __io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); __io.unobserve(en.target); }
    });
  }, { threshold: 0.08 });
}
function observeReveals(root) {
  if (!__io) return;
  root.querySelectorAll('.reveal:not(.in)').forEach(el => __io.observe(el));
}

// ── 启动 ──
window.addEventListener('scroll', onScroll, { passive: true });
document.getElementById('admin-form').addEventListener('submit', e => { e.preventDefault(); submitPost(); });
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#post-(\d+)$/);
  if (m && Number(m[1]) !== currentPostId) openPost(Number(m[1]));
});
initTheme();
// 夜跑模式恢复
if (localStorage.getItem('blog-nightrun') === '1') document.body.classList.add('nightrun');
// 视图偏好
if (localStorage.getItem('blog-view') === 'list') document.getElementById('post-grid').classList.add('list-view');
// 键盘快捷键：/ 搜索 · ← → 上一篇下一篇 · m 主题 · f 沉浸 · Esc 退出
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); go('home'); setTimeout(() => { const s = document.getElementById('search-input'); if (s) s.focus(); }, 80); }
  else if (k === 'arrowleft' && window.__neighbors && window.__neighbors.prev) openPost(window.__neighbors.prev.id);
  else if (k === 'arrowright' && window.__neighbors && window.__neighbors.next) openPost(window.__neighbors.next.id);
  else if (k === 'm') toggleTheme();
  else if (k === 'f') toggleImmersive();
  else if (k === 'n') toggleNightrun();
  else if (e.key === 'Escape') document.body.classList.remove('immersive');
});
initReveal();
initCursorGlow();
observeReveals(document);
loadSettings();
loadStats();
loadPosts();
// PWA：注册 Service Worker（离线缓存）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
if (/^#post-/.test(location.hash)) {
  const m = location.hash.match(/^#post-(\d+)$/);
  if (m) openPost(Number(m[1]));
}

// ── 效果包：光晕 / 粒子 / 打字机 / 逐字浮现 ──
(function () {
  // 1. 鼠标光晕
  const glow = document.getElementById('cursor-glow');
  if (glow && matchMedia('(pointer:fine)').matches) {
    let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy;
    addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.left = gx + 'px'; glow.style.top = gy + 'px';
      requestAnimationFrame(loop);
    })();
  }

  // 2. 粒子背景（星空微光）
  const cv = document.getElementById('particle-canvas');
  if (cv && cv.getContext) {
    const ctx = cv.getContext('2d');
    let W, H, dots = [];
    const resize = () => {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      dots = Array.from({ length: Math.min(60, Math.floor(W / 25)) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4, s: Math.random() * 0.3 + 0.1
      }));
    };
    resize(); addEventListener('resize', resize);
    (function draw() {
      ctx.clearRect(0, 0, W, H);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#0d9488';
      for (const d of dots) {
        d.y -= d.s;
        if (d.y < -5) { d.y = H + 5; d.x = Math.random() * W; }
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7);
        ctx.fillStyle = accent + '33'; ctx.fill();
      }
      requestAnimationFrame(draw);
    })();
  }

  // 3. 打字机标题（“从躺平到站直”）
  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle) {
    const fullText = heroTitle.textContent;
    const gradStart = fullText.indexOf('到'); // 渐变部分起点
    heroTitle.innerHTML = '<span id="type-part"></span><span class="type-cursor"></span>';
    const partEl = document.getElementById('type-part');
    const cursor = heroTitle.querySelector('.type-cursor');
    let i = 0;
    const type = () => {
      if (i < fullText.length) {
        partEl.textContent = fullText.slice(0, i + 1);
        i++; setTimeout(type, 45);
      } else {
        // 打完：恢复渐变 span 结构
        heroTitle.innerHTML = fullText.slice(0, gradStart) + '<span class="grad-flow">' + fullText.slice(gradStart) + '</span>';
      }
    };
    type();
  }

  // 4. 滚动浮现（新增 fade-in-block）
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  function watchBlocks() {
    document.querySelectorAll('.fade-in-block:not(.visible)').forEach(el => io.observe(el));
  }
  watchBlocks();
  const mo = new MutationObserver(watchBlocks);
  mo.observe(document.body, { childList: true, subtree: true });
})();
