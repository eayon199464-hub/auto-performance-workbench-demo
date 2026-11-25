(()=>{'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), $=id=>document.getElementById('pfrv-'+id), btn=(id,t)=>`<button type="button" class="pf-btn pf-primary" id="pfrv-${id}">${E(t)}</button>`,tag=t=>`<span class="pf-tag">${E(t)}</span>`,panel=(h,x)=>`<section class="pf-panel"><h3>${h}</h3>${x}</section>`, hint=t=>`<p class="pf-muted">${E(t)}</p>`, table=(heads,body)=>`<div style="overflow:auto"><table class="pf-table"><thead><tr>${heads.map(t=>`<th>${E(t)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`,field=(id,title,type,more='')=>`<label class="pf-field">${title}<input id="pfrv-${id}" type="${type}" ${more}></label>`;
let choice='',context='',alertText='',current;
const examples={E020:{kind:'region',title:'区域行为评价',metric:'有效线索完成量',target:100,weight:90,actual:87,score:87,weighted:78.3,rank:'区域内 7 / 12',warn:'已触警',name:'跨部门协作',rule:'按响应时效与协作记录评价，−5 至 +5 分（演示范围）'},E031:{kind:'front',title:'门店扣罚与申诉',metric:'合格交付工单数',target:40,weight:100,actual:36,score:90,weighted:90,rank:'待提供',warn:'待提供',name:'返工扣罚',rule:'本期返工工单须有复检依据；每起扣 2 分（演示规则）'},E011:{kind:'self',title:'本人结果核对',metric:'有效成交台数',target:20,weight:100,actual:18,score:90,weighted:90,rank:'业务线内 4 / 12',warn:'未触警'}};
function list(s,rows){let out=[];const visible=(rows||[]).filter(x=>s.actor!=='员工'||x.id===s.employeeId);const plans=PFEngine.reviewData().plans.filter(p=>p.stage==='active'&&p.month===s.month);for(const person of visible){const match=plans.filter(p=>p.people?.some(z=>z.id===person.id));const ex=examples[person.id];if(s.month==='2026-11'&&ex&&match.length){const p=match[0];out.push({id:'case/'+person.id,person,p,x:ex,scenario:true})}for(const p of match)out.push({id:p.id+'/'+person.id,person,p,x:{}})}return out;}
const record=a=>PFEngine.reviewData().reviewDeskV1?.[a.id]||{},actorPriority=(s,a)=>a.scenario&&({区域总:'region','1+N店长':'front','业务老师':'region'}[s.actor]===a.x.kind)?0:a.scenario?1:2;
function baseMetrics(a){const x=a.x;if(a.scenario)return [{name:x.metric,source:'业务系统 → 大数据',target:x.target,weight:x.weight,actual:x.actual,score:x.score,weighted:x.weighted,status:'已返回 · 11/24'},...(x.kind==='region'?[{name:x.name,source:'区域总 → 业务老师 → 大数据',weight:10,status:'待返回'}]:[])];return (a.p.metrics||[]).map(m=>({name:m.name,source:m.sourceBindings?.map(b=>b.kind+' · '+b.ref).join('；')||m.source||'待确认',target:m.target,weight:m.weight,status:'待返回'}))}
function manual(a) {
  if (a.scenario) {
    const x = a.x;
    if (!['region','front'].includes(x.kind)) return [];
    return [{key:'scenario',legacyIndex:0,kind:x.kind,name:x.name,rule:x.rule,
      metricIndex:x.kind==='region'?1:null,range:x.kind==='region'?[-5,5]:null}];
  }
  const region = a.p.scope === '区域中台';
  const items = [];
  let legacyIndex = 0;
  (a.p.metrics || []).forEach((m,index) => {
    const legacy = /行为|主观/.test(m.type) ? legacyIndex++ : null;
    if (!PFScoring.isManual(m) && legacy === null) return;
    const setting = PFScoring.manual(m);
    const problem = PFScoring.validateManual(m);
    items.push({
      key:'metric/'+index, legacyIndex:legacy, metricIndex:index,
      kind:region?'region':'other', name:m.name, rule:setting?.criteria, weight:m.weight,
      range:problem?null:[Number(setting.min),Number(setting.max)], base:setting?.base, problem
    });
  });
  (a.p.adjustments || []).forEach((m,index) => items.push({
    key:'adjustment/'+index, legacyIndex:legacyIndex++, name:m.name, rule:m.condition,
    kind:!region&&['金额扣罚','扣分'].includes(m.type)?'front':'other'
  }));
  return items;
}
function savedItem(r,m) {
  return r.items?.[m.key] ?? (m.legacyIndex == null ? undefined : r.items?.[m.legacyIndex]);
}
function metrics(a) {
  const items = manual(a);
  const r = record(a);
  return baseMetrics(a).map((d,i) => {
    const m = items.find(m => m.metricIndex === i);
    if (m) {
      const v = savedItem(r,m);
      d.source = m.kind === 'region' ? '区域总评分' : '人工评分';
      d.status = v?.status || (m.kind === 'region' ? '待区域总评分' : '评分人待确认');
      if (v?.status?.startsWith('已确认')) d.actual = Number(v.value);
    }
    return {...d,...window.PFMobileResults?.correction(a.id,i,a.person.id,a.p.month)};
  });
}
function actions(a,s,r) {
  const items = manual(a);
  if (!items.length) return hint('本方案没有人工评价或扣罚项。');
  return items.map((m,i) => {
    const v = savedItem(r,m);
    const area = m.kind === 'region', penalty = m.kind === 'front';
    const status = v?.status || (area ? '待区域总评分' : penalty ? '待核对' : '负责人待确认');
    const details=[];
    if (m.rule) details.push(hint((m.metricIndex!=null && !a.scenario?'评分标准：':'')+m.rule));
    if (m.range) {
      const facts=['评分范围 '+m.range.join(' 至 ')+' 分'];
      if (m.base!=null && m.base!=='') facts.push('基准 '+m.base+' 分');
      if (m.weight!=null && m.weight!=='') facts.push('岗位权重 '+m.weight+'%');
      details.push(hint(facts.join('　·　')));
    }
    if (v) {
      let saved = (penalty ? '核查结论：' : '已填分值：')+v.value+(penalty?'':' 分');
      if (m.base!=null && m.base!=='' && !penalty) {
        const delta=Number((Number(v.value)-Number(m.base)).toFixed(4));
        saved+='（较基准 '+(delta>0?'+':'')+delta+' 分）';
      }
      details.push(hint(saved),hint('依据：'+v.why));
    }
    if (area && !v && !m.range) details.push(hint('本期方案缺少有效的评分设置。'));
    if (area && !v && m.range && s.actor === '区域总') {
      const [min,max] = m.range;
      details.push('<div class="pf-row">'+
        field('val'+i,a.scenario?'调整分值':'实际评分','number','min="'+min+'" max="'+max+'" step="any"')+
        field('why'+i,'评分依据','text','maxlength="240" placeholder="填写关键行为或记录编号"')+
        btn('act'+i,'提交业务老师确认')+'</div>');
    }
    if (area && v?.status === '待业务确认' && s.actor === '业务老师') details.push(btn('act'+i,'确认行为评价'));
    if (penalty && !v && s.actor === '业务老师') {
      details.push('<div class="pf-row"><label class="pf-field">核查结论<select id="pfrv-val'+i+'"><option value="">请选择</option><option>已触发</option><option>未触发</option></select></label>'+
        field('why'+i,'事实依据','text','maxlength="240" placeholder="工单编号或核查说明"')+btn('act'+i,'确认扣罚事实')+'</div>');
    }
    return '<article class="rv-item"><div class="pf-row pf-split"><strong>'+E(m.name)+'</strong>'+tag(status)+'</div>'+details.join('')+'</article>';
  }).join('');
}
function render(page,s,rows){const ls=list(s,rows).filter(a=>page!=='manual'||manual(a).length).sort((a,b)=>{
  if(page==='manual'){
    const ready=v=>!v.scenario&&manual(v).some(m=>m.kind==='region'&&m.range);
    const diff=Number(ready(b))-Number(ready(a));
    if(diff)return diff;
  }
  return actorPriority(s,a)-actorPriority(s,b)
});const sig=[page,s.actor,s.month,s.biz,s.org,s.scope,s.employeeId].join('|');if(sig!==context){context=sig;choice='';alertText=''}if(!ls.some(a=>a.id===choice))choice=ls[0]?.id||'';const a=ls.find(x=>x.id===choice);current={page,s,ls,a};if(!a)return panel('当前范围暂无已下发方案',hint('调整月份、业务或组织，或先完成对应岗位的方案下发。'));const r=record(a),tm=page==='tracking',ds=metrics(a),x=a.x,items=manual(a),result=a.scenario&&x.kind==='self'?'待本人核对':'待核对';const val=z=>z==null?'—':E(z),csvButton=!tm&&s.actor==='结果管理员'?btn('csv','导出当前范围结果明细'):'';const hdr=`<section class="pf-panel"><div class="pf-row pf-split"><label class="pf-field">${s.actor==='员工'?'我的绩效记录':'考核对象与岗位方案'}<select id="pfrv-pick">${ls.map(v=>`<option value="${E(v.id)}" ${v.id===choice?'selected':''}>${E(v.person.name+' · '+v.p.job+' · '+(v.scenario?v.x.metric:(v.p.title||v.p.metrics?.[0]?.name||'本期岗位方案')))}</option>`).join('')}</select></label>${csvButton}</div><p>${E(a.p.month)}　/　${E(a.person.store||a.p.org)}　/　${E(a.p.biz)}　/　${E(a.p.scope)}</p></section>`;let block=panel('指标结果明细',table(['指标 / 来源','岗位目标','岗位权重','实际完成','绩效值','加权得分','计算状态'],ds.map(d=>`<tr><td><strong>${E(d.name)}</strong><br><small>${E(d.source)}</small></td><td>${val(d.target)}</td><td>${d.weight==null?'—':E(d.weight)+'%'}</td><td>${val(d.actual)}</td><td>${val(d.score)}</td><td>${val(d.weighted)}</td><td>${E(d.status)}</td></tr>`).join('')));
if(tm)block+=panel('排名与预警',`<div class="pf-row">${tag(x.warn||'暂无预警数据')}<strong>${E(x.rank||'暂无排名')}</strong></div>`+(x.warn==='已触警'?hint('本期有效线索量低于预警线。'):''));
else if(page==='manual')block=panel('评价与扣罚',actions(a,s,r));
return `<div id="pfrv-root">${hdr}${alertText?`<p role="status" class="pf-panel">${E(alertText)}</p>`:''}${block}</div>`}
function bind(s,refresh){if(!$('root')||!current?.a)return;const {a,page}=current;const hook=(id,fn)=>{if($(id))$(id).onclick=fn};$('pick').onchange=ev=>{choice=ev.target.value;alertText='';refresh()};const fail=t=>{let n=$('root').querySelector('[data-review-alert]');if(!n){n=document.createElement('p');n.dataset.reviewAlert='';n.setAttribute('role','alert');$('root').prepend(n)}n.textContent=t;n.scrollIntoView({block:'nearest'})};const auth=()=>list(s,s.rows).some(q=>q.id===a.id);function commit(mut,text){if(page!=='manual'||!auth())return;const db=PFEngine.reviewData();db.reviewDeskV1||={};const old=db.reviewDeskV1[a.id],n=JSON.parse(JSON.stringify(old||{}));n.items||={};if(!mut(n))return;n.log||=[];n.log.unshift({time:new Date().toLocaleString('zh-CN'),actor:s.actor,text});db.reviewDeskV1[a.id]=n;try{PFEngine.saveReviewData()}catch(err){if(old)db.reviewDeskV1[a.id]=old;else delete db.reviewDeskV1[a.id];return fail('保存失败，请刷新后重试。')}alertText=text;refresh()}
manual(a).forEach((m,i)=>hook('act'+i,()=>{let val=$('val'+i)?.value.trim(),why=$('why'+i)?.value.trim(),isArea=m.kind==='region'&&s.actor==='区域总',isConfirm=m.kind==='region'&&s.actor==='业务老师',front=m.kind==='front'&&s.actor==='业务老师';if(!isArea&&!isConfirm&&!front)return;if(isArea&&(!val||!m.range||!Number.isFinite(+val)||+val<m.range[0]||+val>m.range[1]))return fail(m.range?'评分应在 '+m.range[0]+' 至 '+m.range[1]+' 分之间。':'本期方案缺少有效的评分设置。');if(front&&!['已触发','未触发'].includes(val))return fail('请选择核查结论。');if(!isConfirm&&!why)return fail('请填写业务依据。');commit(n=>{let prior=savedItem(n,m);if(isConfirm){if(prior?.status!=='待业务确认')return false;prior.status='已确认 · 待核算回传'}else{if(prior)return false;n.items[m.key]={value:isArea?Number(val):val,why,status:isArea?'待业务确认':'已确认 · 待核算回传'}}return true},isArea?'已提交，待业务老师确认。':'已确认，等待核算结果。')}));hook('ack',()=>{if(s.actor==='员工'&&s.employeeId===a.person.id&&a.x.kind==='self')commit(n=>!n.ack&&!n.appeal&&(n.ack=true),'本人已核对本期明细。')});hook('appeal',()=>{if(s.actor!=='员工'||s.employeeId!==a.person.id)return;let v=$('case').value.trim();if(!v)return fail('请填写业务系统申诉单号。');commit(n=>!n.appeal&&(n.appeal=v),'已登记模拟申诉单，等待业务系统回传。')});hook('csv',()=>{if(s.actor!=='结果管理员')return;const lines=[['考核月','归属组织','层级','业务','人员编号','姓名','岗位','指标','岗位权重(%)','实际完成','绩效值','加权得分','状态','最终总分']];for(const a of list(s,s.rows).filter(z=>!z.scenario))for(const m of metrics(a))lines.push([a.p.month,a.p.org,a.p.scope,a.p.biz,a.person.id,a.person.name,a.p.job,m.name,m.weight,m.actual,m.score,m.weighted,m.status,'待确认']);const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});let u=URL.createObjectURL(blob),l=document.createElement('a');l.href=u;l.download=s.month+'-授权范围岗位绩效明细.csv';l.click();setTimeout(()=>URL.revokeObjectURL(u),1000)})}
window.PFReview={render,bind,list,metrics};})();
