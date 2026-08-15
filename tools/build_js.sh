#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# build_js.sh — يولّد نسخ .min.js من ملفات js/*.js المصدرية
# باستخدام terser، عشان نضمن إن النسخة المصغّرة (اللي
# الصفحات بتستخدمها فعليًا) متزامنة دايمًا مع المصدر.
#
# الاستخدام:
#   npm install -g terser   (مرة واحدة فقط)
#   bash tools/build_js.sh
#
# يشمل كل ملف js/*.js عدا الملفات المنتهية بـ .min.js نفسها.
# ═══════════════════════════════════════════════════
set -euo pipefail

if ! command -v terser &> /dev/null; then
  echo "❌ terser غير مثبت. شغّل: npm install -g terser"
  exit 1
fi

cd "$(dirname "$0")/.."

for src in js/*.js; do
  case "$src" in
    *.min.js) continue ;;
  esac
  out="${src%.js}.min.js"
  terser "$src" -c -m -o "$out" --comments false
  echo "✅ $src → $out"
done

echo "تم توليد كل ملفات .min.js من المصدر."
