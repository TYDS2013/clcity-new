/* ==========================================================
   index-js.js —— 主页逻辑
   时钟 + 轮播 + 最新要闻摘要（最多 6 条）+ 搜索跳转
   ========================================================== */
(function () {
  'use strict';

  var SITE_ROOT = Site.root;
  var NEWS_LIMIT = 6;

  /* ---------- 时钟 ---------- */
  var clockEl = document.getElementById('siteClock');
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function updateClock() {
    if (!clockEl) return;
    var d = new Date();
    clockEl.textContent =
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      '星期' + WEEK[d.getDay()] + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* ---------- 轮播 ---------- */
  var state = { slides: [], index: 0, timer: null };

  function initCarousel(slides) {
    var stage = document.getElementById('carouselStage');
    var viewport = document.getElementById('carouselViewport');
    var dotsBox = document.getElementById('carouselDots');
    var caption = document.getElementById('carouselCaption');
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');

    if (!stage || !slides || !slides.length) {
      if (caption) caption.textContent = '暂无图片要闻';
      return;
    }

    state.slides = slides;
    state.index = 0;

    viewport.innerHTML = slides.map(function (s, i) {
      return '<a class="carousel__slide' + (i === 0 ? ' is-active' : '') + '"' +
        ' href="' + Site.escapeHtml(s.link) + '">' +
        '<img src="' + Site.escapeHtml(SITE_ROOT + s.image) + '"' +
        ' alt="' + Site.escapeHtml(s.title || '') + '"' +
        (i === 0 ? '' : ' loading="lazy"') + '></a>';
    }).join('');

    dotsBox.innerHTML = slides.map(function (s, i) {
      return '<button class="carousel__dot' + (i === 0 ? ' is-active' : '') + '"' +
        ' type="button" role="tab" data-index="' + i + '"' +
        ' aria-label="第 ' + (i + 1) + ' 张"></button>';
    }).join('');

    caption.textContent = slides[0].title || '';

    function go(n) {
      var total = state.slides.length;
      if (!total) return;
      state.index = (n % total + total) % total;
      var slideEls = viewport.querySelectorAll('.carousel__slide');
      var dotEls = dotsBox.querySelectorAll('.carousel__dot');
      Array.prototype.forEach.call(slideEls, function (el, i) {
        el.classList.toggle('is-active', i === state.index);
      });
      Array.prototype.forEach.call(dotEls, function (el, i) {
        el.classList.toggle('is-active', i === state.index);
      });
      caption.textContent = state.slides[state.index].title || '';
    }
    function start() { stop(); state.timer = setInterval(function () { go(state.index + 1); }, 5000); }
    function stop() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

    prevBtn.addEventListener('click', function () { go(state.index - 1); start(); });
    nextBtn.addEventListener('click', function () { go(state.index + 1); start(); });
    dotsBox.addEventListener('click', function (e) {
      var btn = e.target.closest('.carousel__dot');
      if (!btn) return;
      go(Number(btn.getAttribute('data-index')));
      start();
    });
    stage.addEventListener('mouseenter', stop);
    stage.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    start();
  }

  /* ---------- 最新要闻摘要 ---------- */
  var newsList = document.getElementById('newsList');
  var allNews = [];

  function articleUrl(file) {
    return SITE_ROOT + 'pages/article.html?post=' + encodeURIComponent(file);
  }

  function renderNews(limit) {
    if (!newsList) return;
    if (!allNews.length) {
      newsList.innerHTML = '<li class="empty">暂无要闻内容。</li>';
      return;
    }
    newsList.innerHTML = allNews.slice(0, limit).map(function (n) {
      return '<li><a href="' + Site.escapeHtml(articleUrl(n.file)) + '">' +
        (n.date ? '<time>' + Site.escapeHtml(String(n.date).slice(5)) + '</time>' : '') +
        '<span class="tag">' + Site.escapeHtml(n.category) + '</span>' +
        '<span class="title" title="' + Site.escapeHtml(n.title) + '">' +
        Site.escapeHtml(n.title) + '</span></a></li>';
    }).join('');
  }

  /* ---------- 搜索（跳转到要闻页） ---------- */
  var searchForm = document.getElementById('searchForm');
  var searchInput = document.getElementById('searchInput');
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (searchInput.value || '').trim();
      location.href = SITE_ROOT + 'pages/news.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }

  /* ---------- 初始化 ---------- */
  Site.fetchJSON('post/posts.json').then(function (index) {
    initCarousel(index.slides || []);
    return Site.loadPostMetas(index.posts || []);
  }).then(function (metas) {
    allNews = metas.filter(function (m) { return m !== null; });
    renderNews(NEWS_LIMIT);
  }).catch(function (err) {
    if (newsList) {
      newsList.innerHTML = '<li class="empty">加载失败：' + Site.escapeHtml(err.message) +
        '<br><small>请通过服务器或 GitHub Pages 访问。</small></li>';
    }
  });
})();