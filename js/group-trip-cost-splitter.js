/* ═══════════════════════════════════════════════════
   group-trip-cost-splitter.js — محرك حاسبة تقسيم مصاريف الرحلة الجماعية
   نفس نمط tip-bill-split-calculator.js / roommate-expense-splitter.js: يعتمد
   على CoreUtils، ولازم يتحمّل بعد core-utils.js في الصفحة.

   مبسّطة عن نسخة quickcalcs الإنجليزية: كل مصروف بيتقسّم على
   كل المسافرين بالتساوي (بدون اختيار مشاركين لكل مصروف على
   حدة) — كافي لصفحة واحدة، والميزة الأهم (مين مديون لمين)
   محفوظة بالكامل عبر نفس خوارزمية التسوية الجشعة (greedy).
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ════ DOM References ════ */
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

  const _fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
  const money = v => `${_fmt.format(Number(v || 0))} ج.م`;

  const MAX_PEOPLE   = 20;
  const MAX_EXPENSES = 40;
  let nextPersonId  = 0;
  let nextExpenseId = 0;
  let _r = {};
  let calcDebounce = null;
  let toastTimer = null;

  const STORAGE_KEY = 'tripSplit_v1';

  /* ════ Toast / Save ════ */
  function showToast(msg) {
    clearTimeout(toastTimer);
    saveToast.textContent = msg || '💾 تم الحفظ تلقائياً';
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
      addPerson('المسافر الأول');
      addPerson('المسافر الثاني');
      return;
    }
    d.people.forEach(p => addPerson(p.name, p.id));
    refreshPayerOptions();
    if (Array.isArray(d.expenses)) {
      d.expenses.forEach(e => addExpense(e.desc, e.amount, e.payer));
    }
  }

  /* ════ People ════ */
  function refreshAddPersonState() {
    addPersonBtn.disabled = peopleArea.querySelectorAll('.person-row').length >= MAX_PEOPLE;
  }

  function getPeople() {
    return Array.from(peopleArea.querySelectorAll('.person-row')).map(row => ({
      id  : row.dataset.id,
      name: row.querySelector('.person-name').value.trim() || 'مسافر'
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
      <input type="text" class="input-field person-name" placeholder="اسم المسافر" value="${name || ''}" />
      <button type="button" class="rm-remove" aria-label="حذف">
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
      select.innerHTML = people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      if (people.some(p => p.id === current)) select.value = current;
    });
    addExpenseBtn.disabled = people.length === 0;
    addExpenseBtn.title = people.length === 0 ? 'أضف مسافر أولاً' : '';
  }

  /* ════ Expenses ════ */
  function refreshAddExpenseState() {
    addExpenseBtn.disabled = expenseArea.querySelectorAll('.expense-row').length >= MAX_EXPENSES
      || getPeople().length === 0;
  }

  function getExpenses() {
    return Array.from(expenseArea.querySelectorAll('.expense-row')).map(row => ({
      desc  : row.querySelector('.exp-desc').value.trim() || 'مصروف',
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
      <input type="text" class="input-field exp-desc" placeholder="وصف المصروف (عشاء، تذاكر...)" value="${desc || ''}" />
      <input type="number" class="input-field exp-amount" placeholder="المبلغ" min="0" step="10" value="${amount || ''}" />
      <select class="input-field exp-payer"></select>
      <button type="button" class="rm-remove" aria-label="حذف">
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
     نفس خوارزمية quickcalcs بالظبط: مطابقة أكبر مدين مع أكبر
     دائن بشكل متكرر — بتنتج أقل عدد ممكن تقريبًا من التحويلات
     المطلوبة لتسوية المجموعة بالكامل. */
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

  /* ════ Calculate ════ */
  function calculate(scrollToResults = true) {
    const people = getPeople();
    const expenses = getExpenses();

    if (!people.length) { resultsEl.classList.add('hidden'); return; }

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const n = people.length;
    const fairShare = n ? total / n : 0; // كل المصاريف بتتقسّم على الجميع بالتساوي

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
      if (Math.abs(b.balance) < 0.005) { cls = 'settled'; status = 'حسابه متزون'; amt = money(0); }
      else if (b.balance > 0) { cls = 'owed'; status = 'له عند الباقي'; amt = money(b.balance); }
      else { cls = 'owes'; status = 'عليه للباقي'; amt = money(-b.balance); }
      return `
        <div class="balance-item ${cls}">
          <span class="name">${b.name}</span>
          <div style="text-align:left">
            <span class="status">${status}</span>
            <span class="amt">${amt}</span>
          </div>
        </div>`;
    }).join('');

    if (settlements.length) {
      settleListEl.innerHTML = settlements.map(s =>
        `<div class="settle-line">
           <span><strong>${s.from}</strong> يدفع لـ <strong>${s.to}</strong></span>
           <span class="amt">${money(s.amount)}</span>
         </div>`
      ).join('');
      settleSection.hidden = false;
    } else {
      settleListEl.innerHTML = `<p class="settle-empty">الحسابات متزونة، مفيش تحويلات مطلوبة 🎉</p>`;
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

  /* ════ PDF ════ */
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
          filename: `تقسيم_مصاريف_الرحلة.pdf`,
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
        pdf.save(`تقسيم_مصاريف_الرحلة.pdf`);
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
    if (!_r.balances)  { alert('احسب النتيجة أولاً.'); return; }

    const data = [
      ['معدلاتي — حاسبة تقسيم مصاريف الرحلة الجماعية', ''],
      [''],
      ['إجمالي مصاريف الرحلة', money(_r.total)],
      ['عدد المسافرين', _r.people],
      [''],
      ['الاسم', 'الرصيد']
    ];
    _r.balances.forEach(b => {
      const label = b.balance > 0.005 ? `له ${money(b.balance)}` : b.balance < -0.005 ? `عليه ${money(-b.balance)}` : 'متزون';
      data.push([b.name, label]);
    });
    data.push(['']);
    data.push(['التسوية', '']);
    _r.settlements.forEach(s => data.push([`${s.from} → ${s.to}`, money(s.amount)]));

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقسيم الرحلة');
    XLSX.writeFile(wb, `تقسيم_مصاريف_الرحلة.xlsx`);
  }

  /* ════ WhatsApp ════ */
  function shareWhatsApp() {
    if (!_r.balances) { alert('احسب النتيجة أولاً.'); return; }
    let text = `✈️ *معدلاتي — تقسيم مصاريف الرحلة*\n\n💰 الإجمالي: ${money(_r.total)}\n👥 عدد المسافرين: ${_r.people}\n\n`;
    if (_r.settlements.length) {
      text += `📋 التسوية:\n`;
      _r.settlements.forEach(s => { text += `• ${s.from} يدفع ${money(s.amount)} لـ ${s.to}\n`; });
    } else {
      text += `🎉 الحسابات متزونة، مفيش تحويلات مطلوبة\n`;
    }
    text += `\nجرّبها بنفسك: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener');
  }

  /* ════ Copy ════ */
  function copyResult(btn) {
    if (!_r.balances) { alert('احسب النتيجة أولاً.'); return; }
    let text = `معدلاتي — تقسيم مصاريف الرحلة\nالإجمالي: ${money(_r.total)}\n\nالتسوية:\n`;
    if (_r.settlements.length) {
      _r.settlements.forEach(s => { text += `${s.from} → ${s.to}: ${money(s.amount)}\n`; });
    } else {
      text += 'الحسابات متزونة\n';
    }
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> تم النسخ!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    }).catch(() => alert('تعذّر النسخ، يرجى المحاولة يدوياً.'));
  }

  /* ════ Wire Events ════ */
  function wireEvents() {
    addPersonBtn.addEventListener('click', () => { addPerson(''); liveCalculate(); });
    addExpenseBtn.addEventListener('click', () => { addExpense('', '', ''); liveCalculate(); });

    $('clearSavedBtn').addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      showToast('🗑️ تم مسح البيانات المحفوظة');
    });

    $('pdfBtn').addEventListener('click', () => saveAsPDF($('pdfBtn'), 'pdf-content'));
    $('excelBtn').addEventListener('click', exportToExcel);
    $('shareBtn').addEventListener('click', shareWhatsApp);
    $('copyBtn').addEventListener('click', () => copyResult($('copyBtn')));
  }

  /* ════ Init ════ */
  window.addEventListener('load', () => {
    CoreUtils.initDarkMode('dark-toggle');
    CoreUtils.initViewCounter('view-count', 'group-trip-cost-splitter');
    wireEvents();
    loadData();
    calculate(false);
  });

  /* ── Scroll Top Button ── */
  (function () {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  })();

})();
