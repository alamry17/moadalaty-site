/* ═══════════════════════════════════════════════════
   roommate-expense-splitter.en.js — Roommate Expense Splitter engine
   Same pattern as tip-bill-split-calculator.en.js: relies on
   CoreUtils, must load after core-utils.js on the page.
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const rentInput   = $('rent');
  const billsInput  = $('bills');
  const roommateArea = $('roommateArea');
  const addBtn      = $('addRoommate');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const weightHelp  = $('weightHelp');
  const resultsEl   = $('results');
  const splitList   = $('splitList');
  const totalPerCycle = $('totalPerCycle');
  const saveToast   = $('saveToast');

  const _fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const money = v => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${_fmt.format(n)}` : '---';
  };

  /* Roommate names get inserted into innerHTML both when building the
     row (as an attribute value) and again when rendering the result
     (as text-node content between <span> tags). Without escaping, a
     name like "><img src=x onerror=...> would execute as real HTML. */
  const escapeHtml = str => String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const MAX_ROOMMATES = 20;
  let nextId = 0;
  let mode = 'equal'; // or 'weighted'
  let _r = {};
  let calcDebounce = null;
  let toastTimer = null;

  const STORAGE_KEY = 'roommateSplit_en_v1';

  function snapshotState() {
    const rows = Array.from(roommateArea.querySelectorAll('.roommate-row')).map(row => ({
      name  : row.querySelector('.rm-name').value,
      weight: row.querySelector('.rm-weight').value
    }));
    return { rent: rentInput.value, bills: billsInput.value, mode, roommates: rows };
  }

  function showToast(msg) {
    clearTimeout(toastTimer);
    saveToast.textContent = msg || '💾 Saved automatically';
    saveToast.style.display = 'block';
    saveToast.style.animation = 'fadeUp .3s ease';
    toastTimer = setTimeout(() => {
      saveToast.style.animation = 'toastFade .4s ease forwards';
      setTimeout(() => { saveToast.style.display = 'none'; }, 400);
    }, 1800);
  }

  function saveData() {
    const ok = CoreUtils.saveWithExpiry(STORAGE_KEY, snapshotState());
    if (ok) showToast();
  }

  function loadData() {
    const d = CoreUtils.loadWithExpiry(STORAGE_KEY);
    if (!d) { addRoommate('', 1); addRoommate('', 1); return; }

    rentInput.value  = d.rent  !== undefined ? d.rent  : rentInput.value;
    billsInput.value = d.bills !== undefined ? d.bills : billsInput.value;
    setMode(d.mode || 'equal', false);

    if (Array.isArray(d.roommates) && d.roommates.length) {
      d.roommates.forEach(rm => addRoommate(rm.name, rm.weight));
    } else {
      addRoommate('', 1); addRoommate('', 1);
    }
  }

  function refreshAddBtnState() {
    const count = roommateArea.querySelectorAll('.roommate-row').length;
    addBtn.disabled = count >= MAX_ROOMMATES;
  }

  function addRoommate(name, weight) {
    if (roommateArea.querySelectorAll('.roommate-row').length >= MAX_ROOMMATES) return;
    nextId++;
    const id = nextId;

    const row = document.createElement('div');
    row.className = 'roommate-row';
    row.dataset.id = id;

    row.innerHTML = `
      <input type="text" class="input-field rm-name" placeholder="Roommate ${id} name" value="${escapeHtml(name || '')}" />
      <input type="number" class="input-field rm-weight" min="0.1" step="0.1" value="${weight || 1}" />
      <button type="button" class="rm-remove" aria-label="Remove">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;
    roommateArea.appendChild(row);

    row.querySelector('.rm-name').addEventListener('input', liveCalculate);
    row.querySelector('.rm-weight').addEventListener('input', liveCalculate);
    row.querySelector('.rm-remove').addEventListener('click', () => {
      if (roommateArea.querySelectorAll('.roommate-row').length <= 1) return;
      row.remove();
      refreshAddBtnState();
      liveCalculate();
    });

    refreshAddBtnState();
  }

  function setMode(newMode, recalc = true) {
    mode = newMode;
    modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    roommateArea.classList.toggle('weighted', mode === 'weighted');
    weightHelp.hidden = mode !== 'weighted';
    if (recalc) liveCalculate();
  }

  function calculate(scrollToResults = true) {
    const rent  = parseFloat(rentInput.value)  || 0;
    const bills = parseFloat(billsInput.value) || 0;
    const total = rent + bills;

    const rows = Array.from(roommateArea.querySelectorAll('.roommate-row'));
    const roommates = rows.map((row, i) => ({
      name  : row.querySelector('.rm-name').value.trim() || `Roommate ${i + 1}`,
      weight: mode === 'weighted' ? (parseFloat(row.querySelector('.rm-weight').value) || 0) : 1
    }));

    const validRoommates = roommates.filter(r => r.weight > 0);
    if (!(total > 0) || !validRoommates.length) {
      resultsEl.classList.add('hidden');
      return;
    }

    const weightSum = validRoommates.reduce((s, r) => s + r.weight, 0);
    const shares = validRoommates.map(r => ({
      name : r.name,
      share: total * (r.weight / weightSum)
    }));

    _r = { rent, bills, total, mode, shares };

    splitList.innerHTML = shares.map(s => `
      <div class="split-item">
        <span class="name">${escapeHtml(s.name)}</span>
        <span class="amt">${money(s.share)}</span>
      </div>
    `).join('');
    totalPerCycle.innerText = money(total);

    resultsEl.classList.remove('hidden');
    if (scrollToResults) setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

    saveData();
  }

  window.liveCalculate = function () {
    clearTimeout(calcDebounce);
    calcDebounce = setTimeout(() => calculate(false), 200);
  };

  /* ════ Lazy-load PDF/Excel libraries on demand ════ */
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
  async function ensurePdfLibs() {
    await loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ).catch(() => {});
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
    ]).catch(() => {});
  }
  async function ensureXlsxLib() {
    await loadScriptOnce(
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    ).catch(() => {});
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
          filename: `roommate-expense-split.pdf`,
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
        pdf.save(`roommate-expense-split.pdf`);
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
    if (!_r.shares) { alert('Calculate a result first.'); return; }
    if (!window.XLSX) await ensureXlsxLib();
    if (!window.XLSX) { alert('The Excel library is not available right now.'); return; }

    const data = [
      ['Moadalaty — Roommate Expense Splitter', ''],
      [''],
      ['Rent', _r.rent],
      ['Shared Bills', _r.bills],
      ['Total', _r.total],
      ['Split Method', _r.mode === 'weighted' ? 'Weighted (by room size)' : 'Equal'],
      ['']
    ];
    const shareStartRow = data.length;
    _r.shares.forEach(s => data.push([s.name, s.share]));

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
    const currencyFmt = '$#,##0.00';
    ['B3', 'B4', 'B5'].forEach(ref => { if (ws[ref]) ws[ref].z = currencyFmt; });
    for (let r = shareStartRow; r < data.length; r++) {
      const ref = 'B' + (r + 1);
      if (ws[ref]) ws[ref].z = currencyFmt;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Split');
    XLSX.writeFile(wb, `roommate-expense-split.xlsx`);
  }

  function shareWhatsApp() {
    if (!_r.shares) { alert('Calculate a result first.'); return; }
    let text =
      `🏠 *Moadalaty — Roommate Expense Splitter*\n\n` +
      `💰 Total: ${money(_r.total)}\n` +
      `📋 Method: ${_r.mode === 'weighted' ? 'Weighted by room size' : 'Equal'}\n\n`;
    _r.shares.forEach(s => { text += `• ${s.name}: ${money(s.share)}\n`; });
    text += `\nTry it yourself: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener,noreferrer');
  }

  function copyResult(btn) {
    if (!_r.shares) { alert('Calculate a result first.'); return; }
    let text = `Moadalaty — Roommate Expense Splitter\nTotal: ${money(_r.total)}\n\n`;
    _r.shares.forEach(s => { text += `${s.name}: ${money(s.share)}\n`; });

    const showCopied = () => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    };

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
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    addBtn.addEventListener('click', () => { addRoommate('', 1); liveCalculate(); });

    [rentInput, billsInput].forEach(el => {
      el.addEventListener('input', liveCalculate);
      el.addEventListener('change', saveData);
    });

    $('clearSavedBtn')?.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      showToast('🗑️ Saved data cleared');
    });

    $('pdfBtn')?.addEventListener('click', () => saveAsPDF($('pdfBtn'), 'pdf-content'));
    $('excelBtn')?.addEventListener('click', exportToExcel);
    $('shareBtn')?.addEventListener('click', shareWhatsApp);
    $('copyBtn')?.addEventListener('click', () => copyResult($('copyBtn')));
  }

  window.addEventListener('load', () => {
    CoreUtils.initDarkMode('dark-toggle');
    wireEvents();
    loadData();
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
