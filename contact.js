/**
 * Cloudflare Pages Function — /api/contact
 * يستقبل بيانات نموذج "اتصل بنا" ويرسلها كإيميل عبر REST API الخاص
 * بخدمة Cloudflare Email Service — بدون أي خدمة خارجية.
 *
 * ملحوظة: مشاريع Pages لا تدعم "Send Email" binding (على عكس Workers العادية)،
 * فبنستخدم بدلاً منه REST API مباشرة عبر fetch().
 *
 * الإعداد المطلوب في لوحة تحكم Cloudflare (مرة واحدة فقط):
 * 1) فعّل Email Sending على نطاقك (Cloudflare Dashboard → Compute → Email Service
 *    → Email Sending → Onboard Domain → اختر moadalaty.com)
 * 2) أنشئ API Token له صلاحية Email Sending فقط على حسابك
 *    (My Profile → API Tokens → Create Token)
 * 3) روح لمشروع الـ Pages → Settings → Variables and secrets → أضف:
 *    - CF_ACCOUNT_ID  (قيمة عادية) = رقم حسابك في Cloudflare
 *    - CF_EMAIL_API_TOKEN  (Secret مشفّر) = التوكن اللي أنشأته
 * 4) بعد إضافة المتغيرين وإعادة النشر، الفورم هيشتغل تلقائيًا
 */

async function sendViaEmailService(env, { to, from, subject, text }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_EMAIL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, from, subject, text }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Email Service error ${res.status}: ${errText}`);
  }
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

    const toAddr = env.CONTACT_TO_EMAIL || "alamry17@gmail.com";
    const bodyText =
      `اسم المرسل: ${name}\r\n` +
      `البريد الإلكتروني: ${email}\r\n` +
      `الهاتف: ${phone || "—"}\r\n` +
      `الموضوع: ${subject || "—"}\r\n\r\n` +
      `الرسالة:\r\n${message}\r\n`;

    const subjectLine = `[تواصل الموقع] ${subject || "بدون موضوع"} — من ${name}`;

    await sendViaEmailService(env, {
      to: toAddr,
      from: "no-reply@moadalaty.com",
      subject: subjectLine,
      text: bodyText,
    });

    return Response.redirect(new URL("/contact.html?sent=1", request.url), 303);
  } catch (err) {
    return Response.redirect(new URL("/contact.html?error=1", request.url), 303);
  }
}
