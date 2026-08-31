/* ═══════════════════════════════════════════════════
   core-utils.js — دوال أساسية مشتركة بين كل محركات الحاسبات
   (form-calc.js, gpa-subject-calc.js, وأي محرك مستقبلي)

   ليه الملف ده موجود:
   قبل كده كانت دوال تطبيع الأرقام العربية (toWesternDigits،
   containsArabicIndicDigits...) متكررة حرفيًا جوه كل محرك على حدة.
   أي تعديل في منطق الأرقام كان محتاج يتكرر في أكتر من مكان.
   دلوقتي كل محرك بيستورد من هنا بدل ما يكرر نفسه.

   لازم يتحمّل بـ <script> قبل form-calc.js و gpa-subject-calc.js
   (وأي محرك جديد يحتاج نفس الدوال) في أي صفحة.
   ═══════════════════════════════════════════════════ */

(function (global) {

  const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  // "١٢٣" → "123"
  function toWesternDigits(str) {
    return String(str || '').replace(/[٠-٩]/g, d => ARABIC_INDIC_DIGITS.indexOf(d));
  }

  // "123" → "١٢٣"
  function toArabicIndicDigits(str) {
    return String(str || '').replace(/[0-9]/g, d => ARABIC_INDIC_DIGITS[+d]);
  }

  // هل النص فيه أرقام هندية-عربية أصلاً؟ (بنستخدمها لتقرر تعرض النتيجة
  // بنفس شكل الأرقام اللي المستخدم كتبها بيها)
  function containsArabicIndicDigits(str) {
    return /[٠-٩]/.test(String(str || ''));
  }

  // دالة تنسيق جاهزة: بترجع رقم كنص، بنفس نظام الأرقام اللي المستخدم
  // كتب بيه (عربي أو إنجليزي) — لتفادي تكرار شرط "useArabicIndic ? ... : ..."
  // في كل محرك
  function formatLikeInput(n, usedArabicIndic) {
    return usedArabicIndic ? toArabicIndicDigits(n) : String(n);
  }

  /* ── تخزين محلي بسياسة انتهاء موحّدة ──
     كل الحاسبات اللي بتحفظ بيانات المستخدم (رسوم، دخل، درجات...) في
     localStorage لازم تستخدم الدالتين دول بدل ما تنادي localStorage
     مباشرة، عشان نضمن:
     ١) كل حفظة عليها طابع زمني (savedAt)
     ٢) البيانات بتتمسح تلقائيًا لو عدّت مدة صلاحيتها (افتراضي ٩٠ يوم)
     البيانات فضلت دايمًا على جهاز المستخدم بس ومتتبعتش لأي سيرفر —
     ده بس بيضبط مدة بقائها هي نفسها على الجهاز. */
  const DEFAULT_MAX_AGE_DAYS = 90;

  function saveWithExpiry(key, payload) {
    try {
      const data = Object.assign({}, payload, { savedAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  // بيرجّع الـ payload المحفوظ لو لسه صالح، أو null لو مش موجود/منتهي
  // (وبيمسحه تلقائيًا من localStorage لو لقاه منتهي)
  function loadWithExpiry(key, maxAgeDays) {
    maxAgeDays = maxAgeDays || DEFAULT_MAX_AGE_DAYS;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.savedAt !== 'number') return null;

      const ageMs = Date.now() - data.savedAt;
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  /* ── الوضع الليلي (Dark Mode) ──
     كان الكود ده مكرر يدويًا وبصيغ مختلفة شوية في أكتر من 15 مقال —
     حتى تنسيق القيمة المحفوظة اختلف بين مقال وتاني ('on'/'off' مقابل
     '1'/'0')، يعني تفضيل المستخدم كان ممكن ميتنقلش صح بين صفحة وتانية.
     دلوقتي كل صفحة بس بتنادي CoreUtils.initDarkMode() وخلاص.

     محدّث: طلع إن article.js عنده fallback handler قديم بيشتغل على
     نفس الزرار في كل صفحة (كان السبب الأصلي للتنسيقين المختلفين من
     الأول). عشان أي صفحة تنادي الدالة دي أكتر من مرة (من article.js
     ومن كود الصفحة نفسها مع بعض) متعملش listener مكرر يلغي بعضه،
     الدالة بقت idempotent — أول نداء بس هو اللي بيفعّل. */
  function initDarkMode(toggleId) {
    const btn = document.getElementById(toggleId || 'dark-toggle');
    if (!btn || btn.dataset.darkInit) return;
    btn.dataset.darkInit = '1';
    if (localStorage.getItem('darkMode') === 'on') {
      document.body.classList.add('dark');
      btn.textContent = '☀️';
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.setAttribute('aria-pressed', 'false');
    }
    btn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    });
  }

  /* ── نسخ رابط الصفحة الحالي ──
     كانت الدالة دي مكررة حرفيًا (بصيغ متطابقة تقريبًا: const/var،
     arrow/function عادية) في 7 مقالات مختلفة. أي تعديل مستقبلي (مثلاً
     تغيير مدة ظهور رسالة النجاح، أو إضافة رسالة خطأ أوضح) كان الزم
     يتكرر يدويًا في السبعة كل مرة. دلوقتي أي صفحة بس بتنادي
     CoreUtils.copyPageLink() من زرار onclick، وخلاص.
     btnId اختياري — الافتراضي 'copy-link-btn' زي كل الصفحات الحالية. */
  function copyPageLink(btnId) {
    const url = window.location.href;
    const btn = document.getElementById(btnId || 'copy-link-btn');
    function flashSuccess() {
      if (!btn) return;
      btn.style.background = 'var(--success)';
      btn.style.borderColor = 'var(--success)';
      btn.style.color = '#fff';
      setTimeout(() => { btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = ''; }, 2000);
    }
    navigator.clipboard.writeText(url).then(flashSuccess).catch(() => {
      // متصفحات قديمة أو بدون صلاحية clipboard API — نفس الـ fallback
      // اللي كان مكرر في كل نسخة: textarea مؤقت + execCommand.
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flashSuccess();
    });
  }

  /* ── عداد المشاهدات الحقيقي (عبر /api/views، مبني على Cloudflare KV) ──
     كان العداد قبل كده معادلة وهمية (base + أيام×معدل) مكررة ومختلفة
     شوية في كل مقالة. دلوقتي رقم حقيقي بيتزوّد فعليًا مع كل زيارة، عبر
     نداء واحد مركزي. لو الطلب فشل (مثلاً تخطينا حد الـ 1000 كتابة
     المجاني اليومي، أو مفيش إنترنت)، بنسيب النص الافتراضي "—" زي ما هو
     بهدوء — hideEmptyViewCounter في article.js أصلاً بيخفي العنصر كله
     في الحالة دي، فمفيش داعي نتعامل مع الخطأ هنا تاني.
     pageSlug: حروف/أرقام/شرطات بس (نفس تنسيق الـ page slug في الـ API). */
  async function initViewCounter(elId, pageSlug) {
    const el = document.getElementById(elId);
    if (!el || !pageSlug) return;
    try {
      const res = await fetch(`/api/views?page=${encodeURIComponent(pageSlug)}`, { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.views === 'number') {
        el.textContent = data.views.toLocaleString('ar-SA');
      }
    } catch (e) {
      // فشل الشبكة أو أي خطأ تاني — نسيب "—" الافتراضي، مفيش داعي نكسر الصفحة.
    }
    return el.textContent.trim();
  }

  global.CoreUtils = {
    toWesternDigits,
    toArabicIndicDigits,
    containsArabicIndicDigits,
    formatLikeInput,
    saveWithExpiry,
    loadWithExpiry,
    initDarkMode,
    copyPageLink,
    initViewCounter
  };

})(window);
