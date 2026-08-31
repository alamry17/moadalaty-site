/* ═══════════════════════════════════════════════════
   tip-bill-split-calculator.js — محرك حاسبة تقسيم الفاتورة والبقشيش
   نفس نمط form-calc.js / gpa-subject-calc.js: يعتمد على
   CoreUtils (core-utils.js) للحفظ المحلي والوضع الليلي،
   ولازم يتحمّل بعد core-utils.js في الصفحة.
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ════ DOM References ════ */
  const billInput      = $('bill');
  const tipCustomInput = $('tipCustom');
  const peopleInput    = $('people');
  const tipButtons     = document.querySelectorAll('.tip-btn');

  const displayBill     = $('displayBill');
  const tipAmountEl     = $('tipAmount');
  const totalWithTipEl  = $('totalWithTip');
  const perPersonTipEl  = $('perPersonTip');
  const perPersonTotalEl= $('perPersonTotal');
  const tipPctLabelEl   = $('tipPctLabel');
  const resultsEl       = $('results');
  const saveToast       = $('saveToast');

  /* ════ State ════ */
  let _r          = {};
  let activeTipPct = 15;
  let calcDebounce = null;
  let toastTimer   = null;

  const _fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
  const money = v => {
    const n = Number(v);
    return Number.isFinite(n) ? `${_fmt.format(n)} ج.م` : '---';
  };

  /* ════ Auto-Save (٩٠ يوم صلاحية عبر CoreUtils) ════ */
  const STORAGE_KEY = 'tipSplit_v1';
  function saveData() {
    const effectiveTipPct = tipCustomInput.value.trim() !== ''
      ? parseFloat(tipCustomInput.value)
      : activeTipPct;
    const ok = CoreUtils.saveWithExpiry(STORAGE_KEY, {
      bill  : billInput.value,
      tipPct: effectiveTipPct,
      custom: tipCustomInput.value,
      people: peopleInput.value
    });
    if (ok) {
      clearTimeout(toastTimer);
      saveToast.textContent = '💾 تم الحفظ تلقائياً';
      saveToast.style.display = 'block';
      saveToast.style.animation = 'fadeUp .3s ease';
      toastTimer = setTimeout(() => {
        saveToast.style.animation = 'toastFade .4s ease forwards';
        setTimeout(() => { saveToast.style.display = 'none'; }, 400);
      }, 1800);
    }
  }
  function loadData() {
    const d = CoreUtils.loadWithExpiry(STORAGE_KEY);
    if (!d) return;
    if (d.bill   !== undefined) billInput.value      = d.bill;
    if (d.people !== undefined) peopleInput.value    = d.people;
    if (d.custom !== undefined) tipCustomInput.value = d.custom;
    if (d.tipPct !== undefined) selectTipPct(d.tipPct, false, true);
  }

  /* ════ Validation ════ */
  window.clearErr = function (id) {
    const inp = $(id), msg = $('err-' + id);
    if (inp) { inp.classList.remove('err'); inp.removeAttribute('aria-invalid'); inp.removeAttribute('aria-describedby'); }
    if (msg) msg.classList.remove('show');
  };
  function showErr(id) {
    const inp = $(id), msg = $('err-' + id);
    if (inp) { inp.classList.add('err'); inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', 'err-' + id); }
    if (msg) msg.classList.add('show');
  }

  /* ════ Tip % selection (أزرار سريعة + قيمة مخصصة) ════ */
  function selectTipPct(pct, fromClick, skipCalc) {
    activeTipPct = pct;
    tipButtons.forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.pct) === pct);
    });
    // لو القيمة مش من الأزرار الجاهزة، اعتبرها مخصّصة واعرضها في حقل الإدخال
    const presetValues = Array.from(tipButtons).map(b => Number(b.dataset.pct));
    if (!presetValues.includes(pct)) {
      tipCustomInput.value = pct;
    } else if (fromClick) {
      tipCustomInput.value = '';
    }
    if (!skipCalc) liveCalculate();
  }

  /* ════ Calculate ════ */
  function getFormData() {
    const billVal = Number(billInput.value);
    const peopleVal = Number(peopleInput.value);
    const customRaw = tipCustomInput.value.trim();
    let tipPct = activeTipPct;
    if (customRaw !== '') {
      const n = Number(customRaw);
      tipPct = Number.isFinite(n) ? n : NaN;
    }
    return {
      bill  : Number.isFinite(billVal) ? billVal : 0,
      people: Number.isInteger(peopleVal) && peopleVal > 0 ? peopleVal : 1,
      tipPct
    };
  }

  function validate(bill, people, tipPct) {
    clearErr('bill');
    clearErr('people');
    clearErr('tipCustom');
    let ok = true;
    if (!(bill > 0))  { showErr('bill');   ok = false; }
    if (!(people >= 1)) { showErr('people'); ok = false; }
    if (!Number.isFinite(tipPct) || tipPct < 0 || tipPct > 100) { showErr('tipCustom'); ok = false; }
    return ok;
  }

  function calculate(scrollToResults = true) {
    const { bill, people, tipPct } = getFormData();
    if (!validate(bill, people, tipPct)) return;

    const tipAmount    = bill * (tipPct / 100);
    const totalWithTip = bill + tipAmount;
    const perPersonTip   = tipAmount / people;
    const perPersonTotal = totalWithTip / people;

    _r = { bill, people, tipPct, tipAmount, totalWithTip, perPersonTip, perPersonTotal };

    displayBill.innerText      = money(bill);
    tipPctLabelEl.innerText    = `${tipPct}%`;
    tipAmountEl.innerText      = money(tipAmount);
    totalWithTipEl.innerText   = money(totalWithTip);
    perPersonTipEl.innerText   = money(perPersonTip);
    perPersonTotalEl.innerText = money(perPersonTotal);

    resultsEl.classList.remove('hidden');
    if (scrollToResults) setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

    saveData();
  }

  window.liveCalculate = function () {
    clearTimeout(calcDebounce);
    calcDebounce = setTimeout(() => calculate(false), 200);
  };

  /* ════ تحميل مكتبات PDF/Excel وقت الحاجة بس (Lazy Load) ════
     كانت الأربع مكتبات دي (html2pdf, jsPDF, html2canvas, xlsx) بتتحمّل
     synchronous في <head> مع كل زيارة للصفحة حتى لو الزائر أصلًا معملش
     PDF/Excel. دلوقتي بتتحمّل ديناميكيًا أول ما يضغط الزرار المعني بس. */
  const _loadedScripts = new Map();
  function loadScriptOnce(primarySrc, fallbackSrc) {
    if (_loadedScripts.has(primarySrc)) return _loadedScripts.get(primarySrc);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = primarySrc;
      s.onload = () => resolve();
      s.onerror = () => {
        if (!fallbackSrc) { reject(new Error('script load failed: ' + primarySrc)); return; }
        const s2 = document.createElement('script');
        s2.src = fallbackSrc;
        s2.onload = () => resolve();
        s2.onerror = () => reject(new Error('script load failed: ' + fallbackSrc));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    _loadedScripts.set(primarySrc, p);
    return p;
  }
  // html2pdf.bundle.min.js فيه jsPDF/html2canvas جواه أصلًا (bundled) —
  // بنحمّله لوحده الأول، والنسخة المنفصلة بترجع بس لو فشل فعليًا.
  async function ensurePdfLibs() {
    await loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ).catch(() => { /* هيتعامل معاها saveAsPDF بمحاولة الـ fallback */ });
  }
  async function ensureFallbackPdfLibs() {
    await Promise.all([
      loadScriptOnce(
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      ),
      loadScriptOnce(
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      ),
    ]).catch(() => { /* هيتعامل معاها saveAsPDF بالـ alert لو الشرط مش متحقق */ });
  }
  async function ensureXlsxLib() {
    await loadScriptOnce(
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    ).catch(() => { /* هيتعامل معاها exportToExcel بالـ alert */ });
  }

  /* ════ PDF — نفس نمط html2pdf أولاً ثم html2canvas+jsPDF fallback ════ */
  async function saveAsPDF(btn, targetId) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-1"></i> جاري التجهيز...';
    btn.disabled = true;

    await ensurePdfLibs();

    const isDark  = document.body.classList.contains('dark');
    const element = $(targetId);

    if (window.html2pdf) {
      try {
        await html2pdf().set({
          margin: 8,
          filename: `تقسيم_الفاتورة.pdf`,
          image: { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 2.5, backgroundColor: isDark ? '#0f172a' : '#ffffff', useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
        btn.innerHTML = orig; btn.disabled = false;
        return;
      } catch (err) { console.error('html2pdf failed:', err); /* fallback */ }
    }

    await ensureFallbackPdfLibs();

    if (window.html2canvas && window.jspdf) {
      try {
        const canvas = await html2canvas(element, {
          scale: 2.5, backgroundColor: isDark ? '#0f172a' : '#ffffff',
          logging: false, useCORS: true
        });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw  = pdf.internal.pageSize.getWidth();
        const img = canvas.toDataURL('image/png');
        const imgH = (canvas.height * pw) / canvas.width;
        pdf.addImage(img, 'PNG', 0, 0, pw, imgH);
        pdf.save(`تقسيم_الفاتورة.pdf`);
      } catch (err) {
        console.error('PDF generation failed:', err);
        alert('حدث خطأ أثناء إنشاء PDF. تأكد من أن النتائج ظاهرة أولاً.');
      }
    } else {
      alert('مكتبة PDF غير متاحة الآن، يرجى المحاولة لاحقاً.');
    }

    btn.innerHTML = orig; btn.disabled = false;
  }

  /* ════ Excel ════ */
  async function exportToExcel() {
    if (!_r.bill) { alert('احسب النتيجة أولاً.'); return; }
    if (!window.XLSX) await ensureXlsxLib();
    if (!window.XLSX) { alert('مكتبة Excel غير متاحة الآن.'); return; }

    const data = [
      ['معدلاتي — حاسبة تقسيم الفاتورة والبقشيش', ''],
      [''],
      ['إجمالي الفاتورة', _r.bill],
      ['نسبة البقشيش', _r.tipPct],
      ['قيمة البقشيش', _r.tipAmount],
      ['الإجمالي شامل البقشيش', _r.totalWithTip],
      ['عدد الأشخاص', _r.people],
      ['نصيب الفرد من البقشيش', _r.perPersonTip],
      ['نصيب الفرد الإجمالي', _r.perPersonTotal]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
    const currencyFmt = '#,##0.00" ج.م"';
    ['B3', 'B5', 'B6', 'B8', 'B9'].forEach(ref => { if (ws[ref]) ws[ref].z = currencyFmt; });
    if (ws['B4']) ws['B4'].z = '0"%"';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقسيم الفاتورة');
    XLSX.writeFile(wb, `تقسيم_الفاتورة.xlsx`);
  }

  /* ════ WhatsApp ════ */
  function shareWhatsApp() {
    if (!_r.bill) { alert('احسب النتيجة أولاً.'); return; }
    const text =
      `🧾 *معدلاتي — تقسيم الفاتورة والبقشيش*\n\n` +
      `💰 إجمالي الفاتورة: ${money(_r.bill)}\n` +
      `💵 البقشيش (${_r.tipPct}%): ${money(_r.tipAmount)}\n` +
      `✅ الإجمالي: ${money(_r.totalWithTip)}\n` +
      `👥 عدد الأشخاص: ${_r.people}\n` +
      `🔖 نصيب الفرد: ${money(_r.perPersonTotal)}\n\n` +
      `جرّبها بنفسك: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener,noreferrer');
  }

  /* ════ Copy ════ */
  function copyResult(btn) {
    const text =
      `معدلاتي — تقسيم الفاتورة والبقشيش\n` +
      `إجمالي الفاتورة: ${_r.bill ? money(_r.bill) : '---'}\n` +
      `البقشيش (${_r.tipPct || 0}%): ${_r.tipAmount !== undefined ? money(_r.tipAmount) : '---'}\n` +
      `الإجمالي: ${_r.totalWithTip !== undefined ? money(_r.totalWithTip) : '---'}\n` +
      `عدد الأشخاص: ${_r.people || '---'}\n` +
      `نصيب الفرد: ${_r.perPersonTotal !== undefined ? money(_r.perPersonTotal) : '---'}`;

    const showCopied = () => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> تم النسخ!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    };

    // بديل للمتصفحات القديمة جداً اللي مش بتدعم navigator.clipboard
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) showCopied();
        else alert('تعذّر النسخ، يرجى المحاولة يدوياً.');
      } catch (_) {
        alert('تعذّر النسخ، يرجى المحاولة يدوياً.');
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showCopied).catch(legacyCopy);
    } else {
      legacyCopy();
    }
  }

  /* ════ Wire Events ════ */
  function wireEvents() {
    tipButtons.forEach(btn => {
      btn.addEventListener('click', () => selectTipPct(Number(btn.dataset.pct), true));
    });
    tipCustomInput.addEventListener('input', () => {
      if (tipCustomInput.value) {
        tipButtons.forEach(b => b.classList.remove('active'));
      }
      liveCalculate();
    });

    $('clearSavedBtn').addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      clearTimeout(toastTimer);
      saveToast.textContent = '🗑️ تم مسح البيانات المحفوظة';
      saveToast.style.display = 'block';
      saveToast.style.animation = 'fadeUp .3s ease';
      toastTimer = setTimeout(() => {
        saveToast.style.animation = 'toastFade .4s ease forwards';
        setTimeout(() => { saveToast.style.display = 'none'; saveToast.textContent = '💾 تم الحفظ تلقائياً'; }, 400);
      }, 1800);
    });

    $('pdfBtn').addEventListener('click', () => saveAsPDF($('pdfBtn'), 'pdf-content'));
    $('excelBtn').addEventListener('click', exportToExcel);
    $('shareBtn').addEventListener('click', shareWhatsApp);
    $('copyBtn').addEventListener('click', () => copyResult($('copyBtn')));

    [billInput, peopleInput].forEach(el => {
      el.addEventListener('input', liveCalculate);
      el.addEventListener('change', saveData);
    });
  }

  /* ════ Init ════ */
  window.addEventListener('load', () => {
    CoreUtils.initDarkMode('dark-toggle');
    loadData();
    wireEvents();
    calculate(false);
  });

  /* ── Scroll Top Button (نفس نمط index.html) ── */
  (function () {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  })();

})();
