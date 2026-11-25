/* DMOC keeps proposed definitions outside the effective catalog until a Big Data receipt. */
(()=>{'use strict';
const db=()=>PFEngine.reviewData(), clone=x=>JSON.parse(JSON.stringify(x)), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const identity=m=>JSON.stringify([m.business,m.scope||'',m.job||'',m.name]), equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b), stamp=()=>new Date().toLocaleString('zh-CN',{hour12:false});
const repo=()=>db().exchange||{changes:[],batch:null};let note='',active='catalog',repairId='',openRepair=false;
const hr=s=>['方案配置人','总部 HRBP'].includes(s.actor||s.role), big=s=>(s.actor||s.role)==='大数据接口演示';
function effective(m){const lib=db().library;return lib.find(v=>m.exchangeKey&&v.exchangeKey===m.exchangeKey)||lib.find(v=>identity(v)===identity(m))||null}
let inBatch=false;function atomic(fn){if(inBatch){fn(db(),db().exchange);return}const d=db(),old=clone(d.library),prev=d.exchange?clone(d.exchange):null;try{d.exchange??={changes:[],batch:null};fn(d,d.exchange);PFEngine.saveReviewData()}catch(e){d.library=old;if(prev)d.exchange=prev;else delete d.exchange;throw e}}

const protectedSource=m=>!!m&&(m.origin==='大数据'||(m.sourceBindings||[]).some(b=>b.kind==='大数据取值')||(!m.sourceBindings?.length&&/大数据|数仓/.test(m.source||'')));
function logic(m){const r=m.rule||{};return [PFCalc.modes[r.kind]||r.kind,r.a,r.kind==='ratio'?r.b:'',...(r.kind==='behavior'?[r.base,r.min,r.max]:[])].filter(v=>v!==undefined&&v!==null&&String(v)!=='').join(' / ')}
function scoringDifferences(previous, next) {
  if (!PFScoring.isManual(previous) && !PFScoring.isManual(next)) return [];
  const before = PFScoring.isManual(previous) ? PFScoring.manual(previous) : {};
  const after = PFScoring.isManual(next) ? PFScoring.manual(next) : {};
  return [['最低分','min'], ['最高分','max'], ['基准分','base'], ['评分标准','criteria']]
    .filter(([,field]) => String(before[field] ?? '').trim() !== String(after[field] ?? '').trim())
    .map(([label,field]) => [label, before[field], after[field]]);
}
function differences(old, m) {
  if (!protectedSource(old)) return [];
  const data = x => (x.sourceBindings || []).map(b => [b.input,b.kind,b.ref,b.field].join(' / ')).join('；');
  const fields = [['权重（%）',old.weight,m.weight], ['计分算法',old.algorithm,m.algorithm],
    ['计算口径',old.formula,m.formula], ['实际值计算规则',logic(old),logic(m)],
    ['分档规则',old.bands,m.bands], ['取值来源',data(old),data(m)]];
  return fields.filter(([,a,b]) => String(a ?? '').trim() !== String(b ?? '').trim())
    .concat(scoringDifferences(old, m));
}
function confirmChanges(pairs){const changes=pairs.map(([a,b])=>({name:b.name,delta:differences(a,b)})).filter(c=>c.delta.length);if(!changes.length)return Promise.resolve('');return new Promise(resolve=>{const box=document.createElement('dialog');box.style.cssText='border:1px solid #b8ccc5;border-radius:12px;padding:24px;width:min(620px,92vw);max-height:82vh;overflow:auto;color:#18332c';box.innerHTML=`<h3>申请变更大数据指标</h3><p>核对差异并填写原因。大数据确认前，当前生效版本继续使用。</p>${changes.map(c=>`<h4>${esc(c.name)}</h4><table class="pf-table"><thead><tr><th>变更项</th><th>原设置</th><th>新设置</th></tr></thead><tbody>${c.delta.map(([k,a,b])=>`<tr><td>${esc(k)}</td><td>${esc(a??'—')}</td><td>${esc(b??'—')}</td></tr>`).join('')}</tbody></table>`).join('')}<form><label class="pf-field">变更原因（必填）<textarea required maxlength="500" rows="3"></textarea></label><div class="pf-row"><button class="pf-btn" type="button">取消</button><button class="pf-btn pf-primary" type="submit">确认并提交变更</button></div></form>`;document.body.append(box);let answer=null;box.onclose=()=>{box.remove();resolve(answer)};box.querySelector('[type=button]').onclick=()=>box.close();const input=box.querySelector('textarea');input.oninput=()=>input.setCustomValidity('');box.querySelector('form').onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('请填写变更原因');input.reportValidity();return}answer=input.value.trim();box.close()};box.showModal()})}

function stage(old,m,reason='DMOC 配置',changeReason='',baseline=old){if(differences(baseline,m).length&&!changeReason.trim())throw Error('修改大数据指标须先确认变更并填写原因。');const q=repo().changes,key=old?.exchangeKey||m.exchangeKey||identity(old||m);if(q.some(v=>v.key===key&&v.status!=='已生效'))throw Error('该指标已有未完成的变更，请先处理回执。');if(!m.name||!m.definition)throw Error('请补齐名称和定义。');const v=Number(old?.exchangeVersion|| (old?1:0))+1;return {id:'MX-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),key,version:v,base:old?clone(old):null,metric:{...clone(m),...(protectedSource(baseline)?{origin:'大数据'}:{}),exchangeKey:key,exchangeVersion:v},status:'待同步',reason,changeReason,delta:differences(baseline,m),time:stamp(),log:[{t:stamp(),s:'DMOC 保存配置'}]}}
function context(s,refresh){const repair=hr(s)&&repo().changes.find(c=>c.id===repairId&&c.status==='配置待修正');const original=repair?[clone(repair.metric)]:clone(db().library),work={library:clone(original)};return {view:'library',editorKey:repair ? repair.id : '',role:hr(s)?'方案配置人':s.actor||s.role,filters:repair?{...s,biz:'全部业务',scope:'全部层级'}:s,data:work,refresh,save:(changeReason='')=>{try{if(!hr(s))throw Error('仅总部 HRBP 可以修改指标。');if(repair){if(work.library.length!==1||equal(original[0],work.library[0]))throw Error('请修改本条被退回的配置后再保存。');atomic((d,r)=>{const c=r.changes.find(x=>x.id===repairId);if(!c||c.status!=='配置待修正')throw Error('变更状态已更新，请重新核对。');if(differences(original[0],work.library[0]).length&&!changeReason)throw Error('请确认本次变更。');if(changeReason)c.changeReason=changeReason;c.delta=differences(c.base||original[0],work.library[0]);c.metric={...clone(work.library[0]),exchangeKey:c.key,exchangeVersion:c.version};c.status='待同步';c.time=stamp();c.log.push({t:c.time,s:'总部 HRBP 修正原变更，待重新同步'});});repairId='';}else{const changes=work.library.flatMap((m,i)=>original[i]&&equal(original[i],m)?[]:[stage(original[i],m,'DMOC 配置',changeReason)]);if(!changes.length)return;atomic((d,r)=>r.changes.unshift(...changes));}note='已保存变更，等待同步至大数据。';active='queue'}catch(e){note=e.message;active='queue';repairId=''}}}}
const btn=(act,title,primary=false,id='')=>`<button type="button" class="pf-btn ${primary?'pf-primary':''}" data-exchange-action="${act}" data-exchange-id="${esc(id)}">${title}</button>`;
function history(c){return `<details><summary>版本明细</summary><div><p>定义：${esc(c.metric.definition)}</p>${PFScoring.isManual(c.metric)?`<p>人工评分：${esc(PFScoring.summary(c.metric))}</p>`:`<p>取值：${esc(PFSource.summary(c.metric))}</p><p>逻辑：${esc(c.metric.formula||'待确认')} · ${esc(c.metric.algorithm||'待确认')}</p>`}<p>默认权重：${esc(c.base?.weight??'—')} → ${esc(c.metric.weight??'待确认')}%</p>${c.changeReason?`<p>变更原因：${esc(c.changeReason)}</p>`:''}${(c.delta||[]).map(([k,a,b])=>`<small class="pfc-desc">${esc(k)}：${esc(a??'—')} → ${esc(b??'—')}</small>`).join('')}${c.log.map(l=>`<small class="pfc-desc">${esc(l.t)}　${esc(l.s)}</small>`).join('')}</div></details>`}
function sample(){return {name:'交付回访达成率（接口示例）',type:'固定指标',business:'交付',definition:'考核期内本人已完成的有效交付回访数，相对本期回访目标的达成情况。',source:'演示交付回访明细',sourceBindings:[{kind:'大数据取值',input:'实际值',ref:'交付回访汇总（示例）',field:'有效回访数'}],formula:'已完成有效回访数 ÷ 目标回访数 × 100%',algorithm:'达成率',rule:{kind:'sum',a:'有效回访数'},target:10,weight:30,bands:''}}
function problems(metric, peers = []) {
  const reason = PFConfig.reviewReason(metric, peers);
  return reason ? [reason] : [];
}
function actions(c,s){if(hr(s)&&c.status==='待同步')return btn('send','发送变更',true,c.id);if(hr(s)&&c.status==='同步失败')return btn('send','重试本次传输',true,c.id);if(hr(s)&&c.status==='配置待修正')return btn('repair','修正本次配置',true,c.id);if(big(s)&&c.status==='等待回执')return `<details><summary>模拟接口回执</summary>${btn('accept','校验通过',false,c.id)} ${btn('reject','配置有误',false,c.id)} ${btn('fail','传输失败',false,c.id)}</details>`;return c.status==='已生效'?'已完成':c.status==='等待回执'?'等待大数据回执':'等待总部 HRBP 处理'}
function library(s){const r=repo(),pending=r.changes.filter(c=>c.status!=='已生效').length,subset=r.changes.filter(c=>(!s.biz||s.biz==='全部业务'||c.metric.business==='通用'||c.metric.business===s.biz)&&(!c.metric.scope||!s.scope||s.scope==='全部层级'||c.metric.scope===s.scope));let body='';if(!hr(s)){repairId='';openRepair=false;}
if(active==='catalog'){const html=PFConfig.renderLibrary(context(s,()=>{}));body=(repairId?`<section class="pf-panel"><strong>修正被退回的指标配置</strong><p>保存后沿用本次变更编号和版本，重新发送。</p>${btn('queue','返回变更记录')}</section>`:'')+html.replace('保存指标</button>','保存待同步版本</button>');}
else if(active==='queue'){body=`<section class="pf-panel"><h3>指标变更记录</h3><div class="pfc-scroll"><table class="pf-table"><thead><tr><th>指标 / 业务</th><th>版本</th><th>状态</th><th>变更详情</th><th>处理</th></tr></thead><tbody>${subset.map(c=>`<tr><td><strong>${esc(c.metric.name)}</strong><small class="pfc-desc">${esc(c.metric.business)} · ${esc(c.reason)}</small></td><td>V${esc(c.version)}</td><td>${esc(c.status)}</td><td>${history(c)}</td><td>${actions(c,s)}</td></tr>`).join('')||'<tr><td colspan="5">当前范围暂无变更。</td></tr>'}</tbody></table></div></section>`;}
else {body=`<section class="pf-panel"><h3>首次全量指标导入</h3><table class="pf-table"><thead><tr><th>批次</th><th>来源</th><th>接收结果</th></tr></thead><tbody><tr><td>INIT-DEMO-01</td><td>大数据 · 本地演示</td><td>${r.batch?`${r.batch.total} 条，${r.batch.issues} 条待核对 · ${esc(r.batch.t)}`:'尚未模拟接收'}</td></tr></tbody></table>${big(s)?btn('receive',r.batch?'模拟重复推送':'模拟首次全量推送',true):''}</section>`;}
const tabs = [
  ['catalog', '指标目录'],
  ['queue', '变更记录' + (pending ? ' · ' + pending : '')],
  ['initial', '首次导入记录']
];
const navigation = tabs.map(([key, label]) =>
  `<button type="button" class="pf-btn ${key === active ? 'pf-primary' : ''}" data-exchange-action="${key}" aria-pressed="${key === active}">${label}</button>`
).join('');
return `<div class="pf" data-exchange-root>
  <nav class="pf-row" aria-label="指标池视图">${navigation}</nav>
  ${note ? `<p class="pf-muted" role="status">${esc(note)}</p>` : ''}
  ${body}
</div>`;
}

function bind(s,refresh){const root=document.querySelector('[data-exchange-root]');if(!root)return;if(active==='catalog'){PFConfig.bindLibrary(context(s,refresh));if (repairId) {
  const catalog = root.querySelector('.pfc-catalog');
  const editorVisible = Boolean(root.querySelector('#pfc-form'));
  if (catalog) catalog.closest('section').hidden = editorVisible;
  root.querySelectorAll('[data-pfc-route], #pfc-lib-new, #pfc-lib-in, #pfc-lib-export, #pfc-lib-dl')
    .forEach(control => control.remove());
  if(openRepair){openRepair=false;const edit=root.querySelector('[data-pfc-libedit="0"]');if(edit){edit.click();return}}}}root.querySelectorAll('[data-exchange-action]').forEach(b=>b.onclick=()=>{const k=b.dataset.exchangeAction;note='';try{if(['catalog','queue','initial'].includes(k)){active=k;repairId='';openRepair=false;refresh();return}if(k==='repair'){const c=repo().changes.find(x=>x.id===b.dataset.exchangeId);if(!hr(s)||c?.status!=='配置待修正')throw Error('无可修正的配置。');repairId=c.id;openRepair=true;active='catalog';refresh();return}if(k==='receive'){if(!big(s))throw Error('仅大数据接口演示可模拟首次推送。');if(repo().batch){note='该批次已接收，未重复导入。'}else atomic((d,r)=>{const m=sample();if(!d.library.some(v=>identity(v)===identity(m)))d.library.push({...m,origin:'大数据',exchangeVersion:1,exchangeKey:identity(m)});r.batch={total:d.library.length,issues:d.library.filter(v=>problems(v,d.library).length).length,t:stamp()};note='已接收本地演示全量包。'})}else atomic((d,r)=>{const c=r.changes.find(v=>v.id===b.dataset.exchangeId);if(!c)throw Error('未找到变更。');if(k==='send'&&hr(s)&&['待同步','同步失败'].includes(c.status)){c.status='等待回执';note='已模拟发送本次变更，等待回执。'}else if(big(s)&&c.status==='等待回执'&&['accept','reject','fail'].includes(k)){if(k==='fail'){c.status='同步失败';note='传输失败：请按原变更编号重试。'}else{const idx=d.library.findIndex(v=>v.exchangeKey===c.key||identity(v)===c.key);const issues=problems(c.metric);if(c.base&&(idx<0||!equal(d.library[idx],c.base)))issues.push('原版本已变化');if(d.library.some((v,i)=>i!==idx&&identity(v)===identity(c.metric))||(!c.base&&idx>=0))issues.push('同名指标');if(k==='reject'||issues.length){c.status='配置待修正';note='大数据校验退回：'+(issues.join('、')||'计算逻辑与配置不一致（演示）')+'。请修正原变更。'}else{if(idx<0)d.library.push(clone(c.metric));else d.library[idx]=clone(c.metric);c.status='已生效';note='模拟成功回执：新版本已生效，已下发方案保留原版本。'}}}else throw Error('当前身份或状态不支持此操作。');c.time=stamp();c.log.push({t:c.time,s:note})});}catch(e){note=e.message}refresh()})}
window.PFExchange={library,bind,effective,protectedSource,scoringDifferences,confirmChanges,batchWriteback(fn){atomic(()=>{inBatch=true;try{fn()}finally{inBatch=false}})},openQueue(){active='queue';note='';repairId='';openRepair=false;},stageWriteback(m,reason='',baseline){const old=effective(m);if(old&&equal(old,m))return;const change=stage(old,m,'岗位方案回写',reason,old||baseline);atomic((d,r)=>r.changes.unshift(change))}};
})();
