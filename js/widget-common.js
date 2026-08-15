/* ═══════════════════════════════════════════════════
   widget-common.js — محرك مشترك لأي صفحة widgets/*.html
   (بدل ما نكرر منطق postMessage والـ ResizeObserver في كل ودجت جديد)

   بيوفّر MoadalatyWidgetBridge بوظيفتين:
     initAutoResize()    — يبلّغ الصفحة الحاضنة بارتفاع المحتوى تلقائيًا
                           (عند التحميل + عند أي تغيّر في الحجم)
     initAnalyticsBridge() — يعترض أي dataLayer.push جوه الودجت ويرحّله
                           لصفحة الموقع الحاضن عبر postMessage، عشان
                           أحداث استخدام الحاسبة (calculator_used) تتتبّع
                           حتى لو الودجت متضمّن في موقع طرف ثالث
                           (تكمل نفس منطق calculator_used في form-calc.js
                           و gpa-subject-calc.js من غير أي تعديل فيهم).

   أي صفحة widgets/جديدة (رسوم، ميزانية...) محتاجة بس:
     <script src="/js/widget-common.js"></script>
     <script>
       MoadalatyWidgetBridge.initAnalyticsBridge();
       MoadalatyWidgetBridge.initAutoResize();
     </script>
   من غير أي iframe/postMessage جديد من الصفر — راجع js/embed-widget.js
   على الطرف التاني (صفحة الموقع الحاضن).
   ═══════════════════════════════════════════════════ */

(function (global) {

  function reportHeight() {
    if (global.parent === global) return; // مش جوه iframe، تجاهل
    global.parent.postMessage({
      source: 'moadalaty-widget',
      type: 'resize',
      height: document.body.scrollHeight
    }, '*');
  }

  function initAutoResize() {
    global.addEventListener('load', reportHeight);
    try {
      new ResizeObserver(reportHeight).observe(document.body);
    } catch (e) {
      // متصفحات قديمة جدًا من غير ResizeObserver — التبليغ هيفضل يشتغل
      // عند load وعند أي نداء يدوي لـ reportHeight من الودجت نفسه
    }
  }

  function initAnalyticsBridge() {
    global.dataLayer = global.dataLayer || [];
    if (global.dataLayer.__moadalatyBridged) return; // منع الاعتراض مرتين
    global.dataLayer.__moadalatyBridged = true;

    const originalPush = Array.prototype.push.bind(global.dataLayer);
    global.dataLayer.push = function (event) {
      const result = originalPush(event);
      if (global.parent !== global) {
        try {
          global.parent.postMessage({
            source: 'moadalaty-widget',
            type: 'event',
            event: event
          }, '*');
        } catch (e) {}
      }
      return result;
    };
  }

  global.MoadalatyWidgetBridge = {
    reportHeight,
    initAutoResize,
    initAnalyticsBridge
  };

})(window);
