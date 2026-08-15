#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_breadcrumbs.py
========================
يولّد/يحدّث Breadcrumb Schema (JSON-LD) تلقائيًا في كل صفحات الموقع
اعتمادًا على مكان الملف (جذر الموقع أو داخل /articles/) وعنوان H1 الفعلي
في كل صفحة — بدل ما تكتبه يدويًا وتنسى تحدّثه لما تغيّر العنوان.

الاستخدام:
    python3 generate_breadcrumbs.py

شغّله من نفس المجلد اللي فيه index.html و articles/ — يعني من جذر الموقع
(المجلد اللي فيه الملف ده نفسه، tools/، هو المفروض يبقى جوه جذر الموقع).

هيدور تلقائيًا على كل ملفات .html في الجذر و/articles/، ولكل ملف:
  1) يقرأ نص أول <h1> في الصفحة كعنوان الصفحة (بيشيل أي إيموجي في البداية)
  2) يبني مسار Breadcrumb صحيح:
       - لو الملف في /articles/  → الرئيسية › المقالات › عنوان الصفحة
       - لو الملف في الجذر (about.html وغيرها) → الرئيسية › عنوان الصفحة
       - لو الملف هو index.html نفسه أو articles/index.html → بدون Breadcrumb (صفحات جذرية)
  3) يبحث عن أي <script type="application/ld+json"> فيه "@type":"BreadcrumbList"
     موجود بالفعل ويستبدله بالكامل بالنسخة المحدّثة، أو يضيف واحد جديد
     قبل </head> لو مش موجود.

الملف آمن يتكرر تشغيله أي وقت — دايمًا بيحسب من عنوان الصفحة الحالي،
فمش هيسبب تراكم أو تكرار.
"""

import json
import re
from pathlib import Path

DOMAIN = "https://moadalaty.com"
SITE_ROOT = Path(__file__).resolve().parent.parent  # tools/ جوه جذر الموقع

# صفحات مالهاش Breadcrumb (الصفحات الجذرية للموقع)
SKIP = {"index.html", "articles/index.html"}


def extract_h1_text(html: str) -> str | None:
    """يسحب نص أول h1 في الصفحة، ويشيل أي وسوم/إيموجي/مسافات زيادة."""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    if not m:
        return None
    raw = m.group(1)
    # استبدل أي وسم HTML داخلي بمسافة (بدل حذفه المباشر) لتفادي التصاق الكلمات
    text = re.sub(r"<[^>]+>", " ", raw)
    # شيل الإيموجي والرموز غير الأبجدية من البداية
    text = re.sub(r"^[^\w\u0600-\u06FF]+", "", text).strip()
    # وحّد المسافات المتعددة
    text = re.sub(r"\s+", " ", text)
    return text or None


def build_breadcrumb_json(rel_path: str, page_title: str) -> dict:
    items = [
        {"@type": "ListItem", "position": 1, "name": "الرئيسية", "item": f"{DOMAIN}/"}
    ]
    if rel_path.startswith("articles/"):
        items.append({
            "@type": "ListItem", "position": 2, "name": "المقالات",
            "item": f"{DOMAIN}/articles/",
        })
        items.append({
            "@type": "ListItem", "position": 3, "name": page_title,
            "item": f"{DOMAIN}/{rel_path}",
        })
    else:
        items.append({
            "@type": "ListItem", "position": 2, "name": page_title,
            "item": f"{DOMAIN}/{rel_path}",
        })
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def find_existing_breadcrumb_block(html: str):
    """يدوّر على أول <script type="application/ld+json"> بيحتوي BreadcrumbList، ويرجّع (start, end) للاستبدال."""
    for m in re.finditer(
        r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', html, re.S
    ):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if data.get("@type") == "BreadcrumbList":
            return m.start(), m.end()
    return None


def process_file(path: Path):
    rel_path = str(path.relative_to(SITE_ROOT)).replace("\\", "/")
    if rel_path in SKIP:
        return "skipped"

    html = path.read_text(encoding="utf-8")
    title = extract_h1_text(html)
    if not title:
        return "no-h1"

    new_json = build_breadcrumb_json(rel_path, title)
    new_block = (
        '<script type="application/ld+json">\n'
        + json.dumps(new_json, ensure_ascii=False)
        + "\n</script>"
    )

    existing = find_existing_breadcrumb_block(html)
    if existing:
        start, end = existing
        html = html[:start] + new_block + html[end:]
        action = "updated"
    else:
        # أضِف قبل </head> لو موجودة، وإلا قبل أول <script> أو في البداية
        if "</head>" in html:
            html = html.replace("</head>", new_block + "\n</head>", 1)
        else:
            html = new_block + "\n" + html
        action = "added"

    path.write_text(html, encoding="utf-8")
    return f"{action}: {title}"


def main():
    targets = []
    for p in SITE_ROOT.glob("*.html"):
        targets.append(p)
    articles_dir = SITE_ROOT / "articles"
    if articles_dir.is_dir():
        targets.extend(articles_dir.glob("*.html"))

    print(f"جاري معالجة {len(targets)} ملف...\n")
    for p in sorted(targets):
        result = process_file(p)
        rel = p.relative_to(SITE_ROOT)
        print(f"  {rel}  →  {result}")

    print("\nتم. راجع الفروقات (git diff) قبل الرفع لو حابب تتأكد.")


if __name__ == "__main__":
    main()
