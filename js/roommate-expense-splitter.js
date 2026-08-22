/* ═══════════════════════════════════════════════════
   roommate-expense-splitter.js — محرك حاسبة تقسيم مصاريف السكن
   نفس نمط tip-bill-split-calculator.js: يعتمد على CoreUtils، ولازم
   يتحمّل بعد core-utils.js في الصفحة.
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ════ DOM References ════ */
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

  const _fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
  const money = v => `${_fmt.format(Number(v || 0))} ج.م`;

  const MAX_ROOMMATES = 20;
  let nextId = 0;
  let mode = 'equal'; // أو 'weighted'
  let _r = {};
  let calcDebounce = null;
  let toastTimer = null;

  /* ════ Auto-Save (٩٠ يوم صلاحية عبر CoreUtils) ════ */
  const STORAGE_KEY = 'roommateSplit_v1';

  function snapshotState() {
    const rows = Array.from(roommateArea.querySelectorAll('.roommate-row')).map(row => ({
      name  : row.querySelector('.rm-name').value,
      weight: row.querySelector('.rm-weight').value
    }));
    return { rent: rentInput.value, bills: billsInput.value, mode, roommates: rows };
  }

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

  /* ════ Roommate Rows ════ */
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
      <input type="text" class="input-field rm-name" placeholder="اسم الشريك ${id}" value="${name || ''}" />
      <input type="number" class="input-field rm-weight" min="0.1" step="0.1" value="${weight || 1}" />
      <button type="button" class="rm-remove" aria-label="حذف">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;
    roommateArea.appendChild(row);

    row.querySelector('.rm-name').addEventListener('input', liveCalculate);
    row.querySelector('.rm-weight').addEventListener('input', liveCalculate);
    row.querySelector('.rm-remove').addEventListener('click', () => {
      if (roommateArea.querySelectorAll('.roommate-row').length <= 1) return; // لازم يفضل واحد على الأقل
      row.remove();
      refreshAddBtnState();
      liveCalculate();
    });

    refreshAddBtnState();
  }

  /* ════ Mode (متساوي / بالوزن) ════ */
  function setMode(newMode, recalc = true) {
    mode = newMode;
    modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    roommateArea.classList.toggle('weighted', mode === 'weighted');
    weightHelp.hidden = mode !== 'weighted';
    if (recalc) liveCalculate();
  }

  /* ════ Calculate ════ */
  function calculate(scrollToResults = true) {
    const rent  = parseFloat(rentInput.value)  || 0;
    const bills = parseFloat(billsInput.value) || 0;
    const total = rent + bills;

    const rows = Array.from(roommateArea.querySelectorAll('.roommate-row'));
    const roommates = rows.map((row, i) => ({
      name  : row.querySelector('.rm-name').value.trim() || `شريك ${i + 1}`,
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
        <span class="name">${s.name}</span>
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
          filename: `تقسيم_مصاريف_السكن.pdf`,
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
        pdf.save(`تقسيم_مصاريف_السكن.pdf`);
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
    if (!_r.shares)    { alert('احسب النتيجة أولاً.'); return; }

    const data = [
      ['معدلاتي — حاسبة تقسيم مصاريف السكن', ''],
      [''],
      ['الإيجار', money(_r.rent)],
      ['الفواتير المشتركة', money(_r.bills)],
      ['الإجمالي', money(_r.total)],
      ['طريقة التقسيم', _r.mode === 'weighted' ? 'بالوزن (حسب حجم الغرفة)' : 'متساوي'],
      ['']
    ];
    _r.shares.forEach(s => data.push([s.name, money(s.share)]));

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقسيم المصاريف');
    XLSX.writeFile(wb, `تقسيم_مصاريف_السكن.xlsx`);
  }

  /* ════ WhatsApp ════ */
  function shareWhatsApp() {
    if (!_r.shares) { alert('احسب النتيجة أولاً.'); return; }
    let text =
      `🏠 *معدلاتي — تقسيم مصاريف السكن*\n\n` +
      `💰 الإجمالي: ${money(_r.total)}\n` +
      `📋 الطريقة: ${_r.mode === 'weighted' ? 'بالوزن حسب حجم الغرفة' : 'متساوي'}\n\n`;
    _r.shares.forEach(s => { text += `• ${s.name}: ${money(s.share)}\n`; });
    text += `\nجرّبها بنفسك: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}&app_absent=0`, '_blank', 'noopener');
  }

  /* ════ Copy ════ */
  function copyResult(btn) {
    if (!_r.shares) { alert('احسب النتيجة أولاً.'); return; }
    let text = `معدلاتي — تقسيم مصاريف السكن\nالإجمالي: ${money(_r.total)}\n\n`;
    _r.shares.forEach(s => { text += `${s.name}: ${money(s.share)}\n`; });
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check ml-1"></i> تم النسخ!';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    }).catch(() => alert('تعذّر النسخ، يرجى المحاولة يدوياً.'));
  }

  /* ════ Wire Events ════ */
  function wireEvents() {
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    addBtn.addEventListener('click', () => { addRoommate('', 1); liveCalculate(); });

    [rentInput, billsInput].forEach(el => {
      el.addEventListener('input', liveCalculate);
      el.addEventListener('change', saveData);
    });

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
    CoreUtils.initViewCounter('view-count', 'roommate-expense-splitter');
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
