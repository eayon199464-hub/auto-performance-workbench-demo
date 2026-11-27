/* Performance results are calculated from an issued plan and period-specific input records. */
(() => {
  'use strict';
  const pages = (window.PerfAdminPages ||= {}),
    base = '基础绩效',
    behavior = '行为评价',
    penalty = '扣罚项',
    floor = '保护机制';
  const e = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const finite = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(+v),
    fmt = (v) => (finite(v) ? String(Number((+v).toFixed(4))) : '—'),
    now = () => new Date().toLocaleString('zh-CN', { hour12: false }),
    owner = (p) => (p.scope === '区域中台' ? '区域总' : '后台业务老师');
  const btn = (a, id, t, off = false) =>
      `<button type="button" class="pa-link" data-pr-${a}="${e(id)}" ${off ? 'disabled' : ''}>${e(t)}</button>`,
    tag = (t) => `<span class="pa-tag">${e(t)}</span>`,
    note = (t) => `<p class="pa-note">${e(t)}</p>`;
  const card = (title, body, action = '') =>
      `<section class="pa-card"><div class="pa-toolbar"><h2 class="pa-title">${e(title)}</h2><div class="pa-actions">${action}</div></div>${body}</section>`,
    table = (hs, rows, empty = '当前筛选下暂无记录') =>
      `<div class="pa-scroll"><table class="pa-table"><thead><tr>${hs.map((x) => `<th scope="col">${e(x)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${hs.length}" class="pa-note">${e(empty)}</td></tr>`}</tbody></table></div>`;
  const field = (t, ctrl) => `<label>${e(t)}${ctrl}</label>`,
    select = (n, vs) =>
      `<select name="${n}">${vs.map((v) => `<option value="${e(v)}">${e(v)}</option>`).join('')}</select>`,
    memo = (n) => `<textarea name="${n}" rows="3" maxlength="1500" required></textarea>`;
  const scoped = (c) => c.visiblePeople.filter((x) => c.role !== '1线员工' || x.id === 'E011'),
    records = (c) =>
      scoped(c).map((p) => {
        const pl = window.PerfPlans.forPerson(c.db, c.month, p.id);
        if (!pl) return { p };
        const key = JSON.stringify([c.month, pl.id, pl.version || 1, p.id]);
        let store = (c.db.resultCases ||= {});
        let r = store[key];
        if (!r) {
          r = store[key] = { state: '待月结', manual: {}, values: {}, changes: [], appeals: [], log: [] };
          if (pl.demo && pl.releasedAt === '演示初始下发') {
            for (const m of pl.metrics)
              if (m.category === base && m.demo) {
                const n = Number(p.id.slice(1));
                if (n % 13 !== 0)
                  r.values[m.id] =
                    n % 19 === 0
                      ? 0
                      : Math.round((+m.target || 50) * (n === 11 ? 1.22 : 0.94 + (n % 8) * 0.05));
              }
            if (p.id === 'E011') {
              for (const m of pl.metrics) {
                if (m.category === behavior)
                  r.manual[m.id] = {
                    score: +m.manualScore.max,
                    why: '示例：协作与服务记录完整',
                    at: '演示初始确认',
                    by: owner(p),
                  };
                if (m.category === penalty || m.category === floor)
                  r.manual[m.id] = {
                    apply: false,
                    why: '示例：本期无触发记录',
                    at: '演示初始确认',
                    by: owner(p),
                  };
              }
              if (calc({ p, pl, r }).value != null) {
                r.state = '已发布';
                r.published = '演示初始发布';
                r.log.push({ at: '演示初始发布', role: '后台HRBP', text: '本期示例核对并发布' });
              }
            }
          }
        }
        return { p, pl, r };
      });
  const byId = (c, id) => records(c).find((x) => x.p.id === id && x.pl),
    locked = (x) => x.r.state !== '待月结',
    pending = (x) =>
      x.r.changes.some((z) => ['待VHOME回执', '待大数据回传'].includes(z.state)) ||
      x.r.appeals.some((z) => z.state === '待处理');
  function money(m) {
    return (
      m.category === penalty && /金额|元/.test([m.adjustUnit, m.penaltyUnit, m.unit, m.adjustType].join(' '))
    );
  }
  function calc(x) {
    if (!x.pl) return { value: null, reason: '未下发方案', ds: [] };
    let total = 0,
      weight = 0,
      minimum = null,
      debit = 0,
      amount = 0,
      reason = '';
    const ds = x.pl.metrics.map((m) => {
      const v = x.r.values[m.id],
        t = x.r.manual[m.id];
      let score = null,
        part = null,
        msg = '',
        input = null;
      try {
        if (m.category === base || m.category === behavior) {
          if (!finite(m.weight) || +m.weight <= 0) throw Error('权重异常');
          weight += +m.weight;
          if (m.category === base) {
            input = v;
            if (!finite(v)) throw Error('待大数据提供业务值');
            if (m.algorithm === '达成率' && !(+m.target > 0)) throw Error('目标值无效');
            if (!['达成率', '分段累进', '全量阶梯', '区间取值'].includes(m.algorithm))
              throw Error('计分口径待配置');
            score = window.PFCalc.scoreFromActual(m, +v) / 100;
          } else {
            input = t?.score;
            if (!t || !finite(t.score)) throw Error('待确认评价');
            if (!finite(m.manualScore?.max) || +m.manualScore.max <= 0) throw Error('评分范围待配置');
            score = +t.score / +m.manualScore.max;
          }
          part = (score * +m.weight) / 100;
          if (!Number.isFinite(part)) throw Error('计分口径异常');
          total += part;
          msg = '已计算';
        } else if (m.category === penalty || m.category === floor) {
          if (!t) throw Error('待确认是否适用');
          input = t.apply ? '适用' : '不适用';
          if (t.apply) {
            if (!finite(m.adjustValue) || +m.adjustValue < 0) throw Error('调整口径待配置');
            if (m.category === floor) {
              minimum = Math.max(minimum ?? -Infinity, +m.adjustValue);
              msg = '保底 ' + fmt(m.adjustValue);
            } else if (money(m)) {
              amount += +m.adjustValue;
              msg = '单列 ' + fmt(m.adjustValue) + ' 元';
            } else {
              if (m.unit !== '系数') throw Error('扣罚单位待配置');
              debit += +m.adjustValue;
              msg = '减 ' + fmt(m.adjustValue);
            }
          } else msg = '已确认不适用';
        } else throw Error('类别待配置');
      } catch (err) {
        msg = err.message;
        reason ||= msg;
      }
      return { m, input, score, part, msg, t };
    });
    if (Math.abs(weight - 100) > 0.000001) reason ||= '总权重非 100%';
    if (minimum != null && debit > 0) reason ||= '保护与扣罚同时触发，执行顺序待确认';
    return {
      value: reason ? null : Math.max(total, minimum ?? -Infinity) - debit,
      reason,
      total,
      debit,
      minimum,
      amount,
      ds,
    };
  }
  const active = (c, stage) => c.isOpen(stage),
    save = (c, x, msg) => {
      x.r.log.unshift({ at: now(), role: c.role, text: msg });
      c.save();
      c.close();
      c.refresh();
    },
    canFix = (c) => ['后台HRBP', '后台业务老师', '区域总', '1+N店长', '小区'].includes(c.role),
    canTask = (c, x, m) =>
      (c.role === owner(x.p) && [behavior, penalty].includes(m.category)) ||
      (m.category === floor && c.role === '后台HRBP');
  function form(c, title, body, submit, fn) {
    c.modal(
      title,
      `<form><div class="pa-form-grid">${body}</div><p role="alert" class="pa-error"></p><footer class="pa-actions"><button type="button" data-cancel>取消</button><button class="pa-primary" type="submit">${e(submit)}</button></footer></form>`,
      (d) => {
        d.querySelector('[data-cancel]').onclick = c.close;
        d.querySelector('form').onsubmit = (ev) => {
          ev.preventDefault();
          const data = Object.fromEntries(new FormData(ev.currentTarget)),
            error = fn(data);
          if (error) d.querySelector('[role=alert]').textContent = error;
        };
      },
    );
  }
  const lookup = (c, id, i) => {
    const x = byId(c, id);
    return x && { x, m: x.pl.metrics[i] };
  };
  function manual(c, id, i) {
    const q = lookup(c, id, i);
    if (!q?.m) return;
    const { x, m } = q;
    const permitted = () => canTask(c, x, m) && !locked(x) && active(c, 'evaluation');
    if (!permitted()) return;
    const scored = m.category === behavior,
      t = x.r.manual[m.id],
      v = m.manualScore || {};
    form(
      c,
      `${m.name} · ${x.p.name}`,
      note(
        scored
          ? `${v.criteria || '评分标准待配置'}（${fmt(v.min)} 至 ${fmt(v.max)} 分）`
          : `${m.condition || '触发条件待配置'}；${m.category === floor ? '保底系数' : money(m) ? '扣罚金额（元）' : '扣减系数'}：${fmt(m.adjustValue)}`,
      ) +
        (scored
          ? field(
              '评价分值',
              `<input name="score" type="number" step="any" min="${e(v.min)}" max="${e(v.max)}" value="${e(t?.score ?? '')}" required>`,
            )
          : field(
              '条件是否触发',
              `<select name="apply" required><option value="">请选择</option><option value="否" ${t?.apply === false ? 'selected' : ''}>否，不适用</option><option value="是" ${t?.apply ? 'selected' : ''}>是，按方案执行</option></select>`,
            )) +
        field(
          '确认依据',
          `<textarea name="why" rows="3" maxlength="1500" required>${e(t?.why || '')}</textarea>`,
        ),
      '确认并保存',
      (f) => {
        if (!permitted()) return '当前无法办理';
        if (!f.why.trim()) return '请填写确认依据';
        if (
          scored &&
          (!finite(f.score) || !finite(v.min) || !finite(v.max) || +f.score < +v.min || +f.score > +v.max)
        )
          return '评分超出本期方案范围';
        x.r.manual[m.id] = {
          score: scored ? +f.score : null,
          apply: !scored && f.apply === '是',
          why: f.why.trim(),
          by: c.role,
          at: now(),
        };
        save(c, x, '确认' + m.name + '：' + (scored ? f.score + ' 分' : f.apply) + '；' + f.why.trim());
      },
    );
  }
  function staffing(c) {
    const p = scoped(c).find((v) => v.id === 'E032' && v.biz === '交付');
    if (!p || c.month !== '2026-11') return null;
    const db = (c.db.staffingInputs ||= {});
    const r = (db[c.month] ||= {
      state: '待月结',
      values: { 'b-staff': 3 },
      changes: [],
      appeals: [],
      log: [],
    });
    return { p, r, m: { id: 'b-staff', name: 'B 岗人员数', category: base } };
  }
  function staffingPanel(c, ids) {
    const x = staffing(c);
    if (!x || !ids.includes(x.p.id)) return '';
    c.on('[data-pr-staff-req]', 'click', () => request(c, 'E032', -1));
    c.on('[data-pr-staff-back]', 'click', (_, el) => receipt(c, 'E032', +el.dataset.prStaffBack, true));
    const waiting = x.r.changes.some((z) => ['待VHOME回执', '待大数据回传'].includes(z.state));
    return card(
      '交付服务总监 · 管理人数',
      table(
        ['人员', '岗位', '业务输入', '人数', '操作'],
        [
          [
            e(x.p.name),
            e(x.p.job),
            'B 岗人员数',
            fmt(x.r.values['b-staff']),
            canFix(c) ? btn('staff-req', '', '登记 VHOME 更正', waiting || !active(c, 'correction')) : '—',
          ],
        ],
      ) +
        note('演示原始业务值为 3 人，单独跟踪，不直接计入绩效系数。') +
        (x.r.changes.length
          ? table(
              ['VHOME 单号', '原值 → 申请值', '状态', '回执 / 批次', '操作'],
              x.r.changes.map((z, i) => [
                e(z.ref),
                fmt(z.old) + ' → ' + fmt(z.value),
                e(z.state),
                e([z.receipt, z.batch].filter(Boolean).join(' / ') || '—'),
                c.role === '后台HRBP' && ['待VHOME回执', '待大数据回传'].includes(z.state)
                  ? btn('staff-back', i, z.state === '待VHOME回执' ? '模拟 VHOME 回执' : '模拟大数据回传')
                  : '—',
              ]),
            )
          : ''),
    );
  }
  function request(c, id, i) {
    const input = i === -1 && id === 'E032' ? staffing(c) : null;
    const q = input ? { x: input, m: input.m } : lookup(c, id, i);
    if (!q?.m) return;
    const { x, m } = q;
    const permitted = () =>
      canFix(c) &&
      m.category === base &&
      x.r.state !== '已归档' &&
      active(c, 'correction') &&
      !x.r.changes.some((z) => z.metric === m.id && ['待VHOME回执', '待大数据回传'].includes(z.state));
    if (!permitted()) return;
    form(
      c,
      '登记 VHOME 更正申请',
      note('本地演示。申请不会发送至 VHOME。业务值在收到通过回执和大数据更正值后更新。') +
        note(`${x.p.name} · ${m.name} · 当前业务值 ${fmt(x.r.values[m.id])}`) +
        field('VHOME 流程单号', '<input name="ref" required maxlength="100">') +
        field('申请更正值', '<input name="value" type="number" step="any" required>') +
        field('更正原因', memo('why')),
      '登记申请',
      (f) => {
        if (!permitted()) return '当前无法申请';
        if (!f.ref.trim() || !f.why.trim() || !finite(f.value)) return '请填写完整申请信息';
        if (input && (!Number.isSafeInteger(+f.value) || +f.value < 0)) return '管理人数须为非负整数';
        if (x.r.changes.some((z) => z.ref === f.ref.trim())) return '本期已有该流程单号';
        if (finite(x.r.values[m.id]) && +x.r.values[m.id] === +f.value) return '更正值与当前业务值相同';
        x.r.changes.unshift({
          metric: m.id,
          ref: f.ref.trim(),
          old: x.r.values[m.id] ?? null,
          value: +f.value,
          why: f.why.trim(),
          state: '待VHOME回执',
          at: now(),
        });
        save(c, x, '登记 VHOME 更正申请 ' + f.ref.trim());
      },
    );
  }
  function receipt(c, id, i, staff = false) {
    const x = staff ? staffing(c) : byId(c, id),
      z = x?.r.changes[i];
    if (!z || c.role !== '后台HRBP' || x.r.state === '已归档') return;
    const initial = z.state === '待VHOME回执';
    if (!initial && z.state !== '待大数据回传') return;
    form(
      c,
      initial ? '模拟接收 VHOME 回执' : '模拟接收大数据更正值',
      note('仅演示外部回传，不代表真实系统已审批或同步。') +
        note(z.ref + ' · 申请值 ' + fmt(z.value)) +
        (initial
          ? field(
              '外部审批结果',
              '<select required name="result"><option value="">请选择回执结果</option><option>通过</option><option>驳回</option></select>',
            )
          : field('回传业务值', `<input type="number" step="any" required name="actual">`)) +
        field(
          initial ? '外部审批回执编号' : '大数据回传批次号',
          '<input required name="trace" maxlength="100">',
        ),
      '登记回传',
      (f) => {
        if (!f.trace.trim()) return '请填写回传凭证';
        if (initial) {
          if (!['通过', '驳回'].includes(f.result) || z.state !== '待VHOME回执') return '请核对审批结果';
          z.receipt = f.trace.trim();
          z.state = f.result === '通过' ? '待大数据回传' : 'VHOME已驳回';
        } else {
          if (z.state !== '待大数据回传' || !z.receipt || !finite(f.actual) || +f.actual !== z.value)
            return '回传值须与已批准的更正值一致';
          x.r.values[z.metric] = +f.actual;
          z.batch = f.trace.trim();
          z.state = '已同步';
          x.r.state = '待月结';
          delete x.r.confirmed;
          delete x.r.published;
        }
        save(c, x, z.ref + ' · ' + z.state + ' · ' + f.trace.trim());
      },
    );
  }
  const filterState = new Map();
  function filtered(c, page, input, extra = []) {
    const key = [page, c.role, c.month].join('|'),
      fields = [
        ['biz', '业务线', (x) => x.p.biz],
        ['org', '区域', (x) => x.p.org],
        ['scope', '组织层级', (x) => x.p.scope],
        ...extra,
      ],
      current = filterState.get(key) || {};
    c.on('[data-pr-search]', 'submit', (ev, el) => {
      ev.preventDefault();
      filterState.set(key, Object.fromEntries(new FormData(el)));
      c.refresh();
    });
    c.on('[data-pr-reset]', 'click', () => {
      filterState.delete(key);
      c.refresh();
    });
    const box = card(
      '筛选',
      `<form data-pr-search class="pa-filters">${fields.map(([k, title, get]) => field(title, `<select name="${k}"><option value="">全部</option>${[...new Set(input.map(get).filter(Boolean))].map((v) => `<option value="${e(v)}" ${current[k] === v ? 'selected' : ''}>${e(v)}</option>`).join('')}</select>`)).join('')}<div class="pa-actions"><button type="button" data-pr-reset>重置</button><button class="pa-primary">查询</button></div></form>`,
    );
    return {
      box,
      data: input.filter((x) => fields.every(([k, , get]) => !current[k] || current[k] === get(x))),
    };
  }
  const stages = {
    settlement: ['待月结', '已核对', '月结核对'],
    publish: ['已核对', '已发布', '发布结果'],
    archive: ['已发布', '已归档', '归档结果'],
  };
  function stageAction(c, x, k) {
    const [from, to, label] = stages[k];
    const eligible = () =>
      c.role === '后台HRBP' &&
      active(c, k) &&
      x.r.state === from &&
      !pending(x) &&
      calc(x).value != null &&
      (k !== 'archive' || x.r.confirmed || c.hasEnded?.('appeal'));
    if (!eligible()) return;
    form(
      c,
      label,
      note(`${x.p.name} · ${x.pl.title} · 最终绩效系数 ${fmt(calc(x).value)}。`) +
        (k === 'archive' ? note('归档后锁定本期明细。') : ''),
      label,
      () => {
        if (!eligible()) return '当前状态不允许此操作';
        x.r.state = to;
        if (k === 'publish') x.r.published = now();
        save(c, x, label);
      },
    );
  }
  function appeal(c, x) {
    const mine = () =>
      c.role === '1线员工' &&
      x.p.id === 'E011' &&
      x.r.state === '已发布' &&
      !x.r.confirmed &&
      active(c, 'appeal') &&
      !x.r.appeals.some((a) => a.state === '待处理');
    if (!mine()) return;
    form(
      c,
      '提交本人绩效申诉',
      field(
        '涉及项目',
        select(
          'item',
          x.pl.metrics.map((m) => m.name),
        ),
      ) +
        field('异议及依据', memo('why')) +
        note('业务值异议由经办人登记 VHOME 更正；确认回传前原业务值保持不变。'),
      '提交申诉',
      (f) => {
        if (!mine() || !f.why.trim()) return '请核对状态及申诉依据';
        x.r.appeals.unshift({ item: f.item, why: f.why.trim(), at: now(), state: '待处理' });
        save(c, x, '员工提交申诉：' + f.item);
      },
    );
  }
  function answer(c, x, i) {
    const a = x.r.appeals[i];
    if (!a || a.state !== '待处理' || c.role !== owner(x.p) || !active(c, 'appealReview')) return;
    form(
      c,
      '处理绩效申诉',
      note(a.item + '：' + a.why) +
        field('处理方式', select('kind', ['说明并反馈', '退回重新核对'])) +
        field('处理意见', memo('why')),
      '保存并反馈',
      (f) => {
        if (a.state !== '待处理' || !active(c, 'appealReview') || !f.why.trim()) return '请填写处理意见';
        a.state = '已反馈';
        a.reply = f.why.trim();
        a.by = c.role;
        a.done = now();
        if (f.kind === '退回重新核对') {
          x.r.state = '待月结';
          delete x.r.confirmed;
          delete x.r.published;
        }
        save(c, x, '申诉处理：' + f.kind + '；' + a.reply);
      },
    );
  }
  const timeline = (x) =>
    x.r.log.length
      ? table(
          ['操作时间', '办理角色', '操作记录'],
          x.r.log.map((z) => [e(z.at), e(z.role), e(z.text)]),
        )
      : note('暂无办理记录');
  function metricTable(c, x, withFix = false) {
    return table(
      [
        '考核项目',
        '分类',
        '权重',
        '计分口径',
        '实际值 / 确认',
        '加权系数',
        '状态',
        '确认依据',
        ...(withFix ? ['操作'] : []),
      ],
      calc(x).ds.map(({ m, input, part, msg }, i) => [
        e(m.name),
        e(m.category),
        [base, behavior].includes(m.category) ? fmt(m.weight) + '%' : '—',
        e(
          m.category === base
            ? m.algorithm === '达成率'
              ? '达成率 · 目标 ' + fmt(m.target)
              : m.algorithm + ' · ' + (m.bands || '')
            : m.category === behavior
              ? `人工评分 · 满分 ${fmt(m.manualScore?.max)}`
              : m.condition,
        ),
        e(input ?? '—'),
        fmt(part),
        e(msg),
        e(x.r.manual[m.id] ? [x.r.manual[m.id].why, x.r.manual[m.id].by].filter(Boolean).join(' · ') : '—'),
        ...(withFix
          ? [
              m.category === base && canFix(c) && x.r.state !== '已归档'
                ? !finite(x.r.values[m.id])
                  ? c.role === '后台HRBP'
                    ? btn('first', i, '首次取数', !active(c, 'data'))
                    : '—'
                  : btn(
                      'req',
                      i,
                      '登记 VHOME 更正',
                      !active(c, 'correction') ||
                        x.r.changes.some(
                          (z) => z.metric === m.id && ['待VHOME回执', '待大数据回传'].includes(z.state),
                        ),
                    )
                : '—',
            ]
          : []),
      ]),
    );
  }
  function detail(c, id, mode) {
    const x = byId(c, id);
    if (!x) return;
    const a = calc(x),
      s = x.r.state,
      own = mode === 'mine' && c.role === '1线员工',
      show = !own || ['已发布', '已归档'].includes(s),
      manage = mode === 'results' && c.role === '后台HRBP';
    let content = note(`${c.month} · ${x.p.org} · ${x.p.job} · ${x.pl.title}`);
    if (show) {
      content +=
        `<div class="pa-stats"><div class="pa-stat"><strong>${fmt(a.value)}</strong><span>最终绩效系数</span></div><div class="pa-stat"><strong>${fmt(a.amount)}</strong><span>单列扣罚金额（元）</span></div></div>` +
        note(
          a.reason ||
            `基础绩效与行为评价加权 ${fmt(a.total)}${a.minimum != null ? '，保护下限 ' + fmt(a.minimum) : ''}，扣减系数 ${fmt(a.debit)}。`,
        ) +
        metricTable(c, x, mode === 'tracking');
    } else content += note('本期结果尚未发布。');
    if (show && x.r.changes.length) {
      content +=
        '<h3>业务值更正记录</h3>' +
        table(
          ['流程单号', '业务项', '原值 → 申请值', '状态', '回执 / 批次', '操作'],
          x.r.changes.map((z, i) => [
            e(z.ref),
            e(
              x.pl.metrics.find((m) => m.id === z.metric)?.name ||
                (z.metric === 'b-staff' ? 'B 岗人员数' : z.metric),
            ),
            fmt(z.old) + ' → ' + fmt(z.value),
            e(z.state),
            e([z.receipt, z.batch].filter(Boolean).join(' / ') || '—'),
            mode === 'tracking' && c.role === '后台HRBP' && ['待VHOME回执', '待大数据回传'].includes(z.state)
              ? btn('receipt', i, z.state === '待VHOME回执' ? '模拟 VHOME 回执' : '模拟大数据回传')
              : '—',
          ]),
        );
    }
    if (x.r.appeals.length)
      content +=
        '<h3>申诉与反馈</h3>' +
        table(
          ['绩效项目', '申诉依据', '状态', '处理意见', '操作'],
          x.r.appeals.map((z, i) => [
            e(z.item),
            e(z.why),
            e(z.state),
            e(z.reply || '—'),
            !own && c.role === owner(x.p) && z.state === '待处理'
              ? btn('answer', i, '处理申诉', !active(c, 'appealReview'))
              : '—',
          ]),
        );
    if (show && !own) content += '<h3>操作记录</h3>' + timeline(x);
    if (manage && s !== '已归档') {
      const k = Object.keys(stages).find((k) => stages[k][0] === s);
      if (k) {
        content +=
          note(
            pending(x)
              ? '尚有未结束的申诉或业务值更正。'
              : k === 'archive' && !x.r.confirmed && !c.hasEnded?.('appeal')
                ? '待员工确认，或已配置的申诉期结束且无未决事项后归档。'
                : '办理时间：' + c.windowText(k),
          ) +
          btn(
            'step',
            k,
            stages[k][2],
            !active(c, k) ||
              a.value == null ||
              pending(x) ||
              (k === 'archive' && !x.r.confirmed && !c.hasEnded?.('appeal')),
          );
      }
    }
    c.modal('绩效明细 · ' + x.p.name, content, (d) => {
      const bind = (act, fn) =>
        d
          .querySelectorAll('[data-pr-' + act + ']')
          .forEach((el) => (el.onclick = () => fn(el.getAttribute('data-pr-' + act))));
      bind('first', (i) => initial(c, id, +i));
      bind('req', (i) => request(c, id, +i));
      bind('receipt', (i) => receipt(c, id, +i));
      bind('step', (k) => stageAction(c, x, k));
      bind('answer', (i) => answer(c, x, +i));
    });
  }
  function bindDetails(c, mode) {
    c.on('[data-pr-detail]', 'click', (_, el) => detail(c, el.dataset.prDetail, mode));
  }
  function exports(c, name, cols, rows) {
    c.on('[data-pr-export]', 'click', () => c.csv(c.month + '-' + name, cols, rows));
    return btn('export', '', '导出当前列表');
  }
  function tracking(c) {
    const raw = records(c).map((x) => ({ ...x, status: x.pl ? calc(x).reason || '已取数' : '未下发方案' })),
      f = filtered(c, 'tracking', raw, [['status', '办理状态', (x) => x.status]]);
    bindDetails(c, 'tracking');
    const hs = ['员工', '业务线', '区域 / 门店', '岗位', '已取数 / 基础项', '当前状态'],
      rows = f.data.map((x) => {
        const a = calc(x);
        return [
          x.p.name,
          x.p.biz,
          x.p.store || x.p.org,
          x.p.job,
          x.pl
            ? a.ds.filter((d) => d.m.category === base && finite(d.input)).length +
              ' / ' +
              a.ds.filter((d) => d.m.category === base).length
            : '—',
          x.status,
        ];
      });
    return (
      f.box +
      card(
        '绩效过程跟踪',
        note('业务值来自大数据。缺数保留为空，实绩为零时显示 0；更正通过 VHOME 流程办理。') +
          table(
            [...hs, '操作'],
            rows.map((row, i) => [
              ...row.map(e),
              f.data[i].pl ? btn('detail', f.data[i].p.id, '查看明细') : '—',
            ]),
          ),
        exports(c, '绩效过程跟踪', hs, rows),
      ) +
      staffingPanel(
        c,
        f.data.map((x) => x.p.id),
      )
    );
  }
  function tasks(c) {
    let rows = records(c)
      .filter((x) => x.pl)
      .flatMap((x) =>
        x.pl.metrics
          .map((m, i) => ({ ...x, m, i }))
          .filter(
            (y) =>
              [behavior, penalty, floor].includes(y.m.category) &&
              (c.role === '后台HRBP' || canTask(c, x, y.m)),
          ),
      );
    const f = filtered(c, 'tasks', rows, [
      ['cat', '项目分类', (x) => x.m.category],
      ['state', '办理状态', (x) => (x.r.manual[x.m.id] ? '已确认' : '待确认')],
    ]);
    c.on('[data-pr-handle]', 'click', (_, el) => {
      const [id, i] = JSON.parse(el.dataset.prHandle);
      manual(c, id, i);
    });
    const hs = ['考核对象', '组织', '项目', '类别', '确认人', '确认结果', '状态'],
      data = f.data.map((x) => {
        const t = x.r.manual[x.m.id];
        return [
          x.p.name,
          x.p.store || x.p.org,
          x.m.name,
          x.m.category,
          x.m.category === floor ? '后台HRBP' : owner(x.p),
          !t ? '—' : x.m.category === behavior ? fmt(t.score) + ' 分' : t.apply ? '适用' : '不适用',
          t ? '已确认' : '待确认',
        ];
      });
    return (
      f.box +
      card(
        '综合评价与扣罚',
        note('1+N 组织由后台业务老师确认，区域绩效由区域总确认。评价窗口：' + c.windowText('evaluation')) +
          table(
            [...hs, '操作'],
            data.map((row, i) => {
              const x = f.data[i];
              return [
                ...row.map(e),
                canTask(c, x, x.m) && !locked(x)
                  ? btn(
                      'handle',
                      JSON.stringify([x.p.id, x.i]),
                      x.r.manual[x.m.id] ? '修改确认' : '办理',
                      !active(c, 'evaluation'),
                    )
                  : '—',
              ];
            }),
          ),
        exports(c, '综合评价与扣罚', hs, data),
      )
    );
  }
  function initial(c, id, i) {
    const q = lookup(c, id, i);
    if (!q?.m) return;
    const { x, m } = q;
    const permitted = () =>
      c.role === '后台HRBP' &&
      m.category === base &&
      !finite(x.r.values[m.id]) &&
      !locked(x) &&
      active(c, 'data');
    if (!permitted()) return;
    form(
      c,
      '模拟首次接收大数据业务值',
      note(`${x.p.name} · ${m.name}。仅演示首次入库，已有值须经 VHOME 更正。`) +
        field('业务值', '<input type="number" step="any" required name="v">') +
        field('来源批次号', '<input required name="batch" maxlength="100">'),
      '接收业务值',
      (f) => {
        if (!permitted() || !finite(f.v) || !f.batch.trim()) return '请核对数据、批次及取数时间';
        x.r.values[m.id] = +f.v;
        save(c, x, '首次接收大数据业务值：' + m.name + ' = ' + f.v + '，批次 ' + f.batch.trim());
      },
    );
  }
  function results(c) {
    const raw = records(c)
        .filter((x) => x.pl)
        .map((x) => ({ ...x, status: x.r.state })),
      f = filtered(c, 'results', raw, [['state', '结果状态', (x) => x.status]]),
      groups = new Map();
    for (const x of f.data) {
      const org = x.p.scope === '区域中台' ? x.p.org : x.p.store;
      if (!org) continue;
      const key = x.p.scope + '|' + org;
      if (!groups.has(key)) groups.set(key, { scope: x.p.scope, title: org, xs: [] });
      groups.get(key).xs.push(x);
    }
    const gs = [...groups.values()];
    c.on('[data-pr-org]', 'click', (_, el) => {
      const g = gs[+el.dataset.prOrg];
      if (!g) return;
      c.modal(
        '人员结果 · ' + g.title,
        table(
          ['姓名', '岗位', '绩效系数', '扣罚金额（元）', '办理状态', '员工确认', '操作'],
          g.xs.map((x) => {
            const a = calc(x);
            return [
              e(x.p.name),
              e(x.p.job),
              fmt(a.value),
              fmt(a.amount),
              e(x.r.state),
              e(x.r.confirmed ? '已确认' : '—'),
              btn('person', x.p.id, '查看明细'),
            ];
          }),
        ),
        (d) =>
          d
            .querySelectorAll('[data-pr-person]')
            .forEach((el) => (el.onclick = () => detail(c, el.dataset.prPerson, 'results'))),
      );
    });
    const hs = [
        '结果层级',
        '区域 / 门店',
        '考核人数',
        '待月结',
        '已核对',
        '已发布',
        '已归档',
        '已核对人员系数区间',
        '已核对扣罚合计（元）',
      ],
      rows = gs.map((g) => {
        const done = g.xs
          .filter((x) => x.r.state !== '待月结')
          .map(calc)
          .filter((v) => v.value != null);
        return [
          g.scope === '区域中台' ? '区域' : '门店',
          g.title,
          g.xs.length,
          ...['待月结', '已核对', '已发布', '已归档'].map(
            (st) => g.xs.filter((x) => x.r.state === st).length,
          ),
          done.length
            ? fmt(Math.min(...done.map((v) => v.value))) + ' ～ ' + fmt(Math.max(...done.map((v) => v.value)))
            : '—',
          done.length ? fmt(done.reduce((v, d) => v + d.amount, 0)) : '—',
        ];
      });
    const out = f.data.map((x) => {
      const a = calc(x);
      return [
        c.month,
        x.p.scope === '区域中台' ? '区域' : '门店',
        x.p.store || x.p.org,
        x.p.id,
        x.p.name,
        x.p.job,
        a.value == null ? '' : fmt(a.value),
        fmt(a.amount),
        x.r.state,
      ];
    });
    return (
      f.box +
      card(
        '区域及门店绩效结果',
        note('系数区间和扣罚合计仅统计已核对、已发布或已归档人员。') +
          table(
            [...hs, '操作'],
            rows.map((row, i) => [...row.map(e), btn('org', i, '查看人员结果')]),
          ),
        exports(
          c,
          '绩效结果',
          [
            '考核月份',
            '层级',
            '区域 / 门店',
            '工号',
            '姓名',
            '岗位',
            '最终绩效系数',
            '扣罚金额（元）',
            '办理状态',
          ],
          out,
        ),
      )
    );
  }
  function mine(c) {
    if (c.role !== '1线员工') return card('我的绩效', note('请切换至员工身份。'));
    const x = byId(c, 'E011');
    if (!x) return card('我的绩效', note('本期尚未收到岗位方案。'));
    const { pl, r } = x,
      received = (pl.received || []).includes(x.p.id),
      show = ['已发布', '已归档'].includes(r.state);
    c.on('[data-pr-plan-receive]', 'click', () => {
      if (c.role !== '1线员工' || received || !active(c, 'receipt')) return;
      (pl.received ||= []).push(x.p.id);
      save(c, x, '本人确认岗位方案');
    });
    c.on('[data-pr-appeal]', 'click', () => appeal(c, x));
    c.on('[data-pr-accept]', 'click', () => {
      const ready = () =>
        c.role === '1线员工' &&
        r.state === '已发布' &&
        !pending(x) &&
        !r.confirmed &&
        active(c, 'resultConfirm');
      if (!ready()) return;
      form(
        c,
        '确认本人结果',
        note(`请核对 ${c.month} 绩效系数 ${fmt(calc(x).value)} 及各项明细。确认后本期结果可办理归档。`),
        '确认无异议',
        () => {
          if (!ready()) return '当前不能确认';
          r.confirmed = now();
          save(c, x, '本人确认绩效结果');
        },
      );
    });
    bindDetails(c, 'mine');
    return (
      card(
        '我的岗位方案',
        note(`${x.p.name} · ${x.p.job} · ${x.p.store || x.p.org}`) +
          `<h3>${e(pl.title)}</h3>` +
          table(
            ['考核项目', '类别', '权重'],
            pl.metrics.map((m) => [
              e(m.name),
              e(m.category),
              [base, behavior].includes(m.category) ? fmt(m.weight) + '%' : '—',
            ]),
          ) +
          `<div class="pa-actions">${received ? tag('本人已确认方案') : btn('plan-receive', '', '确认收到方案', !active(c, 'receipt'))}</div>`,
      ) +
      card(
        '我的绩效结果',
        show
          ? `<div class="pa-stats"><div class="pa-stat"><strong>${fmt(calc(x).value)}</strong><span>最终绩效系数</span></div><div class="pa-stat"><strong>${fmt(calc(x).amount)}</strong><span>扣罚金额（元）</span></div></div>` +
              note(r.confirmed ? '本人已确认 · ' + r.confirmed : '请核对业务值、评价分值和扣罚依据。') +
              `<div class="pa-actions">${btn('detail', x.p.id, '查看绩效明细')}${r.state === '已发布' && !r.confirmed ? btn('appeal', '', '提交申诉', !active(c, 'appeal') || r.appeals.some((z) => z.state === '待处理')) + btn('accept', '', '确认结果', !active(c, 'resultConfirm') || pending(x)) : ''}</div>`
          : note('本期绩效结果尚未发布。'),
      ) +
      (r.appeals.length
        ? card(
            '我的申诉记录',
            table(
              ['申诉项目', '状态', '处理反馈'],
              r.appeals.map((z) => [e(z.item), tag(z.state), e(z.reply || '待处理')]),
            ),
          )
        : '')
    );
  }
  Object.assign(pages, { tracking, tasks, results, mine });
  window.PerfResultsAdmin = {
    calculate: calc,
    counts: (c) => {
      const xs = records(c).filter((x) => x.pl);
      return {
        pendingTasks: xs.reduce(
          (n, x) => n + x.pl.metrics.filter((m) => canTask(c, x, m) && !x.r.manual[m.id]).length,
          0,
        ),
        released: xs.filter((x) => ['已发布', '已归档'].includes(x.r.state)).length,
      };
    },
  };
})();
