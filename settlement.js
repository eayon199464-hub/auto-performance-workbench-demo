/* Organization-level monthly results. Personnel logs, appeals and source values stay in their own flows. */
(()=>{'use strict';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={region:'区域结果',store:'门店结果'};
// Demo organization callbacks are independent from employee results. A supplied callback table replaces these fixtures.
const demoCallbacks=[{month:'2026-11',kind:'region',name:'华东大区',biz:'全部业务',scope:'区域中台',value:91.5,example:true},{month:'2026-11',kind:'store',name:'华东大区 · 示范一店',biz:'全部业务',scope:'一线（1+N）',value:88,example:true}];
function orgScore(s,name){const callbacks=window.PFEngine?.reviewData()?.organizationResults??demoCallbacks;const scope=tab==='region'?'区域中台':'一线（1+N）';const business=s.biz||'全部业务';const row=Array.isArray(callbacks)&&callbacks.find(x=>x.month===s.month&&x.kind===tab&&x.name===name&&x.scope===scope&&x.biz===business);return row&&Number.isFinite(row.value)?`${row.value}${row.example?'（示例）':''}`:business==='全部业务'?'待回传':'待回传（业务线）'}
const permitted=new Set(['总部 HRBP','方案配置人','结果管理员','业务老师','区域总','1+N店长']);
let tab='region',context='',expanded=null;
function groups(s,rows){
 if(!permitted.has(s.actor))return [];
 const visible=new Map((rows||[]).filter(r=>(s.actor!=='区域总'||r.org==='华东大区')&&(s.actor!=='1+N店长'||r.store==='华东大区 · 示范一店')).map(r=>[r.id,r]));
 const orgs=new Map();
 for(const r of visible.values()){const name=tab==='region'&&r.scope==='区域中台'?r.org:tab==='store'&&r.scope==='一线（1+N）'?r.store:null;if(name&&!orgs.has(name))orgs.set(name,{name,people:new Map(),biz:new Map()})}
 const plans=window.PFEngine?.reviewData()?.plans||[];
 for(const p of plans){
  if(p.month!==s.month||p.stage!=='active')continue;
  (p.people||[]).forEach((person,i)=>{const r=visible.get(person.id);
   if(!r||p.scope!==r.scope||p.org!==r.org||p.biz!==r.biz||(tab==='region'?r.scope!=='区域中台':r.scope!=='一线（1+N）'))return;
   const name=tab==='region'?r.org:r.store;if(!name)return;
   if(!orgs.has(name))orgs.set(name,{name,people:new Map(),biz:new Map()});const g=orgs.get(name);
   if(!g.biz.has(r.biz))g.biz.set(r.biz,new Map());
   const final=p.demoResults?.[i]?.status==='已定稿';for(const map of [g.people,g.biz.get(r.biz)])map.set(person.id,(map.get(person.id)??true)&&final);
  });
 }return [...orgs.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
}
const counts=m=>{const total=m.size,done=[...m.values()].filter(Boolean).length;return [total,done,total-done]};
const state=m=>{const [n,d]=counts(m);return !n?'尚无下发':!d?'待定稿':n===d?'已定稿':'部分定稿'};
function render(s,rows){const sig=[s.actor,s.month,s.biz,s.org,s.scope].join('|');if(sig!==context){context=sig;expanded=null;tab=s.actor==='1+N店长'||s.scope==='一线（1+N）'?'store':'region'}
 if(!permitted.has(s.actor))return '<section class="pf-panel">当前身份无组织结果查看权限。</section>';
 const list=groups(s,rows),dimension=tab==='region'?'区域':'门店';const toggle=Object.keys(labels).filter(k=>s.actor!=='1+N店长'||k==='store').map(k=>`<button class="pf-btn ${k===tab?'pf-primary':''}" type="button" data-settle-tab="${k}" aria-pressed="${k===tab}">${labels[k]}</button>`).join(' ');
 const table=list.map((g,i)=>`<tr><th scope="row">${escape(g.name)}</th>${counts(g.people).map(v=>`<td>${v}</td>`).join('')}<td>${state(g.people)}</td><td>${escape(orgScore(s,g.name))}</td><td><button type="button" class="pf-btn" data-settle-open="${i}" aria-expanded="${expanded===g.name}">${expanded===g.name?'收起':'查看明细'}</button></td></tr>${expanded!==g.name?'':`<tr><td colspan="7"><strong>${escape(g.name)} · 按业务线</strong><table class="pf-table"><thead><tr><th>业务线</th><th>已下发人数</th><th>已定稿人数</th><th>待定稿人数</th></tr></thead><tbody>${!g.biz.size?'<tr><td colspan="4">本期暂无已下发的岗位方案。</td></tr>':''}${[...g.biz].map(([b,people])=>`<tr><td>${escape(b)}</td>${counts(people).map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></td></tr>`}`).join('');
 return `<section id="pf-settlement" class="pf-panel"><div class="pf-row pf-split"><div class="pf-row">${toggle}</div>${s.actor==='结果管理员'?`<button type="button" class="pf-btn" data-settle-export ${list.length?'':'disabled'}>导出${dimension}汇总</button>`:''}</div>${list.length?`<div style="overflow:auto"><table class="pf-table"><thead><tr><th>${dimension}</th><th title="本月已下发方案覆盖人数，按员工去重">已下发人数</th><th>已定稿人数</th><th>待定稿人数</th><th>定稿状态</th><th title="大数据按组织和业务范围独立回传">组织绩效分</th><th>操作</th></tr></thead><tbody>${table}</tbody></table></div>`:`<p>当前范围暂无${dimension}记录。</p>`}</section>`;
}
function bind(s,rows,refresh){const box=document.getElementById('pf-settlement');if(!box||!permitted.has(s.actor))return;const list=groups(s,rows);
 box.querySelectorAll('[data-settle-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.settleTab;expanded=null;refresh()});box.querySelectorAll('[data-settle-open]').forEach(b=>b.onclick=()=>{const name=list[Number(b.dataset.settleOpen)]?.name;expanded=expanded===name?null:name;refresh()});
 const b=box.querySelector('[data-settle-export]');if(b&&s.actor==='结果管理员')b.onclick=()=>{const data=[['考核月份',tab==='region'?'大区':'门店','已下发人数','已定稿人数','待定稿人数','定稿状态','组织绩效分'],...groups(s,rows).map(g=>[s.month,g.name,...counts(g.people),state(g.people),orgScore(s,g.name)])];if(data.length===1)return;const csv='\uFEFF'+data.map(row=>row.map(v=>'"'+String(v).replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=s.month+'-'+labels[tab]+'汇总.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
}
window.PFSettlement={render,bind};})();
