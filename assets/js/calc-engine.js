/* =========================================================
   생활비 계산소 — 계산기 UI 엔진
   ---------------------------------------------------------
   config 기반 렌더러입니다. compute(values)를 넘기면 입력값 변경,
   계산하기 클릭, 초기화 후 결과 영역과 인쇄 전용 리포트를 최신 값으로
   다시 그립니다. compute가 없는 기존 placeholder config도 그대로 동작합니다.
   ========================================================= */
(function () {
  const PALETTE = ['#2f4276','#5b8def','#4bb7c4','#38a06d','#e0a13a','#d97b6c','#a07fd1','#8a93a8','#c2b07a'];
  const PRINT_HELP = 'PDF 저장 시 인쇄창에서 ‘머리글과 바닥글’을 해제하면 날짜와 파일 경로 없이 더 깔끔하게 저장됩니다.';
  const DEFAULT_DISCLAIMER = '본 계산 결과는 참고용입니다. 실제 비용, 세금, 견적, 병원비 등은 상황에 따라 달라질 수 있습니다. 생활비 계산소는 입력값을 서버에 저장하지 않습니다.';
  const won = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
  const parseNum = v => Number(String(v).replace(/[^0-9.-]/g, '')) || 0;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function stripHTML(value) {
    return String(value ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatDate(date = new Date()) {
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  function calculatorTitle(cfg, result) {
    const raw = result.reportTitle || cfg.reportTitle || cfg.title || document.title.split('—')[0].trim() || '계산 결과';
    return raw.endsWith('결과') ? raw : `${raw.replace(/ 계산기$/, '')} 결과`;
  }

  function formatFieldValue(field, value) {
    if (field.type === 'select' || field.type === 'seg') return value || '-';
    const unit = field.unit || '원';
    if (unit === '원') return `${won(value)}원`;
    const num = Number(value) || 0;
    return `${num.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}`;
  }

  function fieldHTML(f) {
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option${o === f.value ? ' selected' : ''}>${escapeHTML(o)}</option>`).join('');
      return `<div class="field"><label>${escapeHTML(f.label)}</label>
        <div class="select-wrap"><select data-id="${escapeHTML(f.id)}">${opts}</select></div></div>`;
    }
    if (f.type === 'seg') {
      const btns = f.options.map(o =>
        `<button type="button" class="seg-btn${o === f.value ? ' on' : ''}" data-val="${escapeHTML(o)}">${escapeHTML(o)}</button>`).join('');
      return `<div class="field"><label>${escapeHTML(f.label)}</label>
        <div class="seg" data-id="${escapeHTML(f.id)}">${btns}</div></div>`;
    }
    const cls = f.highlight ? 'field income' : 'field';
    return `<div class="${cls}"><label>${escapeHTML(f.label)}</label>
      <div class="input-wrap"><input data-id="${escapeHTML(f.id)}" inputmode="numeric" value="${escapeHTML(f.value ?? '')}" />
      <span class="unit">${escapeHTML(f.unit || '원')}</span></div></div>`;
  }

  function summaryHTML(list) {
    return (list || []).map(s => {
      const tone = s.tone ? ' is-' + s.tone : '';
      const unit = s.unit ? `<small>${escapeHTML(s.unit)}</small>` : '';
      return `<div class="sum${tone}"><div class="k">${escapeHTML(s.label)}</div>
        <div class="v num">${escapeHTML(s.value)}${unit}</div></div>`;
    }).join('');
  }

  function resultHTML(data) {
    const items = (data.chartItems || []).filter(i => Number(i.value) > 0);
    const total = items.reduce((s, i) => s + Number(i.value || 0), 0);
    let acc = 0;
    const stops = [];
    items.forEach((it, i) => {
      const pct = total > 0 ? Number(it.value || 0) / total * 100 : 0;
      it.color = PALETTE[i % PALETTE.length];
      it.pct = pct;
      stops.push(`${it.color} ${acc.toFixed(2)}% ${(acc + pct).toFixed(2)}%`);
      acc += pct;
    });
    const donutBg = total > 0 ? `conic-gradient(${stops.join(',')})` : '#eef1f5';
    const legend = items.map(it => `<li>
      <span class="dot" style="background:${it.color}"></span>
      <span class="ln">${escapeHTML(it.label)}</span>
      <span class="pct num">${it.pct.toFixed(1)}%</span>
      <span class="amt num">${won(it.value)}원</span></li>`).join('');

    const table = data.table || { columns: [], rows: [] };
    const cols = table.columns || [];
    const thead = cols.map(c => `<th class="${c.r ? 'r' : ''}">${escapeHTML(c.label)}</th>`).join('');
    const tbody = (table.rows || []).map(row => {
      const tds = row.map((cell, i) => `<td class="${cols[i] && cols[i].r ? 'r' : ''}">${cell}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    const totalRow = table.totalRow
      ? `<tr class="total">${table.totalRow.map((cell, i) => `<td class="${cols[i] && cols[i].r ? 'r' : ''}">${cell}</td>`).join('')}</tr>`
      : '';

    const checks = (data.interpretChecks || []).map(c =>
      `<li><svg data-lucide="check"></svg><span>${escapeHTML(stripHTML(c))}</span></li>`).join('');

    return `
      <div class="card sec-card">
        <div class="sec-title"><span class="badge">2</span> 계산 결과</div>
        <div class="summary-grid">${summaryHTML(data.summary)}</div>

        <div class="rpanel">
          <h4>${escapeHTML(data.chartTitle || '결과 구성')}</h4>
          <div class="chart-row">
            <div class="donut-wrap">
              <div class="donut" style="background:${donutBg}"></div>
              <div class="donut-hole">
                <span class="lbl">${escapeHTML(data.chartTotalLabel || '합계')}</span>
                <span class="tot num">${won(total)}원</span>
              </div>
            </div>
            <ul class="legend">${legend}</ul>
          </div>
        </div>

        <div class="result-bottom">
          <div class="rpanel" style="margin-top:0">
            <h4>${escapeHTML(data.tableTitle || '상세 내역')}</h4>
            <div class="tbl-scroll">
              <table class="detail">
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}${totalRow}</tbody>
              </table>
            </div>
          </div>
          <div class="interpret">
            <h4><svg data-lucide="sparkles"></svg> 한눈에 해석하기</h4>
            <p class="lead-line">${escapeHTML(stripHTML(data.interpretLead || ''))}</p>
            <ul class="checks">${checks}</ul>
          </div>
        </div>

        <div class="out-actions">
          <button class="btn btn-soft" data-act="copy"><svg data-lucide="copy"></svg> 결과 복사</button>
          <button class="btn btn-soft" data-act="pdf"><svg data-lucide="file-text"></svg> 결과 저장 (PDF)</button>
          <button class="btn btn-soft" data-act="csv"><svg data-lucide="download"></svg> 표 다운로드 (CSV)</button>
          <button class="btn btn-soft" data-act="again"><svg data-lucide="rotate-ccw"></svg> 다시 계산하기</button>
        </div>
        <p class="print-help">${PRINT_HELP}</p>
      </div>

      <div class="ad-slot">
        <div>
          <div class="ad-label">광고 표시 예정 영역</div>
          <div class="ad-sub">계산 버튼과 분리된 안내 영역입니다</div>
        </div>
      </div>`;
  }

  function buildReportData(cfg, values, result) {
    const table = result.table || { columns: [], rows: [] };
    return {
      title: calculatorTitle(cfg, result),
      date: formatDate(),
      inputRows: (cfg.fields || []).map(f => [f.label, formatFieldValue(f, values[f.id])]),
      summary: result.summary || [],
      table: {
        columns: table.columns || [],
        rows: table.rows || [],
        totalRow: table.totalRow
      },
      interpretLead: result.interpretLead || '',
      interpretChecks: result.interpretChecks || [],
      disclaimer: result.disclaimer || cfg.disclaimer || DEFAULT_DISCLAIMER
    };
  }

  function printTableHTML(table) {
    const cols = table.columns || [];
    const headers = cols.map(c => `<th class="${c.r ? 'r' : ''}">${escapeHTML(c.label)}</th>`).join('');
    const rows = (table.rows || []).map(row => `<tr>${
      row.map((cell, i) => `<td class="${cols[i] && cols[i].r ? 'r' : ''}">${escapeHTML(stripHTML(cell))}</td>`).join('')
    }</tr>`).join('');
    const total = table.totalRow
      ? `<tr class="total">${table.totalRow.map((cell, i) => `<td class="${cols[i] && cols[i].r ? 'r' : ''}">${escapeHTML(stripHTML(cell))}</td>`).join('')}</tr>`
      : '';
    return `<table class="print-table"><thead><tr>${headers}</tr></thead><tbody>${rows}${total}</tbody></table>`;
  }

  function renderPrintReport(cfg, values, result, container) {
    const host = container || document.body;
    let report = host.querySelector('#print-report');
    if (!report) {
      report = document.createElement('section');
      report.id = 'print-report';
      report.className = 'print-report';
      report.setAttribute('aria-hidden', 'true');
      host.appendChild(report);
    }

    const data = buildReportData(cfg, values, result);
    const inputRows = data.inputRows.map(([label, value]) =>
      `<tr><th>${escapeHTML(label)}</th><td class="r">${escapeHTML(value)}</td></tr>`).join('');
    const summaryCards = data.summary.map(item => {
      const unit = item.unit || '';
      return `<div class="print-summary-card"><div class="k">${escapeHTML(item.label)}</div><div class="v">${escapeHTML(item.value)}${escapeHTML(unit)}</div></div>`;
    }).join('');
    const checks = data.interpretChecks.map(c => `<li>${escapeHTML(stripHTML(c))}</li>`).join('');

    report.innerHTML = `
      <div class="print-report-head">
        <div class="print-brand">생활비 계산소</div>
        <h1>${escapeHTML(data.title)}</h1>
        <p class="print-meta">출력일: ${escapeHTML(data.date)}</p>
        <p class="print-meta">이 결과는 사용자가 입력한 값을 기준으로 한 참고용 계산 결과입니다.</p>
      </div>

      <section class="print-section">
        <h2>입력값 요약</h2>
        <table class="print-table"><tbody>${inputRows}</tbody></table>
      </section>

      <section class="print-section">
        <h2>계산 결과 요약</h2>
        <div class="print-summary">${summaryCards}</div>
      </section>

      <section class="print-section">
        <h2>상세 내역</h2>
        ${printTableHTML(data.table)}
      </section>

      <section class="print-section">
        <h2>한눈에 해석하기</h2>
        <div class="print-interpret">
          <p>${escapeHTML(stripHTML(data.interpretLead))}</p>
          <ul>${checks}</ul>
        </div>
      </section>

      <section class="print-note">${escapeHTML(data.disclaimer)}</section>`;
  }

  function renderCalculator(cfg) {
    const mount = document.getElementById('calc-mount');
    if (!mount) return;
    let latest = cfg;
    let latestValues = {};

    mount.innerHTML = `
    <div class="calc-layout">
      <div class="calc-left">
        <div class="card sec-card">
          <div class="sec-title"><span class="badge">1</span> 정보 입력</div>
          ${cfg.fields.map(fieldHTML).join('')}
          <div class="form-actions">
            <button class="btn btn-soft" data-act="reset"><svg data-lucide="rotate-ccw"></svg> 초기화</button>
            <button class="btn btn-primary" data-act="calc"><svg data-lucide="equal"></svg> 계산하기</button>
          </div>
        </div>
        <div class="card tip-card">
          <div class="sec-title"><svg data-lucide="lightbulb"></svg> 입력 팁</div>
          <p>${escapeHTML(cfg.tip || '')}</p>
        </div>
      </div>
      <div class="calc-right" data-results></div>
    </div>`;

    const resultTarget = mount.querySelector('[data-results]');

    function values() {
      const out = {};
      cfg.fields.forEach(f => {
        if (f.type === 'select') out[f.id] = mount.querySelector(`select[data-id="${f.id}"]`)?.value || '';
        else if (f.type === 'seg') out[f.id] = mount.querySelector(`.seg[data-id="${f.id}"] .seg-btn.on`)?.dataset.val || '';
        else out[f.id] = parseNum(mount.querySelector(`input[data-id="${f.id}"]`)?.value || 0);
      });
      return out;
    }

    function currentData(inputValues) {
      if (typeof cfg.compute !== 'function') return Object.assign({}, cfg);
      return Object.assign({}, cfg, cfg.compute(inputValues));
    }

    function renderResults() {
      latestValues = values();
      latest = currentData(latestValues);
      resultTarget.innerHTML = resultHTML(latest);
      renderPrintReport(cfg, latestValues, latest, mount);
      if (window.lucide) lucide.createIcons();
    }

    function flash(btn, msg) {
      const o = btn.innerHTML;
      btn.innerHTML = msg;
      setTimeout(() => { btn.innerHTML = o; if (window.lucide) lucide.createIcons(); }, 1200);
    }

    mount.querySelectorAll('.input-wrap input').forEach(inp => {
      inp.addEventListener('input', () => {
        const atEnd = inp.selectionStart === inp.value.length;
        const n = parseNum(inp.value);
        inp.value = n ? n.toLocaleString('ko-KR') : '';
        if (atEnd) inp.setSelectionRange(inp.value.length, inp.value.length);
        renderResults();
      });
    });
    mount.querySelectorAll('.select-wrap select').forEach(sel => sel.addEventListener('change', renderResults));
    mount.querySelectorAll('.seg').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn'); if (!b) return;
        seg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        renderResults();
      });
    });

    mount.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'calc') {
        renderResults();
        flash(btn, '<svg data-lucide="check"></svg> 계산 완료');
      } else if (act === 'again') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        renderResults();
      } else if (act === 'reset') {
        cfg.fields.forEach(f => {
          if (f.type === 'select') {
            const sel = mount.querySelector(`select[data-id="${f.id}"]`);
            if (sel) sel.value = f.value || (f.options && f.options[0]) || '';
          } else if (f.type === 'seg') {
            const seg = mount.querySelector(`.seg[data-id="${f.id}"]`);
            if (seg) seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === f.value));
          } else {
            const inp = mount.querySelector(`input[data-id="${f.id}"]`);
            if (inp) inp.value = f.value || '0';
          }
        });
        renderResults();
      } else if (act === 'copy') {
        latestValues = values();
        latest = currentData(latestValues);
        renderPrintReport(cfg, latestValues, latest, mount);
        const lines = (latest.summary || []).map(s => `${s.label}: ${s.value}${s.unit || ''}`);
        const txt = `[${calculatorTitle(cfg, latest)}]\n` + lines.join('\n');
        navigator.clipboard && navigator.clipboard.writeText(txt);
        flash(btn, '<svg data-lucide="check"></svg> 복사됨');
      } else if (act === 'pdf') {
        latestValues = values();
        latest = currentData(latestValues);
        renderPrintReport(cfg, latestValues, latest, mount);
        window.print();
      } else if (act === 'csv') {
        latestValues = values();
        latest = currentData(latestValues);
        renderPrintReport(cfg, latestValues, latest, mount);
        const cols = latest.table.columns.map(c => c.label);
        let csv = cols.join(',') + '\n';
        const strip = s => stripHTML(s).replace(/,/g, ' ');
        latest.table.rows.forEach(r => { csv += r.map(strip).join(',') + '\n'; });
        if (latest.table.totalRow) csv += latest.table.totalRow.map(strip).join(',') + '\n';
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = latest.csvName || cfg.csvName || 'result.csv';
        a.click();
      }
    });

    renderResults();
  }

  window.renderCalculator = renderCalculator;
  window.calcEngineUtils = { won, parseNum };
  window.calculatorPrint = { renderPrintReport, buildReportData, printHelp: PRINT_HELP };
})();
