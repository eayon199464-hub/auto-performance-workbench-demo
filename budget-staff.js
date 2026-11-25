/* Candidate entry and HR receipts run in the same local authorization ledger. */
(() => {
  'use strict';

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkDigits = '10X98765432';
  const checksum = value => checkDigits[weights.reduce((sum, weight, i) => sum + weight * Number(value[i]), 0) % 11];
  const applicants = [
    ['demo-A','候选人 A','clear'], ['demo-B','候选人 B','clear'],
    ['demo-C','候选人 C','offerOnly'], ['demo-D','候选人 D','active'],
    ['demo-E','候选人 E','leaving'], ['demo-F','候选人 F','unavailable'],
    ['demo-G','候选人 G','invalid']
  ].map(([key, label, hr], i) => {
    // 990000 is a fictional address code reserved here for demonstration.
    const prefix = '99000019980101' + String(i + 1).padStart(3, '0');
    const correct = checksum(prefix);
    return {key, label, hr, document: prefix + (hr === 'invalid' ? (correct === '1' ? '2' : '1') : correct)};
  });
  const statusText = {
    awaitingHire:'待入职', validationFailed:'校验未通过', receiptReview:'入职回执待核对',
    offered:'HR 已发 Offer', active:'HR 已入职', leaving:'HR 离职中', left:'HR 已离职',
    rejected:'业务已驳回', hrRejected:'HR 已退回', cancelled:'申请已撤回'
  };
  const fixtureText = {clear:'待入职',offerOnly:'已发 Offer，尚未入职',active:'已有在岗记录',leaving:'离职手续办理中',unavailable:'HR 暂不可用',invalid:'未入职'};
  const inScope = (ctx, biz) => !ctx.biz || ctx.biz === '全部业务' || ctx.biz === biz;
  const ownerRole = z => BModel.roles[z.level] || z.owner;
  const isOwner = (ctx, z) => ctx.actor === ownerRole(z);
  const cash = value => Math.round(value * 100) / 100;
  const sum = (items, key) => cash(items.reduce((v, x) => v + (Number(x[key]) || 0), 0));
  const el = id => document.getElementById('bs-' + id);
  const stamp = () => new Date().toLocaleString('zh-CN', {hour12:false, timeZone:'Asia/Shanghai'});
  const id = () => 'STA-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 9));
  const requireThat = (ok, text) => { if (!ok) throw new Error(text); };
  const allowedCost = cost => Number.isFinite(cost) && cost > 0 && cost <= 1e10 && Math.abs(cost * 100 - Math.round(cost * 100)) < 0.0001;
  function parseAmount(input) {
    const value=String(input??'').normalize('NFKC').trim();
    if (!/^(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return NaN;
    const amount=Number(value.replaceAll(',',''));
    return allowedCost(amount)?amount:NaN;
  }
  function validDocument(value) {
    if (!/^\d{17}[\dX]$/.test(value) || value.startsWith('000000') || value.slice(14,17)==='000') return false;
    const y = +value.slice(6,10), m = +value.slice(10,12), d = +value.slice(12,14);
    const date = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && date.getTime() <= Date.now() && date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 && date.getUTCDate() === d && value[17] === checksum(value.slice(0,17));
  }
  let localKey;
  function identityKey() {
    if (localKey) return localKey;
    localKey = (async () => {
      const generated = await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'}, false, ['sign']);
      return new Promise((resolve,reject) => {
        const open = indexedDB.open('autoops-intake-identities',1);
        open.onupgradeneeded = () => open.result.createObjectStore('keys');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          let selected;
          const tx = db.transaction('keys','readwrite');
          const store = tx.objectStore('keys');
          const get = store.get('candidate');
          get.onsuccess = () => {
            selected = get.result || generated;
            if (!get.result) store.put(selected,'candidate');
          };
          tx.oncomplete = () => { db.close(); resolve(selected); };
          tx.onabort = () => { db.close(); reject(tx.error || Error('证件去重服务不可用')); };
        };
      });
    })().catch(() => {
      localKey = undefined;
      throw Error('浏览器无法保存本地去重密钥，请检查此站点的存储权限。');
    });
    return localKey;
  }
  async function personKeyFor(documentNumber) {
    // The old demo applicants must continue matching requests from earlier versions.
    const sample = applicants.find(a => a.document === documentNumber);
    if (sample) return sample.key;
    const digest = await crypto.subtle.sign('HMAC',await identityKey(),new TextEncoder().encode(documentNumber));
    return 'candidate-v1-' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  }
  function quotaRows(ctx, z, jobId) {
    const info = ctx.catalog.find(j => j.id === jobId);
    const job = z.jobs.find(j => j.jobId === jobId);
    const line = z.lines.find(l => l.biz === info?.biz);
    requireThat(info && job && line && inScope(ctx, info.biz), '岗位已调整，请重新选择本组织获配的岗位。');
    return {job, line, info};
  }
  function hrSnapshot(z) {
    const rows = items => Object.fromEntries(items.map(([key, row]) => [key, {used:row.used, usedCost:row.usedCost}]));
    return z.staffHRSnapshot || {
      lines:rows(z.lines.map(l => [l.biz, l])),
      jobs:rows(z.jobs.map(j => [j.jobId, j]))
    };
  }
  function runChecks(ctx, z, personKey, jobId, cost, current, verifiedInput=false) {
    const p = applicants.find(a => a.key === personKey);
    const hr = p?.hr || 'clear';
    const {job, line, info} = quotaRows(ctx, z, jobId);
    const checkedDoc = p ? validDocument(p.document) : /^candidate-v1-[0-9a-f]{64}$/.test(personKey) && (verifiedInput || current?.identityChecked === true);
    const duplicate = ctx.hrLookup ? ctx.hrLookup(personKey, current?.id || '') :
      (z.staffRequests || []).find(r => r.id !== current?.id && r.personKey === personKey && ['awaitingHire','offered','receiptReview','active','leaving'].includes(r.status))?.status || 'clear';
    const snap = hrSnapshot(z);
    const hrLine = snap.lines[line.biz] || {used:0, usedCost:0};
    const hrJob = snap.jobs[jobId] || {used:0, usedCost:0};
    const hrLines = Object.values(snap.lines);
    const headroom = [
      z.cap - sum(hrLines,'used') - sum(z.lines,'reserved'),
      line.cap - hrLine.used - line.reserved,
      job.cap - hrJob.used - job.reserved
    ];
    const moneyLeft = [
      cash(z.costCap - sum(hrLines,'usedCost') - sum(z.lines,'reservedCost')),
      cash(job.budget - hrJob.usedCost - job.reservedCost)
    ];
    const enoughPeople = headroom.every(n => n >= 1);
    const enoughMoney = allowedCost(cost) && moneyLeft.every(n => n >= cost);
    const rosterMatched = hrLine.used === line.used && hrJob.used === job.used && sum(hrLines,'used') === sum(z.lines,'used');
    const costMatched = cash(hrLine.usedCost) === cash(line.usedCost) && cash(hrJob.usedCost) === cash(job.usedCost) && sum(hrLines,'usedCost') === sum(z.lines,'usedCost');
    const connected = hr !== 'unavailable';
    return [
      [checkedDoc,'证件核验', checkedDoc ? '演示证件格式、出生日期及校验位通过' : '演示证件校验失败'],
      [connected,'HR 连接', connected ? '已取得演示人员与预算快照' : '暂时无法取得 HR 回执，本次不能继续'],
      [duplicate === 'clear','重复申请',duplicate === 'clear'?'无重复办理记录':'已有办理或入职记录'],
      [connected && ['clear','offerOnly','invalid'].includes(hr),'HR 人员状态',fixtureText[hr]],
      [connected && z.authorized && info.active !== false && enoughPeople && rosterMatched,'编制余额',
        !connected ? '待接收 HR 人数数据' : !rosterMatched ? 'HR 与台账人数不一致' : !z.authorized || info.active === false ? '组织额度未下达或岗位已停用' :
        (enoughPeople ? '可用编制（组织 / 业务线 / 岗位）：'+headroom.join(' / ')+' 人' : '组织、业务线或岗位编制不足')],
      [connected && costMatched && enoughMoney,'成本余额', !connected ? '待接收 HR 预算占用数据' : !costMatched ? 'HR 与台账占用预算不一致' :
        (!allowedCost(cost) ? '请输入有效的年度占用金额' : (enoughMoney ? '组织可用 '+ctx.money(moneyLeft[0])+'，岗位可用 '+ctx.money(moneyLeft[1]) : '组织或岗位可用预算不足'))]
    ];
  }
  function moveUsage(ctx, z, r, heldChange, employeeChange, costChange = r.cost * employeeChange) {
    const {job, line} = quotaRows(ctx, z, r.jobId);
    if ((employeeChange || costChange) && !z.staffHRSnapshot) z.staffHRSnapshot = hrSnapshot(z);
    for (const row of [job, line]) {
      row.reserved += heldChange;
      row.used += employeeChange;
      row.reservedCost = cash(row.reservedCost + r.cost * heldChange);
      row.usedCost = cash(row.usedCost + costChange);
      requireThat([row.used,row.reserved,row.usedCost,row.reservedCost].every(n => Number.isFinite(n) && n >= 0), '占用已变化，请重新校验。');
    }
    if (employeeChange || costChange) {
      for (const [key, group] of [[r.jobId,'jobs'], [r.biz,'lines']]) {
        const hr = z.staffHRSnapshot[group][key] ||= {used:0, usedCost:0};
        hr.used += employeeChange;
        hr.usedCost = cash(hr.usedCost + costChange);
        requireThat(hr.used >= 0 && hr.usedCost >= 0, 'HR 余额发生变化，请重新核对。');
      }
    }
  }
  function canStart(ctx, z) {return isOwner(ctx, z) && z.authorized;}
  function jobOptions(ctx) {
    return ctx.center.jobs.map(row => ({row, info:ctx.catalog.find(j => j.id === row.jobId)}))
      .filter(x => x.info && x.info.active !== false && inScope(ctx, x.info.biz));
  }
  function form(ctx) {
    if (!canStart(ctx,ctx.center)) {
      if (!ctx.center.authorized) return '<p class="muted">总部 HRBP 下达本组织额度后，可发起人员调整申请。</p>';
      const owner=ctx.esc(ownerRole(ctx.center));
      return '<p class="muted">本组织的新增人员申请由'+owner+'填写。</p>';
    }
    const jobs=jobOptions(ctx);
    return jobs.length ? BStaffForm.render(ctx,jobs) : '<p class="notice">暂无可申请的岗位。请联系总部 HRBP 配置岗位编制和预算。<a href="#budget/library">查看岗位预算</a></p>';
  }
  const allowedReceipts={awaitingHire:[['active','已入职'],['offered','已发 Offer'],['hrRejected','入职退回']],offered:[['active','已入职'],['hrRejected','入职退回']],receiptReview:[['active','重核入职回执']],active:[['leaving','离职中']],leaving:[['left','已离职']]};
  const requests=ctx=>(ctx.center.staffRequests||[]).filter(r=>inScope(ctx,r.biz)).slice().reverse();
  const unknown='历史未记录';
  const actualCost=r=>r.status==='active'?r.cost:['leaving','left'].includes(r.status)?cash((r.exitBudgetLimit||0)-(r.exitBudgetReleased||0)):0;
  const checkedText=r=>r.checks?.length?(r.checks.every(c=>c[0])?'通过':'未通过'):'历史校验明细未记录';
  function detail(ctx,r){const e=ctx.esc,job=ctx.catalog.find(j=>j.id===r.jobId),pairs=[['申请编号',r.batchId||r.id],['候选人记录编号',r.id],['姓名',r.personLabel],['身份证号',r.maskedDocument||unknown],['组织 / 岗位',ctx.center.name+' / '+(job?.name||r.jobId)],['申请年度预算',ctx.money(r.cost)],['提交人',r.requester||unknown],['提交时间',r.created||unknown],['HR 校验',checkedText(r)],['校验时间',r.checkedAt||unknown],['办理状态',statusText[r.status]||r.status],['最近 HR 回执',r.lastReceipt?.label||(!r.checks?unknown:'尚无回执')],['回执时间',r.lastReceipt?.time||(!r.checks?unknown:'—')],['实际占用', (r.status==='active'?1:0)+' 人 / '+ctx.money(actualCost(r))],['首次实际占用时间',r.occupiedAt||(['active','leaving','left'].includes(r.status)?unknown:'—')]];
    return '<dl class="bs-details">'+pairs.map(([k,v])=>'<div><dt>'+e(k)+'</dt><dd>'+e(v)+'</dd></div>').join('')+'</dl>'+(r.checks?.length?'<h4>HR 校验明细</h4><ul>'+r.checks.map(([ok,label,why])=>'<li>'+e(label)+'：'+(ok?'通过':'未通过')+' · '+e(why)+'</li>').join('')+'</ul>':'')+(r.receiptIssues?.length?'<p>'+(r.status==='receiptReview'?'入职回执待核对，尚未入账：':'入职已入账，差异待核对：')+e(r.receiptIssues.join('；'))+'</p>':'')+'<details><summary>办理记录</summary><ul>'+(r.history||[]).map(h=>'<li>'+e(h.time)+' · '+e(h.actor)+' · '+e(h.event)+'</li>').join('')+'</ul></details>';}
  function ledger(ctx){const e=ctx.esc,rows=requests(ctx);if(!rows.length)return '<p class="muted">暂无人员申请。</p>';return '<div class="tablewrap"><table><thead><tr><th>候选人 / 岗位</th><th>申请年度预算</th><th>HR 校验</th><th>办理状态</th><th>实际占用</th><th>操作</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+e(r.personLabel)+' / '+e(ctx.catalog.find(j=>j.id===r.jobId)?.name||r.jobId)+'</td><td>'+e(ctx.money(r.cost))+'</td><td>'+e(checkedText(r))+'</td><td>'+e(statusText[r.status]||r.status)+'</td><td>'+(r.status==='active'?1:0)+' 人 / '+e(ctx.money(actualCost(r)))+'</td><td><button type="button" data-bs-detail="'+e(r.id)+'" aria-expanded="false">查看详情</button></td></tr><tr hidden><td colspan="6" data-bs-details="'+e(r.id)+'"></td></tr>').join('')+'</tbody></table></div>';}
  function simulator(ctx){const e=ctx.esc,rows=requests(ctx).filter(r=>allowedReceipts[r.status]);if(!rows.length||!(isOwner(ctx,ctx.center)||ctx.actor==='总部 HRBP'))return '';return '<details class="panel" id="bs-simulator"><summary>模拟 HR 系统</summary><p class="muted">演示回执，仅更新本地台账。</p><div class="grid"><label class="field">候选人<select id="bs-sim-person"><option value="">选择人员申请</option>'+rows.map(r=>'<option value="'+e(r.id)+'">'+e(r.personLabel)+' · '+e(r.batchId||r.id)+'</option>').join('')+'</select></label><label class="field">HR 回执<select id="bs-sim-event" disabled></select></label></div><div id="bs-sim-exit" hidden><label class="field">可释放预算（元）<input id="bs-refund" type="number" min="0" step="0.01" value="0"></label><label class="field">释放依据<input id="bs-basis" maxlength="80"></label></div><button id="bs-sim-send" type="button" disabled>接收模拟回执</button></details>';}
  function render(ctx){return '<section class="panel"><h3>新增人员申请</h3>'+form(ctx)+'</section><section class="panel"><h3>人员调整记录</h3><p class="muted">待入职及已发 Offer 均不占编制和预算。按 HR 已入职回执计入。</p>'+ledger(ctx)+'</section>'+simulator(ctx);}
  const record=(r,actor,event,time=stamp())=>(r.history??=[]).push({time,actor,event});
  async function prepareRows(raw){return Promise.all(raw.map(async x=>{const name=String(x.name||'').trim(),doc=String(x.document||'').trim().toUpperCase(),cost=parseAmount(x.cost),errors=[];if(!name)errors.push('请填写姓名');if(!/^\d{17}[\dX]$/.test(doc))errors.push('请填写 18 位身份证号，末位可为 X');if(!x.jobId)errors.push('请选择岗位');if(!allowedCost(cost))errors.push('年度预算须大于 0，最多两位小数');return {name,jobId:x.jobId,cost,errors,valid:validDocument(doc),mask:doc?'**************'+doc.slice(-4):'',personKey:!errors.length?await personKeyFor(doc):''};}));}
  const locked=fn=>navigator.locks?navigator.locks.request('autoops-budget-staff-batch',fn):fn();
  function checkBatchLimits(ctx,z,records) {
    const groups=new Map();
    const orgSeats=z.cap-sum(z.lines,'used')-sum(z.lines,'reserved');
    const orgBudget=cash(z.costCap-sum(z.lines,'usedCost')-sum(z.lines,'reservedCost'));
    for(const r of records.filter(x=>x.checks.every(c=>c[0]))) {
      const {job,line}=quotaRows(ctx,z,r.jobId);
      const limits=[['组织',orgSeats,orgBudget],['业务线 '+r.biz,line.cap-line.used-line.reserved,null],
        ['岗位 '+r.jobId,job.cap-job.used-job.reserved,cash(job.budget-job.usedCost-job.reservedCost)]];
      for(const [key,slots,budget] of limits) {
        if(!groups.has(key))groups.set(key,{rows:[],slots,budget});
        groups.get(key).rows.push(r);
      }
    }
    for(const [key,g] of groups) {
      if(g.rows.length<=g.slots&&(g.budget===null||sum(g.rows,'cost')<=g.budget))continue;
      for(const r of g.rows)r.checks.push([false,'同单额度',key.split(' ')[0]+'同单申请合计超过可用额度']);
    }
  }
  async function submit(ctx,raw) {
    const f=el('form'),people=await prepareRows(raw);
    if(!people.length||people.some(p=>p.errors.length))return {ok:false,rows:people};
    const batchId=ctx.month.replace('-','')+'-'+crypto.randomUUID().slice(-12).toUpperCase();
    const success=await locked(()=>f?.isConnected&&(ctx.writeLatest||ctx.write)('提交新增人员申请（'+people.length+' 人）','申请单 '+batchId,z=>{
      requireThat(canStart(ctx,z),'请由当前获授权组织负责人提交。');
      const keys=new Map();
      for(const p of people)keys.set(p.personKey,(keys.get(p.personKey)||0)+1);
      const records=people.map(p=>{
        const {info}=quotaRows(ctx,z,p.jobId),time=stamp();
        const r={id:id(),batchId,batchSize:people.length,personLabel:p.name,personKey:p.personKey,
          maskedDocument:p.mask,identityChecked:p.valid,jobId:p.jobId,biz:info.biz,cost:p.cost,
          month:ctx.month,requester:ctx.actor,created:time,checkedAt:time,history:[]};
        r.checks=runChecks(ctx,z,r.personKey,r.jobId,r.cost,null,p.valid);
        if(keys.get(r.personKey)>1)r.checks[r.checks.findIndex(c=>c[1]==='重复申请')]=[false,'重复申请','本单身份证号重复'];
        return r;
      });
      checkBatchLimits(ctx,z,records);
      for(const r of records) {
        r.status=r.checks.every(c=>c[0])?'awaitingHire':'validationFailed';
        record(r,ctx.actor,'提交申请',r.created);
        record(r,'模拟 HR 系统','自动校验'+checkedText(r),r.checkedAt);
        z.staffRequests.push(r);
      }
    }));
    return {ok:!!success,rows:[],message:success?'申请已提交':'本单未保存，请核对当前组织及最新数据。'};
  }
  function postHire(ctx,z,r,time) {
    let failed;
    try {
      failed=runChecks(ctx,z,r.personKey,r.jobId,r.cost,r).filter(([ok])=>!ok);
    } catch(error) {
      failed=[[false,'岗位归属',error.message]];
    }
    r.receiptIssues=failed.map(([,label,reason])=>label+'：'+reason);
    const shortageReasons=new Set(['组织、业务线或岗位编制不足','组织或岗位可用预算不足']);
    if(failed.some(([,label,reason])=>!['编制余额','成本余额'].includes(label)||!shortageReasons.has(reason))) {
      r.status='receiptReview';
      record(r,'模拟 HR 系统','已收已入职回执，未入账，待核对：'+r.receiptIssues.join('；'),time);
      return false;
    }
    moveUsage(ctx,z,r,0,1);
    r.occupiedAt=time;
    if(failed.length) record(r,'模拟 HR 系统','入职已入账，额度差异待核对：'+r.receiptIssues.join('；'),time);
    return true;
  }
  function applyReceipt(ctx,rid,event,release,basis) {
    return (ctx.writeLatest||ctx.write)('模拟 HR 回执',rid+' · '+(statusText[event]||event),z=>{
      requireThat(isOwner(ctx,z)||ctx.actor==='总部 HRBP','无当前组织办理权限。');
      const r=z.staffRequests.find(v=>v.id===rid);
      requireThat(r&&inScope(ctx,r.biz)&&(allowedReceipts[r.status]||[]).some(([a])=>a===event),'回执已处理或与当前状态不符。');
      const time=stamp();
      if(r.status!=='receiptReview') r.lastReceipt={label:statusText[event],time};
      if(event==='active'&&!postHire(ctx,z,r,time))return;
      if(event==='leaving') {
        moveUsage(ctx,z,r,0,-1,0);
        r.exitBudgetLimit=r.cost;
        r.exitBudgetReleased=0;
      }
      if(event==='left') {
        const max=r.exitBudgetLimit??0;
        requireThat(Number.isFinite(release)&&release>=0&&release<=max&&Math.abs(release*100-Math.round(release*100))<.0001,'释放金额不得超过本单保留占用，最多两位小数。');
        requireThat(!release||basis.trim().length>0&&basis.length<=80,'请输入 HR 释放依据。');
        if(release)moveUsage(ctx,z,r,0,0,-release);
        r.exitBudgetReleased=release;
        r.exitBasis=basis;
      }
      r.status=event;
      record(r,'模拟 HR 系统',statusText[event]+(event==='left'?' · 释放 '+ctx.money(release):''),time);
    },event==='active'?{hrReceipt:true}:{});
  }
  function bind(ctx){if(el('form'))BStaffForm.bind(ctx,{parseAmount,submit:raw=>submit(ctx,raw)});document.querySelectorAll('[data-bs-detail]').forEach(b=>b.onclick=()=>{const r=requests(ctx).find(r=>r.id===b.dataset.bsDetail),row=b.closest('tr').nextElementSibling;if(!r||!row)return;row.hidden=!row.hidden;b.setAttribute('aria-expanded',String(!row.hidden));b.textContent=row.hidden?'查看详情':'收起详情';if(!row.hidden)row.firstElementChild.innerHTML=detail(ctx,r);});const person=el('sim-person'),event=el('sim-event'),send=el('sim-send');if(!person)return;person.onchange=()=>{const r=requests(ctx).find(r=>r.id===person.value);event.replaceChildren(...(allowedReceipts[r?.status]||[]).map(([v,label])=>new Option(label,v)));event.disabled=send.disabled=!r;el('sim-exit').hidden=event.value!=='left';el('refund').value=0;el('basis').value='';};send.onclick=async()=>{send.disabled=true;try{await locked(()=>send.isConnected&&applyReceipt(ctx,person.value,event.value,el('refund').valueAsNumber,el('basis').value));}finally{if(send.isConnected)send.disabled=!person.value;}};}
  window.BStaff={render,bind};
})();
