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

    const name = (form.get("name") || "").toString().slice(0, 200);
    const email = (form.get("email") || "").toString().slice(0, 200);
    const phone = (form.get("phone") || "").toString().slice(0, 50);
    const subject = (form.get("subject") || "").toString().slice(0, 100);
    const message = (form.get("message") || "").toString().slice(0, 5000);

    if (!name || !email || !message) {
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

    return env.ASSETS.fetch(request);
  },
};
