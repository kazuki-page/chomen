#!/bin/sh
# OG画像（1200x630）を scripts/og-image.svg から書き出す。
#
#   sh scripts/make-og.sh
#
# **macOS 専用。** qlmanage と sips という OS 標準のツールを使う。
# 画像変換ツールを別途入れずに済ませるための割り切りで、
# 生成物（public/og-image.png）はコミットしてあるため、
# 他の環境で開発する場合にこのスクリプトを走らせる必要はない。
#
# SVG は 1200x1200 の正方形にしてある。qlmanage は正方形に収める挙動のため、
# 非正方形のまま渡すと拡大されて位置が読めなくなる。
# 中央の 630px 帯（上端から 285px）を切り出すと目的の画像になる。
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
qlmanage -t -s 1200 -o "$tmp" "$root/scripts/og-image.svg" >/dev/null 2>&1
sips -c 630 1200 --cropOffset 285 0 "$tmp/og-image.svg.png" >/dev/null
cp "$tmp/og-image.svg.png" "$root/public/og-image.png"
rm -rf "$tmp"
echo "書き出し $root/public/og-image.png 1200x630"
