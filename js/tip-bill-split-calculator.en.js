/* ═══════════════════════════════════════════════════
   tip-bill-split-calculator.en.js — Tip & Bill Split Calculator engine
   Same pattern as the Arabic version: relies on CoreUtils
   (core-utils.js) for local saving and dark mode; must load
   after core-utils.js on the page.
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

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

  let _r          = {};
  let activeTipPct = 15;
  let calcDebounce = null;
  let toastTimer   = null;

  const _fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const money = v => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${_fmt.format(n)}` : '---';
  };

  const STORAGE_KEY = 'tipSplit_en_v1';
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
      saveToast.textContent = '💾 Saved automatically';
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

  function selectTipPct(pct, fromClick, skipCalc) {
    activeTipPct = pct;
    tipButtons.forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.pct) === pct);
    });
    const presetValues = Array.from(tipButtons).map(b => Number(b.dataset.pct));
    if (!presetValues.includes(pct)) {
      tipCustomInput.value = pct;
    } else if (fromClick) {
      tipCustomInput.value = '';
    }
    if (!skipCalc) liveCalculate();
  }

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

  /* ════ Lazy-load PDF/Excel libraries on demand ════
     These four libraries (html2pdf, jsPDF, html2canvas, xlsx) used to
     load synchronously in <head> on every page visit even when the
     visitor never used PDF/Excel export. Now they load dynamically
     only when the relevant button is clicked. */
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
  // html2pdf.bundle.min.js already bundles jsPDF/html2canvas internally —
  // load it alone first; the separate copies are only a true fallback.
  async function ensurePdfLibs() {
    await loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ).catch(() => { /* handled by saveAsPDF's fallback attempt */ });
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
    ]).catch(() => { /* handled by saveAsPDF's alert if the condition fails */ });
  }
  async function ensureXlsxLib() {
    await loadScriptOnce(
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    ).catch(() => { /* handled by exportToExcel's alert */ });
  }

  async function saveAsPDF(btn, targetId) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-1"></i> Preparing...';
    btn.disabled = true;

    await ensurePdfLibs();

    const isDark  = document.body.classList.contains('dark');
    const element = $(targetId);

    if (window.html2pdf) {
      try {
        await html2pdf().set({
          margin: 8,
          filename: `tip-bill-split.pdf`,
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
        pdf.save(`tip-bill-split.pdf`);
      } catch (err) {
        console.error('PDF generation failed:', err);
        alert('An error occurred while generating the PDF. Make sure the results are visible first.');
      }
    } else {
      alert('The PDF library is not available right now. Please try again later.');
    }

    btn.innerHTML = orig; btn.disabled = false;
  }

  async function exportToExcel() {
    if (!_r.bill) { alert('Calculate a result first.'); return; }
    if (!window.XLSX) await ensureXlsxLib();
    if (!window.XLSX) { alert('The Excel library is not available right now.'); return; }

    const data = [
      ['Moadalaty — Tip & Bill Split Calculator', ''],
      [''],
      ['Total Bill', _r.bill],
      ['Tip %', _r.tipPct],
      ['Tip Amount', _r.tipAmount],
      ['Total with Tip', _r.totalWithTip],
      ['Number of People', _r.people],
      ['Tip per Person', _r.perPersonTip],
      ['Total per Person', _r.perPersonTotal]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
    const currencyFmt = '$#,##0.00';
    ['B3', 'B5', 'B6', 'B8', 'B9'].forEach(ref => { if (ws[ref]) ws[ref].z = currencyFmt; });
    if (ws['B4']) ws['B4'].z = '0"%"';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tip Split');
    XLSX.writeFile(wb, `tip-bill-split.xlsx`);
  }

  function shareWhatsApp() {
    if (!_r.bill) { alert('Calculate a result first.'); return; }
    const text =
      `🧾 *Moadalaty — Tip & Bill Split Calculator*\n\n` +
      `💰 Total Bill: ${money(_r.bill)}\n` +
      `💵 Tip (${_r.tipPct}%): ${money(_r.tipAmount)}\n` +
      `✅ Total: ${money(_r.totalWithTip)}\n` +
      `👥 People: ${_r.people}\n` +
      `🔖 Per Person: ${money(_r.perPersonTotal)}\n\n` +
      `Try it yourself: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener,noreferrer');
  }

  function copyResult(btn) {
    const text =
      `Moadalaty — Tip & Bill Split Calculator\n` +
      `Total Bill: ${_r.bill ? money(_r.bill) : '---'}\n` +
      `Tip (${_r.tipPct || 0}%): ${_r.tipAmount !== undefined ? money(_r.tipAmount) : '---'}\n` +
      `Total: ${_r.totalWithTip !== undefined ? money(_r.totalWithTip) : '---'}\n` +
      `People: ${_r.people || '---'}\n` +
      `Per Person: ${_r.perPersonTotal !== undefined ? money(_r.perPersonTotal) : '---'}`;

    const showCopied = () => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    };

    // Fallback for older browsers / non-secure contexts where
    // navigator.clipboard isn't available (e.g. very old WebViews).
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
        else alert('Could not copy. Please try manually.');
      } catch (_) {
        alert('Could not copy. Please try manually.');
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showCopied).catch(legacyCopy);
    } else {
      legacyCopy();
    }
  }

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

    $('clearSavedBtn')?.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      clearTimeout(toastTimer);
      saveToast.textContent = '🗑️ Saved data cleared';
      saveToast.style.display = 'block';
      saveToast.style.animation = 'fadeUp .3s ease';
      toastTimer = setTimeout(() => {
        saveToast.style.animation = 'toastFade .4s ease forwards';
        setTimeout(() => { saveToast.style.display = 'none'; saveToast.textContent = '💾 Saved automatically'; }, 400);
      }, 1800);
    });

    $('pdfBtn')?.addEventListener('click', () => saveAsPDF($('pdfBtn'), 'pdf-content'));
    $('excelBtn')?.addEventListener('click', exportToExcel);
    $('shareBtn')?.addEventListener('click', shareWhatsApp);
    $('copyBtn')?.addEventListener('click', () => copyResult($('copyBtn')));

    [billInput, peopleInput].forEach(el => {
      el.addEventListener('input', liveCalculate);
      el.addEventListener('change', saveData);
    });
  }

  window.addEventListener('load', () => {
    CoreUtils.initDarkMode('dark-toggle');
    loadData();
    wireEvents();
    calculate(false);
  });

  (function () {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  })();

})();
