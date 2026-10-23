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
  { href: "/", label: "🏠 الأداة" },
  { href: "/gpa-calculator", label: "🎓 حاسبة المعدل GPA" },
  { href: "/tip-bill-split-calculator", label: "🧾 تقسيم الفاتورة والبقشيش" },
  { href: "/roommate-expense-splitter", label: "🏠 تقسيم مصاريف السكن" },
  { href: "/group-trip-cost-splitter", label: "✈️ تقسيم مصاريف الرحلة" },
  { href: "/articles/school-fees-dollar-impact-calculator", label: "💵 تأثير الدولار على المصروفات" },
  { href: "/articles/", label: "📚 المقالات" },
  { href: "/articles/faq", label: "❓ الأسئلة الشائعة" },
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "اتصل بنا" },
  { href: "/privacy", label: "الخصوصية" },
  { href: "/terms", label: "الشروط" },
  { href: "/disclaimer", label: "إخلاء المسؤولية" },
];

// ═══ النسخة الإنجليزية من نفس القائمة ═══
// كانت الصفحات الإنجليزية (index.en.html وأخواتها) بتحتفظ بفوتر ثابت
// مكتوب يدويًا جوه كل ملف، منفصل تمامًا عن FOOTER_NAV_LINKS فوق — يعني
// أي لينك جديد كان لازم يتضاف يدويًا في كل صفحة إنجليزية على حدة، وده
// سهل ينسى ويسيب الصفحات مش متزامنة. دلوقتي بقى فيه مصدر واحد هنا لكل
// اللغتين، وأي صفحة إنجليزية فيها <nav aria-label="Main site links">
// هتاخد الفوتر ده تلقائيًا زي ما العربي بياخد بالظبط.
const FOOTER_NAV_LINKS_EN = [
  { href: "/en/", label: "🏠 Home" },
  { href: "/en/tip-bill-split-calculator", label: "🧾 Tip & Bill Split" },
  { href: "/en/roommate-expense-splitter", label: "🏠 Roommate Expenses" },
  { href: "/en/group-trip-cost-splitter", label: "✈️ Group Trip Costs" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
];

// رسالة نجاح الاشتراك مكتوبة بنفس النص في 37 صفحة. بدل تعديلها يدوياً، الـ Worker بيستبدلها
// هنا لتناسب خطوة تأكيد البريد. (رابط الـ PDF تحتها بيفضل ظاهر زي ما هو.)
const JOIN_SUCCESS_TEXT =
  "✅ تم استلام طلبك! لو اشتراكك جديد فستصلك رسالة تأكيد، افتحها واضغط الرابط لإكمال الاشتراك (تفقّد مجلد الترويجية أو السبام). وهذا دليلك المجاني من الزر التالي:";

class JoinSuccessHandler {
  element(el) {
    el.setInnerContent(JOIN_SUCCESS_TEXT);
  }
}

function buildFooterNavHtml(links, langSwitch) {
  const allLinks = langSwitch ? [...links, langSwitch] : links;
  return allLinks
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join('\n        <span aria-hidden="true">·</span>\n        ');
}

class FooterNavHandler {
  constructor(links, langSwitch) {
    this.links = links;
    this.langSwitch = langSwitch;
  }
  element(el) {
    el.setInnerContent(buildFooterNavHtml(this.links, this.langSwitch), { html: true });
  }
}

// ═══ رابط تبديل اللغة (عربي ↔ إنجليزي) ═══
// بيظهر بس في الصفحات اللي فعلاً ليها نسخة مقابلة باللغة التانية (الرئيسية
// وحاسبات التقسيم التلاتة)، وبيودّي لنفس الصفحة بالظبط مش للرئيسية بس —
// عشان يفيد الزائر فعليًا ويدعم علاقة hreflang اللي في <head> بلينك مرئي
// وقابل للزحف بدل ما تفضل معلومة مخفية شايفها جوجل بس. الصفحات اللي مالهاش
// ترجمة (المقالات، من نحن، اتصل بنا... إلخ) بتفضل من غيره تمامًا، عشان منربطش
// لصفحة مش موجودة.
const LANG_ALTERNATES = {
  "/": { href: "/en/", label: "🇬🇧 English" },
  "/tip-bill-split-calculator": { href: "/en/tip-bill-split-calculator", label: "🇬🇧 English" },
  "/roommate-expense-splitter": { href: "/en/roommate-expense-splitter", label: "🇬🇧 English" },
  "/group-trip-cost-splitter": { href: "/en/group-trip-cost-splitter", label: "🇬🇧 English" },
  "/en/": { href: "/", label: "🇸🇦 العربية" },
  "/en/tip-bill-split-calculator": { href: "/tip-bill-split-calculator", label: "🇸🇦 العربية" },
  "/en/roommate-expense-splitter": { href: "/roommate-expense-splitter", label: "🇸🇦 العربية" },
  "/en/group-trip-cost-splitter": { href: "/group-trip-cost-splitter", label: "🇸🇦 العربية" },
};

// بيتطبّق بس على استجابات HTML فعلية (مش CSS/JS/صور... إلخ) — بنتأكد من
// الـ Content-Type قبل ما نحاول نعمل rewrite، تجنبًا لأي محاولة تعديل على
// ملفات مش HTML أصلاً.
function applyUnifiedFooter(response, pathname) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const langSwitch = LANG_ALTERNATES[pathname] || null;

  return new HTMLRewriter()
    .on('nav[aria-label="روابط الموقع الرئيسية"]', new FooterNavHandler(FOOTER_NAV_LINKS, langSwitch))
    .on('nav[aria-label="Main site links"]', new FooterNavHandler(FOOTER_NAV_LINKS_EN, langSwitch))
    .on('#join-success p', new JoinSuccessHandler())
    .transform(response);
}

// بيشيل أي \r أو \n من القيمة — ده اللي بيمنع Header Injection (CRLF
// Injection): من غير التنضيف ده، حد ممكن يحط "attacker@x.com\r\nBcc:
// victim@y.com" في حقل بيتحط في هيدر إيميل، ويضيف هيدرز زيادة (Bcc/Cc/إلخ)
// ويستخدم النموذج عشان يبعت سبام لناس تانية باسم الموقع. مشتركة بين
// /api/contact و /api/subscribe عشان مانكررش نفس المنطق مرتين.
function sanitizeHeaderField(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
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
      return Response.redirect(new URL("/contact?sent=1", request.url), 303);
    }

    const name = sanitizeHeaderField((form.get("name") || "").toString().slice(0, 200));
    const email = sanitizeHeaderField((form.get("email") || "").toString().slice(0, 200));
    const phone = sanitizeHeaderField((form.get("phone") || "").toString().slice(0, 50));
    const subject = sanitizeHeaderField((form.get("subject") || "").toString().slice(0, 100));
    // الـ message مش بيتحط في أي هيدر — هو بس جوه الـ body بعد الهيدرز
    // خالص، فمش محتاج نفس التنضيف (ممكن يفضل فيه أسطر جديدة عادية).
    const message = (form.get("message") || "").toString().slice(0, 5000);

    if (!name || !email || !message) {
      return Response.redirect(new URL("/contact?error=1", request.url), 303);
    }

    // تحقق بسيط إن الإيميل معمول بشكل منطقي (مش تحقق كامل RFC، بس كافي
    // عشان نمنع أي حاجة غريبة توصل لهيدر Reply-To)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.redirect(new URL("/contact?error=1", request.url), 303);
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

    return Response.redirect(new URL("/contact?sent=1", request.url), 303);
  } catch (err) {
    return Response.redirect(new URL("/contact?error=1", request.url), 303);
  }
}

// ═══ إعدادات الإرسال عبر Brevo ═══
// المفتاح BREVO_API_KEY لازم يكون Secret في إعدادات الـ Worker (Runtime) مش في Builds.
// عنوان المرسل لازم يكون على نطاق موثّق في Brevo (moadalaty.com). تقدر تغيّره من
// متغير BREVO_SENDER_EMAIL من غير ما تعدّل الكود.
const SITE_ORIGIN = "https://moadalaty.com";
const PDF_URL = `${SITE_ORIGIN}/assets/moadalaty-study-planner.pdf`;
const DEFAULT_SENDER_EMAIL = "info@moadalaty.com";
const SENDER_NAME = "معدلاتي";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buildUnsubscribeUrl(email, token) {
  return `${SITE_ORIGIN}/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
}

// إرسال رسالة عبر Brevo Transactional API. بترجّع true/false ومابترميش خطأ،
// عشان فشل الإرسال مايكسرش الاشتراك نفسه.
async function sendBrevoEmail(env, { to, subject, html, text, headers }) {
  if (!env.BREVO_API_KEY) {
    console.error("BREVO_API_KEY غير موجود في بيئة التشغيل (Runtime)");
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL, name: SENDER_NAME },
        replyTo: { email: env.CONTACT_TO_EMAIL || "alamry17@gmail.com" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
        headers,
      }),
    });
    if (!res.ok) {
      console.error("Brevo error", res.status, (await res.text()).slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Brevo request failed", String(err));
    return false;
  }
}

async function sendWelcomeEmail(env, email, token) {
  const unsubUrl = buildUnsubscribeUrl(email, token);
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f6fb;font-family:Tahoma,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#fff;border-radius:14px;padding:28px;line-height:1.9;color:#1c2b4a;">
    <h2 style="margin:0 0 12px;">أهلاً بك في معدلاتي 🎓</h2>
    <p style="margin:0 0 16px;">شكراً لاشتراكك. هذا دليلك المجاني للتخطيط للمصروفات الدراسية:</p>
    <p style="text-align:center;margin:24px 0;"><a href="${PDF_URL}" style="background:#f0a030;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block;">📥 حمّل الملف الآن (PDF)</a></p>
    <p style="margin:0;color:#5a6a85;font-size:14px;">لا نرسل رسائل مزعجة، ويمكنك إلغاء الاشتراك في أي وقت.</p>
  </div>
  <p style="text-align:center;color:#8a96ad;font-size:12px;margin:16px 0 0;">
    وصلتك هذه الرسالة لأنك اشتركت في نشرة moadalaty.com<br>
    <a href="${unsubUrl}" style="color:#8a96ad;">إلغاء الاشتراك</a>
  </p>
</div></body></html>`;
  const text =
    `أهلاً بك في معدلاتي\n\nحمّل دليلك المجاني من هنا:\n${PDF_URL}\n\n` +
    `لإلغاء الاشتراك في أي وقت:\n${unsubUrl}\n`;
  return sendBrevoEmail(env, {
    to: email,
    subject: "دليلك المجاني من معدلاتي 🎓",
    html,
    text,
    // الترويستان دول بيظهروا زر "إلغاء الاشتراك" جوه Gmail وبيشتغل بضغطة واحدة.
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ═══ تأكيد البريد (Double Opt-in) ═══
// الاشتراك الجديد بيتسجّل في KV بحالة pending (معلّق)، وبيوصل للمشترك إيميل فيه
// رابط تأكيد. مفيش إيميل ترحيب ولا أي رسائل تانية قبل الضغط على الرابط. ده بيمنع
// إن حد يسجّل إيميل غيره ويبعتله سبام باسم الموقع.
//
// شكل السجل في KV (مفتاح "sub:<email>"):
//   { email, subscribedAt, source, token, pending?, confirmSentAt?, confirmedAt?, unsubscribedAt? }
// السجل اللي مفيهوش pending ولا unsubscribedAt = مشترك نشط (بما فيهم اللي اشتركوا قبل التأكيد).
const CONFIRM_RESEND_MS = 10 * 60 * 1000; // أقل فاصل بين إعادة إرسال رسالة التأكيد لنفس الإيميل

function buildConfirmUrl(email, token) {
  return `${SITE_ORIGIN}/confirm?e=${encodeURIComponent(email)}&t=${token}`;
}

async function sendConfirmationEmail(env, email, token) {
  const confirmUrl = buildConfirmUrl(email, token);
  const unsubUrl = buildUnsubscribeUrl(email, token);
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f6fb;font-family:Tahoma,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#fff;border-radius:14px;padding:28px;line-height:1.9;color:#1c2b4a;">
    <h2 style="margin:0 0 12px;">أكّد اشتراكك في معدلاتي</h2>
    <p style="margin:0 0 16px;">وصلنا طلب اشتراك بهذا البريد. اضغط الزر التالي لتأكيده، وسنرسل لك دليلك المجاني فور التأكيد:</p>
    <p style="text-align:center;margin:24px 0;"><a href="${confirmUrl}" style="background:#f0a030;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block;">✅ تأكيد الاشتراك</a></p>
    <p style="margin:0;color:#5a6a85;font-size:14px;">إن لم تطلب هذا الاشتراك فتجاهل الرسالة، ولن يُضاف بريدك.</p>
  </div>
  <p style="text-align:center;color:#8a96ad;font-size:12px;margin:16px 0 0;">
    <a href="${unsubUrl}" style="color:#8a96ad;">لا أريد رسائل من معدلاتي</a>
  </p>
</div></body></html>`;
  const text =
    `أكّد اشتراكك في معدلاتي\n\nاضغط الرابط التالي لتأكيد الاشتراك:\n${confirmUrl}\n\n` +
    `إن لم تطلب هذا الاشتراك فتجاهل الرسالة.\nلإيقاف الرسائل: ${unsubUrl}\n`;
  return sendBrevoEmail(env, {
    to: email,
    subject: "أكّد اشتراكك في معدلاتي",
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// تنبيه لصاحب الموقع (Email Routing) — بيتبعت عند تأكيد المشترك مش عند التسجيل.
async function notifyOwner(env, email, source, now) {
  try {
    const toAddr = env.CONTACT_TO_EMAIL || "alamry17@gmail.com";
    const bodyText =
      `مشترك جديد أكّد اشتراكه في النشرة البريدية:\r\n\r\n` +
      `الإيميل: ${email}\r\n` +
      `الصفحة: https://moadalaty.com${source}\r\n` +
      `التاريخ: ${now}\r\n`;
    const subjectLine = `[اشتراك مؤكَّد] ${email}`;
    const raw =
      `From: "نشرة معدلاتي" <no-reply@moadalaty.com>\r\n` +
      `To: ${toAddr}\r\n` +
      `Subject: =?UTF-8?B?${toBase64Utf8(subjectLine)}?=\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      toBase64Utf8(bodyText);
    await env.SEND_EMAIL.send(new EmailMessage("no-reply@moadalaty.com", toAddr, raw));
  } catch (err) {
    console.error("owner notification failed", String(err));
  }
}

// POST /api/subscribe  { email, source, botField }
async function handleSubscribe(request, env, ctx) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return json({ error: "invalid request" }, 400);
    }

    // Honeypot — بوت. نرجّع نجاح وهمي.
    if (body.botField) return json({ ok: true });

    const email = sanitizeHeaderField((body.email || "").toString().slice(0, 200)).toLowerCase();
    const source = sanitizeHeaderField((body.source || "").toString().slice(0, 200)) || "/";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid email" }, 400);
    }

    const key = `sub:${email}`;
    const now = new Date().toISOString();

    let prev = null;
    try {
      const raw = await env.SUBSCRIBERS_KV.get(key);
      if (raw) prev = JSON.parse(raw);
    } catch (_) {}

    // مشترك نشط ومؤكَّد: نحدّث آخر زيارة بس، من غير أي إيميل.
    if (prev && !prev.pending && !prev.unsubscribedAt) {
      try {
        await env.SUBSCRIBERS_KV.put(key, JSON.stringify({ ...prev, lastSeen: now, lastSource: source }));
      } catch (_) {}
      return json({ ok: true, alreadySubscribed: true });
    }

    let record;
    if (prev && prev.pending && !prev.unsubscribedAt) {
      // معلّق لسه مأكّدش: نعيد إرسال رسالة التأكيد بس لو عدّى وقت كفاية (حماية من الإزعاج).
      const last = prev.confirmSentAt ? Date.parse(prev.confirmSentAt) : 0;
      if (Date.now() - last < CONFIRM_RESEND_MS) return json({ ok: true, pending: true });
      record = { ...prev, confirmSentAt: now };
    } else {
      // اشتراك جديد، أو واحد ألغى قبل كده — بيحتاج تأكيد من جديد في الحالتين.
      record = {
        email,
        subscribedAt: prev ? prev.subscribedAt : now,
        source: prev ? prev.source : source,
        token: (prev && prev.token) || generateToken(),
        pending: true,
        confirmSentAt: now,
      };
      if (prev) record.resubscribeRequestedAt = now;
    }

    // لازم السجل يتخزّن، لأن رابط التأكيد بيعتمد عليه. لو KV فشل نرجّع خطأ والزائر يحاول تاني.
    try {
      await env.SUBSCRIBERS_KV.put(key, JSON.stringify(record));
    } catch (err) {
      console.error("KV put failed", String(err));
      return json({ error: "server error" }, 500);
    }

    ctx.waitUntil(sendConfirmationEmail(env, email, record.token));
    return json({ ok: true, pending: true });
  } catch (err) {
    return json({ error: "server error" }, 500);
  }
}

// GET /confirm?e=<email>&t=<token> — بيأكّد الاشتراك فوراً (من غير زر تاني، عشان التجربة أسهل).
async function handleConfirm(request, env, ctx) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") || "").trim().toLowerCase().slice(0, 200);
  const token = (url.searchParams.get("t") || "").trim().slice(0, 64);

  const invalid = () =>
    unsubscribePage("الرابط غير صالح", "تعذّر التحقق من رابط التأكيد. اشترك من الموقع مرة أخرى لتصلك رسالة تأكيد جديدة.", "", 400);

  if (!email || !token || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid();

  let rec = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(`sub:${email}`);
    if (raw) rec = JSON.parse(raw);
  } catch (_) {}
  if (!rec || !safeEqual(rec.token || "", token)) return invalid();

  if (rec.unsubscribedAt) {
    return unsubscribePage("الاشتراك ملغى", "ألغيتَ اشتراكك سابقاً. إن أردت العودة فاشترك من الموقع مرة أخرى.");
  }

  const pdfButton = `<p><a href="${PDF_URL}" download style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;">📥 حمّل الملف الآن (PDF)</a></p>`;

  if (!rec.pending) {
    return unsubscribePage("اشتراكك مؤكَّد", "تم تأكيد اشتراكك سابقاً.", pdfButton);
  }

  const now = new Date().toISOString();
  const { pending, confirmSentAt, ...rest } = rec;
  try {
    await env.SUBSCRIBERS_KV.put(`sub:${email}`, JSON.stringify({ ...rest, confirmedAt: now }));
  } catch (err) {
    return unsubscribePage("حدث خطأ", "تعذّر حفظ التأكيد الآن. اضغط الرابط مرة أخرى بعد قليل.", "", 500);
  }

  ctx.waitUntil(
    (async () => {
      await sendWelcomeEmail(env, email, rec.token);
      await notifyOwner(env, email, rec.source || "/", now);
    })()
  );

  return unsubscribePage("تم تأكيد اشتراكك 🎉", `شكراً لك. أرسلنا دليلك المجاني إلى <strong dir="ltr">${escapeHtml(email)}</strong>، ويمكنك تحميله الآن:`, pdfButton);
}

// ═══ إلغاء الاشتراك ═══
// GET  /unsubscribe?e=<email>&t=<token>  → صفحة فيها زر تأكيد واحد
// POST /unsubscribe?e=<email>&t=<token>  → ينفّذ الإلغاء فوراً (الزر + زر Gmail "إلغاء الاشتراك")
// السبب في الـ GET بزر: بعض برامج فحص الروابط بتفتح كل رابط في الإيميل، ولو الإلغاء
// بيحصل على GET هتلغي اشتراك الناس من غير ما يقصدوا.
// السجل بيفضل في KV بعلامة unsubscribedAt عشان أي إرسال جماعي لاحق يتخطّاه.
function unsubscribePage(title, message, extraHtml = "", status = 200) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)} | معدلاتي</title>
<style>body{margin:0;background:#f4f6fb;font-family:Tahoma,Arial,sans-serif;color:#1c2b4a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:14px;padding:32px;max-width:440px;text-align:center;line-height:1.9;box-shadow:0 4px 18px rgba(0,0,0,.06)}
button{background:#1e3a8a;color:#fff;border:0;border-radius:10px;padding:12px 28px;font-size:16px;font-weight:bold;cursor:pointer;font-family:inherit}
a{color:#1e3a8a}</style></head><body><div class="card"><h2 style="margin-top:0">${escapeHtml(title)}</h2>
<p>${message}</p>${extraHtml}<p style="margin-bottom:0"><a href="/">العودة إلى معدلاتي</a></p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// زر "احذف بريدي نهائياً" — بيظهر في صفحة "تم إلغاء اشتراكك". بيمسح سجل المشترك من KV فوراً
// من غير أي تدخل منك. (POST على مسار منفصل /unsubscribe/delete عشان طلب Gmail
// "إلغاء الاشتراك بنقرة" ما يمسحش السجل بالغلط.)
function deleteForm(email, token) {
  const action = `/unsubscribe/delete?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
  return `<form method="POST" action="${escapeHtml(action)}" style="margin:18px 0 8px;border-top:1px solid #e3e8f2;padding-top:16px"><p style="margin:0 0 10px;font-size:14px;color:#5a6a85">تريد حذف بريدك نهائياً من سجلاتنا؟ لا يمكن التراجع عن ذلك.</p><button type="submit" style="background:#b42318">🗑️ احذف بريدي نهائياً</button></form>`;
}

async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") || "").trim().toLowerCase().slice(0, 200);
  const token = (url.searchParams.get("t") || "").trim().slice(0, 64);

  const invalid = () =>
    unsubscribePage("الرابط غير صالح", "تعذّر التحقق من هذا الرابط، أو أن البريد حُذف من سجلاتنا مسبقاً. إن كنت تريد إيقاف الرسائل فاستخدم رابط إلغاء الاشتراك من آخر رسالة وصلتك.", "", 400);

  if (!email || !token || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid();

  let rec = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(`sub:${email}`);
    if (raw) rec = JSON.parse(raw);
  } catch (_) {}
  if (!rec || !safeEqual(rec.token || "", token)) return invalid();

  if (request.method === "POST") {
    if (!rec.unsubscribedAt) {
      try {
        await env.SUBSCRIBERS_KV.put(`sub:${email}`, JSON.stringify({ ...rec, unsubscribedAt: new Date().toISOString() }));
      } catch (err) {
        return unsubscribePage("حدث خطأ", "تعذّر حفظ الطلب الآن. حاول مرة أخرى بعد قليل.", "", 500);
      }
    }
    return unsubscribePage("تم إلغاء اشتراكك", `لن تصلك رسائل جديدة على <strong dir="ltr">${escapeHtml(email)}</strong>.`, deleteForm(email, token));
  }

  if (rec.unsubscribedAt) {
    return unsubscribePage("اشتراكك ملغى بالفعل", `لا توجد رسائل قادمة إلى <strong dir="ltr">${escapeHtml(email)}</strong>.`, deleteForm(email, token));
  }

  const form = `<form method="POST" action="${escapeHtml(url.pathname + url.search)}"><button type="submit">تأكيد إلغاء الاشتراك</button></form><br>`;
  return unsubscribePage("إلغاء الاشتراك", `اضغط الزر لإيقاف الرسائل عن <strong dir="ltr">${escapeHtml(email)}</strong>.`, form);
}

// ═══ فحص أسبوعي لمفتاح Brevo (Cron Trigger) ═══
// بيستدعي /v3/account بالمفتاح مرة في الأسبوع عشان يفضل "مستخدم" (Brevo بيعطّل
// المفتاح بعد 90 يوم من غير استخدام). ولو الرد 401/403 (المفتاح اتعطّل أو اتحذف)
// بيبعتلك إيميل تنبيه عبر Email Routing، بدل ما تكتشف المشكلة من اشتراك فاشل.
async function pingBrevo(env) {
  if (!env.BREVO_API_KEY) {
    console.error("cron: BREVO_API_KEY غير موجود في بيئة التشغيل");
    return;
  }
  let status = 0;
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": env.BREVO_API_KEY, Accept: "application/json" },
    });
    status = res.status;
    await res.text();
  } catch (err) {
    console.error("cron: Brevo ping failed", String(err));
    return;
  }
  console.log("cron: Brevo ping status", status);
  if (status === 401 || status === 403) {
    try {
      const toAddr = env.CONTACT_TO_EMAIL || "alamry17@gmail.com";
      const subjectLine = "[تنبيه] مفتاح Brevo لا يعمل";
      const bodyText =
        `الفحص الأسبوعي رجّع الحالة ${status}.\r\n` +
        `غالباً المفتاح اتعطّل أو اتحذف، فرسائل الترحيب لن تُرسل.\r\n` +
        `أنشئ مفتاحاً جديداً من Brevo (SMTP & API) وضعه في Cloudflare كـ Secret باسم BREVO_API_KEY.\r\n`;
      const raw =
        `From: "نشرة معدلاتي" <no-reply@moadalaty.com>\r\n` +
        `To: ${toAddr}\r\n` +
        `Subject: =?UTF-8?B?${toBase64Utf8(subjectLine)}?=\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset="UTF-8"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        toBase64Utf8(bodyText);
      await env.SEND_EMAIL.send(new EmailMessage("no-reply@moadalaty.com", toAddr, raw));
    } catch (err) {
      console.error("cron: alert email failed", String(err));
    }
  }
}

// POST /unsubscribe/delete?e=<email>&t=<token> — حذف سجل المشترك نهائياً من KV.
// لو اشترك تاني بعد كده بيعدّي على تأكيد البريد من جديد زي أي مشترك جديد.
async function handleDeleteSubscriber(request, env) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") || "").trim().toLowerCase().slice(0, 200);
  const token = (url.searchParams.get("t") || "").trim().slice(0, 64);

  const invalid = () =>
    unsubscribePage("الرابط غير صالح", "تعذّر التحقق من هذا الرابط، أو أن البريد حُذف من سجلاتنا مسبقاً.", "", 400);

  if (!email || !token || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid();

  let rec = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(`sub:${email}`);
    if (raw) rec = JSON.parse(raw);
  } catch (_) {}
  if (!rec || !safeEqual(rec.token || "", token)) return invalid();

  try {
    await env.SUBSCRIBERS_KV.delete(`sub:${email}`);
  } catch (err) {
    return unsubscribePage("حدث خطأ", "تعذّر الحذف الآن. حاول مرة أخرى بعد قليل.", "", 500);
  }
  return unsubscribePage("تم حذف بريدك نهائياً", `حذفنا <strong dir="ltr">${escapeHtml(email)}</strong> من سجلاتنا، ولن نراسلك بعد الآن.`);
}

// ═══ إعادة كتابة مسارات النسخة الإنجليزية (/en/*) للملفات الحقيقية ═══
// الموقع بيستخدم روابط نضيفة (Clean URLs) بشكل افتراضي — Cloudflare بيحذف
// امتداد ".html" من أي رابط تلقائيًا (مثلاً /tip-bill-split-calculator.html
// بيتحول لـ /tip-bill-split-calculator). يعني الـ pathname اللي بيوصل هنا
// عادةً من غير ".html" خالص. الدالة دي بتبني مسار الملف الحقيقي "/foo.en"
// (من غير .html هي كمان) وتسيب Cloudflare نفسه يلاقي "foo.en.html" ورا
// الكواليس زي ما بيعمل مع أي رابط نضيف تاني في الموقع — عشان نتجنب أي
// تحويل (redirect) إضافي مش محتاجينه. لسه بتفهم روابط ".html" القديمة
// كمان (لو حد عنده لينك قديم محفوظ) عن طريق حذفها قبل ما نضيف ".en".
function resolveEnglishAssetPath(pathname) {
  if (pathname === "/en" || pathname === "/en/") {
    return "/index.en";
  }
  if (pathname.startsWith("/en/")) {
    let rest = pathname.slice(4); // بعد "/en/"
    if (rest.endsWith(".html")) rest = rest.slice(0, -5);
    if (rest) return `/${rest}.en`;
  }
  return null;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingBrevo(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/views") {
      return handleViews(request, env);
    }

    if (url.pathname === "/api/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env, ctx);
    }

    if (url.pathname === "/confirm" && request.method === "GET") {
      return handleConfirm(request, env, ctx);
    }

    if (url.pathname === "/unsubscribe/delete" && request.method === "POST") {
      return handleDeleteSubscriber(request, env);
    }

    if (url.pathname === "/unsubscribe" && (request.method === "GET" || request.method === "POST")) {
      return handleUnsubscribe(request, env);
    }

    // لو المسار "/en/..." حوّله للملف الحقيقي المطابق قبل ما نطلبه.
    let assetRequest = request;
    const rewrittenPath = resolveEnglishAssetPath(url.pathname);
    if (rewrittenPath) {
      const rewrittenUrl = new URL(rewrittenPath, url.origin);
      assetRequest = new Request(rewrittenUrl.toString(), request);
    }

    // كل الطلبات التانية (صفحات HTML، CSS، JS، صور...) بتتقدّم من الملفات
    // الساكنة زي ما هي، وبعدين لو كانت الاستجابة HTML فعلاً، بيتعمل عليها
    // rewrite لفوتر موحّد قبل ما ترجع للزائر — راجع applyUnifiedFooter فوق.
    const assetResponse = await env.ASSETS.fetch(assetRequest);
    const langSwitchKey = url.pathname === "/en" ? "/en/" : url.pathname;
    return applyUnifiedFooter(assetResponse, langSwitchKey);
  },
};
