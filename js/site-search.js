/* ═══════════════════════════════════════════════════
   site-search.js — منطق شريط البحث الموحّد
   يعتمد على window.SITE_SEARCH_INDEX من site-search-data.js
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْ]/g, '');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, query) {
    if (!query) return text;
    var nText = normalize(text);
    var nQuery = normalize(query);
    var idx = nText.indexOf(nQuery);
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      '<mark>' + text.slice(idx, idx + query.length) + '</mark>' +
      text.slice(idx + query.length)
    );
  }

  function init() {
    var index = window.SITE_SEARCH_INDEX || [];
    var form = document.getElementById('site-search-form');
    var input = document.getElementById('site-search-input');
    var clearBtn = document.getElementById('site-search-clear');
    var resultsBox = document.getElementById('site-search-results');
    if (!form || !input || !resultsBox) return;

    var activeIndex = -1;
    var currentMatches = [];

    function closeResults() {
      resultsBox.classList.remove('show');
      resultsBox.innerHTML = '';
      activeIndex = -1;
      currentMatches = [];
    }

    function render(query) {
      var nQuery = normalize(query);
      if (!nQuery) { closeResults(); return; }

      var matches = index
        .map(function (item) {
          var nTitle = normalize(item.title);
          var score = nTitle.indexOf(nQuery);
          return { item: item, score: score };
        })
        .filter(function (m) { return m.score !== -1; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, 8)
        .map(function (m) { return m.item; });

      currentMatches = matches;
      activeIndex = -1;

      if (!matches.length) {
        resultsBox.innerHTML =
          '<div class="site-search-empty">😕 لا توجد نتائج مطابقة لـ «' +
          escapeHtml(query) + '»</div>';
        resultsBox.classList.add('show');
        return;
      }

      var html = '';
      var lastCat = null;
      matches.forEach(function (item) {
        if (item.category !== lastCat) {
          html += '<div class="site-search-cat">' + item.category + '</div>';
          lastCat = item.category;
        }
        html +=
          '<a class="site-search-item" href="' + item.url + '">' +
          '<span class="site-search-item-icon">🔎</span>' +
          '<span>' + highlight(item.title, query) + '</span>' +
          '</a>';
      });
      resultsBox.innerHTML = html;
      resultsBox.classList.add('show');
    }

    function setActive(i) {
      var items = resultsBox.querySelectorAll('.site-search-item');
      items.forEach(function (el) { el.classList.remove('active'); });
      if (items[i]) {
        items[i].classList.add('active');
        items[i].scrollIntoView({ block: 'nearest' });
      }
      activeIndex = i;
    }

    input.addEventListener('input', function () {
      clearBtn.classList.toggle('show', !!input.value);
      render(input.value.trim());
    });

    input.addEventListener('keydown', function (e) {
      var items = resultsBox.querySelectorAll('.site-search-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((activeIndex + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((activeIndex - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        if (activeIndex > -1 && items[activeIndex]) {
          e.preventDefault();
          window.location.href = items[activeIndex].getAttribute('href');
        }
      } else if (e.key === 'Escape') {
        closeResults();
        input.blur();
      }
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      clearBtn.classList.remove('show');
      closeResults();
      input.focus();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (currentMatches[0]) {
        window.location.href = currentMatches[0].url;
      }
    });

    document.addEventListener('click', function (e) {
      if (!form.contains(e.target) && !resultsBox.contains(e.target)) {
        closeResults();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
