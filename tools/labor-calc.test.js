/*!
 * labor-calc.test.js — 회귀 테스트
 *
 * 매년 rates.json / tax_table.json 을 갱신한 뒤 반드시 실행할 것.
 * 요율이 바뀌면 기대값도 함께 갱신하되, 어떤 값이 왜 바뀌었는지 확인한 뒤 고친다.
 *
 *   node tools/labor-calc.test.js
 */

const fs = require('fs');
const path = require('path');
const LC = require('../assets/js/labor-calc.js');

const DIR = process.argv[2] || path.join(__dirname, '../assets/data/');
LC.setData(
  JSON.parse(fs.readFileSync(path.join(DIR, 'rates.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(DIR, 'tax_table.json'), 'utf8'))
);

let pass = 0, fail = 0;
const w = n => Number(n).toLocaleString('ko-KR');

function t(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'O' : 'X'} ${name.padEnd(36)}${String(got).padStart(12)}` +
              (ok ? '' : `   기대: ${want}`));
}
function section(s) { console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 52 - s.length))}`); }

// ─────────────────────────────────────────────
section('최저임금 (고시 제2025-47호)');
t('시급 10,320원 충족', LC.checkMinimumWage(10320).ok, true);
t('시급 10,319원 미달', LC.checkMinimumWage(10319).ok, false);
t('  부족액', LC.checkMinimumWage(10000).shortfall, 320);
t('수습 감액 시급', LC.checkMinimumWage(9288,
  { probation: true, contractOver1Year: true }).appliedHourly, 9288);
t('1년미만 계약 감액불가',
  LC.checkMinimumWage(9288, { probation: true, contractOver1Year: false }).ok, false);
t('단순노무직 감액불가',
  LC.checkMinimumWage(9288, { probation: true, contractOver1Year: true, simpleLabor: true }).ok, false);

section('주휴수당 (근로기준법 제55조)');
t('주 20시간 주휴시간', LC.weeklyHolidayPay({ weeklyHours: 20, hourlyWage: 10320 }).holidayHours, 4);
t('  주휴수당', LC.weeklyHolidayPay({ weeklyHours: 20, hourlyWage: 10320 }).amount, 41280);
t('주 40시간 주휴수당', LC.weeklyHolidayPay({ weeklyHours: 40, hourlyWage: 10320 }).amount, 82560);
t('주 48시간 상한 8h', LC.weeklyHolidayPay({ weeklyHours: 48, hourlyWage: 10320 }).holidayHours, 8);
t('주 14시간 제외', LC.weeklyHolidayPay({ weeklyHours: 14 }).eligible, false);
t('4주평균 15h 포함', LC.weeklyHolidayPay({ weeklyHoursList: [10, 10, 20, 20] }).eligible, true);
t('4주평균 14.75h 제외', LC.weeklyHolidayPay({ weeklyHoursList: [10, 10, 19, 20] }).eligible, false);
t('개근 미충족', LC.weeklyHolidayPay({ weeklyHours: 20, fullAttendance: false }).eligible, false);
t('5인미만도 적용', LC.weeklyHolidayPay({ weeklyHours: 20 }).appliesUnder5, true);

section('4대보험 적용 여부 — 보험별로 규칙이 다르다');
let e = LC.insuranceEligibility({ monthlyHours: 50, continuousMonths: 4 });
t('월50h·4개월 국민연금', e.pension.status, 'conditional');
t('월50h·4개월 건강보험', e.health.status, 'no');
t('월50h·4개월 고용보험', e.employment.status, 'yes');
e = LC.insuranceEligibility({ monthlyHours: 50, continuousMonths: 2, monthlyDays: 10 });
t('월50h·2개월·10일 연금', e.pension.status, 'yes');
t('월50h·2개월·10일 건보', e.health.status, 'conditional');
e = LC.insuranceEligibility({ monthlyHours: 50, continuousMonths: 2, monthlyIncome: 2200000 });
t('월소득 220만 연금', e.pension.status, 'yes');
e = LC.insuranceEligibility({ monthlyHours: 80 });
t('월80h 연금·건보·고용', e.pension.status + e.health.status + e.employment.status, 'yesyesyes');
e = LC.insuranceEligibility({ monthlyHours: 30, continuousMonths: 1, isDailyWorker: true });
t('일용근로자 고용보험', e.employment.status, 'yes');

section('4대보험료 공제');
let d = LC.insuranceDeduction({ monthlyWage: 2156880 });
t('최저임금 국민연금', d.pension, 102451);
t('  건강보험', d.health, 77539);
t('  장기요양', d.longTermCare, 10189);
t('  고용보험', d.employment, 19411);
t('  합계', d.total, 209590);
d = LC.insuranceDeduction({ monthlyWage: 3000000 });
t('월300만 합계', d.total, 291522);
d = LC.insuranceDeduction({ monthlyWage: 8000000 });
t('월800만 연금 상한', d.pension, 313025);
t('  상한 도달', d.capped.pension, true);
d = LC.insuranceDeduction({ monthlyWage: 300000 });
t('월30만 연금 하한', d.pension, 19475);
d = LC.insuranceDeduction({ monthlyWage: 3000000, apply: { employment: true } });
t('3.3%계약 고용만', d.total, 27000);

section('근로소득세 (간이세액표)');
t('300만/1인', LC.withholdingTax({ monthlyTaxablePay: 3000000, familyCountIncludingSelf: 1 }).incomeTax, 84850);
t('  지방소득세', LC.withholdingTax({ monthlyTaxablePay: 3000000, familyCountIncludingSelf: 1 }).localTax, 8480);
t('300만/2인', LC.withholdingTax({ monthlyTaxablePay: 3000000, familyCountIncludingSelf: 2 }).incomeTax, 67350);
t('300만/4인', LC.withholdingTax({ monthlyTaxablePay: 3000000, familyCountIncludingSelf: 4 }).incomeTax, 26690);
t('200만/1인', LC.withholdingTax({ monthlyTaxablePay: 2000000, familyCountIncludingSelf: 1 }).incomeTax, 19520);
t('70만원 (표 하한 미만)', LC.withholdingTax({ monthlyTaxablePay: 700000 }).incomeTax, 0);
t('1200만 산식 적용', LC.withholdingTax({ monthlyTaxablePay: 12000000 }).method, 'formula');
t('  세액', LC.withholdingTax({ monthlyTaxablePay: 12000000 }).incomeTax, 2238400);

section('가산수당 (근로기준법 제56조)');
t('연장2h', LC.overtimePay({ hourlyWage: 10000, overtimeHours: 2 }).total, 30000);
t('연장2h+야간2h 중복가산', LC.overtimePay({ hourlyWage: 10000, overtimeHours: 2, nightHours: 2 }).total, 40000);
t('5인미만 가산 제외',
  LC.overtimePay({ hourlyWage: 10000, overtimeHours: 2, nightHours: 2, under5Employees: true }).total, 20000);
t('휴일8h', LC.overtimePay({ hourlyWage: 10000, holidayHoursWithin8: 8 }).total, 120000);
t('휴일8h+초과2h', LC.overtimePay({ hourlyWage: 10000, holidayHoursWithin8: 8, holidayHoursOver8: 2 }).total, 160000);

section('연차휴가 (근로기준법 제60조)');
t('1개월', LC.annualLeave({ serviceMonths: 1 }).days, 1);
t('6개월', LC.annualLeave({ serviceMonths: 6 }).days, 6);
t('11개월', LC.annualLeave({ serviceMonths: 11 }).days, 11);
t('1년', LC.annualLeave({ serviceMonths: 12 }).days, 15);
t('2년', LC.annualLeave({ serviceMonths: 24 }).days, 15);
t('3년', LC.annualLeave({ serviceMonths: 36 }).days, 16);
t('5년', LC.annualLeave({ serviceMonths: 60 }).days, 17);
t('21년 상한', LC.annualLeave({ serviceMonths: 252 }).days, 25);
t('출근율 80% 미만', LC.annualLeave({ serviceMonths: 24, attendanceRate: 0.7 }).days, 0);
t('주 14시간 제외', LC.annualLeave({ serviceMonths: 24, weeklyHours: 14 }).days, 0);

section('퇴직금');
let s = LC.severancePay({ last3MonthsWage: 9000000, last3MonthsDays: 92, serviceDays: 1095 });
t('3년 근속 (일평균 97,826)', s.amount, 8804347);
t('  사용 기준', s.usedLabel, '평균임금');
s = LC.severancePay({ last3MonthsWage: 9000000, last3MonthsDays: 92, serviceDays: 1095, ordinaryDailyWage: 120000 });
t('통상임금이 클 때', s.usedLabel, '통상임금');
t('1년 미만 제외', LC.severancePay({ serviceDays: 200 }).eligible, false);
t('주15시간 미만 제외', LC.severancePay({ serviceDays: 800, weeklyHours: 10 }).eligible, false);

section('프리랜서 3.3% 환급 판단');
let f = LC.freelanceRefund({ jobKey: 'developer', income: 50000000, prevYearIncome: 20000000 });
t('직전 2000만 → 단순경비율', f.canUseSimple, true);
t('  기납부세액', f.prepaid, 1650000);
t('  최종세액', f.chosen.finalTax, 1565850);
t('  판정', f.verdict, '환급 가능성 있음');
f = LC.freelanceRefund({ jobKey: 'developer', income: 50000000, prevYearIncome: 40000000 });
t('직전 4000만 → 기준경비율', f.canUseSimple, false);
t('  판정', f.verdict, '비슷하거나 추가납부');
f = LC.freelanceRefund({ jobKey: 'developer', income: 50000000, prevYearIncome: 20000000 });
t('경비 2단 적용', f.simple.expense, 30610000);
f = LC.freelanceRefund({ jobKey: 'rider', income: 30000000, prevYearIncome: 25000000 });
t('라이더 3000만', f.verdict, '환급 가능성 높음');
f = LC.freelanceRefund({ jobKey: 'writer', income: 50000000, prevYearIncome: 20000000 });
t('작가 5000만 손익분기 초과', f.chosen.refund, false);
f = LC.freelanceRefund({ jobKey: 'developer', income: 80000000, prevYearIncome: 10000000 });
t('당해 8000만 → 기준경비율', f.canUseSimple, false);

// ─────────────────────────────────────────────
console.log(`\n${'='.repeat(58)}`);
console.log(`  통과 ${pass}  /  실패 ${fail}`);
if (fail) {
  console.log('\n  실패 항목을 확인하세요. 요율 개정이 원인이면 기대값을 갱신하고,');
  console.log('  그렇지 않으면 계산 로직에 문제가 있는 것입니다.');
  process.exit(1);
}
console.log('  전체 통과');
