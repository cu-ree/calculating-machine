/*!
 * labor-calc.js — 급여·노동 법정 계산 모듈
 *
 * 순수 계산만 담당한다. DOM 을 건드리지 않는다.
 * UI 는 기존 calc-engine.js 가, 법정 규칙은 이 파일이 맡는다.
 *
 * 모든 기준값은 assets/data/rates.json 과 tax_table.json 에서 읽는다.
 * 매년 1월에 그 두 파일만 갱신하면 계산기 9개가 전부 따라온다.
 *
 *   <script src="/assets/js/labor-calc.js"></script>
 *   await LaborCalc.ready();
 *   LaborCalc.insuranceDeduction({ monthlyWage: 3000000 });
 */
(function (global) {
  'use strict';

  var DATA_BASE = '/assets/data/';
  var YEAR = '2026';

  var _rates = null;
  var _taxTable = null;
  var _readyPromise = null;

  // ────────────────────────────────────────────────────
  // 로딩
  // ────────────────────────────────────────────────────

  function ready(opts) {
    if (_readyPromise) return _readyPromise;
    var base = (opts && opts.base) || DATA_BASE;
    _readyPromise = Promise.all([
      fetch(base + 'rates.json').then(function (r) {
        if (!r.ok) throw new Error('rates.json 로드 실패 (' + r.status + ')');
        return r.json();
      }),
      fetch(base + 'tax_table.json').then(function (r) {
        if (!r.ok) throw new Error('tax_table.json 로드 실패 (' + r.status + ')');
        return r.json();
      })
    ]).then(function (v) {
      _rates = v[0];
      _taxTable = v[1];
      return true;
    });
    return _readyPromise;
  }

  function setData(rates, taxTable) {   // 테스트용 주입
    _rates = rates;
    _taxTable = taxTable;
    _readyPromise = Promise.resolve(true);
  }

  function Y(year) {
    if (!_rates) throw new Error('LaborCalc.ready() 를 먼저 호출하세요.');
    var y = _rates.years[year || YEAR];
    if (!y) throw new Error((year || YEAR) + '년 기준값이 없습니다.');
    return y;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); }

  /**
   * 원 단위 절사.
   * 0.009 같은 요율은 이진 부동소수점으로 정확히 표현되지 않아
   * 3,000,000 × 0.009 이 26999.999... 가 된다. 먼저 오차를 제거한 뒤 절사한다.
   */
  function won(v) { return Math.floor(Number(v.toFixed(6))); }

  // ────────────────────────────────────────────────────
  // 1. 최저임금
  // ────────────────────────────────────────────────────

  /**
   * @param {number} hourlyWage 시급
   * @param {object} o { probation:boolean, contractOver1Year:boolean, simpleLabor:boolean }
   */
  function checkMinimumWage(hourlyWage, o) {
    o = o || {};
    var mw = Y(o.year).minimum_wage;
    var applied = mw.hourly;
    var discount = false;
    var reasons = [];

    if (o.probation) {
      var p = mw.probation_discount;
      if (o.contractOver1Year && !o.simpleLabor) {
        applied = p.hourly;
        discount = true;
        reasons.push('수습 감액 적용 (' + (p.rate * 100) + '%, 최대 ' + p.max_months + '개월)');
      } else {
        if (!o.contractOver1Year) reasons.push('1년 미만 계약은 수습 감액 불가');
        if (o.simpleLabor) reasons.push('단순노무직은 수습 감액 불가');
      }
    }

    var ok = hourlyWage >= applied;
    return {
      ok: ok,
      standardHourly: mw.hourly,
      appliedHourly: applied,
      discountApplied: discount,
      shortfall: ok ? 0 : won(applied - hourlyWage),
      monthly209h: mw.monthly_209h,
      notice: mw.notice,
      reasons: reasons
    };
  }

  // ────────────────────────────────────────────────────
  // 2. 주휴수당
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o { weeklyHours, hourlyWage, fullAttendance, weeklyHoursList }
   * weeklyHoursList 가 있으면 4주 평균으로 판정한다.
   */
  function weeklyHolidayPay(o) {
    var w = Y(o.year).weekly_holiday_pay;
    var list = o.weeklyHoursList;
    var avg = (list && list.length)
      ? list.reduce(function (a, b) { return a + b; }, 0) / list.length
      : o.weeklyHours;

    var reasons = [];
    var eligible = true;

    if (avg < w.min_weekly_hours) {
      eligible = false;
      reasons.push('4주 평균 주 ' + w.min_weekly_hours + '시간 미만 (현재 ' + avg.toFixed(1) + '시간)');
    }
    if (o.fullAttendance === false) {
      eligible = false;
      reasons.push('해당 주 소정근로일 개근 요건 미충족');
    }

    var hours = eligible ? Math.min(avg, 40) / 40 * 8 : 0;
    var amount = won(hours * (o.hourlyWage || 0));

    return {
      eligible: eligible,
      avgWeeklyHours: avg,
      holidayHours: hours,
      amount: amount,
      monthlyAmount: won(amount * 4.345),   // 1개월 ≈ 4.345주
      appliesUnder5: w['5인미만_적용'],
      formulaNote: w.간편식_전제,
      reasons: reasons
    };
  }

  // ────────────────────────────────────────────────────
  // 3. 4대보험 적용 여부  ★ 보험별로 규칙이 다르다
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o {
   *   monthlyHours, weeklyHours, continuousMonths,
   *   monthlyDays, monthlyIncome, isDailyWorker
   * }
   * @returns { pension, health, employment, accident } 각각 {status, reason}
   *   status: 'yes' | 'no' | 'conditional'
   */
  function insuranceEligibility(o) {
    var e = Y(o.year).insurance_eligibility;
    var mh = o.monthlyHours != null ? o.monthlyHours
           : (o.weeklyHours != null ? o.weeklyHours * 4.345 : null);
    var months = o.continuousMonths || 0;
    var days = o.monthlyDays || 0;
    var income = o.monthlyIncome || 0;

    // 국민연금
    var pension;
    if (mh != null && mh >= 60) {
      pension = { status: 'yes', reason: '월 60시간 이상' };
    } else if (months >= 1 && (days >= e.national_pension.monthly_days_threshold ||
               income >= e.national_pension.monthly_income_threshold)) {
      pension = {
        status: 'yes',
        reason: '1개월 이상 계속근로 + ' +
          (days >= e.national_pension.monthly_days_threshold
            ? '월 8일 이상' : '월소득 220만원 이상')
      };
    } else if (months >= 3) {
      pension = { status: 'conditional', reason: '3개월 이상이면 본인 희망·사용자 동의로 가입 가능' };
    } else {
      pension = { status: 'no', reason: '월 60시간 미만 단시간근로자' };
    }

    // 건강보험 — 3개월 예외 규정이 없다
    var health;
    if (mh != null && mh >= 60) {
      health = { status: 'yes', reason: '월 60시간 이상' };
    } else if (months >= 1 && days >= 8) {
      health = { status: 'conditional', reason: '1개월 이상 고용 + 월 8일 이상이면 실무상 가입 판단' };
    } else {
      health = { status: 'no', reason: '월 60시간 미만 단시간근로자 (국민연금과 달리 3개월 예외 없음)' };
    }

    // 고용보험
    var employment;
    if ((mh != null && mh >= 60) || (o.weeklyHours != null && o.weeklyHours >= 15)) {
      employment = { status: 'yes', reason: '월 60시간 또는 주 15시간 이상' };
    } else if (months >= 3) {
      employment = { status: 'yes', reason: '3개월 이상 계속 근로 제공' };
    } else if (o.isDailyWorker) {
      employment = { status: 'yes', reason: '일용근로자' };
    } else {
      employment = { status: 'no', reason: '월 60시간·주 15시간 미만, 계속근로 3개월 미만' };
    }

    return {
      pension: pension,
      health: health,
      employment: employment,
      accident: { status: 'yes', reason: '사업주 전액 부담 — 근로자 공제 없음' }
    };
  }

  // ────────────────────────────────────────────────────
  // 4. 4대보험료 공제액
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o { monthlyWage, apply:{pension,health,employment} }
   */
  function insuranceDeduction(o) {
    var i = Y(o.year).insurance;
    var w = o.monthlyWage || 0;
    var ap = o.apply || { pension: true, health: true, employment: true };

    var pension = 0;
    if (ap.pension) {
      var base = clamp(w, i.national_pension.min_base, i.national_pension.max_base);
      pension = won(base * i.national_pension.employee);
    }

    var health = 0, care = 0;
    if (ap.health) {
      var premium = clamp(w * i.health.total,
                          i.health.premium_min_total, i.health.premium_max_total);
      health = won(premium * 0.5);
      care = won(health * i.long_term_care.rate_on_health_premium);
    }

    var employment = ap.employment ? won(w * i.employment.employee) : 0;
    var total = pension + health + care + employment;

    return {
      pension: pension,
      health: health,
      longTermCare: care,
      employment: employment,
      accident: 0,
      total: total,
      afterDeduction: won(w - total),
      effectiveRate: w ? total / w : 0,
      capped: {
        pension: w > i.national_pension.max_base,
        health: w * i.health.total > i.health.premium_max_total
      }
    };
  }

  /**
   * 근로자와 사업주 부담을 함께 반환한다.
   *
   * 주의 — 사업주 부담 중 아래 둘은 포함하지 않는다.
   *   · 고용보험 고용안정·직업능력개발사업분 : 사업장 규모별로 다름
   *   · 산재보험 : 업종별로 다름
   * 두 항목은 rates.json 에 규모·업종별 표가 없으므로 추정하지 않는다.
   * 참고용 평균 산재요율만 avgAccidentRate 로 함께 반환한다.
   */
  function insuranceFull(o) {
    var i = Y(o.year).insurance;
    var w = o.monthlyWage || 0;
    var ap = o.apply || { pension: true, health: true, employment: true };

    var emp = { pension: 0, health: 0, longTermCare: 0, employment: 0 };
    var er = { pension: 0, health: 0, longTermCare: 0, employment: 0 };
    var capped = { pension: false, health: false };

    if (ap.pension) {
      var base = clamp(w, i.national_pension.min_base, i.national_pension.max_base);
      emp.pension = won(base * i.national_pension.employee);
      er.pension = emp.pension;                        // 노사 절반씩
      capped.pension = w > i.national_pension.max_base ||
                       w < i.national_pension.min_base;
    }

    if (ap.health) {
      var raw = w * i.health.total;
      var premium = clamp(raw, i.health.premium_min_total, i.health.premium_max_total);
      capped.health = raw !== premium;
      emp.health = won(premium * 0.5);
      er.health = emp.health;
      var carePremium = premium * i.long_term_care.rate_on_health_premium;
      emp.longTermCare = won(carePremium * 0.5);
      er.longTermCare = emp.longTermCare;
    }

    if (ap.employment) {
      emp.employment = won(w * i.employment.employee);
      er.employment = emp.employment;                  // 실업급여분만. 나머지는 제외
    }

    var sum = function (x) {
      return x.pension + x.health + x.longTermCare + x.employment;
    };

    return {
      employee: emp,
      employer: er,
      employeeTotal: sum(emp),
      employerTotal: sum(er),
      capped: capped,
      afterDeduction: won(w - sum(emp)),
      avgAccidentRate: i.industrial_accident.avg_total,
      excluded: [
        '고용보험 고용안정·직업능력개발사업분 (사업장 규모별 상이, 사업주 전액)',
        '산재보험 (업종별 상이, 사업주 전액)'
      ]
    };
  }

  // ────────────────────────────────────────────────────
  // 5. 근로소득세 (간이세액표)
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o { monthlyTaxablePay, familyCountIncludingSelf, childCountAge8To20 }
   */
  function withholdingTax(o) {
    if (!_taxTable) throw new Error('LaborCalc.ready() 를 먼저 호출하세요.');
    var pay = o.monthlyTaxablePay || 0;
    var family = clamp(o.familyCountIncludingSelf || 1, 1, _taxTable.family_max);
    var idx = family - 1;

    var incomeTax = 0;
    var method = 'table';

    if (pay < _taxTable.brackets[0].from) {
      incomeTax = 0;
      method = 'below_min';
    } else if (pay >= 10000000) {
      var base = _taxTable.base_10m[idx];
      var rule = null;
      for (var k = 0; k < _taxTable.over_10m_rules.length; k++) {
        var r = _taxTable.over_10m_rules[k];
        if (pay > r.over) rule = r;
      }
      if (rule) {
        var excess = pay - rule.excess_base;
        incomeTax = base + rule.add +
                    excess * (rule.factor_98 ? 0.98 : 1) * rule.rate;
      } else {
        incomeTax = base;
      }
      method = 'formula';
    } else {
      for (var j = 0; j < _taxTable.brackets.length; j++) {
        var b = _taxTable.brackets[j];
        if (pay >= b.from && pay < b.to) { incomeTax = b.tax[idx]; break; }
      }
    }

    // 자녀 세액공제는 표에 이미 반영된 구조이나, 별도 반영이 필요하면 여기서 처리
    incomeTax = Math.max(0, Math.floor(incomeTax / 10) * 10);
    var local = Math.floor(incomeTax * 0.1 / 10) * 10;

    return {
      incomeTax: incomeTax,
      localTax: local,
      total: incomeTax + local,
      method: method,
      note: '간이세액표 기준. 연말정산으로 정산됩니다.'
    };
  }

  // ────────────────────────────────────────────────────
  // 6. 연장·야간·휴일 가산수당
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o {
   *   hourlyWage, under5Employees,
   *   overtimeHours, nightHours, holidayHoursWithin8, holidayHoursOver8
   * }
   * 연장과 야간이 겹치는 시간은 nightHours 에도 중복 계상한다 (중복 가산이 맞다).
   */
  function overtimePay(o) {
    var ot = Y(o.year).overtime;
    var wage = o.hourlyWage || 0;
    var under5 = !!o.under5Employees;

    var h = {
      overtime: o.overtimeHours || 0,
      night: o.nightHours || 0,
      holidayWithin8: o.holidayHoursWithin8 || 0,
      holidayOver8: o.holidayHoursOver8 || 0
    };

    // 기본임금은 실제 근로시간에 대해 지급 (야간은 중복 계상이므로 기본임금 제외)
    var baseHours = h.overtime + h.holidayWithin8 + h.holidayOver8;
    var basePay = won(baseHours * wage);

    var extra = { overtime: 0, night: 0, holidayWithin8: 0, holidayOver8: 0 };
    if (!under5) {
      extra.overtime = won(h.overtime * wage * ot['연장']);
      extra.night = won(h.night * wage * ot['야간']);
      extra.holidayWithin8 = won(h.holidayWithin8 * wage * ot['휴일_8시간이내']);
      extra.holidayOver8 = won(h.holidayOver8 * wage * ot['휴일_8시간초과']);
    }
    var extraTotal = extra.overtime + extra.night +
                     extra.holidayWithin8 + extra.holidayOver8;

    return {
      basePay: basePay,
      extra: extra,
      extraTotal: extraTotal,
      total: basePay + extraTotal,
      under5Excluded: under5,
      note: under5
        ? '5인 미만 사업장은 근로기준법 제56조 가산수당 적용 대상이 아닙니다. 다만 제55조 주휴수당은 별도로 적용될 수 있습니다.'
        : '연장과 야간이 겹치면 각각 가산되어 총 200%가 됩니다.'
    };
  }

  // ────────────────────────────────────────────────────
  // 7. 연차휴가
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o { serviceMonths, weeklyHours, attendanceRate }
   */
  function annualLeave(o) {
    var a = Y(o.year).annual_leave;
    var months = o.serviceMonths || 0;
    var years = Math.floor(months / 12);
    var reasons = [];

    if (o.weeklyHours != null && o.weeklyHours < a.min_weekly_hours) {
      return { days: 0, years: years, reasons: ['주 15시간 미만은 연차 규정 적용 제외'] };
    }

    if (months < 12) {
      var d = Math.min(Math.floor(months), a.under_1year['최대']);
      return {
        days: d, years: 0,
        detail: '1개월 개근 시 1일씩 발생 (최대 ' + a.under_1year['최대'] + '일)',
        reasons: reasons
      };
    }

    if (o.attendanceRate != null && o.attendanceRate < 0.8) {
      reasons.push('직전 1년 출근율 80% 미만 — 15일 연차 미발생');
      return { days: 0, years: years, reasons: reasons };
    }

    var days = a.over_1year['기본'];
    if (years >= a['가산']['시작_근속년수']) {
      var add = Math.floor((years - a['가산']['시작_근속년수']) / a['가산']['주기_년']) + 1;
      days += add * a['가산']['가산일'];
    }
    days = Math.min(days, a['가산']['최대']);

    return {
      days: days,
      years: years,
      detail: years >= 3 ? '3년 이상 근속, 2년마다 1일 가산 (최대 25일)' : '기본 15일',
      reasons: reasons
    };
  }

  // ────────────────────────────────────────────────────
  // 8. 퇴직금
  // ────────────────────────────────────────────────────

  /**
   * @param {object} o {
   *   last3MonthsWage, last3MonthsDays,
   *   annualBonus, annualLeaveAllowance,
   *   ordinaryDailyWage, serviceDays, weeklyHours
   * }
   */
  function severancePay(o) {
    var s = Y(o.year).severance;
    var days = o.serviceDays || 0;
    var reasons = [];

    if (days < 365) reasons.push('계속근로 1년 미만 — 퇴직금 지급 대상 아님');
    if (o.weeklyHours != null && o.weeklyHours < s.min_weekly_hours) {
      reasons.push('주 15시간 미만 — 퇴직금 지급 대상 아님');
    }

    var periodDays = o.last3MonthsDays || 92;
    var bonusPart = (o.annualBonus || 0) * s['상여금_산입']['비율'];
    var leavePart = (o.annualLeaveAllowance || 0) * s['연차수당_산입']['기존_발생분']['비율'];
    var totalWage = (o.last3MonthsWage || 0) + bonusPart + leavePart;

    var avgDaily = periodDays ? totalWage / periodDays : 0;
    var ordinaryDaily = o.ordinaryDailyWage || 0;
    var usedDaily = Math.max(avgDaily, ordinaryDaily);
    var usedLabel = ordinaryDaily > avgDaily ? '통상임금' : '평균임금';

    var amount = reasons.length ? 0 : won(usedDaily * 30 * days / 365);

    return {
      eligible: reasons.length === 0,
      avgDailyWage: won(avgDaily),
      ordinaryDailyWage: won(ordinaryDaily),
      usedDailyWage: won(usedDaily),
      usedLabel: usedLabel,
      bonusIncluded: won(bonusPart),
      leaveIncluded: won(leavePart),
      amount: amount,
      pretax: true,
      note: '세전 금액입니다. 퇴직소득세는 별도로 계산됩니다. ' +
            '퇴직으로 비로소 발생한 미사용 연차수당은 평균임금에 포함하지 않습니다.',
      reasons: reasons
    };
  }

  // ────────────────────────────────────────────────────
  // 9. 종합소득세 · 프리랜서 3.3% 환급 판단
  // ────────────────────────────────────────────────────

  function incomeTaxOnBase(base, year) {
    var brackets = Y(year).income_tax['종합소득세_기본세율'];
    var t = 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      var hi = b.upto == null ? Infinity : b.upto;
      if (base > b.over) t += (Math.min(base, hi) - b.over) * b.rate;
    }
    return t;
  }

  /**
   * @param {object} o { jobKey, income, prevYearIncome, dependents }
   * prevYearIncome 이 null 이면 두 시나리오를 모두 반환한다.
   */
  function freelanceRefund(o) {
    var f = Y(o.year).freelance_refund;
    var cfg = f['단순경비율'];
    var job = null;
    for (var i = 0; i < cfg['업종'].length; i++) {
      if (cfg['업종'][i].key === o.jobKey) job = cfg['업종'][i];
    }
    if (!job) throw new Error('알 수 없는 업종: ' + o.jobKey);

    var income = o.income || 0;
    var dependents = o.dependents || 0;
    var deduction = f['기본공제']['본인'] +
                    dependents * f['기본공제']['부양가족_1인당'];
    var wt = Y(o.year).income_tax.freelance_withholding;
    var paid = won(income * wt.total);

    function calc(useSimple) {
      var expense;
      if (useSimple) {
        var th = cfg.tier_threshold;
        if (job.simple_over == null || income <= th) {
          expense = income * job.simple;
        } else {
          expense = th * job.simple + (income - th) * job.simple_over;
        }
      } else {
        expense = income * job.standard;
      }
      var base = Math.max(0, income - expense - deduction);
      var tax = incomeTaxOnBase(base, o.year);
      var local = tax * 0.1;
      var final = tax + local;
      return {
        method: useSimple ? '단순경비율' : '기준경비율',
        expense: won(expense),
        expenseRate: income ? expense / income : 0,
        taxBase: won(base),
        incomeTax: won(tax),
        localTax: won(local),
        finalTax: won(final),
        diff: won(paid - final),
        refund: paid - final > 0
      };
    }

    // 경비율 방식 판정
    var req = cfg['적용요건'];
    var canSimple = null;
    var methodReason = '';
    if (o.prevYearIncome != null) {
      canSimple = o.prevYearIncome < req['직전연도_인적용역수입_미만'] &&
                  income < req['당해연도_수입_미만'];
      methodReason = canSimple
        ? '직전연도 수입 3,600만원 미만 + 당해연도 7,500만원 미만 → 단순경비율'
        : (o.prevYearIncome >= req['직전연도_인적용역수입_미만']
            ? '직전연도 수입이 3,600만원 이상 → 기준경비율'
            : '당해연도 수입이 7,500만원 이상 → 기준경비율');
    }

    var simple = calc(true);
    var standard = calc(false);
    var chosen = canSimple === null ? null : (canSimple ? simple : standard);

    var verdict = null;
    if (chosen) {
      if (chosen.finalTax < paid * 0.7) verdict = '환급 가능성 높음';
      else if (chosen.finalTax < paid) verdict = '환급 가능성 있음';
      else verdict = '비슷하거나 추가납부';
    }

    return {
      job: job,
      income: income,
      prepaid: paid,
      deduction: deduction,
      canUseSimple: canSimple,
      methodReason: methodReason,
      simple: simple,
      standard: standard,
      chosen: chosen,
      verdict: verdict,
      disclaimer: f['면책문구']
    };
  }

  // ────────────────────────────────────────────────────

  global.LaborCalc = {
    ready: ready,
    setData: setData,
    get rates() { return _rates; },
    get taxTable() { return _taxTable; },
    checkMinimumWage: checkMinimumWage,
    weeklyHolidayPay: weeklyHolidayPay,
    insuranceEligibility: insuranceEligibility,
    insuranceDeduction: insuranceDeduction,
    insuranceFull: insuranceFull,
    withholdingTax: withholdingTax,
    overtimePay: overtimePay,
    annualLeave: annualLeave,
    severancePay: severancePay,
    incomeTaxOnBase: incomeTaxOnBase,
    freelanceRefund: freelanceRefund
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.LaborCalc;
})(typeof window !== 'undefined' ? window : globalThis);
