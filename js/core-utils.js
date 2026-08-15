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
    }
    btn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      btn.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    });
  }

  global.CoreUtils = {
    toWesternDigits,
    toArabicIndicDigits,
    containsArabicIndicDigits,
    formatLikeInput,
    saveWithExpiry,
    loadWithExpiry,
    initDarkMode
  };

})(window);
