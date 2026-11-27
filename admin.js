/* Personnel performance back office. Shared shell, role scopes and period settings. */
(() => {
  'use strict';
  const pages = (window.PerfAdminPages ||= {});
  const roles = ['后台HRBP', '后台业务老师', '区域总', '1+N店长', '小区', '1线员工'];
  const menus = {
    home: '工作台',
    library: '指标库',
    plans: '岗位方案与下发',
    tracking: '绩效过程跟踪',
    tasks: '综合评价与扣罚',
    results: '绩效结果管理',
    calendar: '考核时间配置',
    mine: '我的绩效',
  };
  const scopes = {
    后台HRBP: ['home', 'library', 'plans', 'tracking', 'tasks', 'results', 'calendar'],
    后台业务老师: ['home', 'tracking', 'tasks', 'results'],
    区域总: ['home', 'plans', 'tracking', 'tasks', 'results'],
    '1+N店长': ['home', 'plans', 'tracking', 'results'],
    小区: ['home', 'tracking', 'results'],
    '1线员工': ['home', 'mine'],
  };
  const previousRoles = {
    '总部 HRBP': '后台HRBP',
    方案配置人: '后台HRBP',
    业务老师: '后台业务老师',
    '一线销售 · 沈安': '1线员工',
    区域总: '区域总',
    '1+N店长': '1+N店长',
  };
  const aliases = {
    jobs: 'plans',
    config: 'plans',
    release: 'plans',
    overview: 'home',
    manual: 'tasks',
    settlement: 'results',
  };
  const stages = {
    config: '方案配置',
    release: '方案下发',
    receipt: '员工确认方案',
    data: '业务值取数',
    evaluation: '综合评价与扣罚确认',
    appeal: '员工申诉',
    appealReview: '申诉处理',
    resultConfirm: '员工确认结果',
    correction: 'VHOME 更正申请',
    settlement: '月结核对',
    publish: '结果发布',
    archive: '月结归档',
  };
  const storageKey = 'performance.admin.v1';
  const session = {
    role: '',
    month: '2026-11',
    tabRole: '',
    tabs: [],
    view: 'home',
    root: null,
    options: null,
    dialog: null,
    revision: '',
    db: null,
  };
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const permitted = (page) => scopes[session.role]?.includes(page);
  const pathname = (page) => (page === 'home' ? 'home' : 'performance/' + (page === 'plans' ? 'jobs' : page));
  function readSession(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }
  function setSession(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  }
  function load() {
    let latest;
    try {
      latest = localStorage.getItem(storageKey) || '';
    } catch {
      latest = '';
    }
    if (session.db && session.revision === latest) return;
    try {
      session.db = latest ? JSON.parse(latest) : {};
    } catch {
      session.db = {};
    }
    if (!session.db || typeof session.db !== 'object' || Array.isArray(session.db)) session.db = {};
    session.db.periods ||= {};
    session.revision = latest;
  }
  function save() {
    const json = JSON.stringify(session.db);
    try {
      const latest = localStorage.getItem(storageKey) || '';
      if (latest !== session.revision) {
        load();
        refresh();
        toast('其他窗口已更新本期数据，请核对后重新办理。');
        throw new Error('本期数据已更新');
      }
      if (json !== latest) localStorage.setItem(storageKey, json);
      session.revision = json;
    } catch (error) {
      if (error.message === '本期数据已更新') throw error;
      toast('此浏览器无法保存，当前修改仅在本次打开期间有效。');
    }
  }
  function toast(message) {
    if (!session.root) return;
    session.root.querySelector('.pa-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'pa-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    session.root.append(el);
    setTimeout(() => el.remove(), 4200);
  }
  function roster(month) {
    return window.pfRoster(month).map((person) => {
      const region = person.org.replace(/大区$/, '');
      // Both sample stores report to the first district in their respective region.
      const district = person.store ? region + '一区' : '';
      return { ...person, district };
    });
  }
  function visible(person) {
    switch (session.role) {
      case '区域总':
        return person.org === '华东大区';
      case '小区':
        return person.district === '华东一区';
      case '1+N店长':
        return person.store === '华东大区 · 示范一店';
      case '1线员工':
        return person.id === 'E011';
      default:
        return true;
    }
  }
  function changeMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    session.month = value;
    setSession('performance.admin.month', value);
    refresh();
  }
  function windowText(stage, month = session.month) {
    const range = session.db.periods[month]?.[stage];
    const display = (s) => s.replace('T', ' ');
    if (range?.start && range?.end) return display(range.start) + ' 至 ' + display(range.end);
    if (range?.start) return display(range.start) + ' 起';
    if (range?.end) return '截至 ' + display(range.end);
    return '未限定';
  }
  function hasEnded(stage, month = session.month) {
    const end = session.db.periods[month]?.[stage]?.end;
    return Boolean(end && Date.now() >= new Date(end + '+08:00').getTime() + 60000);
  }
  function isOpen(stage, month = session.month) {
    const range = session.db.periods[month]?.[stage];
    if (!range) return true;
    const now = new Date();
    return (
      (!range.start || now >= new Date(range.start + '+08:00')) &&
      (!range.end || now.getTime() < new Date(range.end + '+08:00').getTime() + 60000)
    );
  }
  function close(returnFocus = true) {
    if (!session.dialog) return;
    const { overlay, restore } = session.dialog;
    overlay.remove();
    session.dialog = null;
    if (returnFocus && restore?.isConnected) restore.focus();
  }
  function modal(title, html, setup) {
    close(false);
    const restore = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'pa-overlay';
    overlay.innerHTML =
      '<section class="pa-modal" role="dialog" aria-modal="true" aria-labelledby="pa-dialog-title">' +
      '<header class="pa-modal-header"><h2 id="pa-dialog-title">' +
      esc(title) +
      '</h2>' +
      '<button type="button" class="pa-close" aria-label="关闭弹窗">×</button></header>' +
      '<div class="pa-modal-body">' +
      html +
      '</div></section>';
    document.body.append(overlay);
    const panel = overlay.querySelector('.pa-modal');
    session.dialog = { overlay, restore };
    panel.querySelector('.pa-close').addEventListener('click', () => close());
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') return;
      const focusables = [...panel.querySelectorAll('button, input, select, textarea, a[href]')].filter(
        (el) => !el.disabled && el.offsetParent !== null,
      );
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault();
        focusables.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === focusables.at(-1)) {
        event.preventDefault();
        focusables[0]?.focus();
      }
    });
    setup?.(panel);
    (panel.querySelector('[autofocus]') || panel.querySelector('.pa-close')).focus();
    return panel;
  }
  function csv(filename, headers, rows) {
    const cell = (v) => {
      const str = String(v ?? '');
      const safe = /^[=+@-]/.test(str) && !/^[-+]?\d+(\.\d+)?$/.test(str) ? "'" + str : str;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const value = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', value], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/(?:\.csv)?$/, '.csv');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function go(page) {
    const next = pathname(permitted(page) ? page : 'home');
    if (location.hash === '#' + next) refresh();
    else location.hash = next;
  }
  function calendar(ctx) {
    const range = ctx.db.periods[ctx.month] || {};
    ctx.on('[data-edit-times]', 'click', () => {
      if (ctx.role !== '后台HRBP') return;
      const fields = Object.entries(stages)
        .map(([key, label]) => {
          const item = range[key] || {};
          return (
            '<tr><th scope="row">' +
            label +
            '</th><td><input type="datetime-local" name="' +
            key +
            '-start" aria-label="' +
            label +
            '开始时间" value="' +
            esc(item.start) +
            '"></td><td>' +
            '<input type="datetime-local" name="' +
            key +
            '-end" aria-label="' +
            label +
            '结束时间" value="' +
            esc(item.end) +
            '"></td></tr>'
          );
        })
        .join('');
      modal(
        '配置考核时间 · ' + ctx.month,
        '<form id="pa-time-form"><div class="pa-scroll"><table class="pa-table"><thead><tr>' +
          '<th>办理环节</th><th>开始时间</th><th>结束时间</th></tr></thead><tbody>' +
          fields +
          '</tbody></table></div><p class="pa-note">按北京时间生效。开始或结束时间可留空。</p><p role="alert" class="pa-error"></p>' +
          '<footer class="pa-actions"><button type="button" data-cancel>取消</button><button class="pa-primary">保存配置</button></footer></form>',
        (dialog) => {
          dialog.querySelector('[data-cancel]').onclick = () => close();
          dialog.querySelector('form').onsubmit = (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget),
              next = {};
            for (const [key, label] of Object.entries(stages)) {
              const start = form.get(key + '-start'),
                end = form.get(key + '-end');
              if (start && end && start > end) {
                dialog.querySelector('[role=alert]').textContent = label + '的结束时间早于开始时间，请调整。';
                dialog.querySelector('[name="' + key + '-end"]').focus();
                return;
              }
              if (start || end) next[key] = { start, end };
            }
            ctx.db.periods[ctx.month] = next;
            save();
            close();
            refresh();
            toast('已保存本期考核时间');
          };
        },
      );
    });
    return (
      '<section class="pa-card"><div class="pa-toolbar"><h2 class="pa-title">考核时间（北京时间）</h2>' +
      '<button class="pa-primary" data-edit-times>配置时间</button></div><div class="pa-scroll"><table class="pa-table">' +
      '<thead><tr><th>办理环节</th><th>开始时间</th><th>结束时间</th><th>当前状态</th></tr></thead><tbody>' +
      Object.entries(stages)
        .map(([key, name]) => {
          const item = range[key] || {};
          return (
            '<tr><td>' +
            name +
            '</td><td>' +
            esc(item.start?.replace('T', ' ') || '未限定') +
            '</td><td>' +
            esc(item.end?.replace('T', ' ') || '未限定') +
            '</td><td>' +
            (isOpen(key) ? '可办理' : '未开放') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div></section>'
    );
  }
  pages.calendar = calendar;
  const scopeNames = {
    后台HRBP: '总部 · 全部组织',
    后台业务老师: '总部 · 业务管理',
    区域总: '华东大区',
    '1+N店长': '华东大区 · 示范一店',
    小区: '华东一区',
    '1线员工': '沈安 · 产品专家',
  };
  const mainActions = {
    library: '维护指标与计分规则',
    plans: '查看岗位方案与下发记录',
    tracking: '查看业务值和达成情况',
    tasks: '办理综合评价与扣罚',
    results: '查询区域及门店绩效',
    calendar: '设置各环节办理时间',
    mine: '查看本人方案、结果与申诉',
  };
  function home(ctx) {
    const ids = new Set(ctx.visiblePeople.map((person) => person.id));
    const planRows = (ctx.db.plans || []).filter(
      (p) =>
        p.month === ctx.month &&
        p.status !== '历史版本' &&
        (ctx.role === '后台HRBP' ||
          (p.status === '已下发' && (p.people || []).some((person) => ids.has(person.id)))),
    );
    const work = window.PerfResultsAdmin.counts(ctx);
    const released = planRows.filter((p) => p.status === '已下发');
    const receipts = released.flatMap((p) =>
      (p.people || [])
        .filter((person) => ids.has(person.id))
        .map((person) => ({ id: person.id, confirmed: (p.received || []).includes(person.id) })),
    );
    const stats = [
      ['应考人员', ctx.visiblePeople.length, ctx.role === '1线员工' ? 'mine' : 'tracking'],
      ['本期岗位方案', planRows.length, 'plans'],
      ['已下发方案', released.length, 'plans'],
      ...(['后台业务老师', '区域总'].includes(ctx.role) ? [['待我确认', work.pendingTasks, 'tasks']] : []),
      ['已发布结果人数', work.released, ctx.role === '1线员工' ? 'mine' : 'results'],
      [
        '已确认方案人数',
        new Set(receipts.filter((x) => x.confirmed).map((x) => x.id)).size,
        ctx.role === '1线员工' ? 'mine' : 'plans',
      ],
    ].filter(([, , key]) => permitted(key));
    const actions = scopes[ctx.role].filter((key) => key !== 'home');
    const budget = session.options.legacyHome?.(ctx.month, ctx.role) || '';
    return (
      '<div class="pa-stats">' +
      stats
        .map(
          ([label, value, key]) =>
            '<a class="pa-stat" href="#' +
            pathname(key) +
            '"><strong>' +
            value +
            '</strong><span>' +
            label +
            '</span></a>',
        )
        .join('') +
      '</div><section class="pa-card"><div class="pa-toolbar"><h2 class="pa-title">绩效办理</h2><span class="pa-subtle">' +
      esc(scopeNames[ctx.role]) +
      '</span></div><div class="pa-scroll"><table class="pa-table"><thead><tr><th>业务事项</th><th>办理内容</th><th>操作</th></tr></thead><tbody>' +
      actions
        .map((key) => {
          let text = mainActions[key];
          if (key === 'tasks')
            text =
              ctx.role === '后台业务老师'
                ? '确认 1+N 组织综合评价与扣罚'
                : ctx.role === '区域总'
                  ? '办理本区域综合评价与扣罚'
                  : '查看评价与扣罚办理进度';
          if (key === 'plans' && ctx.role === '后台HRBP') text = '配置岗位目标和权重，按人员名单下发';
          return (
            '<tr><td>' +
            menus[key] +
            '</td><td>' +
            text +
            '</td><td><a class="pa-link" href="#' +
            pathname(key) +
            '">进入</a></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div></section>' +
      budget
    );
  }
  pages.home = home;
  function navLink(key, label, active, icon) {
    return (
      '<a href="#' +
      key +
      '"' +
      (active ? ' aria-current="page" class="active"' : '') +
      '>' +
      (icon ? session.options.icon(icon) : '') +
      '<span>' +
      esc(label) +
      '</span></a>'
    );
  }
  function shell(ctx, content) {
    const active = session.view;
    const links = scopes[ctx.role]
      .filter((k) => k !== 'home')
      .map((k) => navLink(pathname(k), menus[k], active === k))
      .join('');
    const external = session.options.legacyLinks(ctx.role);
    const tabs = session.tabs
      .filter(permitted)
      .map(
        (key) =>
          '<span class="pa-tab-pair"><a href="#' +
          pathname(key) +
          '"' +
          (key === active ? ' aria-current="page"' : '') +
          '>' +
          menus[key] +
          '</a>' +
          (key === 'home'
            ? ''
            : '<button aria-label="关闭' +
              menus[key] +
              '页签" class="pa-tab-close" data-close-page="' +
              key +
              '">×</button>') +
          '</span>',
      )
      .join('');
    const month =
      '<label class="pa-month">考核月份 <input aria-label="考核月份" type="month" value="' +
      ctx.month +
      '" data-pa-month></label>';
    return (
      '<div class="pa-shell' +
      (active === 'mine' ? ' pa-personal' : '') +
      '"><header class="pa-head"><a class="pa-brand" href="#home"><img width="36" height="36" alt="" src="' +
      brandImage +
      '"><strong>综合绩效运营平台</strong></a><div class="pa-crumb">运营平台 <span>/</span> ' +
      (active === 'home' ? '工作台' : '绩效管理 <span>/</span> <b>' + menus[active] + '</b>') +
      '</div><div class="pa-head-end"><span class="pa-demo">演示环境</span><label class="pa-role">切换角色 <select aria-label="切换角色" data-pa-role>' +
      roles
        .map((role) => '<option' + (role === ctx.role ? ' selected' : '') + '>' + role + '</option>')
        .join('') +
      '</select></label></div></header><aside class="pa-side"><nav class="pa-nav" aria-label="业务导航">' +
      navLink('home', '工作台', active === 'home', 'home') +
      (external.includes('budget') ? navLink('budget/library', '人员编制预算', false, 'budget') : '') +
      '<details class="pa-group" open><summary>' +
      session.options.icon('performance') +
      '<span>绩效管理</span></summary>' +
      links +
      '</details>' +
      (external.includes('commission') ? navLink('commission', '人员提成', false, 'commission') : '') +
      (external.includes('incentives') ? navLink('incentives', '激励政策', false, 'incentives') : '') +
      '</nav></aside><main class="pa-main"><nav class="pa-tabs" aria-label="已打开页面">' +
      tabs +
      '</nav><div class="pa-body"><header class="pa-pagehead"><h1>' +
      menus[active] +
      '</h1>' +
      (active === 'library' ? '' : month) +
      '</header>' +
      content +
      '</div></main></div>'
    );
  }
  function refresh() {
    if (!session.root || !isAdminRoute(location.hash.slice(1))) return;
    close(false);
    load();
    const db = session.db,
      month = session.month,
      role = session.role,
      root = session.root;
    const people = roster(month),
      visiblePeople = people.filter(visible);
    const firstVisit = !db.planMonths?.[month];
    window.PerfPlans.init(db, people, month);
    if (firstVisit) save();
    const bindings = [];
    const ctx = {
      db,
      month,
      role,
      root,
      people,
      visiblePeople,
      esc,
      modal,
      close,
      save,
      go,
      csv,
      refresh,
      isOpen,
      hasEnded,
      windowText,
      toast,
      changeMonth,
      on(selector, event, fn) {
        bindings.push({ selector, event, fn });
      },
    };
    const page = session.view;
    const contents = pages[page](ctx);
    root.innerHTML = shell(ctx, contents);
    for (const { selector, event, fn } of bindings) {
      root.querySelectorAll(selector).forEach((el) => el.addEventListener(event, (e) => fn(e, el)));
    }
    root.querySelectorAll('[data-close-page]').forEach((button) =>
      button.addEventListener('click', () => {
        const tab = button.dataset.closePage,
          index = session.tabs.indexOf(tab);
        if (index < 1) return;
        session.tabs.splice(index, 1);
        if (tab === session.view) go(session.tabs[Math.min(index, session.tabs.length - 1)]);
        else refresh();
      }),
    );
    root.querySelector('[data-pa-month]')?.addEventListener('change', (e) => changeMonth(e.target.value));
    root.querySelector('[data-pa-role]').addEventListener('change', (e) => {
      session.role = e.target.value;
      session.options.onRole(session.role);
      setSession('performance.admin.role', session.role);
      session.tabs = ['home'];
      go(permitted(page) ? page : session.role === '1线员工' ? 'mine' : 'home');
    });
    if (page === 'home') session.options.bindLegacyHome?.(month, role, refresh);
    document.title = menus[page] + ' · 综合绩效运营平台';
  }
  function isAdminRoute(raw) {
    const key = raw.split(/[/?]/)[0];
    return ['', 'home', 'performance', 'employee'].includes(key);
  }
  function mount(root, raw, options) {
    close(false);
    session.root = root;
    session.options = options;
    const [group, sub] = raw.split('?')[0].split('/');
    if (!session.role) {
      const saved = readSession('performance.admin.role');
      session.role = roles.includes(saved) ? saved : previousRoles[options.persona] || '后台HRBP';
      const priorMonth = readSession('performance.admin.month');
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(priorMonth)) session.month = priorMonth;
    }
    const linkedMonth = new URLSearchParams(raw.split('?')[1] || '').get('month');
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(linkedMonth || '')) {
      session.month = linkedMonth;
      setSession('performance.admin.month', linkedMonth);
    }
    if (
      ['budget', 'commission', 'incentives'].includes(options.arrivingFrom) &&
      previousRoles[options.persona]
    ) {
      session.role = previousRoles[options.persona];
      setSession('performance.admin.role', session.role);
    }
    if (group === 'employee') {
      session.role = '1线员工';
      setSession('performance.admin.role', session.role);
    }
    options.onRole(session.role);
    let page =
      group === 'employee'
        ? 'mine'
        : group === 'performance'
          ? aliases[sub] || sub || (session.role === '后台HRBP' ? 'plans' : scopes[session.role][1])
          : 'home';
    if (!permitted(page)) page = session.role === '1线员工' ? 'mine' : 'home';
    session.view = page;
    if (session.tabRole !== session.role) {
      session.tabs = ['home'];
      session.tabRole = session.role;
    }
    if (!session.tabs.includes(page)) session.tabs.push(page);
    if (location.hash !== '#' + pathname(page)) history.replaceState(null, '', '#' + pathname(page));
    refresh();
    window.scrollTo(0, 0);
  }
  const brandImage =
    'data:image/png;base64,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';
  window.PerfAdmin = { mount, isAdminRoute, close };
  window.addEventListener('storage', (e) => {
    if (e.key !== storageKey || !isAdminRoute(location.hash.slice(1))) return;
    refresh();
  });
})();
