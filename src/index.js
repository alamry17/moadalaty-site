/**
 * Cloudflare Worker (Static Assets) — نقطة الدخول الرئيسية للموقع
 *
 * - أي طلب على /api/contact بطريقة POST يتم التعامل معه هنا مباشرة
 *   (إرسال إيميل عبر Email Routing المجاني، بدون أي خدمة خارجية).
 * - أي طلب آخر بيتحوّل للملفات الثابتة (HTML, CSS, JS, الصور... إلخ)
 *   عن طريق env.ASSETS.fetch(request) — وده بيشمل _headers و_redirects
 *   تلقائيًا زي ما كان شغال في Cloudflare Pages بالظبط.
 */

import { EmailMessage } from "cloudflare:email";

// ═══ فوتر موحّد لكل صفحات الموقع (يحل مشكلة "تعديل 35+ ملف يدويًا") ═══
// المصدر الوحيد للحقيقة بخصوص روابط الفوتر بقى هنا بس. أي إضافة/تعديل/حذف
// لينك مستقبلي (حاسبة جديدة مثلاً) يتم في المصفوفة دي فقط، وهتتطبّق تلقائيًا
// على كل صفحة HTML في الموقع من غير ما تلمس ولا ملف تاني.
//
// بيشتغل عن طريق HTMLRewriter (ميزة مبنية جوه Cloudflare Workers): بيقرأ
// استجابة الصفحة وهي طالعة من env.ASSETS.fetch، ويستبدل محتوى أي عنصر
// <nav aria-label="روابط الموقع الرئيسية"> بالقائمة الموحّدة دي — بغض النظر
// عن شكل الـ HTML الأصلي جوه الملف نفسه (كان فيه كذا نمط مختلف قبل كده).
//
// ملحوظة مهمة: ده بيستبدل بس روابط التنقّل (nav links)، مش بيلمس سطر
// "آخر تحديث" ولا سطر حقوق النشر تحته — دول لسه بيتقروا من كل ملف HTML
// زي ما هم، لأن تاريخ "آخر تحديث" بيختلف من مقالة لمقالة ولازم يفضل كده.
const FOOTER_NAV_LINKS = [
  { href: "/", label: "🏠 الأداة" },
  { href: "/tip-bill-split-calculator.html", label: "🧾 تقسيم الفاتورة والبقشيش" },
  { href: "/roommate-expense-splitter.html", label: "🏠 تقسيم مصاريف السكن" },
  { href: "/group-trip-cost-splitter.html", label: "✈️ تقسيم مصاريف الرحلة" },
  { href: "/articles/", label: "📚 المقالات" },
  { href: "/articles/faq.html", label: "❓ الأسئلة الشائعة" },
  { href: "/about.html", label: "من نحن" },
  { href: "/contact.html", label: "اتصل بنا" },
  { href: "/privacy.html", label: "الخصوصية" },
  { href: "/terms.html", label: "الشروط" },
  { href: "/disclaimer.html", label: "إخلاء المسؤولية" },
];

function buildFooterNavHtml() {
  return FOOTER_NAV_LINKS
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join('\n        <span aria-hidden="true">·</span>\n        ');
}

class FooterNavHandler {
  element(el) {
    el.setInnerContent(buildFooterNavHtml(), { html: true });
  }
}

// بيتطبّق بس على استجابات HTML فعلية (مش CSS/JS/صور... إلخ) — بنتأكد من
// الـ Content-Type قبل ما نحاول نعمل rewrite، تجنبًا لأي محاولة تعديل على
// ملفات مش HTML أصلاً.
function applyUnifiedFooter(response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  return new HTMLRewriter()
    .on('nav[aria-label="روابط الموقع الرئيسية"]', new FooterNavHandler())
    .transform(response);
}

// تحويل نص UTF-8 (بما فيه عربي) إلى Base64 — الأسلوب المضمون في Workers
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ═══ عداد المشاهدات الحقيقي (Cloudflare KV) ═══
// - GET  /api/views?page=SLUG  → يرجّع العدد الحالي بدون ما يزوّده (لو محتجناه لاحقًا)
// - POST /api/views?page=SLUG  → يزوّد العدد بـ 1 ويرجّعه
//
// الحد المجاني: 1000 عملية كتابة/يوم لكل الموقع مجمّع، بيتصفّر الساعة
// 00:00 UTC. لو اتخطينا الحد، KV بترجّع خطأ — وإحنا هنا بنتعامل مع الخطأ
// ده بهدوء (نرجّع آخر عدد معروف من الكاش لو موجود، أو نتجاهل الزيادة)
// بدل ما نكسر تحميل الصفحة أو نوري رسالة خطأ للزائر. مفيش أي ترقية
// مدفوعة تلقائية — العداد بس بيتوقف عن الزيادة لحد ما يتصفّر الحد.
async function handleViews(request, env) {
  const url = new URL(request.url);
  const page = (url.searchParams.get("page") || "").trim().slice(0, 100);

  if (!page || !/^[a-z0-9-]+$/.test(page)) {
    return new Response(JSON.stringify({ error: "invalid page slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = `views:${page}`;

  if (request.method === "GET") {
    const current = await env.VIEWS_KV.get(key);
    return new Response(JSON.stringify({ page, views: Number(current) || 0 }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (request.method === "POST") {
    try {
      const current = Number(await env.VIEWS_KV.get(key)) || 0;
      const next = current + 1;
      await env.VIEWS_KV.put(key, String(next));
      return new Response(JSON.stringify({ page, views: next }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch (err) {
      // على الأغلب تخطينا الـ 1000 كتابة اليومية المجانية — نرجّع آخر
      // رقم معروف (لو قدرنا نقراه) بدل ما نفشل الطلب بالكامل.
      let fallback = 0;
      try { fallback = Number(await env.VIEWS_KV.get(key)) || 0; } catch (_) {}
      return new Response(JSON.stringify({ page, views: fallback, note: "not incremented" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

async function handleContact(request, env) {
  try {
    const form = await request.formData();

    // Honeypot — لو الحقل ده اتملى، ده بوت
    if (form.get("bot-field")) {
      return Response.redirect(new URL("/contact.html?sent=1", request.url), 303);
    }

    // بيشيل أي \r أو \n من القيمة — ده اللي بيمنع Header Injection (CRLF
    // Injection): من غير التنضيف ده، حد ممكن يحط "attacker@x.com\r\nBcc:
    // victim@y.com" في حقل الإيميل ويضيف هيدرز إيميل زيادة (Bcc/Cc/إلخ)
    // ويستخدم فورم التواصل عشان يبعت سبام لناس تانية باسم الموقع.
    const sanitizeHeaderField = (value) => value.replace(/[\r\n]+/g, " ").trim();

    const name = sanitizeHeaderField((form.get("name") || "").toString().slice(0, 200));
    const email = sanitizeHeaderField((form.get("email") || "").toString().slice(0, 200));
    const phone = sanitizeHeaderField((form.get("phone") || "").toString().slice(0, 50));
    const subject = sanitizeHeaderField((form.get("subject") || "").toString().slice(0, 100));
    // الـ message مش بيتحط في أي هيدر — هو بس جوه الـ body بعد الهيدرز
    // خالص، فمش محتاج نفس التنضيف (ممكن يفضل فيه أسطر جديدة عادية).
    const message = (form.get("message") || "").toString().slice(0, 5000);

    if (!name || !email || !message) {
      return Response.redirect(new URL("/contact.html?error=1", request.url), 303);
    }

    // تحقق بسيط إن الإيميل معمول بشكل منطقي (مش تحقق كامل RFC، بس كافي
    // عشان نمنع أي حاجة غريبة توصل لهيدر Reply-To)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.redirect(new URL("/contact.html?error=1", request.url), 303);
    }

    const toAddr = env.CONTACT_TO_EMAIL || "alamry17@gmail.com";
    const bodyText =
      `اسم المرسل: ${name}\r\n` +
      `البريد الإلكتروني: ${email}\r\n` +
      `الهاتف: ${phone || "—"}\r\n` +
      `الموضوع: ${subject || "—"}\r\n\r\n` +
      `الرسالة:\r\n${message}\r\n`;

    const subjectLine = `[تواصل الموقع] ${subject || "بدون موضوع"} — من ${name}`;

    const raw =
      `From: "نموذج التواصل" <no-reply@moadalaty.com>\r\n` +
      `To: ${toAddr}\r\n` +
      `Reply-To: ${email}\r\n` +
      `Subject: =?UTF-8?B?${toBase64Utf8(subjectLine)}?=\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      toBase64Utf8(bodyText);

    const email_message = new EmailMessage("no-reply@moadalaty.com", toAddr, raw);
    await env.SEND_EMAIL.send(email_message);

    return Response.redirect(new URL("/contact.html?sent=1", request.url), 303);
  } catch (err) {
    return Response.redirect(new URL("/contact.html?error=1", request.url), 303);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/views") {
      return handleViews(request, env);
    }

    // كل الطلبات التانية (صفحات HTML، CSS، JS، صور...) بتتقدّم من الملفات
    // الساكنة زي ما هي، وبعدين لو كانت الاستجابة HTML فعلاً، بيتعمل عليها
    // rewrite لفوتر موحّد قبل ما ترجع للزائر — راجع applyUnifiedFooter فوق.
    const assetResponse = await env.ASSETS.fetch(request);
    return applyUnifiedFooter(assetResponse);
  },
};
