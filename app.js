(()=>{'use strict';const root=document.querySelector('#app'), tabs={home:'工作台',budget:'人员编制预算',performance:'人员绩效',commission:'人员提成',incentives:'激励政策'},roles=['总部管理者','区域负责人','一线员工'], businesses=['销售','交付','售后','市场','新媒体'], orgs=['华东大区','华南大区','华中大区'],months=['2026-11','2026-10','2026-09'];const state={key:'home',role:roles[0],month:months[0],biz:'全部业务',org:'全部组织',scope:'全部层级',focus:''};const personas={ '方案配置人':['总部管理者','方案配置人'], '统一审批人':['总部管理者','统一审批人'], '区域总':['区域负责人','区域总'], '业务老师':['总部管理者','业务老师'], '结果管理员':['总部管理者','结果管理员'], '一线销售 · 沈安':['一线员工','员工','E011'], '钣喷技师 · 宋野':['一线员工','员工','E031'], '交付服务总监 · 许澄':['一线员工','员工','E032'], '大数据接口演示':['接口演示','大数据接口演示']};Object.assign(personas,{'总部 HRBP':['预算负责人','总部 HRBP'],'总部一级负责人':['预算负责人','总部一级负责人'],'1+N店长':['预算负责人','1+N店长']});const defaultEmployee='一线销售 · 沈安';function applyPersona(name){if(name==='一级专业负责人')name='总部一级负责人';if(name==='运营管理中心')name='总部 HRBP';if(!Object.hasOwn(personas,name))name='方案配置人';state.persona=name;[state.role,state.actor,state.employeeId]=personas[name];try{sessionStorage.setItem('pf.demo.identity',name)}catch{}};let remembered='';try{remembered=sessionStorage.getItem('pf.demo.identity')}catch{}const initialRoute=location.hash.split('?')[0];applyPersona(remembered||(initialRoute.startsWith('#employee/')?defaultEmployee:initialRoute.startsWith('#budget')?'总部 HRBP':(!initialRoute||initialRoute==='#home'||initialRoute.startsWith('#performance'))?'总部 HRBP':'方案配置人'));window.PFIdentity={employeeId:()=>state.employeeId||null};function perfState(s){return s.persona==='总部 HRBP'?{...s,actor:'方案配置人',role:'总部管理者'}:s}function personaControl(){const inPerf=state.key==='performance';const options=Object.keys(personas).filter(n=>!inPerf||n!=='方案配置人');const name=inPerf&&state.persona==='方案配置人'?'总部 HRBP':state.persona;return `${BPortal.affiliation(state)}<label class="pf-identity">当前操作身份 <select aria-label="当前操作身份" data-filter="persona">${opts(options,name)}</select></label>`}const paths={home:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',budget:'M3 21v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3 M13 4a4 4 0 1 1 0 7 M17 14a4 4 0 0 1 4 4v3 M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',performance:'M4 20V4 M4 20h17 M8 15v-4 M13 15V7 M18 15v-6',commission:'M3 6h18v13H3z M3 10h18 M15 15h3',incentives:'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C3 9 5 0 9 4l3 4c8 1 7-8 3-4z'};const svg=k=>`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:middle;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[k]}"/></svg>`;const opts=(a,s)=>a.map(x=>`<option ${s===x?'selected':''}>${x}</option>`).join('');const select=(k,a)=>`<select aria-label="${({role:'角色',month:'考核月份',biz:'业务线',org:'组织',scope:'人员层级'})[k]}" data-filter="${k}">${opts(a,state[k])}</select>`;const n=(x)=>x.toLocaleString('zh-CN');const sum=(r,k)=>r.reduce((a,b)=>a+b[k],0);const count=(r,k)=>r.filter(x=>x[k]).length;const names=['林晨','陈悦','王宁','李然','周岚','许航','方晴','赵凯','吴桐','顾言','沈安','杨帆','徐青','叶琳','曹宇','陆洋','宋佳','罗昕','丁凡','唐月','苏林','马越','胡扬','孟欣','朱航','江予','金辰','石羽','段宁','秦安'];const jobs=['产品专家','交付体验专家','服务顾问','获客运营经理','门店主播'];function baseRows(month){let t=months.indexOf(month);let list=Array.from({length:30},(_,i)=>{let b=i%5,isArea=i%4===3,org=orgs[Math.floor(i/5)%3],p=(i+t*3)%8;return {id:'E'+String(i+1).padStart(3,'0'),name:names[i],biz:businesses[b],org,scope:isArea?'区域中台':'一线（1+N）',job:isArea?businesses[b]+'区域运营岗':jobs[b],covered:p!==1,final:p>2||t===2&&p!==1,capacity:i%6?1:2,budget:9000+b*1200,used:7000+((i*719+t*113)%6500),commission:p%3===0?0:800+(i*137+t*55)%2200,pendingCommission:p%3===0,reward:p===4?600+b*150:0,pendingReward:p===5,policy:p===4||p===5?['服务质量专项','季度协作奖励','客户体验激励'][i%3]:''}});list.push({...list[2],id:'E031',name:'宋野',job:'钣喷技师',scope:'一线（1+N）',demo:true});if(month==='2026-11')list.push({...list[6],id:'E032',name:'许澄',biz:'交付',job:'交付服务总监',org:'华南大区',scope:'一线（1+N）',demo:true,sourceCase:true});return list.map(person=>{
  const store=person.scope==='一线（1+N）'?person.org+' · '+(Number(person.id.slice(1))<=15||person.id==='E031'?'示范一店':'示范二店'):'';
  return {...person,store};
})}window.pfRoster=baseRows;function rows(section=state.key){let roster=baseRows(state.month);if(section!=='performance')roster=roster.filter(x=>!x.sourceCase);if(state.actor==='大数据接口演示'&&!(section==='performance'&&state.key==='performance'&&state.page==='tracking'))roster=roster.filter(x=>x.id==='E032');if(section==='performance'&&state.persona==='1+N店长')roster=roster.filter(x=>x.store==='华东大区 · 示范一店');return roster.map(x=>window.PFEngine?window.PFEngine.sync(x,state.month):x).filter(x=>(state.role!==roles[2]||x.id===state.employeeId)&&(state.role!==roles[1]||x.org===orgs[0])&&(state.biz==='全部业务'||x.biz===state.biz)&&(state.org==='全部组织'||x.org===state.org)&&(state.scope==='全部层级'||x.scope===state.scope))}
const budgetNames={library:'岗位预算库',ledger:'额度台账',staff:'人员调整'};
const pageNames=PFDesk.pages;
const homeDescriptions={home:'查看本期运营数据，跟进需要处理的事项。',commission:'核对个人提成的归属、核算与金额。',incentives:'查看政策覆盖、资格核验与奖励兑现情况。'};
const performanceIdentities = {'后台HRBP':'总部 HRBP','后台业务老师':'业务老师','区域总':'区域总','1+N店长':'1+N店长','1线员工':defaultEmployee,'小区':'小区'};
personas['小区']=['小区负责人','小区'];
function performanceIdentity(role) {
  return performanceIdentities[role] || '小区';
}
function budgetHomeState(month, role) {
  const persona = performanceIdentity(role);
  return {...state, month, persona, role:personas[persona][0], actor:personas[persona][1], key:'home', biz:'全部业务', org:'全部组织', scope:'全部层级',focus:''};
}
function route(raw,focus='',push=false){
  if (window.PerfAdmin && PerfAdmin.isAdminRoute(raw) && !(raw==='home' && state.persona==='总部一级负责人')) {
    if (push && location.hash !== '#'+raw) history.pushState(null,'','#'+raw);
    const arrivingFrom=state.key;
    state.key='admin';
    PerfAdmin.mount(root,raw,{
      icon:svg, persona:state.persona, arrivingFrom, onRole:role=>applyPersona(performanceIdentity(role)),
      legacyLinks(role) {
        return ({'后台HRBP':['budget'], '后台业务老师':['commission','incentives'], '区域总':['budget','commission','incentives'],
          '1+N店长':['budget'], '小区':[], '1线员工':['commission','incentives']})[role];
      },
      legacyHome(month, role) {
        const context=budgetHomeState(month, role);
        if (BPortal.canAccess(context)) return BWorkbench.render(context);
        if (!['后台业务老师','1线员工'].includes(role)) return '';
        const roster=baseRows(month).filter(p=>!p.sourceCase && (role!=='1线员工' || p.id==='E011'));
        return '<section class="pa-card"><h2 class="pa-title">其他运营事项</h2><div class="pa-actions">'+
          '<a class="pa-link" href="#commission">待核算提成 '+count(roster,'pendingCommission')+' 笔</a>'+
          '<a class="pa-link" href="#incentives">待核验奖励 '+count(roster,'pendingReward')+' 笔</a></div></section>';

      },
      bindLegacyHome(month,role,update) {
        const context=budgetHomeState(month, role);
        if (BPortal.canAccess(context)) {BPortal.bindHome(update); BWorkbench.bind(context,update);}
      }
    });
    return;
  }
  window.PerfAdmin?.close(false);

  if(['employee/receipt','employee/performance'].includes(raw.split('?')[0])){
    state.key='mobile';state.page=raw.split('?')[0]==='employee/receipt'?'receipt':'performance';state.mobilePage=state.page;state.focus='';state.mobileQuery=new URLSearchParams(raw.split('?')[1]||'');
    if(location.hash!=='#'+raw)history[push?'pushState':'replaceState'](null,'','#'+raw);
    render();window.scrollTo(0,0);return;
  }
  let [k,sub]=raw.split('?')[0].split('/');
  if (k==='performance' && sub==='overview') k='home';
  if (k==='performance' && state.employeeId) { route('employee/performance', '', push); return; }
  if (k==='performance' && sub==='release') { sub='jobs';focus='release'; }
  if (state.actor==='大数据接口演示' && !['home','performance'].includes(k)) k='home';
  if (state.role==='预算负责人' && !['home','budget','performance'].includes(k)) k='home';
  if (!Object.hasOwn(tabs,k) || (state.role===roles[2] && k==='budget')) k='home';
  state.page='';
  if (k==='performance') {
    const role=PFDesk.roleOf(perfState(state));
    const defaultPage=role.pages.includes(role.entry) ? role.entry : role.pages[0];
    const requested=focus==='uncovered' ? 'jobs' : sub==='config' ? 'jobs' : sub || defaultPage;
    if (Object.hasOwn(pageNames,requested) && role.pages.includes(requested)) {
      state.page=requested;
    } else {
      k='home';
    }
  } else if (k==='budget') {
    state.page=focus==='budgetStaff' ? 'staff' : focus==='budgetLedger' ? 'ledger' : Object.hasOwn(budgetNames,sub) ? sub : 'library';
  }
  if (!['home','budget'].includes(k)) {
    if (state.scope==='总部后台') state.scope='全部层级';
    if (state.org==='总部') state.org='全部组织';
  }
  state.key=k;
  state.focus=focus;
  const path=k+(state.page?'/'+state.page:'');
  if(location.hash!=='#'+path)history[push?'pushState':'replaceState'](null,'','#'+path);
  render();window.scrollTo(0,0);
}
let reviewSection = {key:'', tab:''};
function trackingViews(s, people) {
  const views=[];
  if(s.actor!=='大数据接口演示') views.push(['metrics','过程指标']);
  if(s.month==='2026-11' && people.some(p=>p.id==='E032')) views.push(['source','交付业务值']);
  if(['区域总','业务老师'].includes(s.actor)) views.push(['manual','评价与扣罚']);
  if(['业务老师','大数据接口演示'].includes(s.actor)) views.push(['appeals','待处理申诉']);
  return views;
}
function performanceContent(s,r) {
  if(s.page==='library') return PFExchange.library(s,r);
  if(s.page==='results') return PFSettlement.render(s,r);
  if(s.page==='tracking') {
    const tabs=trackingViews(s,r);
    const key=[s.persona,s.month,s.biz,s.org,s.scope].join('|');
    if(reviewSection.key!==key || !tabs.some(([id])=>id===reviewSection.tab))
      reviewSection={key,tab:s.actor==='大数据接口演示'?'appeals':tabs[0]?.[0]};
    const nav=tabs.length>1?'<nav class="px-work-tabs" aria-label="过程跟踪">'+tabs.map(([id,label])=>
      '<button type="button" data-review-set="'+id+'" aria-pressed="'+(reviewSection.tab===id)+'">'+label+'</button>'
    ).join('')+'</nav>':'';
    let body;
    if(reviewSection.tab==='appeals') body=PFMobileResults.inbox(s,r);
    else if(reviewSection.tab==='source') body=PFDeliveryCase.render(s,r);
    else {
      const employees=r.filter(p=>!p.sourceCase);
      body=PFReview.render(reviewSection.tab==='manual'?'manual':'tracking',{...s,rows:employees},employees);
    }
    return nav+body;
  }
  return PFEngine.render({...s,rows:r,openPlanPage(plan) {
    if(state.org!=='全部组织') state.org=plan.org;
    navigate('performance/jobs');
  }});
}
function performanceBindings(s,r) {
  if(s.page==='library') PFExchange.bind({...s,rows:r},render);
  else if(s.page==='results') PFSettlement.bind(s,r,render);
  else if(s.page==='tracking') {
    if(reviewSection.tab==='appeals') PFMobileResults.bindInbox(s,r,render);
    else if(reviewSection.tab==='source') PFDeliveryCase.bind({...s,rows:r},render);
    else PFReview.bind({...s,rows:r.filter(p=>!p.sourceCase)},render);
    document.querySelectorAll('[data-review-set]').forEach(button=>button.onclick=()=>{
      reviewSection.tab=button.dataset.reviewSet;
      render();
    });
  } else PFEngine.bind(render);
  PFDesk.bind(s);
}
function navigate(k,f=''){route(k,f,true)}
window.portalNavigate=navigate;
const go=(k,f='')=>`data-go="${k}" data-focus="${f}"`;

function performanceBreakdown(s,people) {
  const groups=businesses.map(biz=>[biz,people.filter(person=>person.biz===biz)]).filter(([,members])=>members.length);
  const bars=groups.map(([biz,members])=>{
    const final=count(members,'final');
    return `<div class="bar"><span>${biz}</span><div class="track"><div class="fill" style="width:${100*final/members.length}%"></div></div><b>${final} / ${members.length}</b></div>`;
  }).join('');
  const detail=PFDesk.allowed(s,'results') ? `<button class="action" ${go('performance/results')}>查看绩效明细 ↗</button>` : '';
  return `<details class="panel"><summary>覆盖与定稿明细</summary><div class="panelhead"><h3>已覆盖 ${count(people,'covered')} 人 · 已定稿 ${count(people,'final')} 人</h3>${detail}</div><div class="legend">已定稿人数 / 当期应考人数</div><div class="bars">${bars||'<p class="empty">当前范围暂无应考人员</p>'}</div></details>`;
}

function home(r) {
  const s=perfState(state);
  const hasPerformance=PFDesk.roleOf(s).pages.length>0;
  const budgetRole=state.role==='预算负责人';
  const interfaceRole=state.actor==='大数据接口演示';
  const performancePeople=hasPerformance ? rows('performance') : [];
  const breakdown=hasPerformance && !budgetRole && !interfaceRole ? performanceBreakdown(s,performancePeople) : '';
  const overview=hasPerformance ? PFDesk.render(s,performancePeople,breakdown) : '';
  if (interfaceRole) return overview;
  const budgetAccess=BPortal.canAccess(state);
  const budgetDashboard=budgetAccess ? BWorkbench.render(state) : '';
  if (budgetRole) return overview+budgetDashboard;

  const cards=[
    ['commission','已核定提成',n(sum(r,'commission')),'元',`待核算 ${count(r,'pendingCommission')} 笔`],
    ['incentives','已核定奖励',n(sum(r,'reward')),'元',`有效政策 ${new Set(r.map(x=>x.policy).filter(Boolean)).size} 项 · 待核验 ${count(r,'pendingReward')} 笔`]
  ];
  const tasks=[
    ['commission','pendingCommission','核对未核算提成',count(r,'pendingCommission'),'笔','提成核算'],
    ['incentives','pendingReward','核验奖励资格',count(r,'pendingReward'),'笔','激励兑现']
  ];
  if (budgetAccess) {
    const budget=BPortal.home(state);
    cards.unshift(['budget','授权编制',budget.cap,'人',`${budget.historical?'月末空编（按在岗）':'可用编制'} ${budget.cap-budget.used} 人${budget.cash===null?'':' · 可用成本 ¥'+n(budget.cash)}`]);
    tasks.push(['budget','budgetStaff','查看人员申请进展',budget.pending,'人','人员申请']);
  }
  if (PFDesk.allowed(s,'jobs')) {
    tasks.unshift(['performance','uncovered','跟进未覆盖方案',performancePeople.length-count(performancePeople,'covered'),'人','方案下发']);
  }
  const openTasks=tasks.filter(task=>task[3]);
  const metrics=cards.map(([k,label,value,unit,hint])=>`<button class="card" ${go(k,k==='budget'?'budgetLedger':'')}><span class="cardtop"><span class="icon">${svg(k)}</span>${tabs[k]} <span style="margin-left:auto">↗</span></span><span class="muted">${label}</span><strong class="metric">${value} <small>${unit}</small></strong><span class="mini">${hint}</span></button>`).join('');
  const todos=openTasks.map(([k,f,label,value,unit,type])=>`<button class="todo" ${go(k,f)}><span class="icon">${svg(k)}</span><span style="flex:1;text-align:left"><b>${label}</b><small class="muted" style="display:block">${type}</small></span><strong>${value} ${unit}</strong><span> ›</span></button>`).join('');
  return overview+`<div class="sectiontitle"><span>运营概览</span></div><div class="cards">${metrics}</div>`+
    budgetDashboard+window.vehicleView({...state,rows:r},true)+
    `<section class="panel"><div class="panelhead"><h2>${state.role===roles[2]?'我的事项':'待跟进事项'}</h2><span class="badge">${openTasks.length} 类</span></div>${todos||'<p class="empty">当前范围没有待跟进事项</p>'}</section>`;
}
function render(){if(state.key==='mobile'){window.PFMobile.render(root,state);return}let r=rows(),k=state.key,employee=state.role===roles[2],names=k==='budget'?budgetNames:k==='performance'?pageNames:{},pn=names[state.page]||'',subnav=Object.entries(names).filter(([a])=>k!=='performance'||PFDesk.allowed(perfState(state),a)).map(([a,l])=>`<a class="pf-subnavlink ${state.page===a?'sel':''}" href="#${k}/${a}" ${state.page===a?'aria-current="page"':''}>${l}</a>`).join('');document.title=(pn||tabs[k])+' · 综合绩效运营平台';root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brandmark">◈</span><div class="brandtext"><strong>绩效运营</strong><small style="display:block;letter-spacing:2px">AUTO OPS</small></div></div><div class="navlabel">运营管理</div><nav>${Object.entries(tabs).filter(([v])=>(state.role!=='接口演示'||['home','performance'].includes(v))&&(v!=='performance'||state.persona!=='总部一级负责人'&&PFDesk.roleOf(perfState(state)).pages.length>0)&&(state.role!=='预算负责人'||['home','budget','performance'].includes(v))&&(!employee||v!=='budget')).map(([v,l])=>`<button class="navbtn ${k===v?'active':''}" ${go(v)}>${svg(v)} <span>${l}</span></button>${pn&&v===k?`<div class="pf-subnav" aria-label="${tabs[k]}二级页面">${subnav}</div>`:''}`).join('')}</nav></aside><main class="main"><header class="topbar"><span class="crumb">运营平台　/　<b>${tabs[k]}</b>${pn?`　/　${pn}`:''}</span><span style="margin-left:auto" class="badge">演示环境</span><span class="role">${k==='budget'?BPortal.identity(state):personaControl()}</span></header><div class="content">${k!=='home'&&employee?'<a class="pf-my-mobile" href="#employee/performance">我的绩效 →</a>':''}<div class="heading"><div><h1>${k==='home'?'运营工作台':pn||tabs[k]}</h1>${['budget','performance'].includes(k)?'':`<p class="muted">${homeDescriptions[k]||''}</p>`}</div></div>${pn?`<nav class="pf-mobilesub" aria-label="${tabs[k]}分区">${subnav}</nav>`:''}${k==='budget'||k==='performance'&&state.persona==='总部一级负责人'?'':`<div class="filters">${k==='performance'&&state.page==='library'?'':`<label>月份 ${select('month',months)}</label>`}<label>业务 ${select('biz',['全部业务',...businesses])}</label>${k==='performance'&&state.page==='library'?'':state.role===roles[0]||state.persona==='总部 HRBP'?`<label>组织 ${select('org',k==='home'?['全部组织','总部',...orgs]:['全部组织',...orgs])}</label>`:`<span class="badge">${employee?'本人 · '+state.persona.split(' · ')[1]:(state.actor==='大数据接口演示'?'业务值回传':state.persona==='1+N店长'?'华东 · 示范一店':state.actor==='区域总'?'华东大区':'本人负责的组织')}</span>`}${employee||k==='performance'&&(state.page==='library'||state.persona==='1+N店长')?'':`<label>层级 ${select('scope',k==='home'?['全部层级','总部后台','区域中台','一线（1+N）']:['全部层级','区域中台','一线（1+N）'])}</label>`}</div>` }${k==='home'?home(r):k==='budget'?BPortal.render(state):k==='performance'?performanceContent(perfState(state),r):(k==='commission'?window.vehicleView({...state,rows:r},false)+window.limitEditor(state):'')+window.moduleView(k,{...state,rows:r})}<div class="footer">演示数据 · 核算结果仅用于产品评审</div></div></main></div>`;if(k==='budget')BPortal.bind(render);if(k==='home'){if(BPortal.canAccess(state)){BPortal.bindHome(render);BWorkbench.bind(state,render)}PFDesk.bind(perfState(state))}if(k==='performance')performanceBindings(perfState(state),r)}root.addEventListener('click',e=>{const a=e.target.closest('[data-go]');if(a)navigate(a.dataset.go,a.dataset.focus)});root.addEventListener('change',e=>{let k=e.target.dataset.filter;if(!k)return;if(k==='persona'){BPortal.beforePersona(e.target.value,state);applyPersona(e.target.value);state.org='全部组织';state.biz='全部业务';state.scope='全部层级';if(state.key==='home'){render();return}if(state.employeeId){navigate('employee/performance');return}if(state.actor==='大数据接口演示'&&state.key!=='performance'){navigate('performance/tracking');return}if(state.key==='performance'&&!PFDesk.allowed(perfState(state),state.page)){navigate('performance');return}if(state.role==='预算负责人'&&!['home','budget','performance'].includes(state.key)){navigate('home');return}render();return}state[k]=e.target.value;if(k==='role'){state.org='全部组织';state.biz='全部业务';state.scope='全部层级';if(state.role===roles[2]&&(state.key==='budget'||state.key==='performance'&&['jobs','library'].includes(state.page))){route(state.key==='budget'?'home':'performance/release');return}}render()});window.addEventListener('hashchange',()=>route(location.hash.slice(1)||'home'));route(location.hash.slice(1)||'home')})();