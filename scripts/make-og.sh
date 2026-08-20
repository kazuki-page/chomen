#!/bin/sh
# OG画像（1200x630）を2種類書き出す。
#
#   sh scripts/make-og.sh
#
#   public/og-image.png      … 本番用。名前だけの落ち着いたもの
#   public/og-image-demo.png … デモ用。技術スタックとURL入り
#
# **macOS 専用。** qlmanage と sips という OS 標準のツールを使う。
# 画像変換ツールを別途入れずに済ませるための割り切りで、
# 生成物はコミットしてあるため、他の環境で走らせる必要はない。
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

render() {
  node "$root/scripts/make-og.mjs" "$1" > "$tmp/$1.svg"
  qlmanage -t -s 1200 -o "$tmp" "$tmp/$1.svg" >/dev/null 2>&1
  sips -c 630 1200 --cropOffset 285 0 "$tmp/$1.svg.png" >/dev/null
  cp "$tmp/$1.svg.png" "$root/public/$2"
  echo "書き出し public/$2 1200x630"
}

render app og-image.png
render demo og-image-demo.png
