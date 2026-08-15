/**
 * Cloudflare Pages Function — /api/contact
 * يستقبل بيانات نموذج "اتصل بنا" ويرسلها كإيميل عبر Cloudflare Email Routing
 * (المُفعّل على نطاقك ومربوط بجيميلك) — بدون أي خدمة خارجية.
 *
 * الإعداد المطلوب في لوحة تحكم Cloudflare Pages (مرة واحدة فقط):
 * 1) فعّل Email Routing على نطاقك (Cloudflare Dashboard → Email → Email Routing)
 *    وتأكد إن عندك عنوان وجهة verified موجّه لجيميلك (مثال: contact@moadalaty.com → your@gmail.com)
 * 2) روح لمشروع الـ Pages بتاعك → Settings → Functions → Bindings
 *    → أضف "Send Email" binding باسم SEND_EMAIL واختر عنوان الوجهة الـ verified
 * 3) بعد ربط الـ binding، الفورم هيشتغل تلقائيًا بدون أي تعديل تاني في الكود
 */

import { EmailMessage } from "cloudflare:email";

// تحويل نص UTF-8 (بما فيه عربي) إلى Base64 باستخدام TextEncoder —
// وده الأسلوب الحديث المضمون في بيئة Cloudflare Workers (بدل unescape() القديمة
// وبدل Buffer اللي مش متاح افتراضيًا في Workers من غير تفعيل Node.js compat).
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();

    // Honeypot — لو الحقل ده اتملى يبقى بوت، اتجاهله بهدوء
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

    const toAddr = env.CONTACT_TO_EMAIL || "contact@moadalaty.com";
    const bodyText =
      `اسم المرسل: ${name}\r\n` +
      `البريد الإلكتروني: ${email}\r\n` +
      `الهاتف: ${phone || "—"}\r\n` +
      `الموضوع: ${subject || "—"}\r\n\r\n` +
      `الرسالة:\r\n${message}\r\n`;

    const subjectLine = `[تواصل الموقع] ${subject || "بدون موضوع"} — من ${name}`;

    // بناء رسالة MIME يدويًا — بدون أي مكتبات خارجية
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
