/* ==========================================================
   article-js.js —— 文章页逻辑
   1. 读取 post/ 中的 Markdown（Front Matter + 正文）
   2. 优先使用 marked.js 渲染（支持表格等 GFM 语法），
      CDN 不可用时回退到 common.js 内置解析器
   3. 自动修正图片/链接相对路径
   4. 提取 h1~h3 生成右侧目录并滚动高亮
   ========================================================== */
(function () {
  'use strict';

  var contentEl = document.getElementById('articleContent');
  var tocBox = document.getElementById('tocBox');
  var titleEl = document.getElementById('articleTitle');
  var metaEl = document.getElementById('articleMeta');
  var coverEl = document.getElementById('articleCover');
  var crumbEl = document.getElementById('crumbTitle');

  function getParam(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  /* ---------- 标题 ID ---------- */
  function slugify(text, used) {
    var base = String(text)
      .replace(/[*_`~\[\]()#]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\-\s]/g, '')
      .replace(/\s+/g, '-');
    if (!base) base = 'section';
    var id = base, n = 1;
    while (used[id]) { id = base + '-' + (n++); }
    return id;
  }

  /* ---------- Markdown 渲染 ---------- */
  function renderMarkdown(md) {
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        return window.marked.parse(md, { gfm: true, breaks: false });
      } catch (e) {
        // 降级到内置解析器
      }
    }
    return Site.parseMarkdown(md, { resolve: Site.postAsset }).html;
  }

  /* ---------- 相对路径修正 ---------- */
  function fixAssets() {
    // 图片：统一按 post 目录解析
    Array.prototype.forEach.call(contentEl.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src') || '';
      if (!src) return;
      if (/^(https?:)?\/\//i.test(src) || src.charAt(0) === '/' || /^data:/i.test(src)) return;
      img.setAttribute('src', Site.postAsset(src));
      if (!img.getAttribute('alt')) img.setAttribute('alt', '');
      img.setAttribute('loading', 'lazy');
    });

    // 链接：站内页面以 ../ 开头的保持原样，其余相对路径按 post 目录解析
    Array.prototype.forEach.call(contentEl.querySelectorAll('a'), function (a) {
      var href = a.getAttribute('href') || '';
      if (!href) return;
      if (/^(https?:|mailto:|tel:|#)/i.test(href) || href.charAt(0) === '/') return;
      if (href.indexOf('../') === 0) return;
      a.setAttribute('href', Site.postAsset(href));
    });
  }

  /* ---------- 从正文提取目录 ---------- */
  function buildToc() {
    var headings = contentEl.querySelectorAll('h1, h2, h3');
    var used = Object.create(null);
    var toc = [];

    Array.prototype.forEach.call(headings, function (h) {
      var level = Number(h.tagName.charAt(1));
      var text = (h.textContent || '').trim();
      if (!text) return;

      var id = h.id;
      if (!id) {
        id = slugify(text, used);
        h.id = id;
      }
      used[id] = true;
      toc.push({ level: level, text: text, id: id });
    });

    return toc;
  }

  /* ---------- 目录滚动高亮 ---------- */
  function setupTocHighlight() {
    var links = Array.prototype.slice.call(tocBox.querySelectorAll('a[data-toc]'));
    if (!links.length) return;

    var targets = links.map(function (a) {
      return document.getElementById(a.getAttribute('data-toc'));
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var offset = 110;
        var activeIndex = 0;
        for (var i = 0; i < targets.length; i++) {
          var el = targets[i];
          if (el && el.getBoundingClientRect().top <= offset) activeIndex = i;
          else break;
        }
        links.forEach(function (a, i) {
          a.classList.toggle('active', i === activeIndex);
        });
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---------- 渲染文章 ---------- */
  function render(meta, body) {
    var title = meta.title || '未命名文章';

    document.title = title + ' · 翠林城';
    titleEl.textContent = title;
    if (crumbEl) crumbEl.textContent = title;

    var metaParts = [];
    if (meta.date) metaParts.push('发布时间：' + meta.date);
    if (meta.category) metaParts.push('分类：' + meta.category);
    if (meta.author) metaParts.push('来源：' + meta.author);
    metaEl.innerHTML = metaParts.map(function (t) {
      return '<span>' + Site.escapeHtml(t) + '</span>';
    }).join('');

    if (meta.cover) {
      coverEl.src = Site.postAsset(meta.cover);
      coverEl.alt = title;
      coverEl.hidden = false;
    } else {
      coverEl.hidden = true;
    }

    contentEl.innerHTML = renderMarkdown(body);
    fixAssets();

    var toc = buildToc();
    tocBox.innerHTML = Site.renderToc(toc);
    setupTocHighlight();
  }

  /* ---------- 启动 ---------- */
  function boot() {
    var file = getParam('post');

    Site.fetchJSON('post/posts.json').catch(function () {
      return { posts: [] };
    }).then(function (index) {
      if (!file) file = (index.posts && index.posts[0]) || '';
      if (!file) throw new Error('未找到任何文章，请检查 post/posts.json');
      return Site.fetchText('post/' + file);
    }).then(function (raw) {
      var parsed = Site.splitFrontMatter(raw);
      render(parsed.meta || {}, parsed.body || '');
    }).catch(function (err) {
      titleEl.textContent = '文章加载失败';
      metaEl.innerHTML = '';
      coverEl.hidden = true;
      contentEl.innerHTML = '<p class="md-error">' + Site.escapeHtml(err.message) +
        '<br><small>请确认文章文件存在于 post 文件夹中，且 posts.json 已登记该文件；同时需通过服务器访问页面。</small></p>';
      tocBox.innerHTML = '<p class="toc-empty">无法生成目录</p>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();