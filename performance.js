(()=>{'use strict';const key='autoops.performance.flow.11',roles=['方案配置人','统一审批人','区域总','业务老师','员工','结果管理员'],stages={draft:'草稿',review:'待审批',approved:'待下发',active:'已下发'},views={config:'岗位指标配置',library:'指标库',release:'审批与下发',tracking:'过程跟踪',results:'月结与申诉'},biz=['销售','交付','售后','市场','新媒体'];let stored=null,data,scope,rerender,sel='',view='release',role=roles[0],note='',oldScope='',uncovered=false,focusSeen='',asPerson='';const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),stamp=()=>new Date().toLocaleString('zh-CN',{hour12:false}),opt=(x,val,label=x)=>`<option value="${esc(x)}" ${x===val?'selected':''}>${esc(label)}</option>`,btn=(s,t,p=false)=>`<button type="button" data-pfact="${s}" class="pf-btn ${p?'pf-primary':''}">${esc(t)}</button>`;const lib=b=>[{name:({销售:'成交目标达成',交付:'交付完成量',售后:'服务工单完成量',市场:'活动有效线索',新媒体:'内容有效线索'})[b],type:'固定指标',business:b,definition:'本月归属本人的有效业务记录数量（演示）',source:'演示业务台账',formula:'有效记录去重计数',algorithm:'达成率',target:50,weight:70,bands:''},{name:'有效回访量',type:'推荐指标',business:b,definition:'本月已完成的有效回访（演示）',source:'演示回访台账',formula:'有效回访去重计数',algorithm:'达成率',target:20,weight:30,bands:''}];const demo=m=>window.PFCalc?.demoRule?window.PFCalc.demoRule(m):m;
function migrateExamples(d){if(!window.PFCalc?.demoRule||d.demoRuleMigration5)return;const same=(a,b)=>Object.keys(b).every(k=>a[k]===b[k]);const matchExact=(m,biz)=>{const refs=lib(biz);if(m.name==='跨岗协作')refs.push({name:'跨岗协作',business:biz,type:'行为评价',definition:'协作事实与操作记录（演示）',source:'区域总填写',formula:'行为观察',algorithm:'人工评分',target:100,weight:10,bands:''});if(m.weight===60)refs.push({...refs[0],weight:60});return refs.some(ref=>same(m,ref))};for(const p of d.plans){if(!/^2026-\d{2}-\d+$/.test(p.id)||p.fromTemplate)continue;p.metrics=p.metrics.map(m=>!m.rule&&matchExact(m,p.biz)?demo(m):m)}d.library=d.library.map(m=>!m.rule&&matchExact(m,m.business)?demo(m):m);d.demoRuleMigration5=true;save()}
function seedTechnician(d){const month='2026-11',id='E031',x=window.pfRoster(month).find(x=>x.id===id&&x.demo&&x.job==='钣喷技师');if(!x||d.plans.some(p=>p.month===month&&p.people?.some(e=>e.id===id)))return;const planId='demo-2026-11-E031';if(d.plans.some(p=>p.id===planId))return;d.plans.push({id:planId,demo:true,month,title:'钣喷技师月度绩效方案（演示）',biz:x.biz,org:x.org,scope:x.scope,job:x.job,people:[{id:x.id,name:x.name}],metrics:lib(x.biz).map(demo),stage:'active',received:[],log:[{t:'2026-11 · 演示初始化',text:'已下发的模拟方案，供手机端确认体验'}]});save()}
function db(){if(data)return data;try{stored=localStorage.getItem(key);data=JSON.parse(stored);if(data?.plans&&data?.library){migrateExamples(data);seedCatalog(data);seedInputExamples(data);seedTechnician(data);return data}}catch{}data={library:biz.flatMap(lib),plans:[]};for(const month of ['2026-11','2026-10','2026-09']){let groups={};for(let x of window.pfRoster(month)){if(x.sourceCase)continue;if(month==='2026-11'&&x.id==='E031'&&x.demo&&x.job==='钣喷技师')continue;let k=[x.biz,x.org,x.scope,x.job].join('|');(groups[k]??=[]).push(x)}Object.values(groups).forEach((rows,i)=>{if(i%7===5)return;let x=rows[0],stage=month!=='2026-11'?'active':x.scope==='区域中台'&&['市场','交付','销售'].includes(x.biz)?'approved':['draft','review','active','active','approved','draft','active'][i%7];let metrics=lib(x.biz);if(i%4===2){metrics[0].weight=60;metrics.push({name:'跨岗协作',business:x.biz,type:'行为评价',definition:'协作事实与操作记录（演示）',source:'区域总填写',formula:'行为观察',algorithm:'人工评分',target:100,weight:10,bands:''})}data.plans.push({id:month+'-'+i,month,title:x.job+'月度绩效方案',biz:x.biz,org:x.org,scope:x.scope,job:x.job,people:rows.map(({id,name})=>({id,name})),metrics,stage,received:[],log:[{t:month+' · 初始化',text:'演示方案：'+stages[stage]}]})})}migrateExamples(data);seedCatalog(data);seedInputExamples(data);seedTechnician(data);save();return data}function persist(){if(localStorage.getItem(key)!==stored)throw Error('其他窗口已修改，请刷新');const json=JSON.stringify(data);localStorage.setItem(key,json);stored=json}function save(){try{persist()}catch{note='浏览器未保存此次修改，请刷新核对其他窗口的修改或检查可用空间。'}}function sync(x,m){let p=db().plans.find(p=>p.month===m&&p.people.some(e=>e.id===x.id));let idx=p?.people.findIndex(e=>e.id===x.id),s=p?.demoResults?.[idx]?.status;return {...x,covered:p?.stage==='active',final:s==='已定稿'}}const match=(p,s)=>p.month===s.month&&(s.biz==='全部业务'||s.biz===p.biz)&&(s.org==='全部组织'||s.org===p.org)&&(s.scope==='全部层级'||s.scope===p.scope)&&(s.role!=='区域负责人'||p.org==='华东大区')&&(s.role!=='一线员工'||p.stage==='active'&&p.people.some(x=>x.id===(s.employeeId||'E001')));const cp=()=>db().plans.find(p=>p.id===sel)||db().templates?.find(p=>p.id===sel);const ctx=()=>({plan:cp(),role,data:db(),filters:scope,view,esc,save,refresh:()=>rerender(),writeAdjustments:list=>{const p=cp();if(view!=='config'||role!=='方案配置人'||p?.stage!=='draft'||!Array.isArray(list))return false;const prev=p.adjustments;p.adjustments=list;try{persist();note='已保存岗位加扣罚规则。'}catch{p.adjustments=prev;note='规则未保存，请刷新后重试。'}rerender();return p.adjustments===list},employeeId:role==='员工'?(scope.employeeId||'E001'):null});function log(p,text){p.log.unshift({t:stamp(),text});save();note=text;rerender()}
function dispatchRows(p){return (p.people||[]).map((x,i)=>{const n=p.noticeLedger?.[x.id];return {id:x.id,name:x.name,channel:n?.channel||'未记录',state:n?.state||'未记录',reason:n?.reason||'',read:p.received.includes(x.id),at:p.receiptAt?.[x.id]||''}})}
function releaseDetail(p) {
  const fields = (p.metrics || []).map(m => {
    const manual = PFScoring.isManual(m);
    const score = manual ? '<small class="pfc-desc">'+esc(PFScoring.summary(m))+'</small>' : '';
    const target = manual ? '—' : m.target ?? '待配置';
    const source = manual ? '人工评价' : window.PFSource?.summary(m) || m.source || '待确认';
    return `<tr><td>${esc(m.name)}</td><td>${esc(target)}</td><td>${esc(m.weight ?? '待配置')}%</td><td>${esc(m.algorithm || '待配置')}${score}</td><td>${esc(source)}</td></tr>`;
  }).join('');
  return `<section class="pf-panel"><h3>审批核对 · 岗位方案明细</h3><p>${esc(p.month)} · ${esc(p.biz)} / ${esc(p.scope)} / ${esc(p.org)} · ${p.people.length} 人</p><div class="pfc-scroll"><table class="pf-table"><thead><tr><th>指标</th><th>目标</th><th>岗位权重</th><th>计分方式与标准</th><th>取值来源</th></tr></thead><tbody>${fields || '<tr><td colspan="5">暂无指标</td></tr>'}</tbody></table></div></section>`;
}
function notices(p){if(p.stage!=='active'||role!=='方案配置人')return '';let rows=dispatchRows(p);return `<section class="pf-panel"><div class="pf-row pf-split"><div><h3>通知与员工回执</h3><p></p></div><span class="pf-tag">${rows.filter(r=>r.read).length} / ${rows.length} 人已读</span></div><div class="pfc-scroll"><table class="pf-table"><thead><tr><th>接收人</th><th>通知渠道</th><th>投递状态</th><th>员工回执</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.channel)}</td><td>${esc(r.state)}${r.reason?`<small class="pfc-desc">${esc(r.reason)}</small>`:''}</td><td>${r.read?'已确认 · '+esc(r.at||'时间未记录'):'待本人确认'}</td><td>${r.state==='投递失败'?`<button class="pf-btn" data-notice-retry="${esc(r.id)}">模拟重发</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></section>`}
function seedInputExamples(d){
 if(d.sourceExamplesV1)return;
 const bind=(input,kind,ref,field)=>({input,kind,ref,field});
 const demos=[
 {name:'示例｜交付目标达成率',biz:'交付',def:'当月已开票台数除以月度目标台数。演示两项输入可来自不同渠道。',items:[bind('实际开票数','业务系统取值','示例 DMS · 开票月报','已开票台数'),bind('月度目标','人工导入','示例月度目标模板','目标台数')],rule:{kind:'ratio',a:'实际开票数',b:'月度目标'},formula:'当月实际开票数 ÷ 月度目标 × 100%',alg:'区间取值',bands:'0:80:60;80:100:85;100:*:100'},
 {name:'示例｜合格巡检次数',biz:'市场',def:'导入巡检表，按合格记录编号去重统计。',items:[bind('巡检记录','人工导入','示例门店巡检模板','合格记录编号')],rule:{kind:'distinct',a:'合格记录编号'},formula:'本月合格巡检编号去重计数',alg:'达成率',target:2},
 {name:'示例｜有效工单量',biz:'售后',def:'在演示数据集中按岗位读取有效工单数，按考核月汇总。',items:[bind('有效工单数','大数据取值','示例售后主题 · 岗位工单日报','有效工单数')],rule:{kind:'sum',a:'有效工单数'},formula:'本月每日有效工单数之和',alg:'达成率',target:5}];
 const seed=demos.map(x=>({name:x.name,business:x.biz,type:'推荐指标',scope:'',definition:x.def,source:'演示来源说明，未连接真实数据',sourceBindings:x.items,rule:x.rule,formula:x.formula,algorithm:x.alg,target:x.target||100,weight:20,bands:x.bands||''}));
 d.library.unshift(...seed.filter(m=>!d.library.some(x=>x.name===m.name&&x.business===m.business)));d.sourceExamplesV1=true;save();
}
function seedCatalog(d){if(!window.PFFrontline?.length)return;d.templates||=[];const known=new Set(d.library.map(m=>[m.business,m.scope,m.job,m.name].join('|')));let modified=false;for(const item of window.PFFrontline){const id='岗位模板/'+item.biz+'/'+item.job;if(!d.templates.some(x=>x.id===id)){d.templates.push({...item,id,stage:'draft',title:item.job+'岗位模板',people:[],metrics:item.metrics.map(x=>({...x})),received:[],log:[],catalog:true});modified=true}for(const m of [...item.metrics,...(item.options||[])]){const identity=[m.business,m.scope,m.job,m.name].join('|');if(!known.has(identity)){d.library.push({...m});known.add(identity);modified=true}}}for(const x of window.pfRoster('2026-11').filter(x=>x.scope==='区域中台')){const id='区域岗位模板/'+x.biz+'/'+x.job;if(!d.templates.some(t=>t.id===id)){d.templates.push({id,catalog:true,regional:true,stage:'draft',scope:x.scope,biz:x.biz,job:x.job,title:x.job+'岗位模板',people:[],metrics:[],received:[],log:[]});modified=true}}if(modified)save()}
let selectedAfterTemplate = null;
function applyJobTemplate(template) {
  if (role !== '方案配置人' || !template?.catalog || view !== 'config') return;
  const month = scope.month;
  let appliedMessage = '';
  const roster = window.pfRoster(month);
  const organizations = [...new Set(roster.map(person => person.org))].filter(org =>
    scope.role !== '区域负责人' || org === '华东大区'
  );
  const relevant = item => item.biz === template.biz && item.scope === template.scope && item.job === template.job;
  const planRules = plan => [plan.metrics || [], plan.adjustments || []];
  const signature = JSON.stringify(planRules(template));
  const planAt = org => db().plans.filter(plan => relevant(plan) && plan.org === org && plan.month === month);
  function checkAccess() {
    if (role !== '方案配置人' || view !== 'config' || scope.month !== month || cp()?.id !== template.id)
      throw Error('办理身份或当前方案已变化，请重新打开模板。');
    if (localStorage.getItem(key) !== stored || JSON.stringify(planRules(cp())) !== signature)
      throw Error('方案已更新，请刷新页面后重新核对。');
  }
  function apply(requests) {
    checkAccess();
    if (!requests.length || new Set(requests.map(row => row.org)).size !== requests.length)
      throw Error('请选择要应用的组织，每个组织限选一次。');
    const changes = requests.map(({org, action, planId}) => {
      if (!organizations.includes(org)) throw Error('组织超出办理范围。');
      const existing = planAt(org);
      const people = roster.filter(person => relevant(person) && person.org === org).map(({id, name}) => ({id, name}));
      if (action === 'create' && !existing.length && people.length) {
        return {action, org, people};
      }
      if (action === 'replace' && existing.length === 1 && existing[0].id === planId && existing[0].stage === 'draft') {
        if (JSON.stringify(planRules(existing[0])) === signature) throw Error(org + '的草稿已与模板一致。');
        return {action, org, plan:existing[0]};
      }
      throw Error(org + '的办理条件已变化，请重新核对方案状态及接收人。');
    });
    const rollback = JSON.stringify(data);
    let firstPlanId = '', createdCount = 0, replacedCount = 0;
    try {
      for (const change of changes) {
        let plan = change.plan;
        if (change.action === 'create') {
          plan = {id:'PF-' + crypto.randomUUID(), title:template.job + '月度绩效方案', month, biz:template.biz,
            org:change.org, scope:template.scope, job:template.job, people:change.people, stage:'draft', received:[], log:[]};
          db().plans.push(plan);
          createdCount++;
        } else {
          replacedCount++;
        }
        const [metrics, adjustments] = JSON.parse(signature);
        Object.assign(plan, {fromTemplate:template.id, metrics, adjustments});
        (plan.log ||= []).unshift({t:stamp(), text:(change.action === 'create' ? '从模板生成草稿' : '按模板更新草稿') + ' · ' + template.job + ' · ' + metrics.length + ' 项指标、' + adjustments.length + ' 项加扣罚规则'});
        firstPlanId ||= plan.id;
      }
      persist();
    } catch (error) {
      data = JSON.parse(rollback);
      throw Error('本次应用未保存，请刷新后重试。');
    }
    appliedMessage = ['已应用岗位模板', createdCount && ('新建 ' + createdCount + ' 份草稿'), replacedCount && ('更新 ' + replacedCount + ' 份草稿')].filter(Boolean).join(' · ');
    return {createdCount, replacedCount, firstPlanId};
  }
  function openPlan(id) {
    checkAccess();
    const plan = db().plans.find(item => item.id === id && item.month === month && relevant(item) && organizations.includes(item.org));
    if (!plan) throw Error('找不到该组织的本期方案。');
    selectedAfterTemplate = {id, message:appliedMessage};
    scope.openPlanPage(plan);
  }
  window.PFTemplateApplication.open({template, month, organizations, initialOrg:scope.org, plans:db().plans, roster, apply, openPlan});
}
let showPublish = false;

function render(s) {
  scope = s;
  view = 'config';
  const signature = [s.role, s.actor, s.employeeId, s.month, s.biz, s.org, s.scope].join('|');
  const nextRole = s.actor || s.role;
  const newScope = signature !== oldScope;
  if (newScope) {
    oldScope = signature;
    role = nextRole;
    note = '';
    showPublish = false;
  }
  if (focusSeen !== s.focus) {
    uncovered = s.focus === 'uncovered';
    showPublish = s.focus === 'release' && role === '方案配置人';
    focusSeen = s.focus;
  }
  const manager = role === '方案配置人';
  const plans = db().plans.filter(p => match(p,s) && (!uncovered || p.stage !== 'active'));
  const templates = manager ? (db().templates || []).filter(t =>
    (s.biz === '全部业务' || s.biz === t.biz) && (s.scope === '全部层级' || s.scope === t.scope)
  ) : [];
  if (selectedAfterTemplate) {
    if (plans.some(p => p.id === selectedAfterTemplate.id)) {
      sel = selectedAfterTemplate.id;
      note = selectedAfterTemplate.message;
    }
    selectedAfterTemplate = null;
    showPublish = false;
  }
  const next = plans.find(p => p.stage === (manager ? 'draft' : 'review'));
  if (![...plans,...templates].some(p => p.id === sel) ||
      (newScope && role === '统一审批人' && next && cp()?.stage !== 'review')) {
    sel = (next || plans[0] || templates[0])?.id || '';
  }
  const plan = cp();
  const groups = [
    ['一线岗位 · 本期方案', plans.filter(p => p.scope === '一线（1+N）')],
    ['区域岗位 · 本期方案', plans.filter(p => p.scope === '区域中台')],
    ['一线岗位模板', templates.filter(t => !t.regional)],
    ['区域岗位模板', templates.filter(t => t.regional)]
  ];
  const options = groups.filter(([,list]) => list.length).map(([label,list]) =>
    '<optgroup label="'+label+'">'+list.map(p => opt(p.id,sel,
      [p.biz,p.job,p.catalog?'模板':p.org,p.catalog?'':stages[p.stage]].filter(Boolean).join(' / ')
    )).join('')+'</optgroup>').join('');
  const picker = '<section class="pf-panel"><div class="pf-context"><label class="pf-field">岗位与方案<select id="pf-plan">'+
    (options || '<option>暂无岗位方案</option>')+'</select></label><div class="pf-row">'+
    (manager ? btn('new','新建本期方案')+btn('batch',showPublish?'收起批量下发':'批量下发') : '')+
    (uncovered ? btn('showall','查看全部方案') : '')+'</div></div></section>';
  const batch = manager && showPublish ? PFBatch.render(batchCtx()) : '';
  let body = '';
  if (!plan) body = '<section class="pf-panel">当前范围暂无岗位方案。</section>';
  else if (plan.catalog) {
    body = PFConfig.render(ctx())+(window.PFJobAdjustments?.render(ctx())||'')+
      '<section class="pf-panel"><h3>应用到本期</h3>'+btn('instantiate','应用岗位模板',true)+'</section>';
  } else if (manager && plan.stage==='draft') {
    body = planHeader(plan)+PFConfig.render(ctx())+(window.PFJobAdjustments?.render(ctx())||'')+submissionPanel(plan);
  } else {
    body = planHeader(plan)+releaseDetail(plan)+(window.PFJobAdjustments?.summary(plan)||'')+notices(plan)+
      '<details class="pf-panel"><summary>办理记录</summary>'+plan.log.map(x =>
        '<p><small>'+esc(x.t)+'</small>　'+esc(x.text)+'</p>').join('')+'</details>';
  }
  return '<div class="pf">'+picker+(note?'<p class="pf-flash" role="status">'+esc(note)+'</p>':'')+batch+body+'</div>';
}
function planHeader(p) {
  let actions='';
  if(p.stage==='review' && role==='统一审批人') actions=btn('approve','审批通过',true)+btn('reject','退回修改');
  if(p.stage==='approved' && role==='方案配置人') actions=btn('publish','下发本方案',true);
  const active=Object.keys(stages).indexOf(p.stage);
  const steps=Object.entries(stages).map(([key,label],i) =>
    '<span class="pf-step '+(i===active?'now':i<active?'done':'')+'">'+label+'</span>').join('');
  const people=p.people||[];
  return '<section class="pf-panel"><div class="pf-row pf-split"><div><h3>'+esc(p.title||p.job)+'</h3>'+
    '<p>'+esc(p.org)+' · '+esc(p.month)+' · 接收 '+people.length+' 人</p></div><div class="pf-row">'+actions+
    '</div></div><div class="pf-steps" aria-label="方案状态">'+steps+'</div></section>';
}
function movePlan(plan, from, to, message) {
  const owner = from==='draft' ? '方案配置人' : '统一审批人';
  if (role!==owner || plan.stage!==from || !match(plan,scope)) return '方案状态或办理身份已变化，请刷新。';
  if (to!=='draft') {
    const reason=blocker(plan);
    if (reason) return reason;
  }
  const event={t:stamp(),text:message};
  plan.stage=to; plan.log.unshift(event);
  try { persist(); } catch {
    plan.stage=from; plan.log.shift();
    return '保存失败，请刷新核对最新方案。';
  }
  note=message; return '';
}
function publishPlan(plan) {
  const context = batchCtx();
  const eligibility = () => PFBatch.groups(context).find(group=>group.p?.id===plan.id);
  const candidate=eligibility();
  if (!candidate || candidate.why) {
    note=candidate?.why || '当前范围未匹配到此岗位的接收人。';
    rerender(); return;
  }
  const names=plan.people.map(person=>esc(person.name)).join('、');
  dialog('确认下发本方案','<p>'+esc(plan.month)+' · '+esc(plan.org)+' · '+esc(plan.job)+'</p><p>接收人员（'+plan.people.length+' 人）：'+names+'</p>',()=>{
    const group=eligibility();
    if (!context.current() || !group || group.why) return group?.why||'方案已变化，请重新核对。';
    const run={id:'PF-'+crypto.randomUUID(),at:stamp(),month:plan.month,regions:[plan.org],staff:plan.people.map(person=>person.id),plans:[plan.id]};
    if(!context.commit([plan],run)) return '保存失败，请刷新后重试。';
    note='已下发至 '+plan.org+'，共 '+run.staff.length+' 人。'; rerender();
  });
}
function dialog(title,body,complete){const d=document.createElement('dialog');d.className='pf-dialog';d.innerHTML=`<form><h2>${esc(title)}</h2>${body}<p role="alert" class="pf-muted"></p><div class="pf-row"><button class="pf-btn pf-primary">确认</button><button type="button" class="pf-btn">取消</button></div></form>`;document.body.append(d);d.addEventListener('close',()=>d.remove());d.querySelector('[type=button]').onclick=()=>d.close();d.querySelector('form').onsubmit=e=>{e.preventDefault();let r=complete(new FormData(e.target));if(r){d.querySelector('[role=alert]').textContent=r;return}d.close()};d.showModal()}
function bind(fn){rerender=fn;const el=document.querySelector('.pf');if(!el)return;let p=cp();bindSubmission(el);el.querySelectorAll('[data-notice-retry]').forEach(b=>b.onclick=()=>{const id=b.dataset.noticeRetry,n=p?.noticeLedger?.[id];if(role!=='方案配置人'||p.stage!=='active'||n?.state!=='投递失败')return;const old={...n};try{Object.assign(n,{state:'已投递',reason:'',at:stamp()});persist();note='已模拟重发通知，员工阅读状态未变。'}catch{Object.assign(n,old);note='未能保存，请刷新重试。'}fn()});if(showPublish&&role==='方案配置人')PFBatch.bind(batchCtx());if(el.querySelector('#pf-person'))el.querySelector('#pf-person').onchange=e=>{asPerson=e.target.value;note='';fn()};if(el.querySelector('#pf-plan'))el.querySelector('#pf-plan').onchange=e=>{sel=e.target.value;note='';fn()};if(view==='library'||p&&view==='config')window.PFConfig.bind(ctx());if(p&&view==='config')window.PFJobAdjustments?.bind(ctx());if(p&&['tracking','results'].includes(view))window.PFResults.bind(ctx());el.onclick=e=>{let b=e.target.closest('[data-pfview],[data-pfact]');if(!b)return;if(b.dataset.pfview){view=b.dataset.pfview;note='';fn();return}switch(b.dataset.pfact){case 'batch':if(role==='方案配置人'){showPublish=!showPublish;fn()}break;case 'showall':uncovered=false;fn();break;case 'submit':{const issue=movePlan(p,'draft','review','已提交统一审批');if(issue)note=issue;fn();break}
case 'reject':if(role==='统一审批人'&&p.stage==='review')dialog('退回方案','<label>退回原因<textarea required name="reason"></textarea></label>',f=>{const r=f.get('reason').trim();if(!r)return '请填写退回原因';const issue=movePlan(p,'review','draft','已退回：'+r);if(issue)return issue;fn()});break;
case 'approve':{const issue=movePlan(p,'review','approved','审批通过，待下发');if(issue)note=issue;fn();break}
case 'publish':if(role==='方案配置人'&&p?.stage==='approved')publishPlan(p);break;case 'receipt':if(role==='员工'&&acknowledge(p.id,ctx().employeeId)){note='已确认本人方案';fn()}break;case 'instantiate':applyJobTemplate(p);break;case 'new':{let m=new Map();for(let x of scope.rows){let k=[x.biz,x.org,x.scope,x.job].join('|');if(!db().plans.some(p=>p.month===scope.month&&[p.biz,p.org,p.scope,p.job].join('|')===k)){if(!m.has(k))m.set(k,[]);m.get(k).push(x)}}if(!m.size){note='当前范围内的所有岗位均已有本期方案，请从列表中选择。';fn();break}dialog('新建岗位方案',`<label>未配置岗位<select name="job">${Array.from(m.keys()).map(k=>opt(k,'',k.split('|').join(' / '))).join('')}</select></label><label>方案名称<input name="title" required maxlength="55" placeholder="如：11月岗位考核方案"></label>`,f=>{let a=m.get(f.get('job')),x=a[0],title=f.get('title').trim();if(!title)return '请填写方案名称';let q={id:'PF'+Date.now(),title,month:scope.month,biz:x.biz,org:x.org,scope:x.scope,job:x.job,people:a.map(({id,name})=>({id,name})),metrics:[],received:[],log:[],stage:'draft'};db().plans.push(q);sel=q.id;log(q,'新建岗位方案');if(scope.page!=='jobs')window.portalNavigate('performance/jobs')});break}}}}
function submissionIssues(p){
 const ms=p.metrics||[],d=db(),changes=d.exchange?.changes||[],issues=[];
 const fields=['name','definition','algorithm','formula','source','sourceBindings','bands','rule','weight'],norm=v=>typeof v==='object'&&v?JSON.stringify(v):String(v??'');
 const calc=window.PFCalc?.planErrors?window.PFCalc.planErrors(p):['暂时无法校验方案，请刷新后重试。'];
 for(const t of calc){if(t==='岗位权重合计须为 100%'){const total=ms.reduce((n,m)=>n+Number(m.weight),0),fmt=n=>Number(n.toFixed(4));issues.push({text:t+(Number.isFinite(total)?`；当前 ${fmt(total)}%，需${total>100?'减少':'增加'} ${fmt(Math.abs(100-total))} 个百分点。`:'；请补全各项权重。'),kind:'weight'});}else issues.push({text:t});}
 for(const [index,m] of ms.entries()){if(!m.exchangeKey)continue;const v=Number(m.exchangeVersion),change=changes.find(c=>c.key===m.exchangeKey&&Number(c.version)===v),current=d.library.find(x=>x.exchangeKey===m.exchangeKey&&Number(x.exchangeVersion)===v),label=`${m.name}：规则 V${m.exchangeVersion}`;
 if(change?change.status!=='已生效':!current){issues.push({text:label+' 尚未收到大数据生效回执（'+(change?.status||'未找到此版本')+'）。',kind:'receipt'});continue;}
 const effective=change?.metric||current;if(effective&&(fields.some(k=>norm(effective[k])!==norm(m[k]))||PFExchange.scoringDifferences(effective,m).length))issues.push({text:label+' 已生效，但内容与岗位方案不一致。请移除本项，重新选用生效规则并核对权重。',kind:'mismatch',index});}
 if(!p.people?.length)issues.push({text:'本期无接收人员。'});const extra=window.PFJobAdjustments?.error(p);if(extra)issues.push({text:extra});return issues;
}
function blocker(p){return submissionIssues(p).map(i=>i.text).join('；');}
function submissionPanel(p){const issues=submissionIssues(p),weights=issues.some(i=>i.kind==='weight'),queue=issues.some(i=>i.kind==='receipt');return `<section class="pf-panel" data-submission-checks><h3>提交本期岗位方案</h3>${issues.length?`<p>提交前需处理 ${issues.length} 项：</p><ul>${issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul>${queue?'<button type="button" class="pf-btn" data-submission-queue>查看指标变更记录</button> ':''}${weights?(p.metrics||[]).map((m,i)=>`<button type="button" class="pf-btn" data-submission-weight="${i}">调整${esc(m.name)}权重</button>`).join(' '):''}`:`<p>人员范围、指标规则和权重已通过校验。</p>${btn('submit','提交统一审批',true)}`}</section>`;}
function bindSubmission(el){const go=el.querySelector('[data-submission-queue]');if(go)go.onclick=()=>{window.PFExchange.openQueue();window.portalNavigate('performance/library')};el.querySelectorAll('[data-submission-weight]').forEach(b=>b.onclick=()=>{el.querySelector('[data-pfc-edit="'+b.dataset.submissionWeight+'"]')?.click();document.querySelector('#pfc-f-weight')?.focus();});}

function batchCtx(){const c=ctx(),snapshot=stored;return {...c,blocker,openPlan:id=>{if(!db().plans.some(p=>p.id===id&&match(p,scope))){note='此方案不在当前筛选范围，请切换至全部组织、全部业务与全部层级后查看。';rerender();return}sel=id;showPublish=false;rerender();document.querySelector('.pf-steps')?.scrollIntoView({block:'start'})},current:()=>scope===c.filters&&role==='方案配置人',commit:(plans,run)=>{if(scope!==c.filters||role!=='方案配置人'||!plans.length||localStorage.getItem(key)!==snapshot||plans.some(p=>p.stage!=='approved'||blocker(p)))return false;const rollback=JSON.stringify(data);try{data.releaseRuns||=[];for(const p of plans){p.stage='active';p.releaseId=run.id;p.releasedAt=run.at;p.noticeLedger=Object.fromEntries(p.people.map((x,i)=>[x.id,{channel:i%2?'飞书':'企业微信',state:i===1?'投递失败':'已投递',reason:i===1?'演示：渠道暂不可用':'',at:run.at}]));p.log.unshift({t:run.at,text:'方案配置人批量发布 · '+run.id})}data.releaseRuns.unshift(run);persist();return true}catch{data=JSON.parse(rollback);return false}}}}
function employeePlans(employeeId){if(!employeeId||window.PFIdentity?.employeeId?.()!==employeeId)return [];return db().plans.filter(p=>p.stage==='active'&&p.people.some(x=>x.id===employeeId)).map(p=>({...p,people:p.people.filter(x=>x.id===employeeId),received:p.received.filter(x=>x===employeeId),receiptAt:{[employeeId]:p.receiptAt?.[employeeId]},receipts:{[employeeId]:p.receipts?.[employeeId]},demoResults:undefined,log:[]}))}
function acknowledge(id,employeeId){if(!employeeId||window.PFIdentity?.employeeId?.()!==employeeId)return false;const p=db().plans.find(p=>p.id===id);if(!employeeId||p?.stage!=='active'||!p.people.some(x=>x.id===employeeId))return false;if(p.received.includes(employeeId))return true;let x=p.people.find(x=>x.id===employeeId),old=JSON.stringify(data);try{p.received.push(employeeId);const at=stamp();(p.receipts||={})[employeeId]={at};(p.receiptAt||={})[employeeId]=at;p.log.unshift({t:at,text:x.name+'已阅读并确认本期方案'});persist();return true}catch{data=JSON.parse(old);return false}}
window.PFEngine={reviewData:db,saveReviewData:()=>persist(),render,bind,sync,mobilePlans:employeePlans,mobileRead:(employeeId,id)=>acknowledge(id,employeeId),employeePlans,acknowledge};})();