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

    return env.ASSETS.fetch(request);
  },
};
