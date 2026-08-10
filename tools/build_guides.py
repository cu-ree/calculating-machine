#!/usr/bin/env python3
"""
build_guides.py — pages/guide/*.md → HTML

마크다운 원고를 사이트 템플릿에 맞춰 HTML 로 변환한다.
글을 고칠 때는 .md 만 수정하고 이 스크립트를 다시 실행하면 된다.

    python tools/build_guides.py

지원 문법: 제목(#~####), 문단, 목록, 표, **굵게**, `코드`, [링크](주소)
첫 줄의 H1 은 페이지 제목으로 쓰이고 본문에서는 제거된다.
"""

import os
import re
import html as _html

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "pages", "guide")
SITE = "급여계산소"
DOMAIN = "https://costcheck.kr"
ADSENSE = "ca-pub-4822493819381330"

# 목록 순서와 요약 (index.html 생성용)
ORDER = [
    ("weekly-holiday-pay", "주휴수당, 얼마를 언제 받는지 한 번에 정리"),
    ("freelance-vs-insurance", "3.3%와 4대보험, 무엇이 다르고 어느 쪽이 유리한가"),
    ("minimum-wage-net-pay", "최저임금을 받으면 실수령액은 얼마인가"),
    ("severance-annual-leave", "퇴직금과 연차수당, 계산이 헷갈리는 이유"),
    ("overtime-allowance", "연장·야간·휴일수당, 언제 얼마가 붙나"),
]


def esc(s):
    return _html.escape(str(s if s is not None else ""))


def md(text):
    """최소 마크다운 → HTML. 선두 H1 은 제거한다."""
    text = text.replace("\u200b", "").replace("\ufeff", "")
    lines = text.splitlines()
    for i, l in enumerate(lines):
        if l.strip():
            if re.match(r"^#\s+", l):
                lines = lines[i + 1:]
            break

    out, buf, in_ul = [], [], False

    def flush():
        nonlocal buf
        if buf:
            out.append("<p>" + " ".join(buf) + "</p>")
            buf = []

    def close_ul():
        nonlocal in_ul
        if in_ul:
            out.append("</ul>")
            in_ul = False

    def inline(s):
        s = esc(s)
        s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', s)
        return s

    def is_row(l):
        t = l.strip()
        return t.startswith("|") and t.endswith("|")

    def cells(l):
        return [c.strip() for c in l.strip().strip("|").split("|")]

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            flush(); close_ul(); i += 1; continue

        if (is_row(line) and i + 1 < len(lines)
                and re.match(r"^\|[\s:\-|]+\|$", lines[i + 1].strip())):
            flush(); close_ul()
            head = cells(line)
            align = ["right" if c.strip().endswith(":") else "left"
                     for c in cells(lines[i + 1])]
            i += 2
            body = []
            while i < len(lines) and is_row(lines[i]):
                body.append(cells(lines[i])); i += 1
            th = "".join(f'<th style="text-align:{align[j] if j < len(align) else "left"}">'
                         f"{inline(c)}</th>" for j, c in enumerate(head))
            tr = "".join("<tr>" + "".join(
                f'<td style="text-align:{align[j] if j < len(align) else "left"}">'
                f"{inline(c)}</td>" for j, c in enumerate(r)) + "</tr>" for r in body)
            out.append(f'<table class="mini-table"><thead><tr>{th}</tr></thead>'
                       f"<tbody>{tr}</tbody></table>")
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            flush(); close_ul()
            out.append(f"<h{min(len(m.group(1)) + 1, 5)}>{inline(m.group(2))}"
                       f"</h{min(len(m.group(1)) + 1, 5)}>")
            i += 1; continue

        if re.match(r"^[-*]\s+", line):
            flush()
            if not in_ul:
                out.append('<ul class="bullets">'); in_ul = True
            out.append(f"<li>{inline(re.sub(r'^[-*]  *', '', line))}</li>")
            i += 1; continue

        buf.append(inline(line.strip())); i += 1

    flush(); close_ul()
    return "\n".join(out)


def page(slug, title, desc, body_html, is_index=False):
    up = "../../"
    canon = f"{DOMAIN}/pages/guide/{'' if is_index else slug + '.html'}"
    if is_index:
        canon = f"{DOMAIN}/pages/guide/index.html"
    crumb = ('<span>가이드</span>' if is_index else
             f'<a href="index.html">가이드</a><svg data-lucide="chevron-right"></svg>'
             f'<span>{esc(title)}</span>')
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{esc(title)} - {SITE}</title>
<meta name="description" content="{esc(desc)}" />
<link rel="canonical" href="{canon}" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="{canon}" />
<meta property="og:site_name" content="{SITE}" />
<link rel="stylesheet" href="{up}assets/css/styles.css" />
<link rel="stylesheet" href="{up}assets/css/calculator.css" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={ADSENSE}"
     crossorigin="anonymous"></script>
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{up}index.html"><span class="logo"><svg data-lucide="calculator"></svg></span><span class="name">{SITE}</span></a>
    <nav class="nav"><a href="{up}index.html#calculators">계산기</a><a href="index.html" class="active">가이드</a><a href="{up}pages/info/faq.html">FAQ</a><a href="{up}pages/info/contact.html">문의하기</a></nav>
    <button class="icon-btn" aria-label="다크 모드"><svg data-lucide="moon"></svg></button>
    <button class="hamburger" aria-label="메뉴"><svg data-lucide="menu"></svg></button>
  </div>
</header>

<main class="wrap page">
  <nav class="crumb">
    <a href="{up}index.html">홈</a><svg data-lucide="chevron-right"></svg>
    {crumb}
  </nav>

  <div class="page-head">
    <div><h1>{esc(title)}</h1></div>
  </div>

  <section class="content-sections">
    <div class="card csec prose">
{body_html}
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <a class="brand" href="{up}index.html"><span class="logo"><svg data-lucide="calculator"></svg></span><span class="name">{SITE}</span></a>
        <p>급여와 노동 관련 계산을 2026년 법정 기준으로 확인하는 계산기 모음. {SITE}는 사용자가 입력한 값을 서버에 저장하지 않습니다.</p>
      </div>
      <nav class="foot-links"><a href="{up}pages/info/about.html">소개</a><a href="{up}pages/policy/privacy-policy.html">개인정보처리방침</a><a href="{up}pages/info/usage-guide.html">이용 안내</a><a href="{up}pages/info/contact.html">문의하기</a></nav>
    </div>
    <div class="foot-bottom"><span class="copy">© 2026 {SITE}. All rights reserved.</span></div>
  </div>
</footer>

<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<script>if (window.lucide) lucide.createIcons();</script>
</body>
</html>
"""


def main():
    made = []
    for slug, summary in ORDER:
        path = os.path.join(SRC, slug + ".md")
        if not os.path.exists(path):
            print(f"  [건너뜀] {slug}.md 없음")
            continue
        text = open(path, encoding="utf-8").read().strip()
        title = next((re.sub(r"^#\s+", "", l).strip()
                      for l in text.splitlines() if l.strip().startswith("# ")), slug)
        first = next((l.strip() for l in text.splitlines()
                      if l.strip() and not l.startswith("#")), summary)
        desc = re.sub(r"[*`\[\]]|\((?:\.\./)?[^)]*\)", "", first)[:150]
        out = os.path.join(SRC, slug + ".html")
        open(out, "w", encoding="utf-8").write(page(slug, title, desc, md(text)))
        made.append((slug, title, summary, len(text)))
        print(f"  {slug}.html  ({len(text):,}자)")

    rows = "".join(
        f'<a class="rel-card" href="{s}.html">'
        f'<span class="ico t-navy"><svg data-lucide="book-open"></svg></span>'
        f'<span><span class="t">{esc(t)}</span><br><span class="d">{esc(sm)}</span></span>'
        f'<span class="arr"><svg data-lucide="arrow-right"></svg></span></a>'
        for s, t, sm, _ in made)
    body = ('<p>계산기마다 결과가 다른 이유, 법에서 정한 요건, 자주 잘못 알려진 부분을 정리했습니다.</p>'
            f'<div class="related-grid">{rows}</div>')
    open(os.path.join(SRC, "index.html"), "w", encoding="utf-8").write(
        page("index", "급여·노동 가이드",
             "주휴수당, 4대보험, 최저임금, 퇴직금, 가산수당의 계산 기준과 자주 잘못 알려진 부분을 정리했습니다.",
             body, is_index=True))
    print(f"  index.html")
    print(f"\n총 {len(made)}편 + 목록 페이지")


if __name__ == "__main__":
    main()
