(() => {
  'use strict';
  const rules = p => [p.metrics || [], p.adjustments || []];
  const same = (a,b) => JSON.stringify(rules(a)) === JSON.stringify(rules(b));
  const states = {draft:'草稿',review:'审批中',approved:'审批通过，待下发',active:'已下发'};
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title = r => typeof r === 'string' ? r : r.name || r.title || r.label || r.id || '未命名项';
  const list = (p,k) => (p[k] || []).map(r => {
    const score = k === 'metrics' && window.PFScoring?.isManual(r) ? '（'+PFScoring.summary(r)+'）' : '';
    return escape(title(r) + score);
  }).join('、') || '无';
  function report({template,month,plans,roster},org) {
    const relevant = x => x.org===org && ['job','biz','scope'].every(k=>x[k]===template[k]);
    const matches=plans.filter(x=>relevant(x)&&x.month===month), existing=matches[0];
    const people=existing ? existing.people || [] : roster.filter(relevant);
    const mode=matches.length>1?'duplicate':existing ? existing.stage!=='draft'?'locked':same(existing,template)?'same':'replace' : people.length?'create':'empty';
    return {org,existing,people,mode,matches};
  }
  function open(ctx) {
    const {template,month,organizations,apply,openPlan}=ctx;
    const rows=[...new Set(organizations)].map(org=>report(ctx,org));
    const picked=new Set(rows.filter(r=>r.mode==='create').map(r=>r.org));
    const dlg=document.createElement('dialog'); dlg.className='pf-dialog'; dlg.style.cssText='width:min(760px,95vw);max-height:88vh;overflow:auto;color:#183e35'; dlg.setAttribute('aria-label','应用岗位模板');
    let scope=rows.some(r=>r.org===ctx.initialOrg)?ctx.initialOrg:'';
    const visible=()=>rows.filter(r=>!scope||r.org===scope);
    const clean=()=>{dlg.close();dlg.remove()};
    const go=(id,saved=false)=>{try{openPlan(id);clean()}catch(error){dlg.querySelector('[data-error]').textContent=(saved?'草稿已保存，未能打开：':'未能打开：')+error.message;if(saved){dlg.querySelector('[data-main]').textContent='关闭';dlg.querySelector('[data-main]').onclick=clean;dlg.querySelectorAll('input,select,[data-open]').forEach(x=>x.disabled=true)}}};
    const selected=()=>visible().filter(r=>picked.has(r.org)&&['create','replace'].includes(r.mode));
    const label={create:'可新建草稿',replace:'可更新草稿',same:'草稿已与模板一致',locked:'保留现有方案',empty:'本期无该岗位人员',duplicate:'本期存在多份同岗位方案，请核对'};
    const details=r=>{const p=r.existing, t=template;
      return `<details style="margin:8px 0"><summary>查看${p?'配置对照':'模板内容'}</summary>${['metrics','adjustments'].map((k,i)=>`<p><b>${i?'加扣罚规则':'考核指标'}</b>${p?`<br>现有 ${rules(p)[i].length} 项：${list(p,k)}`:''}<br>模板 ${rules(t)[i].length} 项：${list(t,k)}</p>`).join('')}</details>`;
    };
    const draw=()=>{
      dlg.innerHTML=`<h2 style="margin:0">应用岗位模板</h2><p>${escape(month)} · ${escape(template.biz)} / ${escape(template.job)} · ${escape(template.scope)}</p><label>应用范围 <select data-scope><option value="">全部可管理大区（${rows.length}）</option>${rows.map(r=>`<option value="${escape(r.org)}"${scope===r.org?' selected':''}>${escape(r.org)}</option>`).join('')}</select></label><h3>大区覆盖预览</h3><div data-rows></div><p data-status role="status"></p><p data-error role="alert" style="color:#ac332a"></p><div class="pf-row"><button type="button" class="pf-btn pf-primary" data-main></button><button type="button" class="pf-btn" data-close>取消</button></div>`;
      dlg.querySelector('[data-rows]').innerHTML=visible().map(r=>{const index=rows.indexOf(r),p=r.existing,editable=['replace','create'].includes(r.mode);
        return `<section style="border:1px solid #cfdfd7;border-radius:10px;padding:12px 16px;margin:8px 0"><div><strong>${escape(r.org)}</strong> · ${r.people.length} 人 · ${label[r.mode]}${p&&!['same','replace','duplicate'].includes(r.mode)?'（'+escape(states[p.stage]||p.stage)+'）':''}</div>${r.mode==='replace'?`<div>指标 ${rules(p)[0].length} → ${rules(template)[0].length} 项 · 加扣罚 ${rules(p)[1].length} → ${rules(template)[1].length} 项</div>`:''}${editable?`<label style="display:block;margin:8px 0"><input type="checkbox" data-pick="${index}"${picked.has(r.org)?' checked':''}> ${r.mode==='replace'?'用模板替换此草稿的全部指标和加扣罚规则':'按模板新建草稿'}</label>`:''}${['replace','create','same'].includes(r.mode)?details(r):''}${r.matches.map((x,i)=>`<button type="button" class="pf-btn" data-open="${escape(x.id)}">${x.stage==='draft'?'打开':'查看'}${r.matches.length>1?`第 ${i+1} 份`:''}${x.stage==='draft'?'草稿':'方案'}</button>`).join('')}</section>`;
      }).join('')||'当前范围内没有可管理的大区。';
      dlg.querySelector('[data-scope]').onchange=e=>{scope=e.target.value;draw()};
      dlg.querySelectorAll('[data-pick]').forEach(b=>b.onchange=()=>{const org=rows[+b.dataset.pick].org;b.checked?picked.add(org):picked.delete(org);sync()});
      dlg.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>go(b.dataset.open));
      dlg.querySelector('[data-close]').onclick=clean; sync();
    };
    function sync(){const chosen=selected(), creates=chosen.filter(r=>r.mode==='create').length, replacements=chosen.length-creates, main=dlg.querySelector('[data-main]'),cancel=dlg.querySelector('[data-close]'), v=visible(), actionable=v.some(r=>['replace','create'].includes(r.mode));
      const single=v.length===1&&v[0].matches.length===1?v[0].existing:null;
      dlg.querySelector('[data-status]').textContent=chosen.length?`将新建 ${creates} 份、更新 ${replacements} 份草稿。${replacements?'已选草稿的原有人工配置将被替换。':''}应用后仍需提交审批。`:actionable?'可打开现有草稿继续办理，或勾选要应用模板的大区。':'当前无需生成新草稿。';
      main.textContent=chosen.length?`确认应用（${chosen.length} 个大区）`:single?(single.stage==='draft'?'打开草稿':'查看方案'):'关闭'; cancel.hidden=!chosen.length&&!single;
      main.onclick=()=>{if(!chosen.length){if(single)go(single.id);else clean();return}let result;try{result=apply(chosen.map(r=>({org:r.org,action:r.mode,planId:r.existing?.id})));}catch(error){dlg.querySelector('[data-error]').textContent=error.message;return}go(result.firstPlanId,true)};
    }
    draw();document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.showModal();
  }
  window.PFTemplateApplication={open,report};
})();
