/* The dashboard reads the same organization ledger used to authorize headcount. */
(() => {
  'use strict';

  const levelNames = { 后台: '总部后台', 区域: '区域中台', 一线: '一线门店' };
  const view = { dimension: 'level', reviewOpen: false, centerId: '', reportScope: '' };
  const matchesBusiness = (business, filter) => !filter || filter === '全部业务' || business === filter;
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const sum = (rows, key) => rows.reduce((amount, row) => amount + Number(row[key] || 0), 0);

  function organizationFigures(center, dashboard, jobsById) {
    const { month, biz } = dashboard;
    const allBusinesses = matchesBusiness(null, biz);
    const lines = center.lines.filter(line => matchesBusiness(line.biz, biz));
    const assignments = (center.jobs || []).filter(job => matchesBusiness(jobsById.get(job.jobId)?.biz, biz));
    const history = (center.history || []).filter(row =>
      row.month.slice(0, 4) === month.slice(0, 4) && row.month <= month && matchesBusiness(row.biz, biz)
    );
    const actuals = history.filter(row => finite(row.cost));
    const monthly = actuals.filter(row => row.month === month);
    const relevant = allBusinesses || lines.some(l => l.cap > 0 || l.used > 0 || l.reserved > 0) || history.length || assignments.length;
    if (!relevant) return null;
    return {
      center,
      budget: center.authorized ? (allBusinesses ? center.costCap : sum(assignments, 'budget')) : null,
      cost: monthly.length ? sum(monthly, 'cost') : null,
      cumulative: actuals.length ? sum(actuals, 'cost') : null,
      reserved: center.authorized ? sum(lines, 'reservedCost') : null,
      alerts: monthly.filter(row => finite(row.output) && Number(row.avgPeople) > 0 &&
        Number(row.threshold) > 0 && row.output / row.avgPeople < row.threshold).length
    };
  }

  function aggregate(group, key) {
    const withValues = group.filter(row => finite(row[key]));
    return withValues.length ? sum(withValues, key) : null;
  }

  function expenses(d, records) {
    const { esc, money, month, biz } = d;
    const byOrg = view.dimension === 'org';
    const partitions = byOrg ? records.map(record => [record.center.name, [record]]) :
      Object.entries(levelNames).map(([level, label]) => [label, records.filter(record => record.center.level === level)])
        .filter(([, group]) => group.length);
    const businessFiltered = !matchesBusiness(null, biz);
    const amount = v => v === null ? '—' : esc(money(v));
    const current = d.asOf || (records[0] && d.context(records[0].center.id)?.month);
    const showReservation = current === month && records.some(row => row.reserved > 0);
    const headers = [byOrg ? '组织' : '人员层级', businessFiltered ? '岗位年度预算' : '组织年度预算', '当月发生费用', '本年累计费用', '累计使用率'];
    if (showReservation) headers.push('历史预留金额');
    const cells = partitions.map(([label, group]) => {
      const budget = aggregate(group, 'budget');
      const actual = aggregate(group, 'cumulative');
      const partial = group.some(row => row.center.authorized && (row.cost === null || row.cumulative === null));
      const rate = budget > 0 && actual !== null && !partial ? (actual / budget * 100).toFixed(1) + '%' : '—';
      let sublabel = byOrg ? levelNames[group[0].center.level] || '' : group.length + ' 个组织';
      if (partial) sublabel += ' · 月报待补';
      return '<tr><th scope="row">' + esc(label) + '<small>' + esc(sublabel) + '</small></th><td>' +
        amount(budget) + '</td><td>' + amount(aggregate(group, 'cost')) + '</td><td>' + amount(actual) +
        '</td><td>' + rate + '</td>' + (showReservation ? '<td>' + amount(aggregate(group, 'reserved')) + '</td>' : '') + '</tr>';
    }).join('');
    return '<section class="panel bb-expense"><div class="panelhead"><div><h2>人员费用使用情况</h2><small class="muted">' +
      esc(month) + ' · ' + esc(biz || '全部业务') + '</small></div><label class="bb-control">查看维度<select id="bb-dimension">' +
      '<option value="level"' + (!byOrg ? ' selected' : '') + '>按人员层级</option><option value="org"' + (byOrg ? ' selected' : '') +
      '>按组织</option></select></label></div>' +
      (cells ? '<div class="bb-tablescroll"><table><thead><tr>' + headers.map(h => '<th scope="col">' + h + '</th>').join('') +
        '</tr></thead><tbody>' + cells + '</tbody></table></div>' : '<p class="empty">当前范围没有相应组织。</p>') +
      '<details class="bb-notes"><summary>费用统计口径</summary><p>当月和累计费用取月度成本记录，累计至所选月。' +
      (businessFiltered ? '筛选业务线后，年度预算取该业务线已分配到岗位的预算。' : '年度预算取组织最新核定的固定类和其他类刚性成本包。') +
      '累计使用率为累计发生费用除以年度预算。人员申请以 HR 已入职回执计入额度，历史预留单列。费用发生额以成本记录为准。缺月时显示已有记录的合计。</p></details></section>';
  }

  function reviewContext(d, id) {
    const c = d.context(id);
    if (!c) return null;
    return { ...c, centers: d.centers.filter(row => row.authorized && row.level === c.center.level) };
  }

  function review(d, records) {
    const { month, esc } = d;
    const eligible = records.filter(r => r.center.authorized && r.center.history?.some(row =>
      row.month <= month && row.month.slice(0, 4) === month.slice(0, 4) && matchesBusiness(row.biz, d.biz)
    ));
    let selected = eligible.find(row => row.center.id === view.centerId);
    if (!selected) selected = eligible.find(row => row.alerts > 0) || eligible[0];
    view.centerId = selected?.center.id || '';
    const totalAlerts = sum(eligible, 'alerts');
    const alertLine = eligible.length ? eligible.length + ' 个组织有月报 · ' + totalAlerts + ' 项业务线人效低于阈值' : '当前范围暂无人效月报';
    let detail = '';
    if (view.reviewOpen && selected) {
      const c = reviewContext(d, selected.center.id);
      if (c) {
        const reportScope = [d.actor, selected.center.id, month].join('/');
        if(view.reportScope !== reportScope){window.BCycle.selectReportMonth(c, month);view.reportScope=reportScope;}
        const full = c.center.level === '一线' && month === c.month;
        const contents = full ? window.BCycle.render(c, 'review') : window.BCycle.renderSummary(c);
        detail = '<div id="bb-review-body" class="bg-console bb-review-body"><div class="bb-controls">' +
          '<label class="bb-control">复盘组织<select id="bb-review-center">' + eligible.map(r =>
            '<option value="' + esc(r.center.id) + '"' + (r.center.id === selected.center.id ? ' selected' : '') +
            '>' + esc(r.center.name) + '</option>').join('') + '</select></label></div><div id="bg-message" role="status" tabindex="-1"></div><div class="bg-body">' + contents + '</div></div>';
      }
    }
    return '<section class="panel bb-review"><div class="panelhead"><div><h2>人效复盘</h2><span class="muted">' +
      esc(month) + ' · ' + esc(alertLine) + '</span></div>' +
      (eligible.length ? '<button type="button" id="bb-review-toggle" class="action" aria-expanded="' + !!detail +
      '">' + (detail ? '收起复盘' : '查看复盘') + '</button>' : '') + '</div>' + detail + '</section>';
  }

  function render(s) {
    if (s.role === '一线员工') return '';
    const d = window.BPortal.dashboard(s);
    if (!d) return '';
    const jobsById = new Map(d.catalog.map(job => [job.id, job]));
    const records = d.centers.map(center => organizationFigures(center, d, jobsById)).filter(Boolean);
    return '<div id="bb-workbench">' + expenses(d, records) + review(d, records) + '</div>';
  }

  function bind(s, refresh) {
    const root = document.querySelector('#bb-workbench');
    if (!root) return;
    const dimension = root.querySelector('#bb-dimension');
    dimension.onchange = () => { view.dimension = dimension.value; refresh(); };
    const toggle = root.querySelector('#bb-review-toggle');
    if (toggle) toggle.onclick = () => { view.reviewOpen = !view.reviewOpen; refresh(); };
    const picker = root.querySelector('#bb-review-center');
    if (picker) {
      picker.onchange = () => { view.centerId = picker.value; refresh(); };
      const c = reviewContext(window.BPortal.dashboard(s), view.centerId);
      if (c) window.BCycle.bind(c, 'review');
    }
  }
  window.BWorkbench = { render, bind };
})();
