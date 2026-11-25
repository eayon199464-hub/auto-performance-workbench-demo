/* API: BImportModel.headers (string[]); preview(ctx, rows) and commit(ctx, rows[, previewFingerprint]).
   rows: array of data rows in header order, or objects keyed by header. Never include header row.
   preview -> {ok, errors:[{row,field,message}], changes:[{row,year,orgId,orgName,biz,name,type,before,after,newCatalog}], counts:{created,updated,unchanged,newCatalog},fingerprint}.
   type='新增'|'更新'|'不变'; before=null or {cap,budget}; after={cap,budget}. row is Excel row (2-based).
   commit -> {ok,message,preview}. No changes or validation failures never call write/updateAll. */
(() => {
  'use strict';
  const headers = Object.freeze([
    '年度',
    '组织编码',
    '业务线',
    '岗位名称',
    '岗位编制',
    '岗位年度预算',
    '每人年度参考预算',
  ]);
  const HQ = '总部 HRBP',
    text = (v) => String(v ?? '').trim(),
    cents = (v) => Math.round(v * 100);
  const key = (...v) => JSON.stringify(v);
  const number = (v, cash) => {
    const s = text(v);
    if (!(cash ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(s)) return NaN;
    const n = Number(s);
    return Number.isSafeInteger(cash ? cents(n) : n) ? n : NaN;
  };
  function build(ctx, rows, db) {
    if(ctx.actor !== HQ)return denied();
    const centers = new Map(db.centers.map((o) => [o.id, o])),
      scope = new Set(ctx.centers.map((o) => o.id));
    const errors = [],
      changes = [],
      seen = new Map(),
      newJobs = new Map(),
      orgRows = new Map(),
      counts = { created: 0, updated: 0, unchanged: 0, newCatalog: 0 };
    const fail = (row, field, message) => errors.push({ row, field, message });
    if (!Array.isArray(rows) || !rows.length) fail(0, '文件', '未找到数据行。');
    (Array.isArray(rows) ? rows : []).forEach((r, i) => {
      const row = i + 2,
        v = Array.isArray(r) ? r : headers.map((h) => r?.[h]);
      if (v.every((x) => !text(x))) return;
      const [ys, orgId, biz, name] = v.slice(0, 4).map(text);
      const cap = number(v[4], false),
        budget = number(v[5], true),
        rate = text(v[6]) ? number(v[6], true) : null;
      const issues = errors.length;
      const org = centers.get(orgId);
      if (
        !org ||
        !scope.has(orgId)
      ) {
        fail(row, headers[1], '组织编码无效或无当前组织的办理权限。');
        return;
      }
      if (!org.authorized) fail(row, headers[1], '组织尚未获授年度额度。');
      if (org.reviewLocked) fail(row, headers[1], '组织处于复盘锁定期。');
      if (!/^\d{4}$/.test(ys) || ys !== String(org.year))
        fail(row, headers[0], '仅支持本组织当前生效的授权年度。');
      if (!org.lines.some((l) => l.biz === biz)) fail(row, headers[2], '业务线不属于该组织。');
      if (!name) fail(row, headers[3], '岗位名称不能为空。');
      if (!Number.isFinite(cap)) fail(row, headers[4], '请输入非负整数。');
      if (!Number.isFinite(budget)) fail(row, headers[5], '请输入非负金额，最多两位小数。');
      if (rate !== null && !Number.isFinite(rate))
        fail(row, headers[6], '请输入非负金额，最多两位小数。');
      const group = key(ys, orgId, biz, name);
      if (seen.has(group)) fail(row, headers[3], '与第 ' + seen.get(group) + ' 行重复。');
      else seen.set(group, row);
      if (errors.length !== issues) return;
      const catalogKey = key(biz, org.level, name),
        matches = db.catalog.filter(
          (j) => text(j.name) === name && j.biz === biz && j.levels.includes(org.level),
        );
      if (matches.length > 1) {
        fail(row, headers[3], '岗位库存在多条匹配记录，请先合并。');
        return;
      }
      let job = matches[0],
        newCatalog = !job;
      if (!job) {
        if (rate === null) {
          fail(row, headers[6], '新增岗位须填写每人年度参考预算。');
          return;
        }
        job = newJobs.get(catalogKey);
        if (job && cents(job.unitBudget) !== cents(rate)) {
          fail(row, headers[6], '同一新建岗位的每人年度参考预算不一致。');
          return;
        }
        if (!job) {
          job = {
            id: 'pending:' + catalogKey,
            name,
            biz,
            levels: [org.level],
            unitBudget: rate,
            active: true,
          };
          newJobs.set(catalogKey, job);
        }
      }
      const old = (org.jobs || []).find((s) => s.jobId === job.id),
        before = old ? { cap: old.cap, budget: old.budget } : null,
        after = { cap, budget };
      if (!old && !cap && !budget) fail(row, headers[4], '新增配置的编制和预算不能同时为零。');
      if (job.active === false && (!old || cap > old.cap || cents(budget) > cents(old.budget)))
        fail(row, headers[3], '停用岗位仅可保持或收回已有额度。');
      if (old && cap < old.used + old.reserved) fail(row, headers[4], '低于已入职及预留人数合计。');
      if (old && cents(budget) < cents(old.usedCost) + cents(old.reservedCost))
        fail(row, headers[5], '低于已占用及预留预算合计。');
      if (errors.length !== issues) return;
      const type = !old
        ? '新增'
        : cap === old.cap && cents(budget) === cents(old.budget)
          ? '不变'
          : '更新';
      counts[{ 新增: 'created', 更新: 'updated', 不变: 'unchanged' }[type]]++;
      const entry = {
        row,
        year: Number(ys),
        orgId,
        orgName: org.name,
        biz,
        name,
        type,
        before,
        after,
        newCatalog,
        jobId: job.id,
      };
      changes.push(entry);
      if (!orgRows.has(orgId)) orgRows.set(orgId, []);
      orgRows.get(orgId).push(entry);
    });
    if (!seen.size && !errors.length) fail(0, '文件', '未找到数据行。');
    for (const [id, entries] of orgRows) {
      const o = centers.get(id);
      const first = entries[0].row,
        byBiz = new Map();
      let totalCap = 0,
        totalBudget = 0;
      for (const s of o.jobs || []) {
        const b = db.catalog.find((j) => j.id === s.jobId)?.biz;
        byBiz.set(b, (byBiz.get(b) || 0) + s.cap);
        totalCap += s.cap;
        totalBudget += cents(s.budget);
      }
      for (const e of entries) {
        const delta = e.after.cap - (e.before?.cap || 0);
        byBiz.set(e.biz, (byBiz.get(e.biz) || 0) + delta);
        totalCap += delta;
        totalBudget += cents(e.after.budget) - cents(e.before?.budget || 0);
      }
      if (totalCap > o.cap)
        fail(
          first,
          '岗位编制',
          o.name + '的岗位编制合计 ' + totalCap + '，超过组织上限 ' + o.cap + '。',
        );
      if (totalBudget > cents(o.costCap))
        fail(
          first,
          '岗位年度预算',
          o.name +
            '的岗位预算合计 ' +
            (totalBudget / 100).toFixed(2) +
            ' 元，超过组织上限 ' +
            o.costCap +
            ' 元。',
        );
      for (const l of o.lines)
        if ((byBiz.get(l.biz) || 0) > l.cap)
          fail(
            entries.find((e) => e.biz === l.biz)?.row || first,
            '岗位编制',
            o.name +
              ' / ' +
              l.biz +
              '岗位合计 ' +
              byBiz.get(l.biz) +
              ' 人，超过业务线额度 ' +
              l.cap +
              ' 人。',
          );
    }
    counts.newCatalog = newJobs.size;
    const fingerprint = JSON.stringify([
      ctx.actor,
      ctx.center.id,
      changes,
      [...newJobs.values()],
      errors,
    ]);
    return { ok: !errors.length, errors, changes, counts, fingerprint, newJobs };
  }
  function denied() {
    return {ok:false,errors:[{row:0,field:"权限",message:"仅总部 HRBP 可导入岗位预算。"}],changes:[],counts:{created:0,updated:0,unchanged:0,newCatalog:0},fingerprint:null};
  }
  function preview(ctx, rows) {
    if(ctx.actor !== HQ)return denied();
    return build(ctx, rows, { centers: ctx.centers, catalog: ctx.catalog });
  }
  function commit(ctx, rows, fingerprint) {
    const p = preview(ctx, rows),
      result = (ok, message) => ({ ok, message, preview: p });
    if (!p.ok) return result(false, ctx.actor === HQ ? '校验失败，未写入。' : p.errors[0].message);
    if (fingerprint !== undefined && fingerprint !== p.fingerprint)
      return result(false, '数据已变更，请重新预览。');
    if (!p.counts.created && !p.counts.updated) return result(true, '全部一致，无需写入。');
    let detail = '';
    const action = '批量导入岗位预算';
    const success = ctx.updateAll(
      action,
      `新增 ${p.counts.created} 项，更新 ${p.counts.updated} 项。`,
      (db) => {
        const current = build(ctx, rows, db);
        if (!current.ok || current.fingerprint !== p.fingerprint) {
          detail = '额度或岗位记录已变化，请重新预览。';
          throw Error(detail);
        }
        const mapped = new Map();
        for (const [k, j] of current.newJobs) {
          const id =
            'job-' +
            (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-'));
          mapped.set(j.id, id);
          db.catalog.push({ ...j, id });
        }
        const batchId =
            'BI-' +
            (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-')),
          time = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
        const touched = new Map();
        for (const e of current.changes.filter((c) => c.type !== '不变')) {
          const o = db.centers.find((c) => c.id === e.orgId),
            id = mapped.get(e.jobId) || e.jobId,
            s = o.jobs.find((a) => a.jobId === id);
          if (s) Object.assign(s, e.after);
          else
            o.jobs.push({ jobId: id, ...e.after, used: 0, reserved: 0, usedCost: 0, reservedCost: 0 });
          if (!touched.has(o)) touched.set(o, []);
          touched
            .get(o)
            .push({
              row: e.row,
              jobId: id,
              name: e.name,
              biz: e.biz,
              before: e.before,
              after: e.after,
              newCatalog: e.newCatalog,
            });
        }
        for (const [o, diffs] of touched) {
          (o.importBatches ??= []).push({ batchId, time, actor: ctx.actor, year: o.year, diffs });
          o.logs.unshift({
            time,
            month: ctx.month,
            actor: ctx.actor,
            action: '岗位导入明细',
            note:
              batchId +
              ' · ' +
              diffs
                .map(
                  (d) =>
                    d.biz +
                    ' / ' +
                    d.name +
                    '：' +
                    (d.before?.cap ?? 0) +
                    ' → ' +
                    d.after.cap +
                    ' 人，' +
                    (d.before?.budget ?? 0) +
                    ' → ' +
                    d.after.budget +
                    ' 元',
                )
                .join('；'),
          });
        }
      },
      { writesOwnAudit: true },
    );
    return result(
      !!success,
      success ? '导入完成，已记录额度差异。' : detail || '未写入，请核对最新数据和办理权限后重新预览。',
    );
  }
  window.BImportModel = Object.freeze({ headers, preview, commit });
})();
