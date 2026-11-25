// Rules live on the same template/period plan as its metrics; they do not consume KPI weights.
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds=['加分','扣分','金额扣罚'], affects=t=>t==='金额扣罚'?'绩效金额':'绩效总分';
  const impact=r=> (r.type==='加分'?'+':'−')+r.value+(r.type==='金额扣罚'?' 元':' 分');
  const error=r=>!r||!kinds.includes(r.type)||!String(r.name||'').trim()||!String(r.condition||'').trim()||!Number.isFinite(r.value)||r.value<=0?'加扣罚规则需有名称、触发条件和大于零的调整值。':'';
  const rules=p=>Array.isArray(p?.adjustments)?p.adjustments:[];
  const summary=p=>!rules(p).length?'': `<section class="pf-panel"><h3>岗位加分、扣分与金额扣罚</h3><p class="pf-muted">规则只在符合所列条件时适用，独立于指标权重。</p>${table(p,false)}</section>`;
  function table(p,edit){return `<div style="overflow:auto"><table class="pf-table"><thead><tr><th>规则名称</th><th>触发条件</th><th>作用对象</th><th>每次调整</th>${edit?'<th>操作</th>':''}</tr></thead><tbody>${rules(p).map((r,i)=>`<tr><td>${esc(r.name)}</td><td>${esc(r.condition)}</td><td>${esc(affects(r.type))}</td><td>${esc(impact(r))}</td>${edit?`<td><button type="button" class="pf-btn" data-pfa-remove="${i}">移除</button></td>`:''}</tr>`).join('')}</tbody></table></div>`}
  function options(c){let seen=new Set(),pool=[];for(const p of [...(c.data.templates||[]),...(c.data.plans||[])]){if(p.biz!==c.plan.biz||p.scope!==c.plan.scope||p.id===c.plan.id)continue;for(const r of rules(p)){const key=JSON.stringify([r.name,r.type,r.condition,r.value]);if(!seen.has(key)&&!error(r)){seen.add(key);pool.push(r)}}}return pool;}
  function render(c){const p=c.plan;if(!p)return '';const edit=c.role==='方案配置人'&&p.stage==='draft';if(!edit)return summary(p);
    const pool=options(c);
    return `<section id="pf-adjustments" class="pf-panel"><h3>岗位加分、扣分与金额扣罚 <small>选填</small></h3><p class="pf-muted">加分、扣分影响绩效总分；金额扣罚按元计。这里的规则不占指标权重。单项指标内扣分应在该指标中配置。</p>${rules(p).length?table(p,true):'<p>该岗位暂未选用额外规则。</p>'}
    <details><summary>选择或新增规则</summary><form id="pfa-form" class="pf-grid" style="margin-top:12px"><label class="pf-field">选用规则<select name="preset"><option value="">本岗位自定义</option>${pool.map((r,i)=>`<option value="${i}">${esc(r.name)}（${esc(impact(r))}）</option>`).join('')}</select></label>
    <label class="pf-field">规则名称<input name="name" required maxlength="80" placeholder="填写规则名称"></label><label class="pf-field">调整类型<select name="type">${kinds.map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label class="pf-field"><span id="pfa-target">每次增加绩效总分（分）</span><input type="number" name="value" min="0.01" step="0.01" required></label><label class="pf-field">触发条件<input name="condition" required maxlength="280" placeholder="写清哪些情况适用及认定依据"></label><div><button type="submit" class="pf-btn pf-primary">加入本岗位</button><p role="alert"></p></div></form></details></section>`;}
  function bind(c){const p=c.plan;if(!p||c.role!=='方案配置人'||p.stage!=='draft')return;let root=document.getElementById('pf-adjustments');if(!root)return;let form=root.querySelector('form'),v=form.elements,alert=form.querySelector('[role=alert]'),pool=options(c);
    const caps=()=>root.querySelector('#pfa-target').textContent=({'加分':'每次增加绩效总分（分）','扣分':'每次扣减绩效总分（分）','金额扣罚':'每次扣减绩效金额（元）'})[v.type.value];
    v.type.onchange=caps;v.preset.onchange=()=>{const r=v.preset.value===''?null:pool[+v.preset.value];for(const k of ['name','type','value','condition'])v[k].value=r?r[k]:k==='type'?kinds[0]:'';caps();alert.textContent=''};
    form.onsubmit=ev=>{ev.preventDefault();const r={name:v.name.value.trim(),condition:v.condition.value.trim(),type:v.type.value,value:+v.value.value};let msg=error(r);if(!msg&&rules(p).some(x=>x.name===r.name))msg='本岗位已选同名规则。';if(msg){alert.textContent=msg;return}c.writeAdjustments([...rules(p),r]);};
    root.querySelectorAll('[data-pfa-remove]').forEach(b=>b.onclick=()=>{const ix=Number(b.dataset.pfaRemove);c.writeAdjustments(rules(p).filter((_,i)=>i!==ix));});
  }
  window.PFJobAdjustments={render,bind,summary,error:p=>rules(p).map(error).find(Boolean)||'',has:p=>rules(p).length>0};
})();
