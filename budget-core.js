/* One authorization ledger powers the workbench, assigned positions and personnel requests. */
(() => {
  'use strict';
  const { levels, roles, money, total } = BModel;
  const CURRENT = '2026-11';
  const KEY = 'autoops.budget.organizations.v2';
  const OLD = 'autoops.budget.authorization.v1';
  const HRBP = '总部 HRBP';
  const noBudgetRole = '无预算授权';
  const isCentral = actor => actor === HRBP;
  const allBiz = '全部业务';
  const allLevels = '全部层级';
  const roleNames = [HRBP, ...Object.values(roles)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const opt = (value,label,selected) => '<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
  const now = () => new Date().toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});
  let model, raw, selected='', level=allLevels, biz=allBiz, tab='library', extra='', notice='', lastRole='', lastFocus='', lastCtx;
  let libraryOrg='';
  let redraw=()=>{};
  function migrateStaffFlow(db){
    if(db.staffFlowVersion>=2)return false;
    const time=now();
    for(const org of db.centers){
      function releaseHold(job,line,cost){
        const cents=Math.round(Number(cost)*100);
        if(!Number.isSafeInteger(cents)||cents<0||![job,line].every(r=>r && r.reserved>=1 && Math.round(r.reservedCost*100)>=cents))return false;
        for(const row of [job,line]){
          row.reserved--;
          row.reservedCost=(Math.round(row.reservedCost*100)-cents)/100;
        }
        return true;
      }
      for(const request of org.staffRequests||[]){
        const previous=request.status;
        if(!['pending','approved','onboarding','offered'].includes(previous))continue;
        let event='人员申请沿用原校验结果，等待 HR 入职回执。';
        if(previous!=='pending'){
          const job=org.jobs.find(j=>j.jobId===request.jobId),line=org.lines.find(l=>l.biz===request.biz);
          if(releaseHold(job,line,request.cost))event+='已释放原申请预留。';
          else event+='原预留与台账不一致，需核对历史余额。';
        }
        if(previous!=='offered')request.status='awaitingHire';
        (request.history??=[]).push({time,actor:'系统',event});
      }
      // Early demos seeded one fictitious sales reservation without a corresponding application.
      if(['pc-1','pc-2','pc-3'].includes(org.id) && org.logs?.some(l=>l.action==='年初核定' && l.note?.includes('示例初始记录。'))){
        const job=org.jobs.find(j=>j.jobId==='J-2-0'),line=org.lines.find(l=>l.biz==='销售');
        if(releaseHold(job,line,6500))org.logs.unshift({time,month:CURRENT,actor:'系统',action:'更新演示期初数据',note:'移除无入职回执的期初示例预留，1 人、6,500 元。'});
      }
    }
    db.staffFlowVersion=2;
    return true;
  }
  function sync() {
    const stored=localStorage.getItem(KEY)||'';
    if(model && raw===stored) return model;
    if(stored){
      const data=JSON.parse(stored);
      if(data.schema!==2||!Array.isArray(data.centers)||!Array.isArray(data.catalog)) throw Error('组织预算数据无法读取。');
      for(const center of data.centers){
        if(center.level==='后台' && center.owner==='一级专业负责人')center.owner=roles[center.level];
      }
      if(migrateStaffFlow(data))save(data);
      else {model=data;raw=stored;}
      return model;
    }
    const legacy=localStorage.getItem(OLD);
    const previous=legacy?JSON.parse(legacy):null;
    if(previous&&!Array.isArray(previous.centers))throw Error('原门店台账无法读取。');
    const data=BModel.initialize(previous);
    refreshWarnings(data);
    save(data);
    return data;
  }
  function save(data){
    const value=JSON.stringify(data);
    localStorage.setItem(KEY,value); raw=value; model=data;
  }
  function refreshWarnings(db){
    for(const c of db.centers.filter(c=>c.level==='一线'&&c.authorized)){
      const before=new Set(c.tasks.map(t=>t.id));
      if(window.BCycle.ensure(c,CURRENT)){
        for(const t of c.tasks.filter(t=>!before.has(t.id)))
          c.logs.unshift({time:t.created,month:t.month,actor:'系统 · 月度监控',action:'连续两月人效预警',note:t.biz+' · '+t.to});
      }
    }
  }
  function actorOf(s){
    if(s.role==='一线员工')return '员工';
    return roleNames.includes(s.persona)?s.persona:noBudgetRole;
  }
  function selectedOwnerOrg(actor){
    const candidates=sync().centers.filter(c=>c.owner===actor);
    const id=sessionStorage.getItem('budget.demo.scope.'+actor) ||
      (actor===roles['后台']?sessionStorage.getItem('budget.demo.scope.一级专业负责人'):null);
    return candidates.find(c=>c.id===id)||candidates[0];
  }
  function beforePersona(persona,state){
    if(state.key!=='budget'||!isCentral(actorOf(state))||!roleNames.includes(persona))return;
    const c=sync().centers.find(c=>c.id===selected&&c.owner===persona);
    if(c)sessionStorage.setItem('budget.demo.scope.'+persona,c.id);
  }
  function allowed(s,workbench=false){
    const actor=actorOf(s);
    if(isCentral(actor))return sync().centers;
    if(actor==='员工'||actor===noBudgetRole)return [];
    const own=selectedOwnerOrg(actor);
    if(!own)return [];
    return sync().centers.filter(c=>c.id===own.id||(workbench&&actor==='区域总'&&c.level==='一线'&&c.region===own.region));
  }
  // Already recorded HR overages may be reconciled later. Other writes may not worsen them.
  function exceedsQuota(used,limit,oldUsed,oldLimit){
    return used-limit>Math.max(0,(oldUsed??0)-(oldLimit??0))+.005;
  }
  function assertCenter(c,db,prior,entered=false){
    const nonNegative = v=>Number.isFinite(v)&&v>=0;
    const integer=v=>Number.isSafeInteger(v)&&v>=0;
    if(!integer(c.cap)||![c.costFixed,c.costOther,c.costCap].every(nonNegative)||Math.abs(c.costFixed+c.costOther-c.costCap)>.005) throw Error('请核对组织编制和固定、其他两类预算。');
    const oldLines=prior?.lines||[];
    const costs=lines=>total(lines,'usedCost')+total(lines,'reservedCost');
    if(total(c.lines,'cap')>c.cap||(!entered && exceedsQuota(costs(c.lines),c.costCap,costs(oldLines),prior?.costCap)))throw Error('组织额度不足，请核对已占用和预留金额。');
    const byBiz=new Map(c.lines.map(l=>[l.biz,0]));
    const jobs=new Set();
    for(const j of c.jobs){
      const template=db.catalog.find(x=>x.id===j.jobId);
      if(!template||jobs.has(j.jobId)||!byBiz.has(template.biz))throw Error('岗位与所属业务线不一致。');
      jobs.add(j.jobId);byBiz.set(template.biz,byBiz.get(template.biz)+j.cap);
      const old=prior?.jobs.find(row=>row.jobId===j.jobId);
      if(![j.cap,j.used,j.reserved].every(integer)||![j.budget,j.usedCost,j.reservedCost].every(nonNegative)||
        (!entered && (exceedsQuota(j.used+j.reserved,j.cap,old?old.used+old.reserved:0,old?.cap)||exceedsQuota(j.usedCost+j.reservedCost,j.budget,old?old.usedCost+old.reservedCost:0,old?.budget))))
        throw Error('岗位额度低于已入职及流程预留，请核对岗位库。');
    }
    if(total(c.jobs,'budget')>c.costCap+.005) throw Error('已分配岗位预算合计超过组织总预算，请先调整岗位预算。');
    for(const l of c.lines){
      const old=oldLines.find(row=>row.biz===l.biz);
      if(![l.cap,l.used,l.reserved].every(integer)||![l.usedCost,l.reservedCost].every(nonNegative)||(!entered&&exceedsQuota(l.used+l.reserved,l.cap,old?old.used+old.reserved:0,old?.cap))||byBiz.get(l.biz)>l.cap)
        throw Error(l.biz+'的编制不足以覆盖现有岗位分配或占用。');
    }
  }
  function validHirePosting(prior,next){
    const entered=next.staffRequests.filter(r=>r.status==='active' && prior.staffRequests.some(old=>old.id===r.id && ['awaitingHire','offered','receiptReview'].includes(old.status)));
    if(entered.length!==1||quotaDefinition(prior)!==quotaDefinition(next))return false;
    const person=entered[0],oldPerson=prior.staffRequests.find(r=>r.id===person.id);
    if(person.jobId!==oldPerson.jobId || person.biz!==oldPerson.biz || person.cost!==oldPerson.cost)return false;
    function posted(rows,previous,key,id){
      return rows.some(row=>row[key]===id) && rows.every((row,i)=>{
        const old=previous[i],match=row[key]===id;
        return row.reserved===old.reserved && row.reservedCost===old.reservedCost &&
          row.used===old.used+Number(match) && Math.round(row.usedCost*100)===Math.round(old.usedCost*100)+(match?Math.round(person.cost*100):0);
      });
    }
    return posted(next.jobs,prior.jobs,'jobId',person.jobId) && posted(next.lines,prior.lines,'biz',person.biz);
  }
  // Usage and reservations change during hiring. Authorized ceilings change only through HRBP.
  function quotaDefinition(org){
    return JSON.stringify({
      id:org.id, owner:org.owner, level:org.level, year:org.year, authorized:org.authorized,
      cap:org.cap, costFixed:org.costFixed, costOther:org.costOther, costCap:org.costCap,
      standard:org.standard, outLimit:org.outLimit, grantVersions:org.grantVersions, nextGrant:org.nextGrant,
      lines:org.lines.map(({biz,cap})=>[biz,cap]),
      jobs:org.jobs.map(({jobId,cap,budget})=>[jobId,cap,budget])
    });
  }
  function findPerson(personKey,except){
    const priority=['active','leaving','receiptReview','offered','awaitingHire'];
    const found=new Set(model.centers.flatMap(c=>c.staffRequests).filter(r=>r.personKey===personKey&&r.id!==except).map(r=>r.status));
    return priority.find(s=>found.has(s))||'clear';
  }
  function feedback(text){
    notice=text;
    const target=document.querySelector('#bg-message, #bb-status, #bc-feedback');
    if(target){target.textContent=text;target.focus();}
  }
  function context(s,c,scope,{workbench=false,activeView,aggregate=false}={}){
    const actor=actorOf(s), base=raw;
    const owner=isCentral(actor)||c.id===selectedOwnerOrg(actor)?.id;
    const authorizedActor=owner?actor:'区域查看';
    function change(action,note,fn,global,latest=false,options={}){
      if(!latest&&(raw!==base||(localStorage.getItem(KEY)||'')!==base)){
        sync();redraw();feedback('记录已更新，请核对最新余额后重试。');return false;
      }
      try{
        if(activeView && !activeView())throw Error('页面范围已变更，请重新选择岗位。');
        if(aggregate && !global)throw Error('请选择要调整的组织和岗位。');
        if(latest){
          sync();
          if(s.key!=='budget'||s.page!=='staff'||selected!==c.id||!allowed(s).some(x=>x.id===c.id))throw Error('办理组织已变更，请重新核对申请。');
        }
        if(!owner||actor!==actorOf(s)||(global&&actor!==HRBP)) throw Error('当前身份没有这项办理权限。');
        const draft=structuredClone(model);
        const target=draft.centers.find(x=>x.id===c.id);
        fn(global?draft:target);
        if(actor!==HRBP && quotaDefinition(target)!==quotaDefinition(model.centers.find(item=>item.id===c.id)))
          throw Error('仅总部 HRBP 可变更核定编制和预算。');
        for(const item of global?draft.centers:[target]){
          const prior=model.centers.find(prev=>prev.id===item.id);
          const entered=options.hrReceipt && latest && !global && validHirePosting(prior,item);
          assertCenter(item,draft,prior,entered);
        }
        if(!options.writesOwnAudit){
          const logs=aggregate && global?(draft.catalogLogs??=[]):target.logs;
          logs.unshift({time:now(),month:CURRENT,actor:actor+' · '+(BModel.accounts[actor]||target.id),action,note});
        }
        save(draft);
        notice=action+'已保存';redraw();return true;
      }catch(err){feedback(err.message);return false;}
    }
    return {center:c,centers:scope,get catalog(){return model.catalog;},actor:authorizedActor,month:CURRENT,
      canHandleOperations:BModel.accounts[authorizedActor]===BModel.budgetAccount.id && BModel.budgetAccount.handlesOperations,
      biz:workbench?s.biz:biz,esc,money,refresh:()=>redraw(),hrLookup:findPerson,
      write:(a,n,f,options)=>change(a,n,f,false,false,options),writeLatest:(a,n,f,options)=>change(a,n,f,false,true,options),updateAll:(a,n,f,options)=>change(a,n,f,true,false,options)};
  }
  function affiliation(s){
    return s.persona===HRBP?'<span class="budget-affiliation">所属组织：'+esc(BModel.budgetAccount.organization)+'</span>':'';
  }
  function identity(s){
    const actor=actorOf(s);
    const options=roleNames.includes(actor)?roleNames:[actor,...roleNames];
    return affiliation(s)+'<label class="pf-identity">当前操作身份 <select id="bg-actor" aria-label="当前操作身份" data-filter="persona">'+options.map(r=>opt(r,r===noBudgetRole?s.persona+'（无预算授权）':r,actor)).join('')+'</select></label>';
  }
  function choose(s){
    const scope=allowed(s), actor=actorOf(s);
    if(tab!==s.page){
      tab=s.page;extra='';notice='';
      if(tab==='library'&&actor===HRBP){libraryOrg='';level=allLevels;biz=allBiz;}
    }
    if(lastRole!==actor){level=allLevels;biz=allBiz;libraryOrg='';extra='';notice='';lastRole=actor;}
    if(s.focus!==lastFocus){
      if(['budgetLedger','budgetStaff'].includes(s.focus)){
        extra='';biz=s.biz;level=allLevels;
        const candidates=filterHome(s,scope);
        selected=(candidates.find(c=>tab==='staff'&&c.staffRequests.some(r=>['awaitingHire','offered'].includes(r.status)))||candidates[0])?.id||'';
      }
      lastFocus=s.focus;
    }
    if(!isCentral(actor))level=scope[0]?.level||allLevels;
    const list=scope.filter(c=>level===allLevels||c.level===level);
    const hqLibrary=tab==='library'&&actor===HRBP;
    if(hqLibrary&&!list.some(org=>org.id===libraryOrg))libraryOrg='';
    const allOrganizations=hqLibrary&&!libraryOrg;
    const c=list.find(c=>c.id===(hqLibrary?libraryOrg:selected))||list[0];
    if(!c)return null;
    selected=allOrganizations?'':c.id;
    const orgRange=allOrganizations?list:[c];
    const businesses=[...new Set(orgRange.flatMap(org=>org.lines.map(line=>line.biz)))];
    if(!businesses.includes(biz))biz=allBiz;
    const ctx=context(s,c,scope,{aggregate:allOrganizations});
    if(tab==='library'){
      ctx.allOrganizations=allOrganizations;
      ctx.libraryOrgs=orgRange.filter(org=>biz===allBiz||org.lines.some(line=>line.biz===biz));
      ctx.forOrganization=id=>{
        const target=ctx.libraryOrgs.find(org=>org.id===id);
        const currentView=()=>lastCtx===ctx && s.key==='budget' && s.page==='library' && actorOf(s)===HRBP;
        return target && currentView()?context(s,target,scope,{activeView:currentView}):null;
      };
    }
    return {ctx,list,businesses,hqLibrary};
  }
  function auxiliary(c){
    const buttons={...(c.level==='一线'?{approval:'跨线调编与增额',share:'结余分享'}:{}),log:'异动记录'};
    if(!buttons[extra])extra='';
    return '<div class="ob-secondary">'+Object.entries(buttons).map(([id,t])=>'<button type="button" data-aux="'+id+'" aria-expanded="'+(extra===id)+'">'+t+'</button>').join('')+'</div>';
  }
  function legacyComponent(){return extra==='approval'?BDaily:extra==='share'?BCycle:BGrant;}
  function render(s){
    let picked;
    try{picked=choose(s);}catch(e){return '<p class="panel">'+esc(e.message)+'</p>';}
    if(!picked){lastCtx=null;return '<p class="panel">当前身份没有获授权组织。</p>';}
    const {ctx,list,businesses,hqLibrary}=picked,c=ctx.center;lastCtx=ctx;
    const component=tab==='staff'?BStaff:BOrg;
    const badge=c.authorized?'已下发':'待下发';
    const used=total(c.lines,'used'),held=total(c.lines,'reserved'),cashHeld=total(c.lines,'reservedCost'),cashUsed=total(c.lines,'usedCost');
    const cards=[['授权编制',c.cap+' 人','已入职 '+used+' 人'],['可用编制',(c.cap-used-held)+' 人',held?'历史预留 '+held+' 人':'HR 已入职后占用'],
      ['年度预算',money(c.costCap),'固定类 '+money(c.costFixed)+' · 其他类 '+money(c.costOther)],
      ['可用预算',money(c.costCap-cashUsed-cashHeld),'已占 '+money(cashUsed)+(cashHeld?' · 历史预留 '+money(cashHeld):'')]];
    return '<div class="bg-console">'+
      '<div class="bg-scope">'+(isCentral(ctx.actor)?'<label>层级<select id="bg-level">'+[allLevels,...levels].map(l=>opt(l,l===allLevels?l:l==='后台'?'总部后台':l==='区域'?'区域中台':'一线门店',level)).join('')+'</select></label>':'')+
      '<label>组织<select id="bg-center">'+(hqLibrary?opt('','全部组织',selected):'')+list.map(o=>opt(o.id,o.name,selected)).join('')+'</select></label>'+
      (businesses.length>1?'<label>业务线<select id="bg-biz">'+[allBiz,...businesses].map(b=>opt(b,b,biz)).join('')+'</select></label>':'')+
      (ctx.allOrganizations?'':'<span class="bg-date">额度接收人：'+esc(c.owner)+' · '+badge+' · '+c.year+' 年</span>')+'</div>'+
      (tab==='ledger'?'<section class="bg-cards" aria-label="当前组织额度">'+cards.map(([title,value,detail])=>'<div><span>'+title+'</span><strong>'+(c.authorized?value:'待下发')+'</strong><small>'+detail+'</small></div>').join('')+'</section>':'')+
      '<p id="bg-message" tabindex="-1" role="status">'+esc(notice)+'</p><div class="bg-body">'+component.render(ctx,tab)+(tab==='ledger'?auxiliary(c)+(extra?legacyComponent().render(ctx,extra):''):'')+'</div></div>';
  }
  function bind(fn){
    redraw=fn;
    if(!lastCtx)return;
    const onChange=(id,cb)=>{const e=document.getElementById(id);if(e)e.onchange=()=>{cb(e.value);notice='';extra='';fn();};};
    onChange('bg-level',v=>{level=v;selected='';libraryOrg='';biz=allBiz;});
    onChange('bg-center',v=>{selected=v;if(tab==='library'&&lastCtx.actor===HRBP)libraryOrg=v;biz=allBiz;});
    onChange('bg-biz',v=>biz=v);
    for(const button of document.querySelectorAll('[data-aux]'))button.onclick=()=>{extra=extra===button.dataset.aux?'':button.dataset.aux;notice='';fn();if(extra)buttonAnchor();};
    (tab==='staff'?BStaff:BOrg).bind(lastCtx,tab);
    if(tab==='ledger'&&extra)legacyComponent().bind(lastCtx,extra);
  }
  function buttonAnchor(){document.querySelector('[data-aux][aria-expanded="true"]')?.scrollIntoView({block:'nearest'});}
  function filterHome(s,list){
    const selectedLevel={'总部后台':'后台','区域中台':'区域','一线（1+N）':'一线'}[s.scope];
    return list.filter(c=>(!selectedLevel||c.level===selectedLevel)&&(!s.org||s.org==='全部组织'||c.region===s.org)&&
      (!s.biz||s.biz===allBiz||c.lines.some(l=>l.biz===s.biz)));
  }
  function dashboard(s){
    const list=filterHome(s,allowed(s,true));
    return {centers:list,catalog:sync().catalog,asOf:CURRENT,month:s.month,biz:s.biz,actor:actorOf(s),esc,money,
      context(id){const c=list.find(x=>x.id===id);return c?context(s,c,list,{workbench:true}):null;}};
  }
  function home(s){
    lastFocus='';
    const centers=dashboard(s).centers.filter(c=>c.authorized);
    const match=b=>s.biz===allBiz||s.biz===b;
    const history=s.month!==CURRENT;
    const lines=centers.flatMap(c=>history?c.history.filter(r=>r.month===s.month&&match(r.biz)):c.lines.filter(l=>match(l.biz)));
    return {cap:total(lines,history?'quota':'cap'),used:history?total(lines,'filled'):total(lines,'used')+total(lines,'reserved'),
      cash:!history&&s.biz===allBiz?total(centers,'costCap')-total(lines,'usedCost')-total(lines,'reservedCost'):null,historical:history,
      pending:history?0:centers.flatMap(c=>c.staffRequests).filter(r=>['awaitingHire','offered'].includes(r.status)&&match(r.biz)).length};
  }
  window.BPortal={render,bind,identity,affiliation,home,canAccess:s=>roleNames.includes(actorOf(s)),dashboard,beforePersona,bindHome:fn=>{redraw=fn;}};
})();
