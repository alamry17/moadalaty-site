#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_page.py — يرحّل صفحة HTML قديمة لملف Eleventy (front-matter + محتوى)
تلقائيًا: بيفصل head_extra، بيستبدل الفوتر وأزرار المشاركة بـ include، وبيشيل
السكريبتات المكررة (اللي بقت في base.njk).

الاستخدام:
    python3 tools/migrate_page.py <source.html> <permalink> [--out <content/path.html>]

مثال:
    python3 tools/migrate_page.py contact.html contact.html
    python3 tools/migrate_page.py articles/faq.html articles/faq.html
"""
import re
import sys
import argparse
from pathlib import Path
from urllib.parse import unquote

FIXED_TRAILING = [
    'cookie-consent.min.js',
    'site-search-data.min.js',
    'site-search.min.js',
]


def extract_head_body(html):
    head_match = re.search(r"<head>(.*?)</head>", html, re.S)
    body_match = re.search(r"<body[^>]*>(.*)</body>", html, re.S)
    if not head_match or not body_match:
        raise ValueError("لا يوجد <head> أو <body>")
    head = head_match.group(1)
    head = re.sub(
        r"<!-- Google Consent Mode v2.*?<!-- End Google Tag Manager -->\n?",
        "", head, flags=re.S,
    )
    head = re.sub(r'\s*<meta charset="UTF-8"\s*/?>\n?', "", head, count=1)
    viewport_content = "width=device-width, initial-scale=1.0"
    vp_m = re.search(r'<meta name="viewport" content="([^"]*)"\s*/?>\n?', head)
    if vp_m:
        viewport_content = vp_m.group(1)
        head = head[: vp_m.start()] + head[vp_m.end():]
    head = re.sub(
        r'\s*<link rel="icon" href="/favicon\.svg"[^>]*>\n?'
        r'\s*<link rel="icon" href="/favicon\.ico"[^>]*>\n?'
        r'\s*<link rel="apple-touch-icon"[^>]*>\n?',
        "", head, count=1,
    )
    head = head.strip("\n")

    body = body_match.group(1)
    body = re.sub(r'<div id="site-search-bar".*?</div>\s*</div>\s*\n', "", body, count=1, flags=re.S)
    body = re.sub(
        r"<!-- Google Tag Manager \(noscript\) -->.*?<!-- End Google Tag Manager \(noscript\) -->\n?",
        "", body, flags=re.S,
    )
    body = body.strip("\n")
    return head, body, viewport_content


def swap_footer(body):
    """يستبدل <footer class="article-footer"...>...</footer> بـ include، ويرجّع
    (body_جديد, footerLastUpdated أو None)."""
    m = re.search(r'<footer class="article-footer[^"]*"[^>]*>.*?</footer>', body, re.S)
    if not m:
        return body, None
    block = m.group(0)
    date_m = re.search(r"آخر تحديث:\s*([^|<]+?)\s*\|", block)
    last_updated = date_m.group(1).strip() if date_m else None
    new_body = body[: m.start()] + '{% include "partials/footer.njk" %}' + body[m.end():]
    return new_body, last_updated


def swap_share_buttons(body):
    """يستبدل <div class="share-btns...">...</div> بـ include، ويرجّع
    (body_جديد, dict بيانات front-matter)."""
    m = re.search(r'<div class="share-btns[^"]*"[^>]*>.*?</div>', body, re.S)
    if not m:
        return body, {}
    block = m.group(0)
    data = {}
    no_print = "no-print" in re.search(r'class="([^"]*)"', block).group(1)
    if no_print:
        data["shareNoPrint"] = True
    aria_m = re.search(r'<div class="share-btns[^"]*"[^>]*aria-label="([^"]*)"', block)
    if aria_m and aria_m.group(1) != "مشاركة الصفحة":
        data["shareAriaLabel"] = aria_m.group(1)
    label_m = re.search(r'share-btns-label">([^<]*)</span>', block)
    if label_m and label_m.group(1) != "شارك الصفحة:":
        data["shareLabel"] = label_m.group(1)
    copy_m = re.search(r'onclick="([^"]*copyPageLink\(\))"', block)
    if copy_m and copy_m.group(1) != "copyPageLink()":
        data["copyFn"] = copy_m.group(1)
    text_m = re.search(r"[?&]text=([^&\"]+)", block)
    if text_m:
        raw = text_m.group(1).replace("%20%E2%86%92%20", "||").split("||")[0]
        data["_shareText"] = unquote(raw)
    new_body = body[: m.start()] + '{% include "partials/share-buttons.njk" %}' + body[m.end():]
    return new_body, data


def strip_duplicate_trailing_scripts(body):
    for name in FIXED_TRAILING:
        body = re.sub(
            rf'\n?<script src="/js/{re.escape(name)}"[^>]*></script>', "", body
        )
    return body


def find_extra_scripts(body):
    """يلاقي باقي <script src="/js/...">, يشيلهم من الـbody، ويرجّعهم كقائمة
    عشان يتحطوا في extraScripts (base.njk بيحطهم قبل السكريبتات الثابتة)."""
    scripts = []

    def repl(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]+)"', tag).group(1)
        defer = " defer" in tag
        scripts.append((src, defer))
        return ""

    body = re.sub(r'\n?<script src="/js/[^"]+"[^>]*></script>', repl, body)
    return body, scripts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("permalink")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    src_path = Path(args.source)
    html = src_path.read_text(encoding="utf-8")

    title_m = re.search(r"<title>(.*?)</title>", html, re.S)
    title = title_m.group(1).strip() if title_m else ""

    body_class_m = re.search(r'<body class="([^"]*)"', html)
    body_class = body_class_m.group(1) if body_class_m else None

    head, body, viewport_content = extract_head_body(html)
    body, footer_last_updated = swap_footer(body)
    body, share_data = swap_share_buttons(body)
    body = strip_duplicate_trailing_scripts(body)
    body, extra_scripts = find_extra_scripts(body)

    fm_lines = ["---", "layout: layouts/base.njk", f"permalink: {args.permalink}"]
    if body_class:
        fm_lines.append(f'bodyClass: "{body_class}"')
    if viewport_content != "width=device-width, initial-scale=1.0":
        fm_lines.append(f'viewportContent: "{viewport_content}"')
    if footer_last_updated:
        fm_lines.append(f'footerLastUpdated: "{footer_last_updated}"')
    share_text = share_data.pop("_shareText", None)
    fm_lines.append(f'shareUrl: "https://moadalaty.com/{args.permalink}"'.replace("/index.html", "/"))
    if share_text:
        fm_lines.append(f'shareText: "{share_text}"')
    for k, v in share_data.items():
        if isinstance(v, bool):
            fm_lines.append(f"{k}: {str(v).lower()}")
        else:
            fm_lines.append(f'{k}: "{v}"')
    if extra_scripts:
        fm_lines.append("extraScripts:")
        for src, defer in extra_scripts:
            defer_part = ", defer: true" if defer else ""
            fm_lines.append(f'  - {{src: "{src}"{defer_part}}}')
    fm_lines.append("head_extra: |")
    norm = [l.strip("\r") for l in head.split("\n")]
    for l in norm:
        fm_lines.append(("  " + l.lstrip()) if l.strip() else "")
    fm_lines.append("---")

    result = "\n".join(fm_lines) + "\n" + body + "\n"

    out_path = Path(args.out) if args.out else Path("content") / args.permalink
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(result, encoding="utf-8")
    print(f"✓ {args.source} → {out_path}  (title: {title[:50]})")


if __name__ == "__main__":
    main()
