/* ═══════════════════════════════════════════════════
   embed-gpa.js — سكريبت تضمين حاسبة GPA لمواقع طرف ثالث

   طريقة الاستخدام على أي موقع تاني (ضع الوسم التالي في الصفحة،
   ثم وسم Script بمصدر src يشير لهذا الملف على moadalaty.com):
     <div data-moadalaty-widget="gpa-calculator"></div>

   السكريبت بيبني iframe جوه كل عنصر عليه data-moadalaty-widget،
   وبيظبط ارتفاعه تلقائيًا حسب محتوى الحاسبة (عبر postMessage).
   ═══════════════════════════════════════════════════ */

(function () {
  var WIDGET_ORIGIN = 'https://moadalaty.com';
  var WIDGET_URL = WIDGET_ORIGIN + '/widgets/gpa-calculator.html';

  function buildIframe() {
    var iframe = document.createElement('iframe');
    iframe.src = WIDGET_URL;
    iframe.title = 'حاسبة المعدل التراكمي GPA — بواسطة moadalaty.com';
    iframe.loading = 'lazy';
    iframe.setAttribute('scrolling', 'no');
    // allow-scripts + allow-same-origin: عشان الحاسبة تشتغل كـ JS عادي.
    // allow-popups: عشان رابط "بواسطة moadalaty.com" يفتح تاب جديد.
    // ملحوظش: لا allow-forms ولا allow-top-navigation — الودجت میقدرش
    // يوجّه أو يعدّل صفحة الموقع الحاضن.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    iframe.style.cssText = 'width:100%;border:0;display:block;min-height:340px;transition:height .15s ease;';
    return iframe;
  }

  function init() {
    var containers = document.querySelectorAll('[data-moadalaty-widget="gpa-calculator"]:not([data-moadalaty-loaded])');
    containers.forEach(function (el) {
      el.setAttribute('data-moadalaty-loaded', 'true');
      var iframe = buildIframe();
      el.appendChild(iframe);
    });
  }

  // نتحقق من مصدر الرسالة (origin) ومن أنها فعلاً جاية من ودجت moadalaty،
  // قبل ما نثق في أي بيانات جواها — تحصين ضد أي postMessage مزيّف من نافذة تانية
  window.addEventListener('message', function (event) {
    if (event.origin !== WIDGET_ORIGIN) return;
    var data = event.data;
    if (!data || data.source !== 'moadalaty-widget' || data.type !== 'resize') return;

    var iframes = document.querySelectorAll('[data-moadalaty-widget="gpa-calculator"] iframe');
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].contentWindow === event.source) {
        var h = parseInt(data.height, 10);
        if (h && h > 0) iframes[i].style.height = h + 'px';
        break;
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
