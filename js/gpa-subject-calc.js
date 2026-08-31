/* ═══════════════════════════════════════════════════
   gpa-subject-calc.js — محرك مشترك لحاسبات GPA القائمة على صفوف مواد
   (اسم مادة + ساعات معتمدة + درجة → GPA)

   كل صفحة بتستدعي initSubjectGpaCalculator(config) بإعدادات
   خاصة بيها (IDs العناصر + جدول نقاط الدرجات)، بدل ما تكرر نفس
   منطق الحساب/الحفظ/الاسترجاع/كشف الأرقام العربية في كل ملف.

   ملاحظة: مقياس التقييم (grade points map) ثابت واحد لكل نسخة
   حاسبة حاليًا — نفس السلوك الأصلي قبل توحيد الكود.

   يعتمد على core-utils.js (لازم يتحمّل قبله في الصفحة).
   ═══════════════════════════════════════════════════ */

(function (global) {

  const { toWesternDigits, toArabicIndicDigits, containsArabicIndicDigits, saveWithExpiry, loadWithExpiry } = global.CoreUtils;

  /* اسم المادة اللي المستخدم بيكتبه بيتحط في مكانين: (1) جوه سمة
     value="..." وقت بناء الصف، و(2) جوه نص عادي بين <span>...</span>
     وقت عرض نتيجة الحساب. السياق التاني ده خطير فعليًا — لو الاسم فيه
     "<img src=x onerror=...>" هيتنفذ كـ HTML حقيقي مش نص. escapeHtml
     هنا بتغطي الحالتين مع بعض (مش بس علامة الاقتباس زي إصدار قديم). */
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function buildRowHTML(gradeOptionsHtml, data) {
    data = data || { name: '', credits: '', grade: '' };
    const esc = escapeHtml;
    return `
    <div>
      <label>اسم المادة (اختياري)</label>
      <input type="text" placeholder="مثال: فيزياء" class="subj-name" value="${esc(data.name)}">
    </div>
    <div>
      <label>الساعات المعتمدة</label>
      <input type="text" inputmode="numeric" placeholder="3" class="subj-credits" value="${esc(data.credits)}" aria-describedby="">
    </div>
    <div>
      <label>الدرجة</label>
      <select class="subj-grade">${gradeOptionsHtml}</select>
    </div>
    <button class="remove-btn" type="button" aria-label="حذف المادة">×</button>
    <p class="err-msg row-err-msg" role="alert"></p>
  `;
  }

  function badgeFor(gpa) {
    if (gpa >= 3.7) return { text: '🏆 امتياز مع مرتبة الشرف', bg: '#d4f0e0', color: '#1e7e4a' };
    if (gpa >= 3.3) return { text: '🥇 امتياز', bg: '#d4f0e0', color: '#1e7e4a' };
    if (gpa >= 3.0) return { text: '🥈 جيد جداً', bg: '#e8f4fd', color: '#2557a7' };
    if (gpa >= 2.5) return { text: '🥉 جيد', bg: '#fff8e8', color: '#b8720a' };
    if (gpa >= 2.0) return { text: '📘 مقبول', bg: '#fff8e8', color: '#b8720a' };
    return { text: '⚠️ تحت المعدل المقبول', bg: '#fde8e6', color: '#c0392b' };
  }

  /**
   * config = {
   *   storageKey: string|null,       // مفتاح الحفظ المحلي، أو null لتعطيل الحفظ
   *   containerId, addBtnId, calcBtnId, breakdownId, resultBoxId,  // IDs عناصر أساسية
   *
   *   // مقياس ثابت واحد (الوضع البسيط):
   *   gradePoints: { 'A+': 4.3, ... , 'P': null },
   *   gradeOptionsHtml: '<option value="">اختر</option>...',
   *   scaleMax: 4.3,   // أعلى نقطة ممكنة في المقياس (لتطبيع الشارة)، افتراضي 4.3
   *
   *   // أو عدة مقاييس قابلة للاختيار (الوضع متعدد المقاييس):
   *   scaleSelectId: 'scale-select',
   *   scales: {
   *     standard: { gradePoints: {...}, gradeOptionsHtml: '...', max: 4.0 },
   *     plus:     { gradePoints: {...}, gradeOptionsHtml: '...', max: 4.3 },
   *     '5':      { gradePoints: {...}, gradeOptionsHtml: '...', max: 5.0 }
   *   },
   *
   *   outputs: { totalCredits, totalPoints, gpa, badge, passNote }, // IDs عرض النتائج
   *   restoreNoteId, clearBtnId,  // اختياري — لإشعار الاسترجاع وزرار المسح
   *   analyticsId: 'gpa-subject'  // اختياري — معرّف الحاسبة في حدث calculator_used
   *                               // (لو مش موجود بيستخدم calcBtnId بدالة منه)
   * }
   */
  function initSubjectGpaCalculator(config) {
    const container = document.getElementById(config.containerId);
    const addBtn = document.getElementById(config.addBtnId);
    const calcBtn = document.getElementById(config.calcBtnId);
    const breakdown = document.getElementById(config.breakdownId);
    const resultBox = document.getElementById(config.resultBoxId);
    if (!container || !addBtn || !calcBtn || !breakdown || !resultBox) return; // الصفحة دي مش فيها الحاسبة دي

    const out = config.outputs || {};
    const scaleEl = config.scaleSelectId ? document.getElementById(config.scaleSelectId) : null;

    /* ── إعلان مباشر لقارئ الشاشة عند تحديث صندوق النتيجة ديناميكيًا ── */
    resultBox.setAttribute('aria-live', 'polite');
    resultBox.setAttribute('role', 'status');

    /* ── نظام أخطاء موحّد وقابل للوصول (بدل alert()) ── */
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
    function markRowError(row, message) {
      const credits = row.querySelector('.subj-credits');
      const grade = row.querySelector('.subj-grade');
      if (credits) { credits.classList.add('err'); credits.setAttribute('aria-invalid', 'true'); }
      if (grade) { grade.classList.add('err'); grade.setAttribute('aria-invalid', 'true'); }
      const msgEl = row.querySelector('.row-err-msg');
      if (msgEl) { msgEl.textContent = message; msgEl.classList.add('show'); }
    }
    function clearRowError(row) {
      const credits = row.querySelector('.subj-credits');
      const grade = row.querySelector('.subj-grade');
      if (credits) { credits.classList.remove('err'); credits.removeAttribute('aria-invalid'); }
      if (grade) { grade.classList.remove('err'); grade.removeAttribute('aria-invalid'); }
      const msgEl = row.querySelector('.row-err-msg');
      if (msgEl) { msgEl.classList.remove('show'); msgEl.textContent = ''; }
    }
    function clearAllRowErrors() {
      container.querySelectorAll('.subject-row').forEach(clearRowError);
      hideBanner();
    }

    // امسح خطأ الصف تلقائيًا أول ما المستخدم يعدّل حقل فيه
    container.addEventListener('input', (e) => {
      const row = e.target.closest('.subject-row');
      if (row) clearRowError(row);
    });
    container.addEventListener('change', (e) => {
      const row = e.target.closest('.subject-row');
      if (row) clearRowError(row);
    });

    // إعدادات المقياس الحالي (يدعم مقياس ثابت واحد أو عدة مقاييس قابلة للاختيار)
    function activeScale() {
      if (scaleEl && config.scales && config.scales[scaleEl.value]) {
        const s = config.scales[scaleEl.value];
        return { gradePoints: s.gradePoints, gradeOptionsHtml: s.gradeOptionsHtml, max: s.max || 4.3 };
      }
      return { gradePoints: config.gradePoints, gradeOptionsHtml: config.gradeOptionsHtml, max: config.scaleMax || 4.3 };
    }

    function removeRow(btn) {
      const rows = container.querySelectorAll('.subject-row');
      if (rows.length > 1) btn.closest('.subject-row').remove();
    }

    // تفويض النقر لزرار الحذف بدل onclick inline (يشتغل مع الصفوف المضافة ديناميكيًا والمستردة من الحفظ)
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-btn');
      if (btn) removeRow(btn);
    });

    addBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'subject-row';
      row.innerHTML = buildRowHTML(activeScale().gradeOptionsHtml);
      container.appendChild(row);
    });

    // لما المستخدم يغيّر المقياس، نحدّث خيارات الدرجة في كل الصفوف الموجودة
    // (ونحافظ على الدرجة المختارة لو موجودة في المقياس الجديد، وإلا نفرّغها)
    if (scaleEl && config.scales) {
      scaleEl.addEventListener('change', () => {
        const scale = activeScale();
        container.querySelectorAll('.subject-row').forEach(row => {
          const select = row.querySelector('.subj-grade');
          const prevValue = select.value;
          select.innerHTML = scale.gradeOptionsHtml;
          if (prevValue && scale.gradePoints.hasOwnProperty(prevValue)) {
            select.value = prevValue;
          }
        });
      });
    }

    function saveData() {
      if (!config.storageKey) return;
      const rows = container.querySelectorAll('.subject-row');
      const subjects = Array.from(rows).map(row => ({
        name: row.querySelector('.subj-name').value,
        credits: row.querySelector('.subj-credits').value,
        grade: row.querySelector('.subj-grade').value
      }));
      const payload = { subjects };
      if (scaleEl) payload.scale = scaleEl.value;
      saveWithExpiry(config.storageKey, payload);
    }

    function restoreData() {
      if (!config.storageKey) return;
      const saved = loadWithExpiry(config.storageKey, config.storageMaxDays);
      if (!saved || !Array.isArray(saved.subjects) || saved.subjects.length === 0) return;

      if (scaleEl && saved.scale) {
        scaleEl.value = saved.scale;
      }

      const scale = activeScale();
      container.innerHTML = '';
      saved.subjects.forEach(subj => {
        const row = document.createElement('div');
        row.className = 'subject-row';
        row.innerHTML = buildRowHTML(scale.gradeOptionsHtml, subj);
        if (subj.grade) row.querySelector('.subj-grade').value = subj.grade;
        container.appendChild(row);
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

    calcBtn.addEventListener('click', () => {
      const scale = activeScale();
      const rows = container.querySelectorAll('.subject-row');
      let totalCredits = 0, totalPoints = 0;
      let passCount = 0, passCredits = 0;
      breakdown.innerHTML = '';
      let valid = true;

      clearAllRowErrors();

      const useArabicIndic = Array.from(rows).some(row => containsArabicIndicDigits(row.querySelector('.subj-credits').value));
      const fmt = (n) => global.CoreUtils.formatLikeInput(n, useArabicIndic);

      rows.forEach(row => {
        const name = row.querySelector('.subj-name').value || 'مادة';
        const rawCredits = toWesternDigits(row.querySelector('.subj-credits').value);
        const credits = parseFloat(rawCredits);
        const grade = row.querySelector('.subj-grade').value;

        if (!grade || isNaN(credits) || credits <= 0 || credits > 6) {
          valid = false;
          const msg = !grade
            ? 'يرجى اختيار الدرجة.'
            : (isNaN(credits) ? 'يرجى إدخال الساعات المعتمدة.' : 'الساعات المعتمدة يجب أن تكون بين 1 و6.');
          markRowError(row, msg);
          return;
        }

        if (grade === 'P') {
          passCount++;
          passCredits += credits;
          const r = document.createElement('div');
          r.className = 'result-row';
          r.innerHTML = `<span>${escapeHtml(name)} (${fmt(credits)} ساعة)</span><span class="result-val" style="color:var(--success);">Pass ✓</span>`;
          breakdown.appendChild(r);
          return;
        }

        const pts = scale.gradePoints[grade];
        const qualityPts = pts * credits;
        totalCredits += credits;
        totalPoints += qualityPts;

        const r = document.createElement('div');
        r.className = 'result-row';
        r.style.fontSize = '14px';
        r.innerHTML = `<span>${escapeHtml(name)} (${fmt(credits)}س × ${fmt(pts)})</span><span class="result-val">${fmt(qualityPts.toFixed(2))}</span>`;
        breakdown.appendChild(r);
      });

      if (!valid || totalCredits === 0) {
        resultBox.classList.remove('show');
        showBanner(!valid
          ? 'في مواد فيها بيانات ناقصة أو غير صحيحة — تظهر مظلّلة تحت.'
          : 'يرجى إدخال مادة واحدة على الأقل (بخلاف Pass) لحساب المعدل.');
        return;
      }

      hideBanner();
      const gpa = (totalPoints / totalCredits).toFixed(2);

      if (out.totalCredits) document.getElementById(out.totalCredits).textContent = fmt(totalCredits) + ' ساعة';
      if (out.totalPoints) document.getElementById(out.totalPoints).textContent = fmt(totalPoints.toFixed(2));
      if (out.gpa) document.getElementById(out.gpa).textContent = fmt(gpa);

      if (out.badge) {
        const badgeEl = document.getElementById(out.badge);
        // نطبّع القيمة إلى مقياس 4.3 قبل تحديد الشارة، عشان الشارات تفضل دقيقة
        // بصرف النظر عن مقياس التقييم المختار (4.0 عادي، Plus/Minus، أو 5.0)
        const normalizedGpa = (gpa / scale.max) * 4.3;
        const b = badgeFor(normalizedGpa);
        badgeEl.textContent = b.text;
        badgeEl.style.background = b.bg;
        badgeEl.style.color = b.color;
      }

      if (out.passNote) {
        const passNote = document.getElementById(out.passNote);
        if (passCount > 0) {
          passNote.style.display = 'block';
          passNote.innerHTML = `<strong>📝 ملاحظة Pass/Fail:</strong> تم استثناء ${fmt(passCount)} مادة (${fmt(passCredits)} ساعة) من حساب GPA لأنها Pass. ساعاتها تُحتسب للتخرج فقط.`;
        } else {
          passNote.style.display = 'none';
        }
      }

      resultBox.classList.add('show');
      saveData();

      /* ── تتبّع حدث "استخدام حاسبة" — أهم حدث تحويل في الموقع ──
         نفس نمط faq_open في article.js: push محاط بـ try/catch عشان
         عدم وجود dataLayer (أو GTM مش متحمّل) میوقفش الحاسبة نفسها.
         نتأكد إن المصفوفة موجودة (بدل الاعتماد على GTM إنه عرّفها)
         عشان الحدث يفضل في الطابور ويتاخد لو GTM اتحمّل بعد كده. */
      try {
        global.dataLayer = global.dataLayer || [];
        global.dataLayer.push({
          event: 'calculator_used',
          calculator_id: config.analyticsId || config.calcBtnId,
          calculator_engine: 'gpa-subject'
        });
      } catch (e) {}

      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // نضبط خيارات الدرجة في أي صفوف موجودة بالفعل في HTML (الصف الافتراضي مثلاً)
    // لتطابق المقياس المختار افتراضيًا، قبل أي استرجاع من الحفظ المحلي
    if (scaleEl && config.scales) {
      const scale = activeScale();
      container.querySelectorAll('.subject-row').forEach(row => {
        const select = row.querySelector('.subj-grade');
        const prevValue = select.value;
        select.innerHTML = scale.gradeOptionsHtml;
        if (prevValue && scale.gradePoints.hasOwnProperty(prevValue)) select.value = prevValue;
      });
    }

    restoreData();
  }

  global.initSubjectGpaCalculator = initSubjectGpaCalculator;

})(window);
