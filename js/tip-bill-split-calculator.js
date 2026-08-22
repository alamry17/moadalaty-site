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
  const money = v => `${_fmt.format(Number(v || 0))} ج.م`;

  /* ════ Auto-Save (٩٠ يوم صلاحية عبر CoreUtils) ════ */
  const STORAGE_KEY = 'tipSplit_v1';
  function saveData() {
    const ok = CoreUtils.saveWithExpiry(STORAGE_KEY, {
      bill  : billInput.value,
      tipPct: activeTipPct,
      custom: tipCustomInput.value,
      people: peopleInput.value
    });
    if (ok) {
      clearTimeout(toastTimer);
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
    if (d.tipPct !== undefined) selectTipPct(d.tipPct, false);
  }

  /* ════ Validation ════ */
  window.clearErr = function (id) {
    const inp = $(id), msg = $('err-' + id);
    if (inp) { inp.classList.remove('err'); inp.removeAttribute('aria-invalid'); }
    if (msg) msg.classList.remove('show');
  };
  function showErr(id) {
    const inp = $(id), msg = $('err-' + id);
    if (inp) { inp.classList.add('err'); inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', 'err-' + id); }
    if (msg) msg.classList.add('show');
  }

  /* ════ Tip % selection (أزرار سريعة + قيمة مخصصة) ════ */
  function selectTipPct(pct, fromClick) {
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
    liveCalculate();
  }

  /* ════ Calculate ════ */
  function getFormData() {
    return {
      bill  : parseFloat(billInput.value) || 0,
      people: parseInt(peopleInput.value, 10) || 1,
      tipPct: parseFloat(tipCustomInput.value) || activeTipPct
    };
  }

  function validate(bill, people) {
    let ok = true;
    if (!(bill > 0))  { showErr('bill');   ok = false; }
    if (!(people >= 1)) { showErr('people'); ok = false; }
    return ok;
  }

  function calculate(scrollToResults = true) {
    const { bill, people, tipPct } = getFormData();
    if (!validate(bill, people)) return;

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

  /* ════ PDF — نفس نمط html2pdf أولاً ثم html2canvas+jsPDF fallback ════ */
  async function saveAsPDF(btn, targetId) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-1"></i> جاري التجهيز...';
    btn.disabled = true;

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
      } catch (_) { /* fallback */ }
    }

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
      } catch (_) {
        alert('حدث خطأ أثناء إنشاء PDF. تأكد من أن النتائج ظاهرة أولاً.');
      }
    } else {
      alert('مكتبة PDF غير متاحة الآن، يرجى المحاولة لاحقاً.');
    }

    btn.innerHTML = orig; btn.disabled = false;
  }

  /* ════ Excel ════ */
  function exportToExcel() {
    if (!window.XLSX) { alert('مكتبة Excel غير متاحة الآن.'); return; }
    if (!_r.bill)      { alert('احسب النتيجة أولاً.'); return; }

    const data = [
      ['معدلاتي — حاسبة تقسيم الفاتورة والبقشيش', ''],
      [''],
      ['إجمالي الفاتورة', money(_r.bill)],
      ['نسبة البقشيش', `${_r.tipPct}%`],
      ['قيمة البقشيش', money(_r.tipAmount)],
      ['الإجمالي شامل البقشيش', money(_r.totalWithTip)],
      ['عدد الأشخاص', _r.people],
      ['نصيب الفرد من البقشيش', money(_r.perPersonTip)],
      ['نصيب الفرد الإجمالي', money(_r.perPersonTotal)]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
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
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener');
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
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> تم النسخ!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    }).catch(() => alert('تعذّر النسخ، يرجى المحاولة يدوياً.'));
  }

  /* ════ Wire Events ════ */
  function wireEvents() {
    tipButtons.forEach(btn => {
      btn.addEventListener('click', () => selectTipPct(Number(btn.dataset.pct), true));
    });
    tipCustomInput.addEventListener('input', () => {
      clearErr('bill');
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
