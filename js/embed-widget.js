/* ═══════════════════════════════════════════════════
   embed-widget.js — سكريبت تضمين عام لأي ودجت من widgets/*.html
   على مواقع طرف ثالث (خلَف embed-gpa.js اللي كان مبني لحاسبة GPA بس)

   طريقة الاستخدام على أي موقع تاني — لأي حاسبة حالية أو مستقبلية،
   من غير أي كود JS إضافي لكل حاسبة جديدة:
     <div data-moadalaty-widget="gpa-calculator"
          data-moadalaty-title="حاسبة المعدل التراكمي GPA"></div>
     <script src="https://moadalaty.com/js/embed-widget.min.js" defer></script>

   القيمة في data-moadalaty-widget لازم تطابق اسم ملف الودجت
   (widgets/<القيمة>.html) — يعني عشان نضيف حاسبة رسوم قابلة للتضمين
   لاحقًا، يكفي widgets/fees-calculator.html (يستخدم js/widget-common.js
   زي أي ودجت) + <div data-moadalaty-widget="fees-calculator">،
   من غير أي تعديل في هذا الملف.

   ملحوظة: embed-gpa.js القديم متروك كما هو ولسه شغال (موجود بالفعل
   على مواقع طرف ثالث) — الملف ده إضافة جنبه، مش تعديل فيه.

   بيبني iframe جوه كل عنصر عليه data-moadalaty-widget، وبيظبط
   ارتفاعه تلقائيًا (عبر postMessage)، وبيرحّل أي حدث calculator_used
   جاي من الودجت لـ dataLayer بتاع الموقع الحاضن — عشان الموقع
   الحاضن يقدر يتتبّع استخدام الحاسبة برضو لو حابب.
   ═══════════════════════════════════════════════════ */

(function () {
  var WIDGET_ORIGIN = 'https://moadalaty.com';

  function buildIframe(slug, title) {
    var iframe = document.createElement('iframe');
    iframe.src = WIDGET_ORIGIN + '/widgets/' + slug + '.html';
    iframe.title = title || 'أداة تفاعلية بواسطة moadalaty.com';
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
    var containers = document.querySelectorAll('[data-moadalaty-widget]:not([data-moadalaty-loaded])');
    containers.forEach(function (el) {
      var slug = el.getAttribute('data-moadalaty-widget');
      if (!slug) return;
      el.setAttribute('data-moadalaty-loaded', 'true');
      var iframe = buildIframe(slug, el.getAttribute('data-moadalaty-title'));
      el.appendChild(iframe);
    });
  }

  // نتحقق من مصدر الرسالة (origin) ومن أنها فعلاً جاية من ودجت moadalaty،
  // قبل ما نثق في أي بيانات جواها — تحصين ضد أي postMessage مزيّف من نافذة تانية
  window.addEventListener('message', function (event) {
    if (event.origin !== WIDGET_ORIGIN) return;
    var data = event.data;
    if (!data || data.source !== 'moadalaty-widget') return;

    var iframes = document.querySelectorAll('[data-moadalaty-widget] iframe');
    var matched = null;
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].contentWindow === event.source) { matched = iframes[i]; break; }
    }
    if (!matched) return;

    if (data.type === 'resize') {
      var h = parseInt(data.height, 10);
      if (h && h > 0) matched.style.height = h + 'px';
    } else if (data.type === 'event' && data.event) {
      // حدث تتبّع (زي calculator_used) جاي من جوه الودجت — نرحّله
      // لـ dataLayer بتاع الموقع الحاضن، محاط بـ try/catch عشان عدم
      // وجود dataLayer عنده میوقفش الودجت
      try {
        window.dataLayer = window.dataLayer || [];
        var relayed = Object.assign({}, data.event);
        relayed.event = 'moadalaty_widget_' + (data.event.event || 'event');
        window.dataLayer.push(relayed);
      } catch (e) {}
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
