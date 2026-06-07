# 생활비 계산소

생활비 계산소는 생활 결정 전에 비용을 숫자로 먼저 확인할 수 있도록 만든 정적 웹사이트입니다. 월세, 자취, 이사, 알바, 중고거래, 비상금, 데이트, 반려동물, 출산·육아 초기비용 계산기 페이지를 포함합니다.

## 현재 상태

- 9개 계산기 UI와 실제 계산 로직이 연결되어 있습니다.
- 입력값 변경 시 요약 카드, 차트, 표, 해석 문장, 복사, CSV 결과가 갱신됩니다.
- 계산기 페이지에는 PDF 전용 `print-report` 출력 구조가 적용되어 있습니다.
- 서버, DB, 로그인, 빌드 도구 없이 동작하는 정적 사이트입니다.
- 실제 AdSense 코드는 삽입되어 있지 않으며, 광고 영역은 자리 표시용 안내 영역입니다.

## 폴더 구조

```text
calculating-machine/
  index.html
  pages/
    calculators/
      living-alone-cost-calculator.html
      moving-cost-calculator.html
      rent-cost-calculator.html
      part-time-income-calculator.html
      used-item-price-calculator.html
      emergency-fund-calculator.html
      date-cost-calculator.html
      pet-adoption-cost-calculator.html
      baby-first-year-cost-calculator.html
    policy/
      privacy-policy.html
    info/
      about.html
      guide.html
      faq.html
      contact.html
      usage-guide.html
  assets/
    css/
      styles.css
      calculator.css
    js/
      calc-engine.js
    images/
      .gitkeep
  robots.txt
  sitemap.xml
  README.md
```

## 로컬 실행 방법

빌드 명령은 필요 없습니다.

`index.html` 파일을 브라우저에서 직접 열거나, 정적 파일 서버로 루트 폴더를 열어 확인할 수 있습니다.

```bash
python -m http.server 8000
```

이후 `http://127.0.0.1:8000/`에서 확인합니다.

## Cloudflare Pages 배포 방법

### Direct Upload

1. Cloudflare Dashboard에서 Pages로 이동합니다.
2. `Create a project`를 선택합니다.
3. `Direct Upload`를 선택합니다.
4. 이 프로젝트 루트 폴더의 파일을 그대로 업로드합니다.
5. 별도 빌드 명령은 입력하지 않습니다.

### GitHub 연동 배포

1. 이 폴더 내용을 GitHub 저장소 루트에 업로드합니다.
2. Cloudflare Pages에서 해당 저장소를 연결합니다.
3. Framework preset은 `None` 또는 정적 사이트 기준으로 둡니다.
4. Build command는 비워둡니다.
5. Build output directory는 루트 기준 `.` 또는 `/`로 설정합니다.
6. 배포 후 발급된 Pages URL에서 주요 페이지를 확인합니다.

## 도메인 연결 전 교체 필요 위치

현재 실제 도메인이 확정되지 않아 `https://example.com/` 값은 유지되어 있습니다. 실제 도메인이 정해지면 아래 파일을 교체하세요.

```text
robots.txt
  Sitemap: https://example.com/sitemap.xml

sitemap.xml
  https://example.com/
  https://example.com/pages/calculators/living-alone-cost-calculator.html
  https://example.com/pages/calculators/moving-cost-calculator.html
  https://example.com/pages/calculators/rent-cost-calculator.html
  https://example.com/pages/calculators/part-time-income-calculator.html
  https://example.com/pages/calculators/used-item-price-calculator.html
  https://example.com/pages/calculators/emergency-fund-calculator.html
  https://example.com/pages/calculators/date-cost-calculator.html
  https://example.com/pages/calculators/pet-adoption-cost-calculator.html
  https://example.com/pages/calculators/baby-first-year-cost-calculator.html
  https://example.com/pages/policy/privacy-policy.html
  https://example.com/pages/info/about.html
  https://example.com/pages/info/guide.html
  https://example.com/pages/info/faq.html
  https://example.com/pages/info/contact.html
  https://example.com/pages/info/usage-guide.html
```

예를 들어 실제 도메인이 `https://living-cost.example`라면 위 `https://example.com`을 모두 실제 도메인으로 바꿉니다.

## GitHub 업로드 전 제외 권장 파일

배포에는 아래 파일이 필요하지 않습니다. 저장소에 포함하지 마세요.

```text
.DS_Store
Thumbs.db
Desktop.ini
*.tmp
*.temp
*.log
*.pdf
mobile-*.png
*-simple.png
node_modules/
dist/
build/
.cache/
.vite/
__pycache__/
.pytest_cache/
.env
.env.local
```

현재 루트 폴더 기준으로 배포에 필요한 파일은 `index.html`, `pages/`, `assets/`, `robots.txt`, `sitemap.xml`, `README.md`입니다.

## 배포 후 확인 체크리스트

- 메인 페이지가 `/`에서 열리는지 확인합니다.
- 9개 계산기 페이지가 모두 200 상태로 열리는지 확인합니다.
- 계산기 입력값 변경 시 요약, 차트, 표, 해석 문장이 갱신되는지 확인합니다.
- 결과 복사와 CSV 다운로드가 최신 결과를 사용하는지 확인합니다.
- PDF 저장 시 입력폼, 헤더, 광고 영역, SEO 본문 없이 결과 리포트만 출력되는지 확인합니다.
- 모바일 화면에서 입력, 결과, 차트, 표, 해석 순서가 자연스러운지 확인합니다.
- 문의 페이지와 개인정보처리방침의 이메일이 `kr2000ljw@gmail.com`으로 보이는지 확인합니다.
- `robots.txt`와 `sitemap.xml`이 배포 URL에서 열리는지 확인합니다.
- 실제 도메인 연결 후 `sitemap.xml`과 `robots.txt`의 `https://example.com/`을 실제 도메인으로 교체했는지 확인합니다.
- 브라우저 콘솔에 404 또는 JavaScript 오류가 없는지 확인합니다.

## 참고 사항

- 이 사이트는 정적 HTML/CSS/JavaScript만 사용합니다.
- Cloudflare Pages 배포 시 별도의 Node, npm, Vite, React 설정은 필요하지 않습니다.
- 아이콘은 외부 Lucide CDN을 사용합니다. CDN 접근이 차단된 환경에서는 아이콘만 표시되지 않을 수 있지만 계산 기능은 유지됩니다.
