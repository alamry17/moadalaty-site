/* ═══════════════════════════════════════════════════
   article.js — وظائف مشتركة لكل المقالات
   حاسبة الرسوم المدرسية الذكية
   v1.2:
     • تحديث السنة يمر على text nodes فقط
     • aria-current="location" على رابط الـ TOC النشط
     • إخفاء .view-meta لما يكون العداد فاضي ("—")
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. Reading Progress Bar ── */
  const bar = document.getElementById('reading-progress-bar');
  if (bar) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      bar.style.width = Math.min(pct, 100) + '%';
    }, { passive: true });
  }

  /* ── 2. Dark Mode Toggle ──
     محدّث: بيستخدم CoreUtils.initDarkMode() الموحّدة لو core-utils.js
     متحمّل في الصفحة (وبقت الدالة idempotent فمفيش خطر تكرار listener
     حتى لو الصفحة نفسها بتناديها كمان). fallback بسيط بس لصفحات
     مفيهاش core-utils.js خالص — بنفس تنسيق 'on'/'off' الموحّد. */
  const darkBtn = document.getElementById('dark-toggle');
  if (darkBtn) {
    if (window.CoreUtils && typeof window.CoreUtils.initDarkMode === 'function') {
      window.CoreUtils.initDarkMode();
    } else if (!darkBtn.dataset.darkInit) {
      darkBtn.dataset.darkInit = '1';
      const saved = localStorage.getItem('darkMode');
      if (saved === 'on') { document.body.classList.add('dark'); darkBtn.textContent = '☀️'; }
      darkBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        darkBtn.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('darkMode', isDark ? 'on' : 'off');
      });
    }
  }

  /* ── 3. Scroll-to-Top ── */
  const scrollTop = document.getElementById('scroll-top');
  if (scrollTop) {
    window.addEventListener('scroll', () => {
      scrollTop.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ── 4. TOC Active Link (مع aria-current لقارئات الشاشة) ── */
  const tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length) {
    const sections = Array.from(tocLinks)
      .map(a => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    const onScroll = () => {
      let active = sections[0];
      sections.forEach(s => { if (window.scrollY >= s.offsetTop - 100) active = s; });
      tocLinks.forEach(a => {
        const isActive = a.getAttribute('href') === '#' + active?.id;
        a.classList.toggle('active', isActive);
        if (isActive) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── 5. FAQ using <details> (native — no JS needed, but track analytics) ── */
  document.querySelectorAll('.faq-item details').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        const q = d.querySelector('summary')?.textContent?.trim();
        // ملحوظة: كان بيستخدم window.dataLayer?.push — لو GTM لسه ما
        // اتحمّلش (أو مش موجود في الصفحة أصلاً)، الـ optional chaining كان
        // بيتجاهل الحدث بصمت من غير ما ينشئ الطابور. هنا بنضمن وجود
        // المصفوفة الأول عشان الحدث يفضل في الطابور ويتاخد لو GTM اتحمّل بعدين.
        try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: 'faq_open', question: q }); } catch(e) {}
      }
    });
  });

  /* ── 6. Copy Page Link ── */
  window.copyPageLink = function() {
    const btn = document.getElementById('copy-link-btn');
    navigator.clipboard.writeText(window.location.href).then(() => {
      if (btn) {
        const orig = btn.style.cssText;
        btn.style.background = 'var(--success)';
        btn.style.borderColor = 'var(--success)';
        btn.style.color = '#fff';
        setTimeout(() => btn.style.cssText = orig, 2000);
      }
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  };

  /* ── 7. Hide view-meta لما يكون العداد فاضي ── */
  (function hideEmptyViewCounter() {
    const vc = document.getElementById('view-count');
    if (!vc) return;
    const txt = vc.textContent.trim();
    if (txt === '—' || txt === '' || txt === '0') {
      const parent = vc.closest('.view-meta');
      if (parent) parent.style.display = 'none';
    }
  })();

  /* ── 9. Copy Embed Code — لأي قسم "ضيف الحاسبة دي في موقعك" (widgets/*) ──
     نفس المنطق كان مكرر داخل كل مقال فيه ودجت قابل للتضمين (gpa-mistakes.html
     كان أول واحد). دلوقتي مركزي هنا عشان أي مقال جديد فيه ودجت يستدعيه
     بـ ids بتاعته من غير ما يعيد كتابة نفس دالة النسخ. */
  window.copyEmbedCode = function(textId, btnId) {
    const textEl = document.getElementById(textId);
    const btn = document.getElementById(btnId);
    if (!textEl || !btn) return;
    const text = textEl.textContent;
    const done = () => { btn.textContent = '✅ تم النسخ!'; setTimeout(() => { btn.textContent = '📋 نسخ الكود'; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        done();
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      done();
    }
  };

  /* ── 8. Date handling moved to build-time (see /workspace/build_update_dates.py) ── */
  // Why: client-side date auto-update on every page load can be flagged by Google
  // as freshness manipulation (same content, new date every crawl).
  // Build script updates dateModified once at deploy, reflecting real changes.
  // If you re-publish content without changes, just don't run the build script.

});
/* ═══════════════════════════════════════════════════
   NOTE: الكود الخاص بالحاسبات والـ Timers يبقى داخل
   كل مقال منفرداً لأنه مختلف من مقال لآخر.
   ═══════════════════════════════════════════════════ */
