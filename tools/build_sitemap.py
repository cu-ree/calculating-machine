#!/usr/bin/env python3
"""
build_sitemap.py — pages/ 아래 .html 파일을 모아 루트 sitemap.xml 을 생성한다.

pages/_archive/ 는 검색엔진에 노출하지 않을 보관용 페이지이므로 제외한다.
index.html 은 별도로 포함한다.

    python tools/build_sitemap.py
"""

import os
from pathlib import Path

DOMAIN = "https://costcheck.kr"
ROOT = Path(__file__).resolve().parent.parent
PAGES_DIR = ROOT / "pages"
EXCLUDE_DIR = "_archive"
OUT = ROOT / "sitemap.xml"


def collect_urls():
    urls = [""]  # index.html -> 루트 경로

    for dirpath, dirnames, filenames in os.walk(PAGES_DIR):
        dirnames[:] = [d for d in dirnames if d != EXCLUDE_DIR]
        for name in sorted(filenames):
            if not name.endswith(".html"):
                continue
            rel = Path(dirpath, name).relative_to(ROOT)
            urls.append(rel.as_posix())

    return urls


def build_xml(urls):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for url in urls:
        loc = f"{DOMAIN}/{url}" if url else f"{DOMAIN}/"
        lines.append(f"  <url><loc>{loc}</loc></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    urls = collect_urls()
    xml = build_xml(urls)
    OUT.write_text(xml, encoding="utf-8")
    print(f"{len(urls)}개 URL -> {OUT}")
    for url in urls:
        print(f"  {DOMAIN}/{url}" if url else f"  {DOMAIN}/")


if __name__ == "__main__":
    main()
