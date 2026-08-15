/* ═══════════════════════════════════════════════════
   form-calc.js — محرك مشترك لحاسبات الفورم الثابت
   (رسوم، ميزانية... حقول أرقام/اختيارات ثابتة، ومعادلة خاصة بكل حاسبة)

   بعكس gpa-subject-calc.js (صفوف متكررة)، الحاسبات هنا شكلها ثابت:
   كل حاسبة عندها حقولها الخاصة ومعادلتها الخاصة، فالمحرك بيتكفّل
   بالجزء المشترك بس: قراءة القيم (مع دعم الأرقام العربية)، الحفظ
   والاسترجاع المحلي، وعرض النتيجة — والمعادلة نفسها بتتبعت كدالة
   compute() من كل صفحة.

   يعتمد على core-utils.js (لازم يتحمّل قبله في الصفحة).
   ═══════════════════════════════════════════════════ */

(function (global) {

  const { toWesternDigits, containsArabicIndicDigits, saveWithExpiry, loadWithExpiry } = global.CoreUtils;

  /**
   * config = {
   *   storageKey: string|null,
   *   fieldIds: ['fees-basic', 'fees-activities', ...],   // حقول أرقام/نص (بيتحفظوا ويتطبّع رقمهم عربي/إنجليزي)
   *   selectIds: ['months-count', ...],                    // عناصر select (بتتحفظ زي ما هي، من غير تطبيع أرقام)
   *   checkboxIds: ['cb-siblings', ...],                   // اختياري — صناديق اختيار (checkbox)
   *   calcBtnId, resultBoxId,
   *   invalidMessage: 'رسالة عند إدخال غير صحيح',
   *   compute: function(values) {
   *     // values = { fieldId: number, selectId: string, checkboxId: boolean, _arabicIndic: bool }
   *     // يرجّع null/false لو الإدخال غير صالح، أو object فيه واحد على الأقل من:
   *     //   html: 'innerHTML كامل لصندوق النتيجة' (لحاسبات بتبني نتيجتها كتلة واحدة)
   *     //   outputs: { 'elementId': 'النص المعروض', ... } (لحاسبات عندها عناصر نتيجة ثابتة بالفعل)
   *     //   innerHtmlOutputs: { 'elementId': '<div>...</div>' } (زي outputs بس بيحقن HTML مش نص عادي)
   *     //   badge: { elementId, text, bg, color } (اختياري)
   *     //   note:  { elementId, html } (اختياري)
   *   },
   *   restoreNoteId, clearBtnId, resetBtnId,  // اختياري
   *   enterToCalc: true,     // اختياري — Enter داخل أي حقل يشغّل الحساب
   *   recalcOnChange: true,  // اختياري — إعادة حساب تلقائيًا عند تغيير select/checkbox، بس لو النتيجة ظاهرة بالفعل
   *   analyticsId: 'school-fees'  // اختياري — معرّف الحاسبة في حدث calculator_used
   *                                // (لو مش موجود بيستخدم calcBtnId بدالة منه)
   * }
   */
  function initFormCalculator(config) {
    const calcBtn = document.getElementById(config.calcBtnId);
    const resultBox = document.getElementById(config.resultBoxId);
    if (!calcBtn || !resultBox) return; // الصفحة دي مش فيها الحاسبة دي

    const fieldIds = config.fieldIds || [];
    const selectIds = config.selectIds || [];
    const checkboxIds = config.checkboxIds || [];

    /* ── إعلان مباشر لقارئ الشاشة عند تحديث صندوق النتيجة ديناميكيًا ── */
    resultBox.setAttribute('aria-live', 'polite');
    resultBox.setAttribute('role', 'status');

    /* ── نظام أخطاء موحّد وقابل للوصول (بدل alert()) ──
       بيتنشئ تلقائيًا لكل حاسبة تستخدم form-calc.js من غير ما تحتاج
       تعدّل الـ HTML بتاعها. لو الصفحة عايزة رسائل خطأ لكل حقل على
       حدة، تقدر تضيف <p class="err-msg" id="err-{fieldId}"> جنب
       الحقل — والمحرك هيستخدمها لو موجودة. */
    let errorBanner = document.getElementById(config.calcBtnId + '-error-banner');
    if (!errorBanner) {
      errorBanner = document.createElement('div');
      errorBanner.id = config.calcBtnId + '-error-banner';
      errorBanner.className = 'calc-error-banner';
      errorBanner.setAttribute('role', 'alert');
      errorBanner.setAttribute('aria-live', 'assertive');
      calcBtn.parentNode.insertBefore(errorBanner, calcBtn);
    }

    function showBanner(message) {
      errorBanner.textContent = message;
      errorBanner.classList.add('show');
    }
    function hideBanner() {
      errorBanner.classList.remove('show');
      errorBanner.textContent = '';
    }
    function markFieldError(id, message) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('err');
        el.setAttribute('aria-invalid', 'true');
      }
      const msgEl = document.getElementById('err-' + id);
      if (msgEl) {
        if (message) msgEl.textContent = message;
        msgEl.classList.add('show');
        if (el) el.setAttribute('aria-describedby', 'err-' + id);
      }
    }
    function clearFieldError(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('err');
        el.removeAttribute('aria-invalid');
      }
      const msgEl = document.getElementById('err-' + id);
      if (msgEl) msgEl.classList.remove('show');
    }
    function clearAllErrors() {
      fieldIds.concat(selectIds).forEach(clearFieldError);
      hideBanner();
    }

    // امسح خطأ الحقل تلقائيًا أول ما المستخدم يعدّله
    fieldIds.concat(selectIds).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => clearFieldError(id));
    });

    function collectValues() {
      const values = {};
      let usedArabicIndic = false;
      fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (containsArabicIndicDigits(el.value)) usedArabicIndic = true;
        const western = toWesternDigits(el.value);
        values[id] = western === '' ? NaN : parseFloat(western);
      });
      selectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) values[id] = el.value;
      });
      checkboxIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) values[id] = el.checked;
      });
      values._arabicIndic = usedArabicIndic;
      return values;
    }

    function saveData(values) {
      if (!config.storageKey) return;
      saveWithExpiry(config.storageKey, { values });
    }

    function restoreData() {
      if (!config.storageKey) return;
      const saved = loadWithExpiry(config.storageKey, config.storageMaxDays);
      if (!saved || !saved.values) return;

      fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && saved.values[id] !== undefined && !isNaN(saved.values[id])) el.value = saved.values[id];
      });
      selectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && saved.values[id] !== undefined) el.value = saved.values[id];
      });
      checkboxIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && saved.values[id] !== undefined) el.checked = !!saved.values[id];
      });

      if (config.restoreNoteId) {
        const note = document.getElementById(config.restoreNoteId);
        if (note) note.style.display = 'flex';
      }
    }

    if (config.clearBtnId) {
      const clearBtn = document.getElementById(config.clearBtnId);
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          try { localStorage.removeItem(config.storageKey); } catch (e) {}
          if (config.restoreNoteId) {
            const note = document.getElementById(config.restoreNoteId);
            if (note) note.style.display = 'none';
          }
        });
      }
    }

    if (config.resetBtnId) {
      const resetBtn = document.getElementById(config.resetBtnId);
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          fieldIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
          checkboxIds.forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
          resultBox.classList.remove('show');
          clearAllErrors();
          try { if (config.storageKey) localStorage.removeItem(config.storageKey); } catch (e) {}
          if (config.restoreNoteId) {
            const note = document.getElementById(config.restoreNoteId);
            if (note) note.style.display = 'none';
          }
        });
      }
    }

    calcBtn.addEventListener('click', () => {
      const values = collectValues();
      const result = config.compute(values);

      // نمط قديم: compute() بيرجّع null/false عند خطأ عام.
      // نمط جديد (اختياري): compute() يرجّع { invalid: true, message, fields }
      // حيث fields مصفوفة IDs أو object { id: 'رسالة الخطأ الخاصة بيه' }
      // لتظليل الحقول الغلط وربطها برسائلها عبر aria-describedby.
      if (!result || result.invalid) {
        resultBox.classList.remove('show');
        const message = (result && result.message) || config.invalidMessage || 'يرجى إدخال بيانات صحيحة في جميع الحقول المطلوبة.';
        showBanner(message);
        if (result && result.fields) {
          if (Array.isArray(result.fields)) {
            result.fields.forEach(id => markFieldError(id));
          } else {
            Object.keys(result.fields).forEach(id => markFieldError(id, result.fields[id]));
          }
        }
        return;
      }

      clearAllErrors();

      if (result.html !== undefined) {
        resultBox.innerHTML = result.html;
      }

      if (result.outputs) {
        Object.keys(result.outputs).forEach(elId => {
          const el = document.getElementById(elId);
          if (el) el.textContent = result.outputs[elId];
        });
      }

      if (result.innerHtmlOutputs) {
        Object.keys(result.innerHtmlOutputs).forEach(elId => {
          const el = document.getElementById(elId);
          if (el) el.innerHTML = result.innerHtmlOutputs[elId];
        });
      }

      if (result.badge) {
        const badgeEl = document.getElementById(result.badge.elementId);
        if (badgeEl) {
          badgeEl.textContent = result.badge.text;
          badgeEl.style.background = result.badge.bg;
          badgeEl.style.color = result.badge.color;
        }
      }

      if (result.note) {
        const noteEl = document.getElementById(result.note.elementId);
        if (noteEl) {
          noteEl.innerHTML = result.note.html || '';
          noteEl.style.display = result.note.html ? 'block' : 'none';
        }
      }

      resultBox.classList.add('show');
      saveData(values);

      /* ── تتبّع حدث "استخدام حاسبة" — أهم حدث تحويل في الموقع ──
         نفس نمط faq_open في article.js. راجع نفس الملاحظة في
         gpa-subject-calc.js بخصوص تعريف dataLayer قبل الـ push. */
      try {
        global.dataLayer = global.dataLayer || [];
        global.dataLayer.push({
          event: 'calculator_used',
          calculator_id: config.analyticsId || config.calcBtnId,
          calculator_engine: 'form'
        });
      } catch (e) {}

      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (config.enterToCalc) {
      fieldIds.concat(selectIds).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') calcBtn.click(); });
      });
    }

    if (config.recalcOnChange) {
      selectIds.concat(checkboxIds).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { if (resultBox.classList.contains('show')) calcBtn.click(); });
      });
    }

    restoreData();
  }

  global.initFormCalculator = initFormCalculator;

})(window);
