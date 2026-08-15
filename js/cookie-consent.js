/* ═══════════════════════════════════════════════════
   cookie-consent.js — لافتة موافقة ملفات الارتباط (Cookies)
   موحّدة لكل صفحات الموقع، عشان محدش يحتاج يكررها.

   محدّث: دلوقتي بيدفع القرار فعليًا لـ Google Consent Mode v2
   (عبر window.gtag المعرّفة في أول <head> قبل GTM — راجع نفس
   السطر ده في كل صفحة). يعني "رفض" بقى بيوقف التتبّع فعليًا،
   مش بس بيسجّل القرار شكليًا زي الإصدار القديم من الملف ده.
   ═══════════════════════════════════════════════════ */

(function () {
  var CONSENT_KEY = 'cookieConsent';

  if (localStorage.getItem(CONSENT_KEY)) return; // القرار متسجّل بالفعل

  function pushConsent(granted) {
    if (typeof window.gtag !== 'function') return;
    var state = granted ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      'ad_storage': state,
      'ad_user_data': state,
      'ad_personalization': state,
      'analytics_storage': state
    });
  }

  function inject() {
    var style = document.createElement('style');
    style.textContent = [
      '#cookie-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:9999;',
      'background:var(--primary,#1a3c6e);color:#fff;padding:14px 18px;',
      'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px;',
      'box-shadow:0 -2px 12px rgba(0,0,0,.18);font-family:\'Cairo\',sans-serif;font-size:14px;}',
      '#cookie-consent-banner p{margin:0;flex:1 1 260px;min-width:220px;line-height:1.6;}',
      '#cookie-consent-banner a{color:var(--accent,#e8a020);text-decoration:underline;}',
      '#cookie-consent-banner .cc-actions{display:flex;gap:8px;flex-shrink:0;}',
      '#cookie-consent-banner button{border:none;border-radius:6px;padding:8px 18px;',
      'font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;}',
      '#cc-accept{background:var(--accent,#e8a020);color:#1a3c6e;}',
      '#cc-decline{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5) !important;}',
      'body.dark #cookie-consent-banner{background:#0f2440;}'
    ].join('');
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'cookie-consent-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'إشعار ملفات الارتباط');
    bar.innerHTML =
      '<p>🍪 نستخدم ملفات تعريف الارتباط لتحسين تجربتك وتحليل استخدام الموقع. ' +
      'التفاصيل في <a href="/privacy.html">سياسة الخصوصية</a>.</p>' +
      '<div class="cc-actions">' +
      '<button id="cc-decline" type="button">رفض</button>' +
      '<button id="cc-accept" type="button">موافق</button>' +
      '</div>';
    document.body.appendChild(bar);

    function decide(value) {
      try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
      pushConsent(value === 'accepted');
      bar.remove();
    }
    document.getElementById('cc-accept').addEventListener('click', function () { decide('accepted'); });
    document.getElementById('cc-decline').addEventListener('click', function () { decide('declined'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
