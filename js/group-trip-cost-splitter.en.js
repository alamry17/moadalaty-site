/* ═══════════════════════════════════════════════════
   group-trip-cost-splitter.en.js — Group Trip Cost Splitter engine
   Same pattern as the other English calculators: relies on
   CoreUtils, must load after core-utils.js on the page.

   Every expense is split equally among all travelers (no
   per-expense participant selection) — the core feature (who
   owes whom) is preserved via the same greedy settlement
   algorithm as the Arabic version.
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const peopleArea    = $('peopleArea');
  const addPersonBtn  = $('addPerson');
  const expenseArea   = $('expenseArea');
  const addExpenseBtn = $('addExpense');
  const resultsEl     = $('results');
  const balanceListEl = $('balanceList');
  const settleListEl  = $('settleList');
  const settleSection = $('settleSection');
  const outTotal       = $('outTotal');
  const outPeopleCount = $('outPeopleCount');
  const saveToast      = $('saveToast');

  const _fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const money = v => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${_fmt.format(n)}` : '---';
  };

  /* Traveler names and expense descriptions get inserted into innerHTML
     both when building rows (as attribute values) and again when
     rendering results (as text-node content, and inside <option>
     tags). Without escaping, a name like "><img src=x onerror=...>
     would execute as real HTML. */
  const escapeHtml = str => String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const MAX_PEOPLE   = 20;
  const MAX_EXPENSES = 40;
  let nextPersonId  = 0;
  let nextExpenseId = 0;
  let _r = {};
  let calcDebounce = null;
  let toastTimer = null;

  const STORAGE_KEY = 'tripSplit_en_v1';

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

  function snapshotState() {
    const people = Array.from(peopleArea.querySelectorAll('.person-row')).map(row => ({
      id  : row.dataset.id,
      name: row.querySelector('.person-name').value
    }));
    const expenses = Array.from(expenseArea.querySelectorAll('.expense-row')).map(row => ({
      desc  : row.querySelector('.exp-desc').value,
      amount: row.querySelector('.exp-amount').value,
      payer : row.querySelector('.exp-payer').value
    }));
    return { people, expenses };
  }

  function saveData() {
    const ok = CoreUtils.saveWithExpiry(STORAGE_KEY, snapshotState());
    if (ok) showToast();
  }

  function loadData() {
    const d = CoreUtils.loadWithExpiry(STORAGE_KEY);
    if (!d || !Array.isArray(d.people) || !d.people.length) {
      addPerson('Traveler 1');
      addPerson('Traveler 2');
      return;
    }
    d.people.forEach(p => addPerson(p.name, p.id));
    refreshPayerOptions();
    if (Array.isArray(d.expenses)) {
      d.expenses.forEach(e => addExpense(e.desc, e.amount, e.payer));
    }
  }

  function refreshAddPersonState() {
    addPersonBtn.disabled = peopleArea.querySelectorAll('.person-row').length >= MAX_PEOPLE;
  }

  function getPeople() {
    return Array.from(peopleArea.querySelectorAll('.person-row')).map(row => ({
      id  : row.dataset.id,
      name: row.querySelector('.person-name').value.trim() || 'Traveler'
    }));
  }

  function addPerson(name, existingId) {
    if (peopleArea.querySelectorAll('.person-row').length >= MAX_PEOPLE) return;
    const id = existingId || `p${++nextPersonId}`;
    if (!existingId) nextPersonId = Math.max(nextPersonId, parseInt(id.replace('p', ''), 10) || 0);

    const row = document.createElement('div');
    row.className = 'person-row';
    row.dataset.id = id;
    row.innerHTML = `
      <input type="text" class="input-field person-name" placeholder="Traveler name" value="${escapeHtml(name || '')}" />
      <button type="button" class="rm-remove" aria-label="Remove">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;
    peopleArea.appendChild(row);

    row.querySelector('.person-name').addEventListener('input', () => {
      refreshPayerOptions();
      liveCalculate();
    });
    row.querySelector('.rm-remove').addEventListener('click', () => {
      if (peopleArea.querySelectorAll('.person-row').length <= 1) return;
      row.remove();
      refreshAddPersonState();
      refreshPayerOptions();
      liveCalculate();
    });

    refreshAddPersonState();
    refreshPayerOptions();
  }

  function refreshPayerOptions() {
    const people = getPeople();
    document.querySelectorAll('.exp-payer').forEach(select => {
      const current = select.value;
      select.innerHTML = people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
      if (people.some(p => p.id === current)) select.value = current;
    });
    addExpenseBtn.disabled = people.length === 0;
    addExpenseBtn.title = people.length === 0 ? 'Add a traveler first' : '';
  }

  function refreshAddExpenseState() {
    addExpenseBtn.disabled = expenseArea.querySelectorAll('.expense-row').length >= MAX_EXPENSES
      || getPeople().length === 0;
  }

  function getExpenses() {
    return Array.from(expenseArea.querySelectorAll('.expense-row')).map(row => ({
      desc  : row.querySelector('.exp-desc').value.trim() || 'Expense',
      amount: parseFloat(row.querySelector('.exp-amount').value) || 0,
      payer : row.querySelector('.exp-payer').value
    })).filter(e => e.amount > 0 && e.payer);
  }

  function addExpense(desc, amount, payerId) {
    if (expenseArea.querySelectorAll('.expense-row').length >= MAX_EXPENSES) return;
    if (getPeople().length === 0) return;
    const id = ++nextExpenseId;

    const row = document.createElement('div');
    row.className = 'expense-row';
    row.dataset.id = id;
    row.innerHTML = `
      <input type="text" class="input-field exp-desc" placeholder="Expense description (dinner, tickets...)" value="${escapeHtml(desc || '')}" />
      <input type="number" class="input-field exp-amount" placeholder="Amount" min="0" step="1" value="${escapeHtml(amount || '')}" />
      <select class="input-field exp-payer"></select>
      <button type="button" class="rm-remove" aria-label="Remove">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;
    expenseArea.appendChild(row);
    refreshPayerOptions();
    if (payerId) row.querySelector('.exp-payer').value = payerId;

    row.querySelectorAll('.exp-desc, .exp-amount').forEach(el => el.addEventListener('input', liveCalculate));
    row.querySelector('.exp-payer').addEventListener('change', liveCalculate);
    row.querySelector('.rm-remove').addEventListener('click', () => {
      row.remove();
      refreshAddExpenseState();
      liveCalculate();
    });

    refreshAddExpenseState();
  }

  /* ════ Greedy Debt-Settlement ════
     Repeatedly matches the largest debtor with the largest
     creditor — produces close to the minimum number of
     transfers needed to fully settle the group. */
  function computeSettlements(balances) {
    const creditors = balances.filter(b => b.balance > 0.005)
      .map(b => ({ name: b.name, amount: b.balance }))
      .sort((a, b) => b.amount - a.amount);
    const debtors = balances.filter(b => b.balance < -0.005)
      .map(b => ({ name: b.name, amount: -b.balance }))
      .sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].amount, creditors[j].amount);
      settlements.push({ from: debtors[i].name, to: creditors[j].name, amount: pay });
      debtors[i].amount -= pay;
      creditors[j].amount -= pay;
      if (debtors[i].amount < 0.005) i++;
      if (creditors[j].amount < 0.005) j++;
    }
    return settlements;
  }

  function calculate(scrollToResults = true) {
    const people = getPeople();
    const expenses = getExpenses();

    if (!people.length) { resultsEl.classList.add('hidden'); return; }

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const n = people.length;
    const fairShare = n ? total / n : 0;

    const paidByPerson = {};
    people.forEach(p => { paidByPerson[p.id] = 0; });
    expenses.forEach(e => {
      if (paidByPerson.hasOwnProperty(e.payer)) paidByPerson[e.payer] += e.amount;
    });

    const balances = people.map(p => {
      const paid = paidByPerson[p.id] || 0;
      return { id: p.id, name: p.name, paid, fairShare, balance: paid - fairShare };
    });

    const settlements = computeSettlements(balances);

    _r = { total, people: people.length, balances, settlements };

    outTotal.innerText = money(total);
    outPeopleCount.innerText = String(people.length);

    balanceListEl.innerHTML = balances.map(b => {
      let cls, status, amt;
      if (Math.abs(b.balance) < 0.005) { cls = 'settled'; status = 'All settled'; amt = money(0); }
      else if (b.balance > 0) { cls = 'owed'; status = 'Owed by the group'; amt = money(b.balance); }
      else { cls = 'owes'; status = 'Owes the group'; amt = money(-b.balance); }
      return `
        <div class="balance-item ${cls}">
          <span class="name">${escapeHtml(b.name)}</span>
          <div style="text-align:right">
            <span class="status">${status}</span>
            <span class="amt">${amt}</span>
          </div>
        </div>`;
    }).join('');

    if (settlements.length) {
      settleListEl.innerHTML = settlements.map(s =>
        `<div class="settle-line">
           <span><strong>${escapeHtml(s.from)}</strong> pays <strong>${escapeHtml(s.to)}</strong></span>
           <span class="amt">${money(s.amount)}</span>
         </div>`
      ).join('');
      settleSection.hidden = false;
    } else {
      settleListEl.innerHTML = `<p class="settle-empty">Everyone's settled up, no transfers needed 🎉</p>`;
      settleSection.hidden = false;
    }

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
          filename: `group-trip-cost-split.pdf`,
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
        pdf.save(`group-trip-cost-split.pdf`);
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
    if (!_r.balances) { alert('Calculate a result first.'); return; }
    if (!window.XLSX) await ensureXlsxLib();
    if (!window.XLSX) { alert('The Excel library is not available right now.'); return; }

    const data = [
      ['Moadalaty — Group Trip Cost Splitter', '', ''],
      ['', '', ''],
      ['Total Trip Cost', _r.total, ''],
      ['Number of Travelers', _r.people, ''],
      ['', '', ''],
      ['Name', 'Status', 'Amount']
    ];
    const balanceStartRow = data.length;
    _r.balances.forEach(b => {
      const status = b.balance > 0.005 ? 'Owed' : b.balance < -0.005 ? 'Owes' : 'Settled';
      const value  = b.balance > 0.005 ? b.balance : b.balance < -0.005 ? -b.balance : 0;
      data.push([b.name, status, value]);
    });
    data.push(['', '', '']);
    data.push(['From', 'To', 'Amount']);
    const settlementStartRow = data.length;
    _r.settlements.forEach(s => data.push([s.from, s.to, s.amount]));

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 18 }];
    const currencyFmt = '$#,##0.00';
    if (ws['B3']) ws['B3'].z = currencyFmt;
    for (let r = balanceStartRow; r < balanceStartRow + _r.balances.length; r++) {
      const ref = 'C' + (r + 1);
      if (ws[ref]) ws[ref].z = currencyFmt;
    }
    for (let r = settlementStartRow; r < settlementStartRow + _r.settlements.length; r++) {
      const ref = 'C' + (r + 1);
      if (ws[ref]) ws[ref].z = currencyFmt;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trip Split');
    XLSX.writeFile(wb, `group-trip-cost-split.xlsx`);
  }

  function shareWhatsApp() {
    if (!_r.balances) { alert('Calculate a result first.'); return; }
    let text = `✈️ *Moadalaty — Group Trip Cost Splitter*\n\n💰 Total: ${money(_r.total)}\n👥 Travelers: ${_r.people}\n\n`;
    if (_r.settlements.length) {
      text += `📋 Settlements:\n`;
      _r.settlements.forEach(s => { text += `• ${s.from} pays ${money(s.amount)} to ${s.to}\n`; });
    } else {
      text += `🎉 Everyone's settled up, no transfers needed\n`;
    }
    text += `\nTry it yourself: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener,noreferrer');
  }

  function copyResult(btn) {
    if (!_r.balances) { alert('Calculate a result first.'); return; }
    let text = `Moadalaty — Group Trip Cost Splitter\nTotal: ${money(_r.total)}\n\nSettlements:\n`;
    if (_r.settlements.length) {
      _r.settlements.forEach(s => { text += `${s.from} → ${s.to}: ${money(s.amount)}\n`; });
    } else {
      text += 'Everyone is settled up\n';
    }

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
    addPersonBtn.addEventListener('click', () => { addPerson(''); liveCalculate(); });
    addExpenseBtn.addEventListener('click', () => { addExpense('', '', ''); liveCalculate(); });

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
