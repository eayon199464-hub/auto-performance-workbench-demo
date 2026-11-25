/* Map editable ranges to the compact CSV representation expected by PFCalc. */
(()=>{'use strict';
const stepModes=['区间取值','全量阶梯','分段累进'];
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=s=>String(s||'').split(/[；;]/).map(r=>r.split(/[:：]/).map(x=>x.trim()));
const describe=(r,alg)=>{const[l,h,v]=r;return '实际值 ≥ '+l+(h==='*'?'':' 且 < '+h)+(alg==='区间取值'?'，得 '+v+' 分':alg==='分段累进'?'，本段每单位 '+v+' 分':'，全部数量每单位 '+v+' 分')};
const summary=(m)=>!m.bands?'':parse(m.bands).map(r=>describe(r,m.algorithm)).join('；');
const box=(m)=>'<fieldset id="pfc-band-box" style="padding:12px;border:1px solid #cfdfdf;border-radius:9px;margin:12px 0" '+(stepModes.includes(m.algorithm)?'':'hidden')+'><legend><strong>分档评分规则</strong></legend><input type="hidden" id="pfc-f-bands" value="'+e(m.bands)+'"><div id="pfc-band-grid"></div></fieldset>';
function bind(){
 const find=x=>document.getElementById('pfc-'+x), hidden=find('f-bands'), grid=find('band-grid'), alg=find('f-algorithm');
 if(!grid||!hidden||!alg)return;
 let rows=hidden.value?parse(hidden.value):[['0','80','60'],['80','100','85'],['100','*','100']];
 const mode=()=>alg.value;
 function pack(){hidden.value=rows.map(r=>r.join(':')).join(';')}
 function guidance(){return mode()==='区间取值'?'每个实际值只取一档，直接得到该档分数。':mode()==='全量阶梯'?'只取实际值命中的那一档。得分 = 全部实际数量 × 该档每单位分值。':'逐段计算。得分 = 每段实际数量 × 本段每单位分值，再将各段相加。'}
 function status(){
   const sc=grid.querySelector('[data-range-status]');if(!sc)return;
   const issue=window.PFCalc.bandError({algorithm:mode(),bands:hidden.value});
   sc.textContent=issue;
   sc.hidden=!issue;
   sc.style.color=issue?'#a43421':'';
 }
 const number=(i,k,v,label)=>'<input style="width:7.2em;max-width:100%;min-width:0" aria-label="第 '+(i+1)+' 档'+label+'" type="number" step="any" data-ri="'+i+'" data-rk="'+k+'" value="'+e(v)+'">';
 function draw(){
   if(!stepModes.includes(mode()))return;
   pack();grid.innerHTML='<p class="pf-muted">'+guidance()+'</p><div class="pfc-scroll"><table class="pf-table"><thead><tr><th>档位</th><th>实际值满足什么条件</th><th>'+(mode()==='区间取值'?'对应得分':'每单位分值')+'</th><th>操作</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td>第 '+(i+1)+' 档</td><td>从 '+number(i,0,r[0],'起点，含')+'（含）'+(r[1]==='*'?' 起，不限上限':' 至 '+number(i,1,r[1],'终点，不含')+'（不含）')+'</td><td>'+number(i,2,r[2],'分值')+' 分</td><td>'+(i===rows.length-1?'<label><input type="checkbox" data-infinite '+(r[1]==='*'?'checked':'')+'> 不限上限</label> ':'')+(rows.length>1?'<button type="button" class="pf-btn" data-rr="'+i+'">移除</button>':'')+'</td></tr>').join('')+'</tbody></table></div><p><button type="button" class="pf-btn" data-ra>添加一档</button></p><p data-range-status role="status" class="pf-muted"></p>';status()
 }
 function invalidate(){hidden.dispatchEvent(new Event('input',{bubbles:true}))}
 grid.oninput=ev=>{const el=ev.target;
   if(!el.hasAttribute('data-ri'))return;const i=+el.dataset.ri,k=+el.dataset.rk;rows[i][k]=el.value;
   const j=k===1?i+1:k===0?i-1:-1,other=k===1?0:1;
   if(j>=0&&j<rows.length&&k<2){rows[j][other]=el.value;const adjacent=grid.querySelector('[data-ri="'+j+'"][data-rk="'+other+'"]');if(adjacent)adjacent.value=el.value}
   pack();status()
 };
 grid.onchange=ev=>{if(ev.target.hasAttribute('data-infinite')){rows[rows.length-1][1]=ev.target.checked?'*':'';draw();invalidate()}};
 grid.onclick=ev=>{const el=ev.target;if(el.hasAttribute('data-ra')){const last=rows[rows.length-1];if(last[1]==='*')last[1]='';rows.push([last[1],'*','']);draw();invalidate();grid.querySelector('[data-ri="'+(rows.length-2)+'"][data-rk="1"]')?.focus()}
   if(el.hasAttribute('data-rr')){const i=+el.dataset.rr,removed=rows.splice(i,1)[0];if(i===rows.length&&rows.length)rows[i-1][1]=removed[1];else if(rows[i])rows[i][0]=removed[0];draw();invalidate()}
 };
 alg.addEventListener('change',()=>{find('band-box').hidden=!stepModes.includes(mode());draw()});draw();
}
window.PFBands={box,bind,summary};
})();
