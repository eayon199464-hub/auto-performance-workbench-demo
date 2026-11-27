/* Performance configuration contract. Released metric entries are immutable snapshots. */
(() => {
  'use strict';
  const api = (window.PerfPlans = {});
  // db.metrics[]: id,name,category,biz,scope,jobs[],definition,source,algorithm,target,bands,manualScore:{min,max,base,criteria}.
  // db.plans[]: id,title,month,biz,org,scope,job,status ('草稿'|'已下发'),people:[{id,name}], metrics:[{...snapshot,weight}],releasedAt,received:[employeeId].
  api.forPerson = (db, month, personId) =>
    (db.plans || []).find(
      (p) => p.status === '已下发' && p.month === month && p.people.some((x) => x.id === personId),
    );
  const C = ['基础绩效', '保护机制', '扣罚项', '行为评价'],
    A = ['达成率', '区间取值', '全量阶梯', '分段累进'],
    un = '通用',
    e = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      ),
    clone = (v) => JSON.parse(JSON.stringify(v)),
    id = () => globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2),
    now = () => new Date().toLocaleString('zh-CN', { hour12: false }),
    unique = (x) => [...new Set(x.filter(Boolean))],
    num = (x) => x !== null && x !== undefined && String(x).trim() !== '' && Number.isFinite(+x),
    sum = (xs) => xs.reduce((s, x) => s + (Number(x.weight) || 0), 0),
    pct = (x) => Number(x.toFixed(4)),
    weighted = (m) => [C[0], C[3]].includes(m.category),
    HR = (c) => c.role === '后台HRBP',
    allowed = (c, stage) => HR(c) && c.isOpen(stage),
    opt = (xs, val = '', first = '') =>
      (first ? `<option value="">${e(first)}</option>` : '') +
      xs.map((x) => `<option value="${e(x)}"${x === val ? ' selected' : ''}>${e(x)}</option>`).join(''),
    button = (a, t, cls = 'pa-link', v = '') =>
      `<button type="button" class="${cls}" data-${a}="${e(v)}">${e(t)}</button>`,
    row = (cells, tag = 'td') => '<tr>' + cells.map((x) => `<${tag}>${x}</${tag}>`).join('') + '</tr>',
    table = (cols, rows) =>
      `<div class="pa-scroll"><table class="pa-table"><thead>${row(cols.map(e), 'th')}</thead><tbody>${rows || `<tr><td colspan="${cols.length}" class="pa-note">暂无符合条件的记录</td></tr>`}</tbody></table></div>`,
    card = (title, html, actions = '') =>
      `<section class="pa-card"><div class="pa-toolbar"><h2 class="pa-title">${title}</h2><div class="pa-actions">${actions}</div></div>${html}</section>`,
    field = (label, control) => `<label>${label}${control}</label>`,
    sel = (name, xs, v, first) => `<select name="${name}">${opt(xs, v, first)}</select>`,
    input = (name, v = '', extra = '') => `<input name="${name}" value="${e(v)}" ${extra}>`,
    footer = (t) =>
      `<p class="pa-error" role="alert"></p><footer class="pa-actions">${button('cancel', '取消', '')}<button class="pa-primary" type="submit">${t}</button></footer>`,
    grp = (p) => [p.biz, p.org, p.scope, p.job].join(' / '),
    low = (p) => (p.scope === '区域中台' ? '区域总' : '后台业务老师');
  const ui = { library: { page: 1, filters: {} }, plans: { page: 1, filters: {} } };
  function compatible(m, p) {
    return (
      (!m.biz || m.biz === un || m.biz === p.biz) &&
      (!m.scope || m.scope === un || m.scope === p.scope) &&
      (!m.jobs?.length || m.jobs.includes(p.job))
    );
  }
  function normalize(m) {
    const cat =
      m.category ||
      (m.type === '行为评价' || m.sourceType === '主观评价' || m.algorithm === '人工评分'
        ? C[3]
        : /保护|保底/.test(m.name)
          ? C[1]
          : /扣罚|处罚/.test(m.name)
            ? C[2]
            : C[0]);
    return {
      ...m,
      id: m.id || id(),
      name: m.name,
      category: cat,
      biz: m.business || m.biz || un,
      scope: m.scope || un,
      jobs: m.jobs || (m.job ? [m.job] : []),
      algorithm: cat === C[3] ? '人工评分' : m.algorithm || '',
      manualScore: m.manualScore || (cat === C[3] ? window.PFScoring?.manual?.(m) : null),
      version: m.version || 1,
    };
  }
  const pg = (c, page, total) => {
    const s = ui[page],
      max = Math.max(1, Math.ceil(total / 12));
    s.page = Math.max(1, Math.min(s.page, max));
    c.on('[data-paging]', 'click', (_, el) => {
      s.page += Number(el.dataset.paging);
      c.refresh();
    });
    return `<div class="pa-actions" style="margin-top:12px"><small>共 ${total} 条 · 每页 12 条</small><button data-paging="-1" ${s.page === 1 ? 'disabled' : ''}>上一页</button><span>${s.page} / ${max}</span><button data-paging="1" ${s.page === max ? 'disabled' : ''}>下一页</button></div>`;
  };
  function checkMetric(m) {
    if (!m.name?.trim() || !m.definition?.trim()) return '请填写指标名称和指标定义。';
    if (m.category === C[3]) {
      const v = m.manualScore || {};
      if (!num(v.min) || !num(v.max) || +v.min < 0 || +v.max <= 0 || +v.min >= +v.max || !v.criteria?.trim())
        return '请填写有效的最低分、最高分及评分标准。';
      if (num(v.base) && (+v.base < +v.min || +v.base > +v.max)) return '基准分须在评分范围内。';
    } else if ([C[1], C[2]].includes(m.category)) {
      if (m.category === C[2] && !['系数', '元'].includes(m.unit)) return '请选择扣罚单位。';
      if (!m.condition?.trim() || !num(m.adjustValue) || +m.adjustValue < 0)
        return '请填写触发条件和非负的调整系数。';
    } else {
      if (!m.source?.trim() || !A.includes(m.algorithm)) return '请在指标库补全业务值和计分方式。';
      if (m.algorithm === A[0] && (!num(m.target) || +m.target <= 0)) return '达成率的目标值须大于零。';
      if (m.algorithm !== A[0]) {
        if (!m.bands || window.PFCalc?.bandError?.(m)) return '请补全有效的分档口径。';
      }
    }
    return '';
  }
  function checkPlan(p) {
    if (!p.metrics.some((m) => m.category === C[0])) return '请至少选择一项基础绩效。';
    const ws = p.metrics.filter(weighted);
    if (ws.some((m) => !num(m.weight) || +m.weight <= 0 || +m.weight > 100) || Math.abs(sum(ws) - 100) > 1e-7)
      return '基础绩效与行为评价的权重合计须为 100%，选用项权重须大于 0。';
    for (const m of p.metrics) {
      const err = checkMetric(m);
      if (err) return m.name + '：' + err;
    }
    if (!p.people?.length) return '本方案没有可接收人员。';
    return '';
  }
  api.checkMetric = checkMetric;
  api.normalize = normalize;
  api.validate = checkPlan;
  api.categories = C;
  api.init = function (db, people, month) {
    db.metrics ||= [];
    db.plans ||= [];
    db.planMonths ||= {};
    db.metricHistory ||= [];
    let old = {};
    if (!db.catalogInitialized || !db.planMonths[month]) {
      try {
        old = JSON.parse(localStorage.getItem('autoops.performance.flow.11') || '{}') || {};
      } catch {}
    }
    if (!db.catalogInitialized) {
      const seen = new Map(),
        add = (m, override = false) => {
          const x = normalize(m),
            k = [x.biz, x.scope, x.jobs.join(','), x.name].join('|');
          if (!seen.has(k)) {
            seen.set(k, x);
            db.metrics.push(x);
          } else if (override) {
            const previous = seen.get(k);
            Object.assign(previous, x, { id: previous.id });
          }
          return seen.get(k);
        };
      for (const [biz, nam] of Object.entries({
        销售: '成交目标达成',
        交付: '交付完成量',
        售后: '服务工单完成量',
        市场: '活动有效线索',
        新媒体: '内容有效线索',
      }))
        add({
          id: 'demo-base-' + biz,
          name: nam,
          biz,
          definition: '考核期内归属被考核人的有效业务量。',
          source: nam + '实际值',
          target: 50,
          algorithm: A[0],
          demo: true,
        });
      add({
        id: 'demo-behavior',
        name: '综合行为评价',
        category: C[3],
        definition: '依据本期工作记录评价协作与服务表现。',
        manualScore: {
          min: 0,
          max: 100,
          base: null,
          criteria: '结合服务记录、协作记录及异常处理情况逐项说明评分依据。',
        },
        demo: true,
      });
      add({
        id: 'demo-floor',
        name: '示例 · 绩效保护',
        category: C[1],
        definition: '符合本期保护条件时采用保底系数。',
        condition: '经确认符合本期保护条件',
        adjustValue: 0.8,
        demo: true,
      });
      add({
        id: 'demo-penalty',
        name: '示例 · 服务规范扣罚',
        category: C[2],
        definition: '已确认的服务规范违规事项。',
        condition: '当期存在核实后的服务规范违规事项',
        adjustValue: 0.05,
        unit: '系数',
        demo: true,
      });
      for (const m of old.library || []) if (m && typeof m.name === 'string') add(m, true);
      for (const group of window.PFFrontline || [])
        for (const m of [...(group.metrics || []), ...(group.options || [])])
          add({ business: group.biz, scope: group.scope, job: group.job, ...m });
      db.catalogInitialized = true;
    }
    if (db.planMonths[month]) return;
    db.planMonths[month] = true;
    const historical = (old.plans || []).filter((p) => p.month === month);
    for (const p of historical) {
      if (!Array.isArray(p.metrics) || !p.people?.length) continue;
      const metrics = p.metrics.map((m) => {
        const x = normalize(m);
        const linked = db.metrics.find(
          (z) =>
            z.name === x.name &&
            z.biz === x.biz &&
            z.scope === x.scope &&
            z.jobs.join('|') === x.jobs.join('|'),
        );
        return { ...x, id: linked?.id || x.id, weight: m.weight ?? 0 };
      });
      for (const [index, a] of (p.adjustments || []).entries()) {
        if (!a?.name) continue;
        const amount = a.type === '金额扣罚',
          deduct = a.type === '扣分';
        metrics.push(
          normalize({
            id: p.id + '-adjust-' + index,
            name: a.name,
            category: amount || deduct ? C[2] : '历史加分（待配置）',
            definition: a.condition || a.name,
            condition: a.condition || '',
            adjustValue: amount && num(a.value) ? +a.value : null,
            unit: amount ? '元' : '分（待配置）',
            weight: 0,
          }),
        );
      }
      db.plans.push({
        ...clone(p),
        status: p.stage === 'active' ? '已下发' : '草稿',
        metrics,
        received: p.received || [],
        version: p.version || 1,
      });
    }
    // Seed examples only for the original demo month. New periods start empty.
    if (!historical.length && month === '2026-11') {
      const groups = new Map();
      for (const x of people) {
        const k = grp(x);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(x);
      }
      let i = 0;
      for (const rows of groups.values()) {
        const x = rows[0],
          b = db.metrics.find((m) => m.id === 'demo-base-' + x.biz);
        if (!b) continue;
        const active = i++ % 4 !== 2 || rows.some((p) => p.id === 'E011'),
          withBehavior = active && i % 3 === 1;
        const metrics = [{ ...clone(b), weight: withBehavior ? 85 : 100 }];
        if (withBehavior)
          metrics.push({ ...clone(db.metrics.find((x) => x.id === 'demo-behavior')), weight: 15 });
        if (i % 3 === 1)
          metrics.push({ ...clone(db.metrics.find((x) => x.id === 'demo-penalty')), weight: 0 });
        db.plans.push({
          id: 'demo-' + month + '-' + x.id,
          demo: true,
          title: x.job + '月度绩效方案',
          biz: x.biz,
          org: x.org,
          scope: x.scope,
          job: x.job,
          month,
          status: active ? '已下发' : '草稿',
          metrics,
          people: rows.map(({ id, name }) => ({ id, name })),
          received: [],
          version: 1,
          releasedAt: active ? '演示初始下发' : '',
          createdBy: '后台HRBP',
        });
      }
    }
  };
  function filterBox(c, key, fields) {
    const s = ui[key];
    c.on('[data-filter-form]', 'submit', (ev, form) => {
      ev.preventDefault();
      s.filters = Object.fromEntries(new FormData(form));
      s.page = 1;
      c.refresh();
    });
    c.on('[data-reset]', 'click', () => {
      s.filters = {};
      s.page = 1;
      c.refresh();
    });
    return card(
      '筛选',
      `<form data-filter-form class="pa-filters">${fields.map(([k, label, options]) => field(label, options ? sel(k, options, s.filters[k], '全部') : input(k, s.filters[k], `placeholder="输入${label}"`))).join('')}<div class="pa-actions">${button('reset', '重置', '')}<button class="pa-primary">查询</button></div></form>`,
    );
  }
  function validRows(items, s) {
    return items.filter((m) =>
      Object.entries(s.filters).every(
        ([key, v]) =>
          !v ||
          (key === 'name'
            ? String(m.name || m.title).includes(v)
            : key === 'job'
              ? !m.jobs?.length || m.jobs.includes(v)
              : m[key] === v),
      ),
    );
  }
  function editMetric(c, orig) {
    if (!allowed(c, 'config')) return;
    const origin = orig || {},
      x = clone(origin),
      jobs = unique([...c.people.map((p) => p.job), ...c.db.metrics.flatMap((m) => m.jobs || [])]),
      bizes = unique([un, ...c.people.map((x) => x.biz), x.biz]),
      scopes = unique([un, ...c.people.map((x) => x.scope), x.scope]);
    const oldUsage =
      orig && c.db.plans.some((p) => p.status === '已下发' && p.metrics.some((m) => m.id === orig.id));
    const score = x.manualScore || {};
    c.modal(
      orig ? '编辑指标' : '新增指标',
      `<form><div class="pa-form-grid">${field('指标名称', input('name', x.name, 'required maxlength="100" autofocus'))}${field('指标分类', sel('category', C, x.category || C[0]))}${field('业务线', sel('biz', bizes, x.biz || un))}${field('适用层级', sel('scope', scopes, x.scope || un))}<div><span>适用岗位</span><details style="margin-top:4px"><summary style="border:1px solid #cbd5e2;border-radius:4px;padding:7px 10px;cursor:pointer" data-jobsum>${e(x.jobs?.join('、') || '全部岗位')}</summary><div style="max-height:155px;overflow:auto;padding:5px">${jobs.map((j) => `<label style="display:block;padding:3px"><input type="checkbox" name="jobs" value="${e(j)}" ${(x.jobs || []).includes(j) ? 'checked' : ''}>${e(j)}</label>`).join('')}</div></details></div></div>${field('指标定义', `<textarea required name="definition" maxlength="2000">${e(x.definition)}</textarea>`)}<fieldset data-kind="base"><legend>基础绩效计分</legend><div class="pa-form-grid">${field('大数据业务值（字段名称）', input('source', x.source))}${field('计分方式', sel('algorithm', A, x.algorithm || A[0]))}<label data-target>目标值${input('target', x.target ?? 100, 'type="number" step="any"')}</label></div><label data-bands>分档口径（下限:上限:分值；多档用分号分隔）${input('bands', x.bands, 'placeholder="0:80:60;80:100:85;100:*:110"')}</label></fieldset><fieldset data-kind="score"><legend>人工评分标准</legend><div class="pa-form-grid">${field('最低分', input('min', score.min ?? 0, 'type="number" min="0" step="any"'))}${field('最高分', input('max', score.max ?? 100, 'type="number" min="0" step="any"'))}${field('基准分（选填）', input('base', score.base, 'type="number" step="any"'))}</div>${field('评分标准', `<textarea name="criteria" placeholder="填写评分档次、对应分值和判断依据">${e(score.criteria)}</textarea>`)}</fieldset><fieldset data-kind="adjust"><legend>适用规则</legend>${field('触发条件', input('condition', x.condition))}<div class="pa-form-grid"><label><span data-adjustlabel></span>${input('adjustValue', x.adjustValue, 'type="number" min="0" step="any"')}</label><label data-unit>扣罚单位${sel('unit', ['系数', '元'], x.unit || '系数')}</label></div></fieldset>${oldUsage ? '<p class="pa-note">已下发方案保留原评分口径。此次修改保存为新版本，供后续方案选用。</p>' : ''}${footer('保存指标')}</form>`,
      (d) => {
        const f = d.querySelector('form'),
          n = f.elements,
          q = (k) => f.querySelector(k),
          jobsVal = () => [...f.querySelectorAll('[name=jobs]:checked')].map((el) => el.value),
          toggle = () => {
            const cat = n.category.value;
            q('[data-kind=base]').hidden = cat !== C[0];
            q('[data-kind=score]').hidden = cat !== C[3];
            q('[data-kind=adjust]').hidden = ![C[1], C[2]].includes(cat);
            q('[data-adjustlabel]').textContent = cat === C[1] ? '保底系数' : '每次扣减值';
            q('[data-unit]').hidden = cat !== C[2];
            q('[data-target]').hidden = n.algorithm.value !== A[0];
            q('[data-bands]').hidden = n.algorithm.value === A[0];
          };
        toggle();
        n.category.onchange = n.algorithm.onchange = toggle;
        f.querySelectorAll('[name=jobs]').forEach(
          (el) => (el.onchange = () => (q('[data-jobsum]').textContent = jobsVal().join('、') || '全部岗位')),
        );
        q('[data-cancel]').onclick = () => c.close();
        f.onsubmit = (ev) => {
          ev.preventDefault();
          if (!allowed(c, 'config')) return;
          const v = Object.fromEntries(new FormData(f)),
            m = normalize({
              ...x,
              id: x.id || id(),
              biz: v.biz,
              business: v.biz,
              scope: v.scope,
              jobs: jobsVal(),
              name: v.name.trim(),
              definition: v.definition.trim(),
              category: v.category,
              algorithm: v.category === C[0] ? v.algorithm : v.category === C[3] ? '人工评分' : '',
              target: v.category === C[0] ? v.target : '',
              bands: v.bands.trim(),
              source: v.category === C[0] ? v.source.trim() : '人工确认',
              condition: v.condition.trim(),
              unit: v.category === C[2] ? v.unit : '系数',
              adjustValue: v.adjustValue === '' ? null : +v.adjustValue,
              manualScore:
                v.category === C[3]
                  ? {
                      min: v.min === '' ? null : +v.min,
                      max: v.max === '' ? null : +v.max,
                      base: v.base === '' ? null : +v.base,
                      criteria: v.criteria.trim(),
                    }
                  : null,
              version: (x.version || 0) + 1,
              updatedAt: now(),
            });
          let err = checkMetric(m);
          if (
            !err &&
            c.db.metrics.some(
              (y) =>
                y.id !== m.id &&
                y.name === m.name &&
                y.biz === m.biz &&
                y.scope === m.scope &&
                [...y.jobs].sort().join() === [...m.jobs].sort().join(),
            )
          )
            err = '相同业务线、层级和岗位下已有同名指标。';
          if (err) {
            q('[role=alert]').textContent = err;
            return;
          }
          if (!orig) c.db.metrics.unshift(m);
          else
            c.db.metrics.splice(
              c.db.metrics.findIndex((z) => z.id === x.id),
              1,
              m,
            );
          c.db.metricHistory.unshift({
            name: m.name,
            version: m.version,
            time: now(),
            role: c.role,
            action: orig ? '编辑' : '新增',
          });
          c.save();
          c.close();
          c.refresh();
          c.toast?.('指标已保存');
        };
      },
    );
  }
  const pages = (window.PerfAdminPages ||= {});
  pages.library = (c) => {
    const s = ui.library,
      ms = c.db.metrics,
      jobs = unique(ms.flatMap((m) => m.jobs || [])).sort(),
      filters = filterBox(c, 'library', [
        ['name', '指标名称'],
        ['category', '指标分类', C],
        ['biz', '业务线', unique(ms.map((m) => m.biz))],
        ['job', '适用岗位', unique([...jobs, ...c.people.map((p) => p.job)])],
      ]),
      rows = validRows(ms, s),
      pagenav = pg(c, 'library', rows.length);
    c.on('[data-m-new]', 'click', () => editMetric(c));
    c.on('[data-m-edit]', 'click', (_, el) =>
      editMetric(
        c,
        ms.find((m) => m.id === el.dataset.mEdit),
      ),
    );
    c.on('[data-m-info]', 'click', (_, el) => {
      const m = ms.find((x) => x.id === el.dataset.mInfo);
      c.modal(
        '指标详情 · ' + m.name,
        table(
          ['项目', '配置'],
          [
            ['指标分类', m.category],
            ['业务线', m.biz],
            ['适用岗位', m.jobs.join('、') || '全部岗位'],
            ['指标定义', m.definition],
            ...(m.category === C[3]
              ? [
                  ['评分范围', (m.manualScore?.min ?? '—') + ' 至 ' + (m.manualScore?.max ?? '—') + ' 分'],
                  ['评分标准', m.manualScore?.criteria],
                ]
              : weighted(m)
                ? [
                    ['业务值', m.source],
                    ['计分方式', m.algorithm],
                    ['目标值 / 分档', m.algorithm === A[0] ? m.target : m.bands],
                  ]
                : [
                    ['触发条件', m.condition],
                    ['调整值', m.adjustValue == null ? '待配置' : m.adjustValue + ' ' + (m.unit || '系数')],
                  ]),
            ['配置版本', 'V' + m.version],
          ]
            .map((v) => row(v.map((z) => e(z || '—'))))
            .join(''),
        ),
      );
    });
    c.on('[data-m-logs]', 'click', () =>
      c.modal(
        '指标变更记录',
        table(
          ['指标', '操作', '版本', '操作角色', '时间'],
          c.db.metricHistory
            .map((h) => row([h.name, h.action, 'V' + h.version, h.role, h.time].map(e)))
            .join(''),
        ),
      ),
    );
    c.on('[data-m-export]', 'click', () =>
      c.csv(
        '指标库清单',
        ['指标名称', '指标分类', '业务线', '适用岗位', '评分标准'],
        rows.map((m) => [
          m.name,
          m.category,
          m.biz,
          m.jobs.join('、') || '全部岗位',
          m.manualScore?.criteria || '',
        ]),
      ),
    );
    window.PerfExchangeAdmin?.bind(c);
    const actions =
      (allowed(c, 'config') ? button('m-new', '＋ 新增指标', 'pa-primary') : '') +
      (window.PerfExchangeAdmin?.buttons(c) || '') +
      button('m-logs', '变更记录', '') +
      button('m-export', '导出', '');
    return (
      filters +
      card(
        '指标列表',
        table(
          ['指标名称', '指标分类', '业务线', '适用层级', '适用岗位', '计分方式', '配置状态', '操作'],
          rows
            .slice((s.page - 1) * 12, s.page * 12)
            .map((m) =>
              row([
                e(m.name),
                e(m.category),
                e(m.biz),
                e(m.scope),
                e(m.jobs.join('、') || '全部岗位'),
                e(m.algorithm || ([C[1], C[2]].includes(m.category) ? '条件调整' : '—')),
                `<span class="pa-badge ${checkMetric(m) ? 'warn' : 'ok'}">${checkMetric(m) ? '待完善' : '可选用'}</span>`,
                button('m-info', '查看', 'pa-link', m.id) +
                  (allowed(c, 'config') ? button('m-edit', '编辑', 'pa-link', m.id) : ''),
              ]),
            )
            .join(''),
        ) + pagenav,
        actions,
      )
    );
  };
  function scoped(c, p) {
    const ids = new Set(c.visiblePeople.map((x) => x.id));
    return (p.people || []).filter((x) => ids.has(x.id));
  }
  function planDetail(c, p) {
    const data = p.metrics
      .map((m) =>
        row([
          e(m.name),
          e(m.category),
          weighted(m) ? e(m.weight) + '%' : '—',
          e(
            m.category === C[3]
              ? `${m.manualScore?.min ?? '—'} 至 ${m.manualScore?.max ?? '—'} 分 · ${m.manualScore?.criteria || '待配置'}`
              : m.category === C[0]
                ? m.algorithm + ' · ' + (m.algorithm === A[0] ? m.target : m.bands)
                : `${m.condition || '待配置'} · ${m.adjustValue ?? '—'} ${m.unit || '系数'}`,
          ),
        ]),
      )
      .join('');
    c.modal(
      p.title,
      `<p class="pa-note">${e([p.month, p.org, p.scope, p.job, 'V' + p.version, p.status].join(' / '))}</p>${table(['指标', '分类', '权重', '计分口径'], data)}<h3>接收与确认</h3>${table(
        ['人员', '人员编号', '状态'],
        scoped(c, p)
          .map((x) =>
            row([
              e(x.name),
              e(x.id),
              p.received?.includes(x.id) ? '已确认' : p.status === '草稿' ? '待下发' : '待确认',
            ]),
          )
          .join(''),
      )}<p class="pa-note">下发时间：${e(p.releasedAt || '—')}</p>`,
    );
  }
  function editPlan(c, orig) {
    if (!allowed(c, 'config')) return;
    const eligible = c.people,
      groups = unique(eligible.map(grp)),
      source = orig || {},
      editing = orig?.status === '草稿',
      rev = orig?.status === '已下发';
    if (!eligible.length) return;
    let chosen = source.job
      ? grp(source)
      : groups.find(
          (g) => !c.db.plans.some((p) => p.month === c.month && grp(p) === g && p.status !== '历史版本'),
        ) || groups[0];
    let items = clone(source.metrics || []),
      title = source.title || '',
      selectedPeople = source.people?.map((x) => x.id),
      isDirty = Boolean(title);
    const group = () => eligible.find((x) => grp(x) === chosen),
      participants = () => eligible.filter((x) => grp(x) === chosen),
      available = (m) => compatible(m, group()) && !checkMetric(m),
      pickable = () => c.db.metrics.filter((m) => available(m) && !items.some((x) => x.id === m.id));
    c.modal(
      (rev ? '修订' : editing ? '编辑' : '新建') + '岗位方案',
      `<form>${field('组织 / 层级 / 岗位', `<select name="group" ${orig ? 'disabled' : ''}>${opt(groups, chosen)}</select>`)}${field('方案名称', input('title', title || group().job + '月度绩效方案', 'required maxlength="100"'))}<fieldset><legend>方案指标</legend><div data-items></div><div class="pa-actions" style="justify-content:flex-start;margin:12px 0"><select name="metric" aria-label="可选指标"></select>${button('add', '加入方案', '')}</div><p class="pa-note" data-total></p></fieldset><fieldset><legend>接收人员</legend><div data-people></div></fieldset>${rev ? '<p class="pa-note">修订将生成新草稿。再次下发前，员工继续使用当前版本。</p>' : ''}${footer('保存草稿')}</form>`,
      (d) => {
        const f = d.querySelector('form'),
          q = (k) => f.querySelector(k),
          err = (t) => (q('[role=alert]').textContent = t),
          drawRecipients = () => {
            const rows = participants();
            if (!selectedPeople) selectedPeople = rows.map((p) => p.id);
            q('[data-people]').innerHTML = rows
              .map(
                (p) =>
                  `<label style="display:inline-block;margin:3px 12px 3px 0"><input type="checkbox" name="recipients" value="${e(p.id)}" ${selectedPeople.includes(p.id) ? 'checked' : ''}>${e(p.name)}（${e(p.id)}）</label>`,
              )
              .join('');
          };
        const drawTotal = () => {
          const b = pct(sum(items.filter((m) => m.category === C[0]))),
            a = pct(sum(items.filter((m) => m.category === C[3])));
          q('[data-total]').textContent =
            `基础绩效 ${b}% ＋ 行为评价 ${a}% ＝ ${pct(b + a)}%（下发须为 100%）`;
        };
        const draw = () => {
          const opts = pickable();
          q('[name=metric]').innerHTML =
            '<option value="">选择要加入的指标</option>' +
            C.map(
              (k) =>
                `<optgroup label="${k}">${opts
                  .filter((m) => m.category === k)
                  .map((m) => `<option value="${e(m.id)}">${e(m.name)}</option>`)
                  .join('')}</optgroup>`,
            ).join('');
          q('[data-items]').innerHTML = items.length
            ? table(
                ['指标名称', '指标分类', '本期目标 / 口径', '权重（%）', '操作'],
                items
                  .map((m, i) =>
                    row([
                      e(m.name),
                      e(m.category),
                      m.category === C[0] && m.algorithm === A[0]
                        ? `<input data-plan-target="${i}" type="number" step="any" style="width:83px" aria-label="${e(m.name)}本期目标" value="${e(m.target)}">`
                        : e(
                            m.category === C[3]
                              ? `${m.manualScore?.min ?? '—'} 至 ${m.manualScore?.max ?? '—'} 分`
                              : m.category === C[0]
                                ? m.bands || '待配置'
                                : m.condition || '—',
                          ),
                      weighted(m)
                        ? `<input data-weight="${i}" type="number" min="0" max="100" step="0.01" style="width:78px" aria-label="${e(m.name)}权重" value="${e(m.weight)}">`
                        : '不占权重',
                      button('rm', '移除', 'pa-link', i),
                    ]),
                  )
                  .join(''),
              )
            : '<p class="pa-note">请选择基础绩效指标。需要人工评分时，再加入行为评价并填写比例。</p>';
          q('[data-items]')
            .querySelectorAll('[data-plan-target]')
            .forEach(
              (el) =>
                (el.oninput = () =>
                  (items[+el.dataset.planTarget].target = el.value === '' ? '' : +el.value)),
            );
          q('[data-items]')
            .querySelectorAll('[data-weight]')
            .forEach(
              (el) =>
                (el.oninput = () => {
                  items[+el.dataset.weight].weight = el.value === '' ? '' : +el.value;
                  drawTotal();
                }),
            );
          q('[data-items]')
            .querySelectorAll('[data-rm]')
            .forEach(
              (el) =>
                (el.onclick = () => {
                  items.splice(+el.dataset.rm, 1);
                  draw();
                }),
            );
          drawTotal();
        };
        q('[data-add]').onclick = () => {
          const m = pickable().find((m) => m.id === f.elements.metric.value);
          if (!m) {
            err('请先选择一个指标。');
            return;
          }
          err('');
          items.push({
            ...clone(m),
            weight: m.category === C[0] && !items.some(weighted) ? 100 : m.category === C[3] ? '' : 0,
          });
          draw();
        };
        f.elements.title.oninput = () => {
          isDirty = true;
        };
        f.elements.group.onchange = () => {
          chosen = f.elements.group.value;
          selectedPeople = null;
          items = items.filter((m) => compatible(m, group()));
          if (!isDirty) f.elements.title.value = group().job + '月度绩效方案';
          draw();
          drawRecipients();
        };
        draw();
        drawRecipients();
        q('[data-cancel]').onclick = () => c.close();
        f.onsubmit = (ev) => {
          ev.preventDefault();
          if (!allowed(c, 'config')) return;
          const g = group(),
            list = Array.from(f.querySelectorAll('[name=recipients]:checked')).map((el) => el.value),
            record = {
              id: editing ? orig.id : id(),
              title: f.elements.title.value.trim(),
              biz: g.biz,
              org: g.org,
              scope: g.scope,
              job: g.job,
              month: c.month,
              status: '草稿',
              version: rev ? (orig.version || 1) + 1 : orig?.version || 1,
              priorId: rev ? orig.id : orig?.priorId,
              people: participants()
                .filter((p) => list.includes(p.id))
                .map(({ id, name }) => ({ id, name })),
              metrics: clone(items),
              received: [],
              updatedAt: now(),
              createdBy: c.role,
            };
          if (!record.title) {
            err('请填写方案名称。');
            return;
          }
          if (!record.people.length) {
            err('请勾选接收人员。');
            return;
          }
          const overlap = c.db.plans.find(
            (p) =>
              p.id !== record.id &&
              p.id !== record.priorId &&
              p.month === record.month &&
              p.status !== '历史版本' &&
              record.people.some((y) => p.people.some((x) => x.id === y.id)),
          );
          if (overlap) {
            err(`部分接收人已有《${overlap.title}》。请编辑已有方案，或调整接收人。`);
            return;
          }
          if (editing) c.db.plans.splice(c.db.plans.indexOf(orig), 1, record);
          else c.db.plans.unshift(record);
          c.save();
          c.close();
          c.refresh();
          c.toast?.('草稿已保存');
        };
      },
    );
  }
  function issue(c, plans) {
    if (!allowed(c, 'release') || !plans.length) return;
    const errors = () =>
      plans.map((p) => {
        if (p.status !== '草稿') return '该方案已下发';
        if (p.people.some((y) => !c.people.some((x) => x.id === y.id && grp(x) === grp(p))))
          return '人员岗位或组织已变更，请重新选择接收人员。';
        if (
          c.db.plans.some(
            (v) =>
              v.month === p.month &&
              v.status === '已下发' &&
              v.id !== p.priorId &&
              v.people.some((x) => p.people.some((y) => x.id === y.id)),
          )
        )
          return '部分人员已有生效方案';
        if (
          p.priorId &&
          c.db.plans.find((v) => v.id === p.priorId)?.people.some((y) => !p.people.some((x) => x.id === y.id))
        )
          return '修订版下发必须覆盖原版全部人员，请补全名单。';
        return checkPlan(p);
      });
    const errs = errors();
    c.modal(
      '方案下发预览',
      `${table(['方案', '组织 / 岗位', '接收人员', '校验'], plans.map((p, i) => row([e(p.title) + ' · V' + e(p.version), e(p.org) + ' / ' + e(p.job), e(p.people.map((x) => x.name).join('、')), e(errs[i] || '可下发')])).join(''))}<p class="pa-note">下发后，接收人员按本版本查看指标和评分口径。修订版将替换原生效版本。</p><p role="alert" class="pa-error"></p><footer class="pa-actions">${button('cancel', '取消', '')}<button data-confirm-release class="pa-primary" ${errs.some(Boolean) ? 'disabled' : ''}>确认下发（${plans.length} 个方案）</button></footer>`,
      (d) => {
        d.querySelector('[data-cancel]').onclick = () => c.close();
        d.querySelector('[data-confirm-release]').onclick = () => {
          const msgs = errors().filter(Boolean);
          if (!allowed(c, 'release') || msgs.length) {
            d.querySelector('[role=alert]').textContent = msgs[0] || '当前不在下发时间内。';
            return;
          }
          for (const p of plans) {
            if (p.priorId) {
              const prior = c.db.plans.find((x) => x.id === p.priorId);
              if (prior) prior.status = '历史版本';
            }
            Object.assign(p, { status: '已下发', releasedAt: now(), releasedBy: c.role, received: [] });
          }
          c.save();
          c.close();
          c.refresh();
          c.toast?.('方案已下发');
        };
      },
    );
  }
  pages.plans = (c) => {
    const s = ui.plans,
      all = c.db.plans.filter(
        (p) => p.month === c.month && (HR(c) || (p.status !== '草稿' && scoped(c, p).length)),
      ),
      filters = filterBox(c, 'plans', [
        ['name', '方案名称'],
        ['biz', '业务线', unique(c.visiblePeople.map((x) => x.biz))],
        ['org', '组织', unique(c.visiblePeople.map((x) => x.org))],
        ['scope', '层级', unique(c.visiblePeople.map((x) => x.scope))],
        ['status', '方案状态', ['草稿', '已下发', '历史版本']],
      ]),
      rows = validRows(all, s),
      nav = pg(c, 'plans', rows.length),
      find = (el) => all.find((p) => p.id === el.value || Object.values(el.dataset).includes(p.id)),
      canRelease = allowed(c, 'release'),
      canEdit = allowed(c, 'config');
    c.on('[data-p-new]', 'click', () => editPlan(c));
    c.on('[data-p-info]', 'click', (_, el) => planDetail(c, find(el)));
    c.on('[data-p-edit]', 'click', (_, el) => editPlan(c, find(el)));
    c.on('[data-p-issue]', 'click', (_, el) => issue(c, [find(el)]));
    c.on('[data-p-batch]', 'click', () => {
      const selected = [...c.root.querySelectorAll('[data-p-check]:checked')].map(find);
      if (!selected.length) {
        c.toast?.('请先勾选需要下发的草稿方案');
        return;
      }
      issue(c, selected);
    });
    c.on('[data-p-all]', 'change', (_, el) =>
      c.root.querySelectorAll('[data-p-check]').forEach((n) => (n.checked = el.checked)),
    );
    c.on('[data-p-export]', 'click', () =>
      c.csv(
        '岗位方案-' + c.month,
        ['月份', '方案', '岗位', '组织', '人数', '状态'],
        rows.map((p) => [p.month, p.title, p.job, p.org, scoped(c, p).length, p.status]),
      ),
    );
    const stats = [
        ['方案数', all.filter((p) => p.status !== '历史版本').length],
        ['草稿', all.filter((p) => p.status === '草稿').length],
        ['已下发', all.filter((p) => p.status === '已下发').length],
        [
          '已覆盖人员',
          unique(all.filter((p) => p.status === '已下发').flatMap((p) => scoped(c, p).map((x) => x.id)))
            .length,
        ],
      ],
      controls =
        (canEdit ? button('p-new', '＋ 新建方案', 'pa-primary') : '') +
        (canRelease ? button('p-batch', '批量下发', '') : '') +
        button('p-export', '导出', '');
    let t = table(
      [
        ...(canRelease ? ['选择'] : []),
        '方案名称',
        '业务线',
        '适用岗位',
        '组织',
        '适用层级',
        '覆盖人数',
        '状态',
        '版本',
        '操作',
      ],
      rows
        .slice((s.page - 1) * 12, s.page * 12)
        .map((p) =>
          row([
            ...(canRelease
              ? [
                  p.status === '草稿'
                    ? `<input type="checkbox" aria-label="选择${e(p.title)}" data-p-check value="${e(p.id)}">`
                    : '',
                ]
              : []),
            e(p.title),
            e(p.biz),
            e(p.job),
            e(p.org),
            e(p.scope),
            String(scoped(c, p).length),
            `<span class="pa-badge ${p.status === '已下发' ? 'ok' : p.status === '草稿' ? 'warn' : ''}">${e(p.status)}</span>`,
            'V' + e(p.version),
            button('p-info', '查看', 'pa-link', p.id) +
              (canEdit && p.status !== '历史版本'
                ? button('p-edit', p.status === '草稿' ? '编辑' : '修订', 'pa-link', p.id)
                : '') +
              (canRelease && p.status === '草稿' ? button('p-issue', '下发', 'pa-link', p.id) : ''),
          ]),
        )
        .join(''),
    );
    if (canRelease)
      t = t.replace('<th>选择</th>', '<th><input data-p-all type="checkbox" aria-label="全选本页草稿"></th>');
    return (
      filters +
      '<div class="pa-stats">' +
      stats.map(([k, v]) => `<div class="pa-stat"><strong>${v}</strong><span>${k}</span></div>`).join('') +
      '</div>' +
      card('岗位方案列表', t + nav, controls)
    );
  };
})();
