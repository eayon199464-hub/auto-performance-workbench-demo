/* Review and share ledgers belong to a single 1+N profit centre. */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>'¥'+Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:2});
const pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const ratio=(a,b)=>b>0?a/b:NaN, val=r=>Number(r??0), sum=(a,k)=>a.reduce((n,x)=>n+val(x[k]),0);
const unique=x=>Array.from(new Set(x));const unitMoney=v=>Math.round(v*100)/100;
const now=()=>new Date().toLocaleString('zh-CN',{hour12:false}),die=t=>{throw Error(t)};
const requireRole=(c,r)=>{if(c.actor!==r)die('当前角色不能办理此操作。')};
const requireOperations=c=>{if(!c.canHandleOperations)die('当前账号未获该项经办权限。')};
const exists=x=>Array.isArray(x)?x:[], hist=x=>exists(x.history);
const ui=new Map(), getUI=c=>{const k=c.center.id+'|'+c.month;if(!ui.has(k))ui.set(k,{period:'month',half:Number(c.month.slice(5))===12?2:1});return ui.get(k)};
const reduced=(list,fn)=>list.reduce(fn,{});
const groupBy=(list,k)=>reduced(list,(d,r)=>{const id=r[k];d[id]??=[];d[id].push(r);return d});
const monthIndex=m=>Number(m.slice(0,4))*12+Number(m.slice(5))-1;
const validRow=r=>Number.isFinite(Number(r.output))&&r.output!=null&&r.output!==''&&Number(r.avgPeople)>0&&Number.isFinite(Number(r.threshold))&&Number(r.threshold)>0;
const warn=r=>validRow(r)&&Number(r.output)/Number(r.avgPeople)<Number(r.threshold);
const stateOf=(db,create=false)=>{if(create&&!db.cycleReview)db.cycleReview={closures:[],packages:[],allocs:[]};return db.cycleReview||{closures:[],packages:[],allocs:[]}};
const centerOK=z=>Number(z.cap)>0&&Number(z.costCap)>0&&hist(z).length>0;
function ensure(z,month){
 if(!centerOK(z)||!month)return false;let changed=false;
 const by=groupBy(hist(z).filter(x=>x.month<=month),'biz');const tasks=z.tasks||(z.tasks=[]);
 for(const [biz,arr] of Object.entries(by)){
  let streak=0,prev=-99;
  for(const r of arr.slice().sort((a,b)=>a.month.localeCompare(b.month))){
   const idx=monthIndex(r.month);if(prev===idx)continue;
   streak=warn(r)?(prev+1===idx?streak+1:1):0;prev=idx;
   if(streak!==2)continue;
   const id='BRT|'+biz+'|'+r.month;
   if(!tasks.some(t=>t.id===id)){tasks.push({id,biz,month:r.month,status:'待重新核定',to:'区域、后台'+biz+'部门、运营管理中心',created:r.month+' 月度监控',events:[]});changed=true;}
  }
 }
 return changed;
}
function periodHist(z,c,mode){return hist(z).filter(r=>r.month<=c.month&&(mode==='month'?r.month===c.month:r.month.slice(0,4)===c.month.slice(0,4)))}
const selectedBiz=(c,b)=>!c.biz||['全部业务','全部','all'].includes(c.biz)||b===c.biz;
function peers(c){return Array.isArray(c.centers)&&c.centers.length?c.centers:[c.center]}
function rank(c,biz,mode){let data=peers(c).map(z=>{const rs=periodHist(z,c,mode).filter(r=>r.biz===biz&&validRow(r));return {id:z.id,eff:rs.length?ratio(sum(rs,'output'),sum(rs,'avgPeople')):NaN}}).filter(p=>Number.isFinite(p.eff));const current=data.find(x=>x.id===c.center.id);return current?{pos:1+data.filter(p=>p.eff>current.eff).length,n:data.length}:null;}
const statuses=x=>'<strong>'+esc(x)+'</strong>';
const empty=s=>'<p class="muted">'+esc(s)+'</p>', note=s=>'<p class="notice">'+esc(s)+'</p>';
const table=(head,rows)=>'<div class="tablewrap"><table><thead><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const panel=(title,detail,body)=>'<section class="panel"><h3>'+esc(title)+'</h3>'+(detail?'<p class="muted">'+esc(detail)+'</p>':'')+body+'</section>';
const field=(id,label,props='type="text"')=>'<label class="field">'+esc(label)+'<input id="bc-'+id+'" '+props+'></label>';
const button=(id,label,cls='primary')=>'<button type="button" class="'+cls+'" id="bc-'+id+'">'+esc(label)+'</button>';
const byId=k=>document.getElementById('bc-'+k);
const options=(xs,sel)=>xs.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(sel)?'selected':'')+'>'+esc(t)+'</option>').join('');
const periodToggle=(c)=>'<div class="grid"><label class="field">统计截止月份<select id="bc-report-month">'+options(unique(hist(c.center).map(r=>r.month).filter(m=>m<=c.month)).sort().reverse().map(m=>[m,m]),getUI(c).reportMonth||c.month)+'</select></label><label class="field">统计期间<select id="bc-period">'+options([['month','所选单月'],['ytd','本年累计至所选月']],getUI(c).period)+'</select></label></div>';
function summary(c){
 const p=getUI(c).period,report={...c,month:getUI(c).reportMonth||c.month}, by=groupBy(periodHist(c.center,report,p).filter(r=>selectedBiz(c,r.biz)),'biz');
 const rows=Object.entries(by).map(([b,rs])=>{
 const rnk=rank(report,b,p),effective=rs.filter(validRow),qs=rs.filter(r=>Number(r.quota)>0);
 const eff=ratio(sum(effective,'output'),sum(effective,'avgPeople'));const full=qs.length?qs.filter(r=>r.filled>=r.quota).length/qs.length:NaN;
 return [esc(b),Number.isFinite(eff)?eff.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—', rnk?rnk.pos+' / '+rnk.n:'—',pct(ratio(sum(qs,'filled'),sum(qs,'quota'))),pct(full),money(sum(rs,'accrualBudget')-sum(rs,'cost')),p==='month'&&warn(rs[rs.length-1])?'触发预警':(p==='month'?(effective.length?'未触警':'数据待补'):'触警 '+rs.filter(warn).length+' 个月')];
 });
 return panel('月度与累计复盘','人效仅在同业务线、同期间、当前授权范围内比较。人工结余取期间成本基准减已发生刚性成本。统计月份仅切换本看板；任务、额度及分享仍在当前办理账期。',periodToggle(c)+(rows.length?table(['业务线','人效（产出/人月）','人效排名','编制使用率','满编率¹','期间人工结余','预警'],rows):empty('本期间暂无匹配的月报。'))+'<details><summary>查看演示统计口径</summary><p>累计人效按总产出 ÷ 总人月计算，不平均月排名。编制使用率按月末实占人数合计 ÷ 核定人数合计。¹ 满编率暂按达到核定编制的业务线月数 ÷ 有效业务线月数演示；各业务线产出单位、人效阈值和满编率正式口径待确认。</p></details>');
}
function auditForm(c,t,i){
 const z=c.center;
 const explanation='重核建议为 '+val(t.proposedCap)+' 人、'+money(t.proposedCost)+'；正式调额时按五条业务线填写核定子额度，总上限取合计。';
 return '<label class="field">正式核定处理<select id="bc-endmode-'+i+'"><option value="keep">沿用现行额度</option><option value="change" '+(z.reviewLocked?'disabled':'')+'>调整本年额度并立即生效</option></select></label>'
  +'<div id="bc-endchange-'+i+'" hidden><p class="muted">'+esc(explanation)+'</p>'+table(['业务线','当前上限','在岗＋预占','新核定（人）'],z.lines.map((l,n)=>[esc(l.biz),esc(l.cap),esc(l.used+l.reserved),'<input type="number" id="bc-endcap-'+i+'-'+n+'" aria-label="'+esc(l.biz)+'本年重核子额度" min="'+esc(l.used+l.reserved)+'" step="1" value="'+esc(l.cap)+'">']))
  +'<div class="grid">'+field('endfixed-'+i,'新固定成本（元）','type="number" min="0" step="0.01" value="'+esc(z.costFixed)+'"')+field('endother-'+i,'新其他刚性成本（元）','type="number" min="0" step="0.01" value="'+esc(z.costOther)+'"')+'</div><p class="notice" id="bc-endpreview-'+i+'" aria-live="polite"></p></div>'
  +(z.reviewLocked?note('半年度复盘锁定中，禁止实施计划外调额。可在复盘后办理，或说明依据并沿用原额度。'):'')
  +field('reason-'+i,'核定依据（沿用时填写原因）','maxlength="180"')+button('task-'+i,'确认核定结果');
}
function grantSnapshot(z){return {cap:z.cap,costCap:z.costCap,costFixed:z.costFixed,costOther:z.costOther,lines:z.lines.map(l=>({biz:l.biz,cap:l.cap}))}}
function taskPanel(c){
 const tasks=exists(c.center.tasks).filter(t=>t.month<=c.month&&selectedBiz(c,t.biz)&&t.id?.startsWith('BRT|')).sort((a,b)=>b.month.localeCompare(a.month));
 if(!tasks.length)return panel('连续两月预警任务','同一利润中心、同一业务线连续两个自然月低于阈值时生成一张任务单；中间缺月或恢复正常会中断连续计数。',empty('当前无连续两月触警任务。'));
 const list=tasks.map((t,i)=>{const info='<p>'+esc(t.month)+' · '+esc(t.biz)+' · '+statuses(t.status)+'　'+(t.due?'优化截止 '+esc(t.due):'优化截止：待核定时指定')+'</p><p class="muted">系统内模拟送达：'+esc(t.to)+'</p>';
 const trail=exists(t.events).map(e=>'<li>'+esc(e.time)+' · '+esc(e.actor)+' · '+esc(e.text)+'</li>').join('');
 let form='';
 if(c.canHandleOperations&&t.status==='待重新核定')form='<div class="grid">'+field('due-'+i,'门店优化截止日期','type="date"')+field('limit-'+i,'复核建议编制上限（人）','type="number" min="0" step="1"')+field('cost-'+i,'复核建议年度成本包（元）','type="number" min="0" step="0.01"')+field('reason-'+i,'重核依据与门店优化要求','maxlength="180"')+'</div>'+button('task-'+i,'下达限期优化任务');
 if(c.actor==='1+N店长'&&t.status==='待门店优化')form=field('reason-'+i,'已完成的人员优化措施 / 依据','maxlength="180"')+button('task-'+i,'提交门店优化结果');
 if(c.canHandleOperations&&t.status==='待验收')form='<label class="field">验收处理<select id="bc-audit-'+i+'"><option value="keep">沿用现行额度</option><option value="refer">转额度核定</option></select></label>'+field('reason-'+i,'验收结论与依据','maxlength="180"')+button('task-'+i,'提交验收结论');
 if(c.actor==='总部 HRBP'&&t.status==='待总部 HRBP 核定')form=auditForm(c,t,i);
 return '<details data-bctask="'+esc(t.id)+'" data-idx="'+i+'"><summary>'+esc(t.biz)+' · '+esc(t.month)+'　'+esc(t.status)+'</summary>'+info+(trail?'<ul>'+trail+'</ul>':'')+form+'</details>';
 }).join('');
 return panel('连续两月预警任务','启动编制与成本包重核，并跟踪门店限期优化。门店优化后，由运营管理中心验收，可沿用现行额度；需要调整时转由中心内的总部 HRBP 核定。',list);
}
const hTag=(year,h)=>year+'-H'+h;
function period(z,h){const year=String(z.year);const start=h===1?1:7;const months=Array.from({length:6},(_,i)=>year+'-'+String(start+i).padStart(2,'0'));const rows=hist(z).filter(r=>months.includes(r.month));const biz=unique(z.lines.map(l=>l.biz));const valid=(v)=>v!=null&&v!==''&&Number.isFinite(Number(v))&&+v>=0;
 const complete=biz.length>0&&biz.every(b=>months.every(m=>{const t=rows.filter(r=>r.biz===b&&r.month===m);return t.length===1&&valid(t[0].cost)&&valid(t[0].accrualBudget)}));
 return {id:hTag(year,h),name:year+'年'+(h===1?'上半年':'下半年'),end:months[5],rows,complete,savings:unitMoney(sum(rows,'accrualBudget')-sum(rows,'cost'))};}
const getHalf=(c)=>{const locked=c.center.reviewLocked&&c.center.reviewHalf;return locked?Number(locked):getUI(c).half};
const halfPick=(c,h)=>'<label class="field">核算半年度<select id="bc-half" '+(c.center.reviewLocked?'disabled':'')+'>'+options([[1,c.center.year+'年上半年'],[2,c.center.year+'年下半年']],h)+'</select></label>';
function review(c){
 const z=c.center,h=getHalf(c),p=period(z,h),ledger=stateOf(z),closed=ledger.closures.find(a=>a.period===p.id);const ok=centerOK(z)&&p.complete&&c.month>=p.end;
 let op=halfPick(c,h);
 if(closed)op+=note('已结案 · 核定结余 '+money(closed.net)+'，按 '+closed.rate+'% 计提 '+money(closed.accrued)+'。依据：'+closed.evidence+'。下一周期建议：'+closed.recommendation);
 else if(!ok)op+=empty(c.month<p.end?'该半年度尚未到期，不可核算或计提。':'该半年度月报或核定额度不足，暂不可结案。');
 else if(c.canHandleOperations&&!z.reviewLocked)op+=button('open','启动半年度复盘');
 if(z.reviewLocked&&!closed)op+=note('复盘进行中：暂停计划外额度调整。')+(c.canHandleOperations?'<div class="grid">'+field('net','核定可分享结余（元）','type="number" min="0" step="0.01"')+field('rate','本次计提比例（%）','type="number" min="0" max="100" step="0.01"')+field('evidence','已实现结余与比例的核定依据','maxlength="180"')+field('recommend','下一周期编制与成本包建议及原因','maxlength="180"')+'</div>'+button('close','核算、计提并结束复盘'):'');
 return summary(c)+taskPanel(c)+panel('半年度复盘与计提','按整个利润中心核算。人效领先优先上浮，连续预警门店相应下调；调整幅度及分享比例由业务核定。年度建议不改变额度，由总部 HRBP 在额度台账中核定下发。',op+'<p class="muted">期间预算与实绩差额：'+money(p.savings)+'。仅可对已核定的正结余计提，核定值不得超过期间正结余；负结余不形成分享包。</p>');
}
function share(c){
 const z=c.center,l=stateOf(z),released=p=>unitMoney(sum(l.packages.filter(x=>x.period===p),'amount')), assigned=id=>unitMoney(sum(l.allocs.filter(x=>x.pkg===id),'amount'));
 const rows=l.closures.map(x=>[esc(x.period),money(x.net),esc(x.rate)+'%',money(x.accrued),money(released(x.period)),money(unitMoney(x.accrued-released(x.period)))]);
 const avail=l.closures.filter(x=>x.accrued>released(x.period));
 const newpkg=c.canHandleOperations&&avail.length?'<div class="grid"><label class="field">从哪期计提中分享<select id="bc-pperiod">'+options(avail.map(x=>[x.period,x.period+' · 可分享 '+money(x.accrued-released(x.period))]))+'</select></label>'+field('amount','本次下达总包（元）','type="number" min="0.01" step="0.01"')+field('ref','分享依据单号（唯一）','maxlength="80"')+'</div>'+button('release','向 1+N 下达分享包'):'';
 const pkgs=l.packages.map(x=>[esc(x.ref),esc(x.period),money(x.amount),money(assigned(x.id)),money(unitMoney(x.amount-assigned(x.id)))]);
 const remaining=l.packages.filter(x=>x.amount>assigned(x.id));const alloc=c.actor==='1+N店长'&&remaining.length?'<div class="grid"><label class="field">使用分享包<select id="bc-package">'+options(remaining.map(x=>[x.id,x.ref+' · 可用 '+money(x.amount-assigned(x.id))]))+'</select></label>'+field('recipient','分配对象（人员或团队）','maxlength="60"')+field('allocamt','本项拟分配金额（元）','type="number" min="0.01" step="0.01"')+field('aref','分配明细编号（包内唯一）','maxlength="80"')+'</div>'+button('allocate','登记包内分配'):'';
 return panel('结余计提与总包下达','半年度先核定结余、确认比例并计提；后续可以不定期、分批向门店下达，未计提的金额不能分。',rows.length?table(['期间','核定结余','核定比例','已计提','已下达','还可下达'],rows)+newpkg:note('暂无已核定的结余计提。先由运营管理中心在工作台的「人效复盘」完成到期半年度复盘，再下达分享包。'))+panel('店长分配方案','总包由店长在包内分配，不直接视作店长个人所得；登记分配不代表已付款。',(pkgs.length?table(['分享单号','所属期间','包总额','已分配','可分配'],pkgs):empty('暂无已下达的分享包。'))+alloc+(l.allocs.length?table(['分享单号','分配明细编号','对象','登记金额'],l.allocs.map(x=>[esc(l.packages.find(p=>p.id===x.pkg)?.ref),esc(x.ref),esc(x.recipient),money(x.amount)])):''));}
const req=(id,title)=>{const v=byId(id)?.value.trim();if(!v)die('请填写'+title);return v};
const number=(id,label,min,max,integer=false)=>{const v=req(id,label),n=Number(v);if(!Number.isFinite(n)||n<min||n>max||(integer?!Number.isInteger(n):Math.abs(Math.round(n*100)-n*100)>0.0001))die(label+'超出允许范围或精度');return n;};
const bindClick=(id,act)=>{const el=byId(id);if(el)el.onclick=act};
function bind(c,k){
 const ms=byId('report-month');if(ms)ms.onchange=()=>{if(hist(c.center).some(r=>r.month===ms.value)&&ms.value<=c.month)getUI(c).reportMonth=ms.value;c.refresh()};
 let sel=byId('period');if(sel)sel.onchange=()=>{getUI(c).period=sel.value;c.refresh()};
 const hx=byId('half');if(hx)hx.onchange=()=>{getUI(c).half=Number(hx.value);c.refresh()};
 const h=getHalf(c),p=period(c.center,h),op=(label,fn)=>c.write(label,c.center.name+' · '+c.month,fn);
 bindClick('open',()=>op('启动半年度复盘',z=>{requireOperations(c);const fp=period(z,h);if(!centerOK(z)||!fp.complete||c.month<fp.end||z.reviewLocked||stateOf(z).closures.some(x=>x.period===fp.id))die('当前不能启动复盘');z.reviewLocked=true;z.reviewHalf=h;}));
 bindClick('close',()=>op('完成复盘与结余计提',z=>{requireOperations(c);const fp=period(z,h),l=stateOf(z,true);if(!z.reviewLocked||z.reviewHalf!==h||!fp.complete||c.month<fp.end||l.closures.some(x=>x.period===fp.id))die('复盘状态已变化');const net=number('net','核定可分享结余',0,Math.max(fp.savings,0)),rate=number('rate','计提比例',0,100);
 l.closures.push({period:fp.id,net,rate,accrued:unitMoney(net*rate/100),evidence:req('evidence','核定依据'),recommendation:req('recommend','下周期建议'),time:now()});z.reviewLocked=false;z.reviewHalf=null;}));
 bindClick('release',()=>op('下达门店分享包',z=>{requireOperations(c);const l=stateOf(z,true),pr=req('pperiod','计提期间'),closure=l.closures.find(x=>x.period===pr),ref=req('ref','分享依据单号');if(!closure||l.packages.some(x=>x.ref===ref))die('该期间未计提，或此单号已下达');const max=unitMoney(closure.accrued-sum(l.packages.filter(x=>x.period===pr),'amount')),amount=number('amount','分享包金额',0.01,max);l.packages.push({id:pr+'/'+ref,ref,period:pr,amount,time:now()});}));
 bindClick('allocate',()=>op('登记店长包内分配',z=>{requireRole(c,'1+N店长');const l=stateOf(z,true),pkg=req('package','分享包'),p=l.packages.find(x=>x.id===pkg),ref=req('aref','分配明细编号');if(!p||l.allocs.some(x=>x.pkg===pkg&&x.ref===ref))die('分享包不存在，或该明细已登记');const amount=number('allocamt','分配金额',0.01,unitMoney(p.amount-sum(l.allocs.filter(x=>x.pkg===pkg),'amount')));l.allocs.push({pkg,ref,recipient:req('recipient','分配对象'),amount,time:now()});}));
 document.querySelectorAll('[data-bctask]').forEach(el=>{const i=el.dataset.idx,id=el.dataset.bctask;const mode=byId('endmode-'+i);
 if(mode){const details=byId('endchange-'+i), preview=()=>{details.hidden=mode.value!=='change';if(details.hidden)return;const caps=c.center.lines.map((_,n)=>byId('endcap-'+i+'-'+n).value.trim()),cash=[byId('endfixed-'+i).value.trim(),byId('endother-'+i).value.trim()];byId('endpreview-'+i).textContent='新核定总上限：'+(caps.every(x=>x!==''&&Number.isInteger(+x)&&+x>=0)?caps.reduce((s,x)=>s+Number(x),0)+' 人':'待补齐')+'；新成本包：'+(cash.every(x=>x!==''&&Number.isFinite(+x)&&+x>=0)?money(cash.reduce((s,x)=>s+Number(x),0)):'待补齐')+'。确认后立即更新本年可用额度。'};mode.onchange=preview;details.oninput=preview;preview();}
 bindClick('task-'+i,()=>op('办理预警任务：'+id,z=>{const t=z.tasks.find(x=>x.id===id);if(!t)die('任务已变更');const text=req('reason-'+i,'处理依据');let detail=text;
 if(t.status==='待重新核定'){requireOperations(c);const due=req('due-'+i,'截止日期');if(!/^\d{4}-\d\d-\d\d$/.test(due)||due<c.month+'-01')die('截止日期不得早于当前业务月份');const cap=number('limit-'+i,'建议编制',0,1000000,true),cost=number('cost-'+i,'建议成本包',0,Number.MAX_SAFE_INTEGER/100);Object.assign(t,{due,proposedCap:cap,proposedCost:cost,status:'待门店优化'});detail+='；建议 '+cap+' 人 / '+money(cost)+'，截止 '+due;
 }else if(t.status==='待门店优化'){requireRole(c,'1+N店长');t.status='待验收'}else if(t.status==='待验收'){requireOperations(c);const mode=req('audit-'+i,'验收处理');if(mode==='refer'){t.status='待总部 HRBP 核定';detail+='；已转额度核定，额度未变。';}else if(mode==='keep'){const snap=grantSnapshot(z);t.finalGrant={mode,before:snap,after:snap,evidence:text,actor:c.actor,time:now()};t.status='已完成';detail+='；沿用现行额度。';}else die('验收处理无效');}else if(t.status==='待总部 HRBP 核定'){requireRole(c,'总部 HRBP');const before=grantSnapshot(z),mode=req('endmode-'+i,'额度处理方式');if(mode==='change'){
 if(z.reviewLocked)die('复盘锁定期间不得计划外调额');const caps=z.lines.map((l,n)=>number('endcap-'+i+'-'+n,l.biz+'新额度（不得小于在岗及预占）',l.used+l.reserved,1000000,true));
 const fixed=number('endfixed-'+i,'固定成本',0,1e12),other=number('endother-'+i,'其他刚性成本',0,1e12),cost=unitMoney(fixed+other);if(cost<unitMoney(sum(z.lines,'usedCost')+sum(z.lines,'reservedCost')))die('新成本包不得低于已占和预占成本之和');
 z.lines.forEach((l,n)=>{l.cap=caps[n]});Object.assign(z,{cap:caps.reduce((x,y)=>x+y,0),costFixed:fixed,costOther:other,costCap:cost});
 }else if(mode!=='keep')die('核定处理方式无效');const after=grantSnapshot(z);t.finalGrant={mode,before,after,evidence:text,actor:c.actor,time:now()};detail+=(mode==='change'?'；正式核定已生效：':'；沿用现行额度：')+before.cap+' → '+after.cap+' 人，'+money(before.costCap)+' → '+money(after.costCap)+'。';t.status='已完成'}else die('该任务已完成');t.events.push({actor:c.actor,time:now(),text:detail})}));});
}
window.BCycle={renderSummary:summary,selectReportMonth(c,month){if(hist(c.center).some(r=>r.month===month))getUI(c).reportMonth=month;},render:(c,k)=>k==='share'?share(c):review(c),bind,ensure};
})();
