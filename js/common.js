/* ==========================================================
   common.js —— 全站公共逻辑
   1. 站点根路径推断（支持首页 / pages 子目录 / GitHub Pages 子路径）
   2. 数据加载（posts.json、Markdown 文本）与缓存
   3. 轻量 Markdown 解析器（支持标题、加粗、斜体、行内代码、
      代码块、列表、引用、链接、图片、分割线）
   4. 目录（TOC）提取与渲染
   ========================================================== */
(function (global) {
  'use strict';

  /* ---------- 1. 站点根路径 ---------- */
  var currentScript = document.currentScript;
  var SITE_ROOT = (function () {
    var src = currentScript ? currentScript.src : '';
    var m = /^(.*?)JS\/common\.js(?:\?.*)?$/.exec(src);
    var root = m ? m[1] : '';
    return root || './';
  })();

  /* ---------- 2. 文本 / JSON 加载（带内存缓存） ---------- */
  var textCache = Object.create(null);
  var jsonCache = Object.create(null);

  function fetchText(path) {
    var key = path;
    if (textCache[key]) return Promise.resolve(textCache[key]);
    return fetch(SITE_ROOT + path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('无法加载 ' + path + '（HTTP ' + res.status + '）');
      return res.text();
    }).then(function (text) {
      textCache[key] = text;
      return text;
    });
  }

  function fetchJSON(path) {
    if (jsonCache[path]) return Promise.resolve(jsonCache[path]);
    return fetch(SITE_ROOT + path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('无法加载 ' + path + '（HTTP ' + res.status + '）');
      return res.json();
    }).then(function (data) {
      jsonCache[path] = data;
      return data;
    });
  }

  /* ---------- 3. HTML 转义 ---------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- 4. 相对 post 目录的资源解析 ---------- */
  function postAsset(src) {
    if (!src) return '';
    src = String(src).trim();
    if (/^(https?:)?\/\//i.test(src) || src.charAt(0) === '/' || /^data:/i.test(src)) return src;
    return SITE_ROOT + 'post/' + src.replace(/^\.\//, '');
  }

  /* ---------- 5. Front Matter 解析 ---------- */
  function splitFrontMatter(text) {
    var src = String(text || '').replace(/\r\n?/g, '\n');
    var m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
    if (!m) return { meta: {}, body: src };

    var meta = {};
    m[1].split('\n').forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx <= 0) return;
      var key = line.slice(0, idx).trim();
      var val = line.slice(idx + 1).trim();
      val = val.replace(/^["']/, '').replace(/["']$/, '');
      if (key) meta[key] = val;
    });
    return { meta: meta, body: src.slice(m[0].length) };
  }

  /* ---------- 6. 行内 Markdown ---------- */
  function renderInline(text, resolve) {
    var codes = [];
    var s = escapeHtml(text);

    // 行内代码占位，避免被其他规则误伤
    s = s.replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return '\u0001' + (codes.length - 1) + '\u0001';
    });

    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
      return '<img src="' + escapeHtml(resolve(src)) + '" alt="' + alt + '" loading="lazy">';
    });

    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, txt, url) {
      var href = /^(https?:|mailto:|#|\/)/i.test(url) ? url : resolve(url);
      return '<a href="' + escapeHtml(href) + '">' + txt + '</a>';
    });

    // 加粗
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');

    // 斜体
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

    // 删除线
    s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

    // 还原行内代码
    s = s.replace(/\u0001(\d+)\u0001/g, function (_, i) {
      return '<code>' + codes[Number(i)] + '</code>';
    });

    return s;
  }

  /* ---------- 7. 块级 Markdown ---------- */
  var BLOCK_START = /^(#{1,6}\s|```|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+|(?:-{3,}|\*{3,}|_{3,})\s*$)/;

  function parseMarkdown(md, options) {
    options = options || {};
    var resolve = options.resolve || function (s) { return s; };
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var toc = [];
    var usedIds = Object.create(null);
    var i = 0;

    function slugify(text) {
      var base = String(text)
        .replace(/[*_`~\[\]()#]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\-\s]/g, '')
        .replace(/\s+/g, '-');
      if (!base) base = 'section';
      var id = base, n = 1;
      while (usedIds[id]) { id = base + '-' + (n++); }
      usedIds[id] = true;
      return id;
    }

    while (i < lines.length) {
      var line = lines[i];

      // 空行
      if (/^\s*$/.test(line)) { i++; continue; }

      // 代码块
      if (/^```/.test(line)) {
        var lang = line.slice(3).trim();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        out.push(
          '<pre class="md-pre"><code' +
          (lang ? ' class="lang-' + escapeHtml(lang) + '"' : '') +
          '>' + escapeHtml(buf.join('\n')) + '</code></pre>'
        );
        continue;
      }

      // 标题
      var heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        var level = heading[1].length;
        var hText = heading[2];
        var hId = slugify(hText);
        if (level <= 3) {
          toc.push({ level: level, text: hText.replace(/[*_`~]/g, ''), id: hId });
        }
        out.push('<h' + level + ' id="' + hId + '">' + renderInline(hText, resolve) + '</h' + level + '>');
        i++;
        continue;
      }

      // 分割线
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      // 引用
      if (/^\s*>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote><p>' + quote.map(function (t) { return renderInline(t, resolve); }).join('<br>') + '</p></blockquote>');
        continue;
      }

      // 无序列表
      if (/^\s*[-*+]\s+/.test(line)) {
        var ulItems = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ulItems.push(renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''), resolve));
          i++;
        }
        out.push('<ul>' + ulItems.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>');
        continue;
      }

      // 有序列表
      if (/^\s*\d+[.)]\s+/.test(line)) {
        var olItems = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          olItems.push(renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, ''), resolve));
          i++;
        }
        out.push('<ol>' + olItems.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol>');
        continue;
      }

      // 段落
      var para = [line];
      i++;
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !BLOCK_START.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + renderInline(para.join('\n'), resolve) + '</p>');
    }

    return { html: out.join('\n'), toc: toc };
  }

  /* ---------- 8. 目录渲染 ---------- */
  function renderToc(toc) {
    if (!toc || !toc.length) return '<p class="toc-empty">本文暂无小节目录</p>';
    var minLevel = toc.reduce(function (min, item) { return Math.min(min, item.level); }, 6);
    var html = '';
    var depth = 0;

    toc.forEach(function (item) {
      var lv = item.level - minLevel + 1;
      while (depth < lv) { html += '<ul class="toc-list">'; depth++; }
      while (depth > lv) { html += '</ul>'; depth--; }
      html +=
        '<li class="toc-item toc-lv' + lv + '">' +
          '<a href="#' + item.id + '" data-toc="' + item.id + '">' + escapeHtml(item.text) + '</a>' +
        '</li>';
    });
    while (depth > 0) { html += '</ul>'; depth--; }
    return html;
  }

  /* ---------- 9. 文章元数据 ---------- */
  function loadPostMeta(file) {
    return fetchText('post/' + file).then(function (raw) {
      var parsed = splitFrontMatter(raw);
      var meta = parsed.meta || {};
      return {
        file: file,
        title: meta.title || file.replace(/\.md$/i, ''),
        date: meta.date || '',
        category: meta.category || '要闻',
        summary: meta.summary || '',
        cover: meta.cover || '',
        author: meta.author || ''
      };
    }).catch(function () {
      return null;
    });
  }

  function loadPostMetas(files) {
    return Promise.all(files.map(loadPostMeta));
  }

  /* ---------- 10. 导航高亮 ---------- */
  function highlightNav() {
    var path = location.pathname.split('/').pop();
    if (!path) path = 'index.html';
    var links = document.querySelectorAll('.main-nav a');
    Array.prototype.forEach.call(links, function (a) {
      var href = (a.getAttribute('href') || '').split('/').pop();
      if (href && href === path) a.classList.add('active');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', highlightNav);
  } else {
    highlightNav();
  }

  /* ---------- 对外暴露 ---------- */
  global.Site = {
    root: SITE_ROOT,
    escapeHtml: escapeHtml,
    fetchText: fetchText,
    fetchJSON: fetchJSON,
    postAsset: postAsset,
    splitFrontMatter: splitFrontMatter,
    parseMarkdown: parseMarkdown,
    renderToc: renderToc,
    loadPostMeta: loadPostMeta,
    loadPostMetas: loadPostMetas
  };
})(window);