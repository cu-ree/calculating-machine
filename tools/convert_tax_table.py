#!/usr/bin/env python3
"""
convert_tax_table.py — 근로소득 간이세액표 (.xls) → JSON

원본 구조
    col 0  월급여액 하한(천원)      "이상"
    col 1  월급여액 상한(천원)      "미만"
    col 2~12  공제대상가족 1~11명   원천징수 세액(원)
    말미     10,000천원 초과 구간의 산식

출력
    tax_table.json
        brackets  : [{ "from": 770000, "to": 775000, "tax": [가족1..11] }, ...]
        over_10m  : 초과 구간 산식 (문자열 원문 + 파싱된 계수)
        base_10m  : 10,000천원 시점의 가족수별 세액 (초과 산식의 기준값)

    pip install xlrd --break-system-packages
    python tools/convert_tax_table.py 근로소득_간이세액표_조견표_.xls
"""

import json
import os
import re
import sys

try:
    import xlrd
except ImportError:
    sys.exit("[중단] pip install xlrd --break-system-packages")

OUT = os.path.join(os.path.dirname(__file__), "../assets/data/tax_table.json")
MAX_FAMILY = 11


def num(v):
    """'-' 또는 빈칸은 0(세액 없음). 숫자는 float."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "–", "—"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


def main(path):
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    title = str(sh.cell_value(0, 0)).strip()
    print(f"제목  : {title}")
    print(f"크기  : {sh.nrows}행 × {sh.ncols}열\n")

    brackets = []
    base_10m = None
    over_text = []
    skipped = 0

    for r in range(sh.nrows):
        c0 = str(sh.cell_value(r, 0)).strip()
        lo = num(sh.cell_value(r, 0))
        hi = num(sh.cell_value(r, 1))

        # 10,000천원 정액 행 — 초과 산식의 기준값
        # col0 이 라벨, col1 은 병합으로 비어 있고 값은 col2 부터 시작한다
        if "10,000천원" in c0 and "초과" not in c0:
            vals = [num(sh.cell_value(r, c)) for c in range(1, sh.ncols)]
            vals = [v for v in vals if v not in (None, 0.0)]
            base_10m = vals[:MAX_FAMILY]
            continue

        # 초과 구간 산식 텍스트
        if "초과" in c0 or "이하" in c0:
            row = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
            row = [x for x in row if x]
            if row:
                over_text.append(" ".join(row))
            continue

        # 일반 구간
        if lo is None or hi is None or lo <= 0 or hi <= lo:
            skipped += 1
            continue

        tax = [num(sh.cell_value(r, c)) for c in range(2, 2 + MAX_FAMILY)]
        if any(t is None for t in tax):
            skipped += 1
            continue

        brackets.append({
            "from": int(lo * 1000),
            "to": int(hi * 1000),
            "tax": [int(t) for t in tax],
        })

    brackets.sort(key=lambda b: b["from"])

    # ── 초과 구간 산식 파싱 ─────────────────────────────
    # 구조: (10,000천원 해당세액) + (누적 가산액) + (구간초과분 × [98%] × 세율)
    # 98% 적용 여부가 구간마다 다르므로 개별 판정한다.
    over_rules = []
    for line in over_text:
        m_over = re.match(r"\s*([\d,]+)천원\s*초과", line)
        if not m_over:
            continue
        over = int(m_over.group(1).replace(",", "")) * 1000

        body = line[m_over.end():]
        m_add = re.search(r"\((\d[\d,]*)원\)", body)      # 순수 금액 괄호만
        add = int(m_add.group(1).replace(",", "")) if m_add else 0

        m_exc = re.search(r"([\d,]+)천원을\s*초과하는\s*금액", body)
        excess_base = int(m_exc.group(1).replace(",", "")) * 1000 if m_exc else over

        seg = body[m_exc.end():] if m_exc else body
        m_rate = re.search(r"(\d+(?:\.\d+)?)\s*퍼센트\s*상당액", seg)
        if not m_rate:
            continue

        over_rules.append({
            "over": over,
            "add": add,
            "excess_base": excess_base,
            "factor_98": "98퍼센트" in seg,
            "rate": float(m_rate.group(1)) / 100,
        })

    over_rules.sort(key=lambda r: r["over"])

    # 연속성 검증 — 한 구간의 끝값이 다음 구간 누적액과 같아야 한다
    continuity = []
    for a, b in zip(over_rules, over_rules[1:]):
        span = b["over"] - a["excess_base"]
        calc = a["add"] + span * (0.98 if a["factor_98"] else 1.0) * a["rate"]
        continuity.append({
            "구간": f"{a['over']:,} ~ {b['over']:,}",
            "계산": round(calc),
            "다음_누적액": b["add"],
            "일치": round(calc) == b["add"],
        })

    data = {
        "_meta": {
            "title": title,
            "source_file": path,
            "note": "월급여액은 비과세 및 학자금을 제외한 금액. 공제대상가족 1~11명.",
            "warning": "원본 파일의 최종 저장일이 오래된 경우 개정 전 표일 수 있음. 반드시 홈택스 계산 결과와 대조할 것.",
            "verified": False,
            "effective_from": None,
        },
        "family_max": MAX_FAMILY,
        "brackets": brackets,
        "base_10m": [int(v) for v in base_10m] if base_10m else None,
        "over_10m_text": over_text,
        "over_10m_rules": over_rules,
        "over_10m_continuity": continuity,
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"구간      : {len(brackets):,}개")
    print(f"급여 범위 : {brackets[0]['from']:,} ~ {brackets[-1]['to']:,}원")
    print(f"건너뜀    : {skipped}행")
    print(f"10,000천원 기준값 : {base_10m[:3] if base_10m else '없음'} ...")
    print(f"초과 산식 : {len(over_rules)}개 파싱")
    for r in over_rules:
        f98 = " ×98%" if r["factor_98"] else "     "
        print(f"    {r['over']:>12,} 초과  기준세액 +{r['add']:>11,}원"
              f"  + ({r['excess_base']:,} 초과분{f98} × {r['rate']*100:g}%)")
    ok = all(c["일치"] for c in continuity)
    print(f"  연속성 검증 : {'통과' if ok else '실패'}")
    for c in continuity:
        mark = "O" if c["일치"] else "X"
        print(f"    {mark} {c['구간']:>26}  계산 {c['계산']:>11,} / 기재 {c['다음_누적액']:>11,}")
    print(f"\n-> {OUT}  ({os.path.getsize(OUT)/1024:.0f} KB)")

    # 샘플 조회
    def lookup(wage, family):
        for b in brackets:
            if b["from"] <= wage < b["to"]:
                return b["tax"][family - 1]
        return None

    print("\n검증용 샘플  (홈택스 계산 결과와 대조하세요)")
    print(f"  {'월급여':>12} {'가족1':>10} {'가족2':>10} {'가족4':>10}")
    for w in (2000000, 2500000, 3000000, 4000000, 5000000, 7000000):
        print(f"  {w:>12,} {str(lookup(w,1)):>10} {str(lookup(w,2)):>10} {str(lookup(w,4)):>10}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "근로소득_간이세액표_조견표_.xls")
