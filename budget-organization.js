/* Head office grants organisation limits. Headquarters HRBP also sets position limits. */
(() => {
  'use strict';
  const headquarters = '总部 HRBP';
  const levels = ['后台', '区域', '一线'];
  const sum = (rows, key) => rows.reduce((total, r) => total + (Number(r[key]) || 0), 0);
  const cents = value => Math.round(Number(value) * 100);
  const amount = value => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(cents(value)) && Math.abs(value * 100 - cents(value)) < 0.001;
  const heads = value => Number.isSafeInteger(value) && value >= 0;
  const get = id => document.getElementById('bo-' + id);
  const jobsOf = org => org.jobs || [];
  const applicable = (job, org) => job.levels.includes(org.level) && org.lines.some(l => l.biz === job.biz);
  const hasBiz = (ctx, biz) => !ctx.biz || ctx.biz === '全部业务' || biz === ctx.biz;
  const recipient = org => org.owner || ({后台:'总部一级负责人',区域:'区域总',一线:'1+N店长'}[org.level]);
  const businessOf = (record, catalog) => catalog.find(job => job.id === record.jobId)?.biz || record.biz;
  const snapshot = form => [...form.elements].filter(el => el.name).map(el => [el.name, el.value]);
  const numberInput = (name, val, step='1', aria='') =>
    '<input required type="number" name="'+name+'" min="0" step="'+step+'" value="'+val+'"'+(aria?' aria-label="'+aria+'"':'')+'>';
  const row = cells => '<tr>'+cells.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
  function table(headers, rows, empty) {
    return '<div class="tablewrap"><table><thead><tr>'+headers.map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+
      (rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'">'+empty+'</td></tr>')+'</tbody></table></div>';
  }
  function status(id) {
    return '<p id="bo-'+id+'" role="status" aria-live="polite" class="muted"></p>';
  }
  function ensureCurrent(ctx, org) {
    if(org.id !== ctx.center.id) throw Error('组织已切换，请重新选择。');
  }

  function ledger(ctx) {
    const org=ctx.center,e=ctx.esc,m=ctx.money;
    const visible=org.lines.filter(line=>hasBiz(ctx,line.biz));
    const lineRows=visible.map(l=>row([e(l.biz),l.cap+' 人',l.used+' 人',l.reserved+' 人',(l.cap-l.used-l.reserved)+' 人',m(l.usedCost)]));
    let grantForm='';
    if(ctx.actor===headquarters){
      grantForm='<details id="bo-grant-open"><summary>'+(org.authorized?'调整并下发额度':'下发编制和预算')+'</summary>'+
        '<form id="bo-grant"><label class="field">额度所属年度<select name="year"><option value="'+org.year+'">'+org.year+' 年（本年度）</option><option value="'+(Number(org.year)+1)+'">'+(Number(org.year)+1)+' 年（下年度）</option></select></label><p>接收组织 <strong>'+e(org.name)+'</strong>　接收人 <strong>'+e(recipient(org))+'</strong></p>'+
        '<div class="grid">'+org.lines.map((l,i)=>'<label class="field">'+e(l.biz)+'编制（人）'+numberInput('line'+i,l.cap)+'</label>').join('')+'</div>'+
        '<div class="grid"><label class="field">固定类预算（元）'+numberInput('fixed',org.costFixed,'0.01')+'</label>'+
        '<label class="field">其他刚性预算（元）'+numberInput('other',org.costOther,'0.01')+'</label>'+
        '<label class="field">下达依据或备注（选填）<input name="evidence" maxlength="160"></label></div>'+
        '<div class="actions"><button type="button" id="bo-preview">预览下达</button><button class="primary" type="submit" id="bo-issue" hidden>确认下达给'+e(recipient(org))+'</button></div>'+status('grant-message')+'</form></details>';
    }
    const records=(org.grantVersions||[]).slice().reverse();
    const audit=records.length?'<details><summary>下达记录（'+records.length+'）</summary>'+
      table(['年度','接收人','编制','人工预算','下达时间'],records.map(a=>row([e(a.year),e(a.recipient||recipient(org)),e(a.cap)+' 人',m(a.costCap),e(a.time||'—')])),'')+'</details>':'';
    return '<section class="panel"><h3>组织额度</h3><p>'+e(org.name)+' · '+e(org.level)+' · 接收人 '+e(recipient(org))+' · '+(org.authorized?'已下达':'待下达')+'</p>'+
      grantForm+table(['业务线','已下达编制','已入职','历史预留','可用编制','已占用预算'],lineRows,'当前业务线没有编制记录。')+
      '<p class="muted">已入职人数以 HR 状态为准，已发 Offer 和离职中人员均不计入。当期人员申请在入职后占用编制与预算。已占用预算含离职时尚未核定释放的金额。</p>'+audit+'</section>';
  }
  function validateGrant(org, catalog, grant) {
    const current=grant.year===Number(org.year);
    if(!current&&grant.year!==Number(org.year)+1)throw Error('请选择本年度或下年度。');
    if(current&&org.reviewLocked) throw Error('复盘锁定中，请结束复盘后下达本期额度。');
    if(grant.lines.length!==org.lines.length) throw Error('业务线已更新，请重新打开。');
    for(const [i,line] of org.lines.entries()){
      const next=grant.lines[i],allocated=jobsOf(org).filter(j=>businessOf(j,catalog)===line.biz);
      if(!heads(next.cap)||next.biz!==line.biz) throw Error('编制须为非负整数。');
      const minimum=Math.max(sum(allocated,'cap'),line.used+line.reserved);
      if(current&&next.cap<minimum)throw Error(line.biz+'至少保留 '+minimum+' 人编制，覆盖已分配岗位及占用名额。');
    }
    if(!amount(grant.costFixed)||!amount(grant.costOther)||!amount(grant.costCap)||!heads(grant.cap))throw Error('请输入有效的编制和预算金额，金额最多保留两位小数。');
    const minimum=Math.max(sum(jobsOf(org),'budget'),sum(org.lines,'usedCost')+sum(org.lines,'reservedCost'));
    if(current&&cents(grant.costCap)<cents(minimum)) throw Error('预算不能低于岗位已分配预算或已占用预算，当前下限为 '+minimum.toLocaleString('zh-CN')+' 元。');
  }
  function bindGrant(ctx) {
    const form=get('grant'); if(!form)return;
    const message=get('grant-message'),confirm=get('issue'),org=ctx.center;
    let previewed='';
    const read=()=>{
      const data=new FormData(form);
      const lines=org.lines.map((l,i)=>({biz:l.biz,cap:Number(data.get('line'+i))}));
      const costFixed=Number(data.get('fixed')),costOther=Number(data.get('other'));
      return {year:Number(data.get('year')),lines,cap:sum(lines,'cap'),costFixed,costOther,costCap:(cents(costFixed)+cents(costOther))/100,evidence:String(data.get('evidence')).trim()};
    };
    form.oninput=()=>{previewed='';confirm.hidden=true;message.textContent='';};
    form.elements.year.onchange=()=>{
      const year=Number(form.elements.year.value),future=year!==Number(org.year);
      const prior=future?(org.grantVersions||[]).filter(r=>Number(r.year)===year).at(-1):null;
      org.lines.forEach((l,i)=>{form.elements['line'+i].value=prior?.lines?.find(v=>v.biz===l.biz)?.cap??l.cap;});
      form.elements.fixed.value=prior?.costFixed??org.costFixed;form.elements.other.value=prior?.costOther??org.costOther;
      confirm.textContent=future?'确认保存下年度额度':'确认下达给'+recipient(org);
      confirm.hidden=true;previewed='';message.textContent=future?'下年度授权单独留存，本期编制与预算按当前授权执行。':'';
    };
    get('preview').onclick=()=>{
      if(ctx.actor!==headquarters || !form.isConnected || !form.reportValidity())return;
      try{
        const g=read();validateGrant(org,ctx.catalog,g);
        message.textContent=org.name+' · '+recipient(org)+' · '+g.year+' 年。'+(g.year===Number(org.year)?
          '编制 '+org.cap+' → '+g.cap+' 人，预算 '+ctx.money(org.costCap)+' → '+ctx.money(g.costCap)+'。':
          '下年度编制 '+g.cap+' 人，预算 '+ctx.money(g.costCap)+'，单独保存下年度版本。');
        previewed=JSON.stringify(snapshot(form));confirm.hidden=false;
      }catch(err){message.textContent=err.message;}
    };
    form.onsubmit=event=>{
      event.preventDefault();
      if(ctx.actor!==headquarters || !form.isConnected)return;
      if(!previewed||previewed!==JSON.stringify(snapshot(form))){message.textContent='请先预览本次下达。';return;}
      const g=read();
      const note=message.textContent+(g.evidence?' 依据：'+g.evidence:'');
      ctx.write('总部下达编制和预算',note,draft=>{
        ensureCurrent(ctx,draft);
        if(ctx.actor!==headquarters)throw Error('仅总部 HRBP 可下达组织额度。');
        validateGrant(draft,ctx.catalog,g);
        if(g.year===Number(draft.year)){
          draft.cap=g.cap;draft.costFixed=g.costFixed;draft.costOther=g.costOther;draft.costCap=g.costCap;draft.authorized=true;
          draft.lines.forEach((l,i)=>{l.cap=g.lines[i].cap;});
        }
        (draft.grantVersions??=[]).push({...g,actor:ctx.actor,recipient:recipient(draft),time:new Date().toLocaleString('zh-CN',{hour12:false}),version:'V'+((draft.grantVersions?.length||0)+1)});
      });
    };
  }
  const scopeOf = ctx => ctx.libraryOrgs || [ctx.center];
  const blocked = org => !org.authorized?'组织年度额度待下达':org.reviewLocked?'复盘锁定':'';
  const levelText = level => ({后台:'总部后台',区域:'区域中台',一线:'一线门店'}[level]||level);
  function orgJobForm(ctx){
    if(ctx.actor!==headquarters)return '';
    return '<div class="actions"><button class="primary" id="bo-new-quota" type="button">新增岗位额度</button></div><form id="bo-assignment" hidden><h4 id="bo-assign-title"></h4><div class="grid">'+
      '<label class="field">组织<select name="org" id="bo-select-org" required></select></label><label class="field">岗位<select name="job" id="bo-select-job" required></select></label>'+
      '<label class="field">岗位编制（人）'+numberInput('cap','','1')+'</label><label class="field">岗位年度预算（元）'+numberInput('budget','','0.01')+'</label></div>'+status('job-reference')+
      '<div class="actions"><button id="bo-estimate" type="button">按参考预算测算</button><button id="bo-save-quota" class="primary" type="submit">保存岗位额度</button><button id="bo-cancel-quota" type="button">取消</button></div>'+status('assign-message')+'</form>';
  }
  function catalogView(ctx) {
    const e=ctx.esc,editor=ctx.actor===headquarters;
    const rows=ctx.catalog.filter(j=>!j.openingBalance&&hasBiz(ctx,j.biz)&&(editor||applicable(j,ctx.center)));
    const biz=[...new Set(ctx.centers.flatMap(o=>o.lines.map(l=>l.biz)).concat(ctx.catalog.map(j=>j.biz)))];
    const form=editor?'<details id="bo-catalog-open"><summary>新增岗位</summary><form id="bo-catalog">'+
      '<div class="grid"><label class="field">岗位名称<input name="name" required maxlength="50"></label><label class="field">所属业务<select name="biz">'+biz.map(b=>'<option>'+e(b)+'</option>').join('')+'</select></label>'+
      '<label class="field">参考年度预算（元/人）'+numberInput('rate','','0.01')+'</label></div><fieldset><legend>适用组织</legend>'+
      levels.map(l=>'<label><input type="checkbox" name="levels" value="'+l+'"'+(!ctx.allOrganizations&&l===ctx.center.level?' checked':'')+'> '+l+'　</label>').join('')+'</fieldset>'+
      '<div class="actions"><button class="primary" type="submit">添加到岗位库</button></div>'+status('catalog-message')+'</form></details>':'';
    return '<section class="panel"><h3>岗位库</h3><p class="muted">每人年度参考预算用于测算；岗位年度预算以总部 HRBP 核定值为准。</p>'+form+
      table(['岗位 / 业务','适用组织','参考预算（元/人年）','状态',...(editor?['操作']:[])],rows.map(j=>row([e(j.name)+' / '+e(j.biz),e(j.levels.join('、')),ctx.money(j.unitBudget),j.active===false?'停用':'启用',...(editor?['<button type="button" data-bo-edit="'+e(j.id)+'">维护</button>']:[])])),'此范围暂无岗位。')+
      (editor?'<form id="bo-edit-catalog" hidden><h4 id="bo-edit-name"></h4><div class="grid"><label class="field">参考年度预算（元/人）'+numberInput('rate',0,'0.01')+'</label>'+
        '<label class="field">岗位状态<select name="active"><option value="yes">启用</option><option value="no">停用</option></select></label></div>'+
        '<div class="actions"><button type="submit" class="primary">保存岗位设置</button><button id="bo-cancel-edit" type="button">取消</button></div>'+status('edit-message')+'</form>':'')+'</section>';
  }
  let resumeList=null;
  function recordsOf(ctx){
    const byId=new Map(ctx.catalog.map(j=>[j.id,j]));
    return scopeOf(ctx).flatMap(org=>jobsOf(org).map(a=>({org,a,j:byId.get(a.jobId)}))).filter(({j})=>j&&hasBiz(ctx,j.biz)).sort((x,y)=>Number(!!x.j.openingBalance)-Number(!!y.j.openingBalance));
  }
  function quotaRows(ctx,records){
    const e=ctx.esc, editor=ctx.actor===headquarters;
    return table(['组织 / 层级','岗位 / 业务','岗位编制','已入职','历史预留','岗位年度预算','已占用预算',...(editor?['操作']:[])],records.map(({org,j,a})=>{
      const reason=j.openingBalance?'历史期初汇总':blocked(org);
      const edit=reason?e(reason):'<button type="button" data-bo-org="'+e(org.id)+'" data-bo-quota="'+e(j.id)+'">编辑</button>';
      return row([e(org.name)+' / '+e(levelText(org.level)),e(j.name)+' / '+e(j.biz)+(j.active===false&&!j.openingBalance?'（已停用）':''),a.cap+' 人',a.used+' 人',a.reserved+' 人',ctx.money(a.budget),ctx.money(a.usedCost),...(editor?[edit]:[])]);
    }),'未找到匹配的岗位额度。');
  }
  function library(ctx) {
    const org=ctx.center,jobs=jobsOf(org),all=ctx.allOrganizations,records=recordsOf(ctx);
    return BImportUI.render(ctx)+'<section class="panel"><h3>组织岗位预算</h3><p class="muted">'+(all?'当前范围：'+scopeOf(ctx).length+' 个组织':ctx.esc(org.name)+' · '+(blocked(org)||('组织尚未分配至岗位：'+(org.cap-sum(jobs,'cap'))+' 人，'+ctx.money(org.costCap-sum(jobs,'budget')))))+'</p>'+orgJobForm(ctx)+
      '<label class="field">查找岗位预算<input type="search" id="bo-search" placeholder="输入组织或岗位名称"></label><div id="bo-quota-list">'+quotaRows(ctx,records.slice(0,10))+'</div><div class="actions"><button id="bo-prev" type="button">上一页</button><span id="bo-page" role="status"></span><button id="bo-next" type="button">下一页</button></div>'+(records.some(r=>r.j.openingBalance)?'<p class="muted">历史期初汇总仅用于保留原台账占用，计入额度校验，不作为标准岗位配置。</p>':'')+'</section>'+catalogView(ctx);
  }
  function bindAssignment(ctx) {
    const form=get('assignment'),orgInput=form?.elements.org,job=form?.elements.job,cap=form?.elements.cap,budget=form?.elements.budget;
    let target=null,lockedJob=null,editing=false,opener=null,page=0;
    const data=recordsOf(ctx),list=get('quota-list'),search=get('search');if(!list)return;
    const viewKey=JSON.stringify([ctx.actor,ctx.biz,scopeOf(ctx).map(o=>o.id)]);
    if(resumeList?.key===viewKey){search.value=resumeList.q;page=resumeList.page;}resumeList=null;
    const chosen=()=>ctx.catalog.find(j=>j.id===job.value);
    function refreshList(){const q=search.value.trim().toLowerCase(),matches=data.filter(({org,j})=>!q||[org.name,j.name].some(s=>s.toLowerCase().includes(q))),last=Math.max(0,Math.ceil(matches.length/10)-1);page=Math.min(page,last);list.innerHTML=quotaRows(ctx,matches.slice(page*10,page*10+10));get('prev').disabled=!page;get('next').disabled=page>=last;get('page').textContent=matches.length+' 条 · 第 '+(page+1)+' / '+(last+1)+' 页';}
    search.oninput=()=>{page=0;refreshList();};get('prev').onclick=()=>{page--;refreshList();};get('next').onclick=()=>{page++;refreshList();};refreshList();
    if(!form || ctx.actor!==headquarters)return;
    function syncJob(){const j=chosen(),org=target?.center,a=org&&jobsOf(org).find(r=>r.jobId===j?.id),can=!!(org&&j&&!blocked(org));cap.disabled=budget.disabled=get('estimate').disabled=get('save-quota').disabled=!can;
      cap.value=a?.cap??'';budget.value=a?.budget??'';get('job-reference').textContent=!org?'请选择配置归属组织。':blocked(org)||(!j?(job.options.length===1?'没有可新增的适用岗位。已有配置请在列表中编辑。':'请选择适用岗位。'):('每人年度参考 '+ctx.money(j.unitBudget)+'。'+(j.active===false?'岗位已停用，仅可收回未使用额度。':'')));
    }
    function syncOrg(){target=ctx.forOrganization(orgInput.value);const org=target?.center;const choices=org&&!blocked(org)?ctx.catalog.filter(j=>!j.openingBalance&&hasBiz(ctx,j.biz)&&applicable(j,org)&&(editing?j.id===lockedJob:j.active!==false&&!jobsOf(org).some(a=>a.jobId===j.id))):[];
      job.replaceChildren(new Option('请选择岗位',''),...choices.map(j=>new Option(j.biz+' / '+j.name,j.id)));job.disabled=editing||!org||!!blocked(org);job.value=editing?lockedJob:'';syncJob();}
    function open(orgId,jobId,button){editing=!!jobId;lockedJob=jobId;opener=button;get('assign-title').textContent=editing?'编辑岗位额度':'新增岗位额度';get('assign-message').textContent='';orgInput.replaceChildren(new Option('请选择组织',''),...scopeOf(ctx).map(o=>new Option(o.name+(blocked(o)?'（'+blocked(o)+'）':''),o.id)));orgInput.disabled=editing||!ctx.allOrganizations;orgInput.value=orgId||(!ctx.allOrganizations?ctx.center.id:'');syncOrg();form.hidden=false;(editing?cap:orgInput.disabled?job:orgInput).focus();form.scrollIntoView({block:'nearest'});}
    get('new-quota').onclick=e=>open('',null,e.currentTarget);list.onclick=e=>{const b=e.target.closest('[data-bo-quota]');if(b&&list.contains(b))open(b.dataset.boOrg,b.dataset.boQuota,b);};orgInput.onchange=syncOrg;job.onchange=syncJob;get('cancel-quota').onclick=()=>{form.hidden=true;target=null;(opener?.isConnected?opener:get('new-quota')).focus();};
    get('estimate').onclick=()=>{if(cap.reportValidity()&&chosen())budget.value=(cents(chosen().unitBudget)*Number(cap.value)/100).toFixed(2);};
    form.onsubmit=event=>{
      event.preventDefault();if(form.hidden||!form.isConnected||ctx.actor!==headquarters)return;
      if(!target||target.center.id!==orgInput.value||!ctx.forOrganization(orgInput.value)){get('assign-message').textContent='当前组织已变更，请重新选择。';return;}
      const j=chosen(),newCap=Number(cap.value),newBudget=Number(budget.value);
      if(!j||j.openingBalance||!hasBiz(ctx,j.biz)||(editing&&j.id!==lockedJob)||!cap.value||!budget.value||!heads(newCap)||!amount(newBudget)){get('assign-message').textContent='请填写有效的岗位、编制和预算。';return;}
      const prior=jobsOf(target.center).find(a=>a.jobId===j.id),note=target.center.name+' / '+j.name+' · '+(prior?.cap||0)+' → '+newCap+' 人，'+ctx.money(prior?.budget||0)+' → '+ctx.money(newBudget);
      resumeList={key:viewKey,q:search.value,page};
      const ok=target.write('配置岗位预算',note,draft=>{
        ensureCurrent(target,draft);
        if(target.actor!==headquarters||!draft.authorized)throw Error('本组织尚未获授权或当前身份无权办理。');
        if(draft.reviewLocked)throw Error('复盘期间暂停计划外预算调整。');
        const line=draft.lines.find(l=>l.biz===j.biz);
        if(!line||!applicable(j,draft))throw Error('岗位不适用于本组织。');
        const existing=jobsOf(draft).find(a=>a.jobId===j.id);
        if(editing!==!!existing)throw Error('岗位配置已变化，请返回列表重新选择。');
        if(j.active===false&&(!existing||newCap>existing.cap||newBudget>existing.budget))throw Error('岗位已停用，只可收回未使用额度。');
        if(existing&&newCap<existing.used+existing.reserved)throw Error('岗位编制不能低于已入职和预留人数之和。');
        if(existing&&cents(newBudget)<cents(existing.usedCost+existing.reservedCost))throw Error('岗位预算不能低于已占用与已预留预算之和。');
        const others=jobsOf(draft).filter(a=>a.jobId!==j.id),sameBiz=others.filter(a=>businessOf(a,ctx.catalog)===j.biz);
        if(sum(others,'cap')+newCap>draft.cap||sum(sameBiz,'cap')+newCap>line.cap)throw Error('岗位编制合计超出组织或业务线编制。');
        if(others.reduce((n,a)=>n+cents(a.budget),0)+cents(newBudget)>cents(draft.costCap))throw Error('岗位年度预算合计超出组织预算。');
        if(existing)Object.assign(existing,{cap:newCap,budget:newBudget});
        else {
          if(!newCap&&!newBudget)throw Error('新增岗位额度须填写编制或预算。');
          (draft.jobs??=[]).push({jobId:j.id,cap:newCap,budget:newBudget,used:0,reserved:0,usedCost:0,reservedCost:0});
        }
      });
      if(ok===false)resumeList=null;
      if(ok===false && form.isConnected)get('assign-message').textContent=document.getElementById('bg-message')?.textContent||'保存失败，请重新核对额度。';
    };
  }
  function bindCatalog(ctx) {
    const add=get('catalog');if(!add)return;
    add.onsubmit=event=>{
      event.preventDefault();if(ctx.actor!==headquarters||!add.isConnected)return;const fields=new FormData(add),name=String(fields.get('name')).trim(),biz=String(fields.get('biz')),selected=fields.getAll('levels'),unitBudget=Number(fields.get('rate'));
      if(!name||!amount(unitBudget)||!selected.length){get('catalog-message').textContent='请填写岗位名称、参考预算，并至少选择一个适用组织层级。';return;}
      ctx.updateAll('新增岗位',biz+' / '+name,db=>{
        if(ctx.actor!==headquarters)throw Error('仅总部 HRBP 可维护岗位库。');
        if(db.catalog.some(j=>j.name===name&&j.biz===biz&&j.levels.some(l=>selected.includes(l))))throw Error('同名岗位已覆盖所选业务及组织层级，请维护已有岗位。');
        db.catalog.push({id:'job-'+(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-')),name,biz,levels:selected,unitBudget,active:true});
      });
    };
    const form=get('edit-catalog');
    document.querySelectorAll('[data-bo-edit]').forEach(button=>button.onclick=()=>{
      const j=ctx.catalog.find(j=>j.id===button.dataset.boEdit);if(!j)return;
      form.dataset.id=j.id;form.hidden=false;get('edit-name').textContent='维护 '+j.name;form.elements.rate.value=j.unitBudget;
      form.elements.active.value=j.active===false?'no':'yes';form.elements.rate.focus();
    });
    get('cancel-edit').onclick=()=>{form.hidden=true;};
    form.onsubmit=event=>{
      event.preventDefault();if(ctx.actor!==headquarters||!form.isConnected)return;const j=ctx.catalog.find(j=>j.id===form.dataset.id),rate=Number(form.elements.rate.value),active=form.elements.active.value==='yes';
      if(!j||!amount(rate)){get('edit-message').textContent='请输入有效的每人年度参考预算。';return;}
      ctx.updateAll('维护岗位库',j.name+' · '+ctx.money(rate)+' /人年 · '+(active?'启用':'停用'),db=>{
        const record=db.catalog.find(r=>r.id===j.id);
        if(ctx.actor!==headquarters||!record||record.openingBalance)throw Error('当前岗位无法维护。');
        Object.assign(record,{unitBudget:rate,active});
      });
    };
  }

  window.BOrg={
    render(ctx,tab){return tab==='library'?library(ctx):ledger(ctx);},
    bind(ctx,tab){if(tab==='library'){bindAssignment(ctx);if(ctx.actor===headquarters){BImportUI.bind(ctx);bindCatalog(ctx);}}else if(ctx.actor===headquarters)bindGrant(ctx);}
  };
})();
