/* ==========================================================
   news-js.js —— 要闻页逻辑
   读取全部文章，支持分页加载与从 URL 带入搜索关键词
   ========================================================== */
(function () {
  'use strict';

  var SITE_ROOT = Site.root;
  var PAGE_SIZE = 10;

  var listEl = document.getElementById('newsFullList');
  var allNews = [];
  var filteredNews = null;
  var shown = PAGE_SIZE;

  function articleUrl(file) {
    return SITE_ROOT + 'pages/article.html?post=' + encodeURIComponent(file);
  }

  function render() {
    if (!listEl) return;
    var list = (filteredNews !== null) ? filteredNews : allNews;

    if (!list.length) {
      listEl.innerHTML = '<li class="empty">' +
        (filteredNews !== null ? '没有找到匹配的要闻。' : '暂无要闻内容。') + '</li>';
      return;
    }

    var html = list.slice(0, shown).map(function (n) {
      return '<li><a href="' + Site.escapeHtml(articleUrl(n.file)) + '">' +
        (n.date ? '<time>' + Site.escapeHtml(String(n.date).slice(5)) + '</time>' : '') +
        '<span class="tag">' + Site.escapeHtml(n.category) + '</span>' +
        '<span class="title" title="' + Site.escapeHtml(n.title) + '">' +
        Site.escapeHtml(n.title) + '</span></a></li>';
    }).join('');

    if (list.length > shown) {
      html += '<li><button class="news-more" type="button" id="newsMore">' +
        '加载更多（还有 ' + (list.length - shown) + ' 条）</button></li>';
    }

    listEl.innerHTML = html;

    var moreBtn = document.getElementById('newsMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        shown += PAGE_SIZE;
        render();
      });
    }
  }

  function applySearch(q) {
    if (!q) { filteredNews = null; shown = PAGE_SIZE; render(); return; }
    var lower = q.toLowerCase();
    filteredNews = allNews.filter(function (n) {
      return (n.title + ' ' + (n.summary || '') + ' ' + (n.category || '')).toLowerCase().indexOf(lower) >= 0;
    });
    shown = Math.max(filteredNews.length, PAGE_SIZE);
    render();
  }

  Site.fetchJSON('post/posts.json').then(function (index) {
    return Site.loadPostMetas(index.posts || []);
  }).then(function (metas) {
    allNews = metas.filter(function (m) { return m !== null; });
    allNews.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var q = new URLSearchParams(location.search).get('q') || '';
    applySearch(q.trim());
  }).catch(function (err) {
    if (listEl) {
      listEl.innerHTML = '<li class="empty">加载失败：' + Site.escapeHtml(err.message) + '</li>';
    }
  });
})();