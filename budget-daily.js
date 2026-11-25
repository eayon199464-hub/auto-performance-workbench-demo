/* 1+N editable workforce ledger. Amounts represent the annual cost commitment, not paid salary. */
(()=>{'use strict';
const e=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const date=()=>new Date().toLocaleString('zh-CN',{hour12:false}),uid=()=>globalThis.crypto?.randomUUID?.()||('br'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
const nums=(v)=>typeof v==='number'&&Number.isFinite(v),cash=n=>'¥'+Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2}),moneyround=n=>Math.round(n*100)/100;
const req=z=>z.requests||[],line=(z,b)=>z.lines.find(l=>l.biz===b),use=l=>l.used+l.reserved;
const totals=z=>z.lines.reduce((a,l)=>({n:a.n+use(l),cost:moneyround(a.cost+l.usedCost+l.reservedCost),out:a.out+l.out}),{n:0,cost:0,out:0});
const assert=(b,m)=>{if(!b)throw Error(m)},num=(v,max=1e10)=>{let n=Number(v);assert(v!==''&&Number.isFinite(n)&&n>=0&&n<=max&&Math.abs(n*100-Math.round(n*100))<.00001,'请填写有效的非负金额（最多两位小数）。');return n;};
const integer=(v,max=10000)=>{let n=num(v,max);assert(Number.isInteger(n),'编制必须为整数。');return n;};
const dict={hire:'招聘预占',join:'入职转占',release:'释放额度',move:'同业务线调岗',transfer:'跨业务线划转',extra:'特殊增额'};
const label={pending:'待审批',approved:'已通过',rejected:'已驳回',reserved:'招聘预占中',active:'在岗',released:'已离岗',cancelled:'已撤销',done:'已办理'};
const isApproval=r=>r.kind==='transfer'||r.kind==='extra';
function countChecks(z,b,n,cost,out){
 const t=totals(z),l=line(z,b);if(!l)return ['请选择有效业务线。'];
 return [[t.n+n<=z.cap,'利润中心总编制不足'],[use(l)+n<=l.cap,'本业务线子编制不足'],[moneyround(t.cost+cost)<=z.costCap,'年度刚性成本包余额不足'],[nums(z.outLimit)&&z.outLimit>=0&&z.outLimit<=1&&(t.n+n===0||((t.out+out)/(t.n+n)<=z.outLimit+1e-10)),'外包占比超过演示上限或尚未配置']].filter(([ok])=>!ok).map(a=>a[1]);
}
function checkCommon(c,z){assert(c.actor==='1+N店长','此项由 1+N 店长办理。');assert(z.authorized!==false,'本年度额度尚未核定。')}
function adjustable(z){assert(!z.reviewLocked,'复盘期内不办理计划外调整。');}
function checkPlan(z,r){
 const l=line(z,r.biz);assert(l,'业务线不存在。');adjustable(z);
 if(r.kind==='transfer'){const bad=countChecks(z,r.biz,0,0,0);assert(!bad.length,'划转前复核：'+bad.join('；'));const d=line(z,r.toBiz);assert(d&&d!==l,'请选择不同的接收业务线。');assert(r.n>0&&Number.isInteger(r.n),'请选择正整数人数。');assert(l.cap-use(l)>=r.n,'转出线剩余额度不足。请调整数量或重新申请。');}
 else{assert(r.kind==='extra'&&r.n>=0&&r.cost>=0&&(r.n||r.cost),'增编人数或追加金额至少有一项大于零。');}
}
function store(c,action,note,fn,source){
 const node=document.getElementById('bd-status');if(node)node.textContent='';
 try{const result=c.write(action,note,z=>{assert(z.id===source,'利润中心已变更，请重新办理。');assert(z.authorized!==false,'本年度尚未核定额度。');z.requests??=[];fn(z)});if(result===false)return;}
 catch(err){if(node)node.textContent=err.message;}
}
const ops=(ls,sel='')=>ls.map(([v,t])=>'<option value="'+e(v)+'"'+(v===sel?' selected':'')+'>'+e(t)+'</option>').join('');
const fld=(t,elem)=>'<label class="field">'+t+elem+'</label>';
const inp=(id,type='text',opts='')=>'<input id="bd-'+id+'" type="'+type+'" '+opts+'>';
const sel=(id,values)=>'<select id="bd-'+id+'">'+ops(values)+'</select>';
const textinput=(id,hint,req=true)=>inp(id,'text',(req?'required ':'')+'maxlength="100" placeholder="'+e(hint)+'"');
const value=id=>(document.getElementById('bd-'+id)?.value||'').trim();
const roleShop=c=>c.actor==='1+N店长',roleQuota=c=>c.actor==='总部 HRBP';
const inScope=(c,b)=>!c.biz||c.biz==='全部业务'||c.biz===b;
const visible=(c,r)=>inScope(c,r.biz)||inScope(c,r.toBiz);
const optLines=c=>c.center.lines.filter(l=>inScope(c,l.biz)).map(l=>[l.biz,l.biz]);
const statusmsg='<p id="bd-status" role="status" aria-live="polite"></p>';
const fields=(...items)=>'<div class="grid">'+items.join('')+'</div>';
let kind='hire',appKind='transfer';
function dailyBody(c){
 const z=c.center,hire=kind==='hire';
 const avail=req(z).filter(r=>r.kind==='hire'&&visible(c,r)&&((kind==='join'&&r.status==='reserved')||(kind==='release'&&['active','reserved'].includes(r.status))||(kind==='move'&&r.status==='active')));
 const source=sel('ref',[['','请选择记录'],...avail.map(r=>[r.id,[r.biz,r.job,r.person||r.ref,r.type,label[r.status]].join(' / ')])]);
 return '<h3>'+dict[kind]+'</h3>'+(!hire?'<p class="muted">选择有明细的占用记录办理。期初余额按汇总导入，不代替人员明细。</p>':'<p class="muted">按一个招聘名额预占编制和当年预计刚性成本；入职时转为在岗，不再占一次。</p>')+
 '<form id="bd-daily">'+(hire?fields(fld('业务线',sel('biz',optLines(c))),fld('岗位',textinput('job','例如：服务顾问')),fld('人员类型',sel('type',[['自有','自有'],['外包','外包']])),fld('当年预计刚性成本（元）',inp('cost','number','min="0.01" max="1000000000" step="0.01" required placeholder="固定＋其他类"'))):fields(fld('关联招聘／人员记录',source),kind==='join'?fld('入职员工（姓名或工号）',textinput('person','输入演示员工标识')):kind==='move'?fld('调入岗位（同业务线）',textinput('job','填写新岗位')):''))+
 fields(fld('业务单号／依据',textinput('doc','例如：招聘单号、入职单号')),fld('办理说明',textinput('reason','填写事由或线下材料编号',false)))+
 '<p id="bd-preview" class="notice"></p><div class="actions"><button class="primary" type="submit">'+({hire:'提交招聘预占',join:'确认入职转占',release:'释放本次占用',move:'确认同线调岗'}[kind])+'</button></div></form>';
}
function planBody(c){
 const cross=appKind==='transfer';
 return '<h3>'+dict[appKind]+'申请</h3><p class="muted">'+(cross?'只划转尚未使用的业务线编制。中心编制总量、刚性成本包保持不变；提交申请时不扣划。':'超限先拦截。确有业务需要时另提增额申请；通过后生成额度，原用工事项须重新校验。')+'</p><form id="bd-plan">'+fields(fld(cross?'转出业务线':'申请业务线',sel('biz',optLines(c))),cross?fld('接收业务线',sel('to',[['','请选择'],...c.center.lines.map(l=>[l.biz,l.biz])])):'',fld(cross?'划转人数':'追加编制人数',inp('n','number','required step="1" min="'+(cross?'1':'0')+'" value="'+(cross?'1':'0')+'"')),cross?'':fld('追加中心年度成本包（元）',inp('cost','number','required step="0.01" min="0" value="0"')))+fields(cross?'':fld('追加金额归属',sel('bucket',[['fixed','固定类'],['other','其他类']])),fld('依据单号',textinput('doc','原始申请或线下依据编号')),fld('申请原因',textinput('reason','说明业务需求'))) +'<div class="actions"><button class="primary" type="submit">提交线上审批</button></div></form>';
}
function approvalRows(c){
 const rows=req(c.center).filter(r=>isApproval(r)&&visible(c,r)&&(!r.month||r.month<=c.month)).slice().reverse();if(!rows.length)return '<p class="muted">当前范围暂无调编或增额申请。</p>';
 return '<div class="tablewrap"><table><thead><tr><th>业务与依据</th><th>申请内容</th><th>处理状态</th><th>审批节点</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+dict[r.kind]+'</strong><br>'+e(r.ref)+' · '+e(r.month)+'</td><td>'+e(r.biz)+(r.kind==='transfer'?' → '+e(r.toBiz)+' · '+r.n+' 人':' · 编制 +'+r.n+' 人／'+(r.bucket==='other'?'其他类':'固定类')+'成本包 +'+cash(r.cost))+'<br><small>'+e(r.note)+'</small></td><td>'+e(label[r.status])+'</td><td>'+((r.status==='pending'&&roleQuota(c)&&c.center.authorized!==false)?'<button type="button" data-bd-approve="'+e(r.id)+'" '+(c.center.reviewLocked?'disabled':'')+'>核准额度并生效</button> <button type="button" data-bd-refuse="'+e(r.id)+'">驳回</button>':e(r.handledBy||'总部 HRBP'))+(r.at?'<br><small>'+e(r.at)+'</small>':'')+(r.rejectReason?'<br>'+e(r.rejectReason):'')+'</td></tr>').join('')+'</tbody></table></div>';
}
function render(c,k){
 const z=c.center,shop=roleShop(c),rows=req(z).filter(r=>r.kind==='hire'&&visible(c,r)&&r.month<=c.month).slice().reverse();
 if(k==='approval')return '<section class="panel"><h2>调编与例外审批</h2><p>跨业务线调编和特殊增额才进入审批。总部 HRBP 核准后额度生效；申请本身不改变额度。</p>'+statusmsg+(shop&&z.authorized!==false&&!z.reviewLocked?'<label class="field">申请类型<select id="bd-application">'+ops([['transfer','跨业务线划转'],['extra','特殊增额']],appKind)+'</select></label><div id="bd-applybox">'+planBody(c)+'</div>':('<p class="notice">'+(z.reviewLocked?'复盘期内暂停计划外划转与增额。':z.authorized===false?'中心年度额度待核定。':roleQuota(c)?'本身份可处理已提交的线上申请。':'可查看已提交的申请。')+'</p>'))+'</section><section class="panel"><h3>申请与审批记录</h3>'+approvalRows(c)+'</section>';
 return '<section class="panel"><h2>用工办理</h2><p>额度内由 1+N 自主办理。外包占比按中心在岗与招聘预占合计校验（演示口径）；具体比例和正式第四项校验待确认。</p>'+statusmsg+(shop&&z.authorized!==false?'<label class="field">办理事项<select id="bd-kind">'+ops(Object.entries(dict).slice(0,4),kind)+'</select></label><div id="bd-work">'+dailyBody(c)+'</div>':'<p class="notice">'+(z.authorized===false?'本年度额度尚未下达。':'由 1+N 店长办理，当前身份只读。')+'</p>')+'</section><section class="panel"><h3>本中心用工记录</h3>'+(rows.length?'<div class="tablewrap"><table><thead><tr><th>业务／岗位</th><th>人员类型／标识</th><th>招聘单号</th><th>年度成本占用</th><th>状态</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+e(r.biz)+' / '+e(r.job)+'</td><td>'+e(r.type)+' / '+e(r.person||'待入职')+'</td><td>'+e(r.ref)+'</td><td>'+cash(['active','reserved'].includes(r.status)?r.cost:0)+'</td><td>'+e(label[r.status])+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">尚无本期办理记录。提交招聘后，可在此关联入职、调岗或释放。</p>')+'</section>';
}
function bind(c,k){
 const z=c.center,el=id=>document.getElementById('bd-'+id),msg=t=>{if(el('status'))el('status').textContent=t};
 if(k==='approval'){
  if(el('application'))el('application').onchange=ev=>{appKind=ev.target.value;c.refresh()};
  if(el('plan'))el('plan').onsubmit=ev=>{ev.preventDefault();try{
   const r={id:uid(),kind:appKind,status:'pending',month:c.month,biz:value('biz'),toBiz:appKind==='transfer'?value('to'):'',n:integer(value('n')),cost:appKind==='extra'?num(value('cost')):0,bucket:value('bucket'),ref:value('doc'),note:value('reason'),submitted:date(),applicant:c.actor};
   assert(r.ref&&r.note,'请填写依据及原因。');store(c,'提交'+dict[r.kind],r.ref+' · '+r.biz+(r.toBiz?' → '+r.toBiz:'')+' · '+r.n+'人／'+cash(r.cost),live=>{checkCommon(c,live);assert(inScope(c,r.biz),'超出当前业务范围。');checkPlan(live,r);assert(!req(live).some(x=>x.kind===r.kind&&x.ref===r.ref&&x.status!=='rejected'),'相同单号的申请已存在。');live.requests.push(r)},z.id)
  }catch(err){msg(err.message)}};
  document.querySelectorAll('[data-bd-approve],[data-bd-refuse]').forEach(b=>b.onclick=()=>{const id=b.dataset.bdApprove||b.dataset.bdRefuse,pass=!!b.dataset.bdApprove,r=req(z).find(x=>x.id===id);if(!r)return;let why='';if(!pass){const val=window.prompt('填写驳回原因');if(val===null)return;why=val.trim();if(!why){msg('请填写驳回原因。');return}}
   store(c,pass?'审批通过 · '+dict[r.kind]:'驳回 · '+dict[r.kind],r.ref+'，'+r.biz+(r.toBiz?' → '+r.toBiz:'')+'，'+r.n+'人／'+cash(r.cost)+(why?'，'+why:''),live=>{assert(roleQuota(c),'仅总部 HRBP 可核准或驳回调额申请。');const q=req(live).find(x=>x.id===id);assert(q&&q.status==='pending'&&visible(c,q),'该申请已处理或不在当前范围。');if(pass){checkPlan(live,q);const l=line(live,q.biz);if(q.kind==='transfer'){l.cap-=q.n;line(live,q.toBiz).cap+=q.n}else{l.cap+=q.n;live.cap+=q.n;live.costCap=moneyround(live.costCap+q.cost);const bucket=q.bucket==='other'?'costOther':'costFixed'; live[bucket]=moneyround((live[bucket]||0)+q.cost)}}q.status=pass?'approved':'rejected';q.handledBy=c.actor;q.at=date();q.rejectReason=why},z.id)
  });return;
 }
 if(el('kind'))el('kind').onchange=ev=>{kind=ev.target.value;c.refresh()};
 if(!el('daily'))return;
 const preview=()=>{const b=value('biz'),cost=Number(value('cost')),out=value('type')==='外包'?1:0,record=req(z).find(r=>r.id===value('ref'));let v='';if(kind==='hire'){const l=line(z,b),t=totals(z);if(l)v='中心可用 '+(z.cap-t.n)+' 人 · '+b+'可用 '+(l.cap-use(l))+' 人 · 剩余成本包 '+cash(z.costCap-t.cost)+'。'+(value('cost')?'本次占用 1 人／'+cash(cost)+'。校验：'+(countChecks(z,b,1,cost,out).join('；')||'通过')+'。':'填入预计成本后显示校验结果。');}else if(record){v='业务线 '+record.biz+' · '+record.type+' · 占用 '+cash(record.cost)+'。'+({join:'招聘预占转为在岗，净额不变。',move:'仅记录新岗位，业务线、编制与成本占用不变。',release:'释放此笔演示占用，不冲销已发工资。'}[kind]);}else v='请选择有明细的业务记录。';el('preview').textContent=v;};
 el('daily').oninput=preview;el('daily').onchange=preview;preview();
 el('daily').onsubmit=ev=>{ev.preventDefault();try{
  const selected=kind,b=value('biz'),out=value('type')==='外包'?1:0,ref=value('doc'),job=value('job'),reason=value('reason'),person=value('person'),id=value('ref'),type=value('type'),cost=selected==='hire'?num(value('cost')):0;
  assert(ref,'请填写业务单号。');const snapshot=req(z).find(r=>r.id===id), subject=selected==='hire'?b+'／'+job:snapshot?.biz+'／'+snapshot?.job;
  const detail=ref+' · '+subject+(selected==='hire'?' · '+type+' · '+cash(cost):' · '+(person||snapshot?.person||snapshot?.ref||'')+(selected==='move'?' → '+job:'')+(selected==='release'?' · 释放 '+cash(snapshot?.cost||0):''))+(reason?' · '+reason:'');
  store(c,dict[selected],detail,live=>{checkCommon(c,live);assert(!req(live).some(x=>x.kind===selected&&x.ref===ref),'该业务单号已办理。');
   if(selected==='hire'){assert(job&&inScope(c,b)&&cost>0,'请补齐岗位、成本与业务线。');const bad=countChecks(live,b,1,cost,out);assert(!bad.length,'已拦截：'+bad.join('；')+'。请调整用工安排，需增额时另行提交线上审批。');const l=line(live,b);l.reserved++;l.reservedCost=moneyround(l.reservedCost+cost);l.out+=out;live.requests.push({id:uid(),kind:selected,status:'reserved',month:c.month,biz:b,type,job,cost,ref,note:reason,created:date()});}
   else{const r=req(live).find(x=>x.id===id&&x.kind==='hire'&&inScope(c,x.biz));assert(r,'未找到可办理的招聘或人员记录。');assert(r.month<=c.month,'不能回溯办理早于预占月份的事项。');const l=line(live,r.biz);assert(l,'业务线已变更。');
    if(selected==='join'){assert(r.status==='reserved'&&person,'需要招聘预占记录与员工标识。');assert(!req(live).some(q=>q.kind==='hire'&&q.status==='active'&&q.person===person),'该员工已在本中心入职。');const bad=countChecks(live,r.biz,0,0,0);assert(!bad.length,'入职复核未通过：'+bad.join('；'));l.reserved--;l.used++;l.reservedCost=moneyround(l.reservedCost-r.cost);l.usedCost=moneyround(l.usedCost+r.cost);r.person=person;r.status='active';}
    else if(selected==='move'){assert(r.status==='active'&&job&&job!==r.job,'请选择在岗人员并填写不同的新岗位。');const bad=countChecks(live,r.biz,0,0,0);assert(!bad.length,'同线调岗复核未通过：'+bad.join('；'));r.job=job;}
    else{assert(['active','reserved'].includes(r.status),'本记录已释放。');const was=r.status==='active',n=was?'used':'reserved',a=was?'usedCost':'reservedCost';assert(l[n]>=1&&l[a]+.00001>=r.cost,'占用台账不一致，无法释放。');l[n]--;l[a]=moneyround(l[a]-r.cost);if(r.type==='外包')l.out--;r.status=was?'released':'cancelled';}
    live.requests.push({id:uid(),parent:id,kind:selected,status:'done',month:c.month,biz:r.biz,person:r.person||'',ref,note:reason,created:date()});
   }
  },z.id)
 }catch(err){msg(err.message)}};
}
window.BDaily={render,bind};
})();
