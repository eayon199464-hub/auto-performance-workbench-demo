(()=>{'use strict';
const types=['固定指标','弹性指标','推荐指标','行为评价'],alg=['达成率','区间取值','全量阶梯','分段累进','人工评分'];
const scoreCols=['最低分','最高分','基准分（选填）','评分标准'];
const columns=['指标名称','指标类型','业务类型','指标定义','数据来源','实际值公式','计分算法','目标值','权重(%)','分档参数'];
const keys=['name','type','business','definition','source','formula','algorithm','target','weight','bands'];
const help='分档写为「下限:上限:绩效值」，多档用分号分隔。例：0:10:1;10:*:2。区间与全量阶梯采用左闭右开；分段累进按各段数量乘绩效值。';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let editor=null,pending=null,note='',current='',picker=false,keyword='',sourceFilter='',statusFilter='',destination=null;
const id=i=>document.getElementById('pfc-'+i), btn=(id,label,primary=false)=>`<button type="button" id="pfc-${id}" class="pf-btn ${primary?'pf-primary':''}">${label}</button>`, opts=(options,v)=>[...new Set([...(v?[v]:[]),...options])].map(x=>`<option${x===v?' selected':''}>${escape(x)}</option>`).join('');
const sample=(business='通用')=>({name:'演示｜服务事项完成率',type:types[0],business,definition:'当月已完成事项占计划事项的比例',source:'演示业务台账',formula:'已完成数 ÷ 计划数 × 100',algorithm:alg[0],target:100,weight:20,bands:''});
function csv(rows){return '\ufeff'+rows.map(row=>row.map(f=>'"'+String(f??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')}
const srccols=n=>['用途','取值来源','模板/系统/数据集','字段/列名'].map(x=>'输入'+n+'·'+x);
function exportFile(kind,ctx){
 const sampleBiz=ctx.plan?.biz||(ctx.filters?.biz!=='全部业务'&&ctx.filters?.biz)||'通用',v=sample(sampleBiz);v.source='演示：实际数来自业务系统，计划数来自人工导入';v.sourceBindings=[{input:'实际值',kind:'业务系统取值',ref:'演示业务系统 · 完成事项明细',field:'已完成数'},{input:'目标值',kind:'人工导入',ref:'月度目标模板',field:'计划数'}];
 const rows=kind==='export'?libRecords(ctx,true).map(x=>x.m).filter(m=>(!statusFilter||statusFilter===(reviewReason(m,ctx.data.library)?'待核对':'可选用'))&&(!sourceFilter||PFSource.bindings(m).some(b=>b.kind===sourceFilter))&&(!keyword||searchText(m).includes(keyword.trim().toLowerCase()))):[v];
 const count=Math.max(2,...rows.map(m=>PFSource.bindings(m).length)), headers=[...columns,...scoreCols,'适用层级','适用岗位',...Array.from({length:count},(_,i)=>srccols(i+1)).flat()];
 const data=csv([headers,...rows.map(m=>{const scoring=PFScoring.isManual(m)?PFScoring.manual(m):{};return [...keys.map(k=>m[k]),scoring.min,scoring.max,scoring.base,scoring.criteria,m.scope,m.job,...Array.from({length:count},(_,i)=>{const b=PFSource.bindings(m)[i]||{};return [b.input,b.kind,b.ref,b.field]}).flat()]})]);
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=kind==='lib'?'指标库维护模板.csv':kind==='export'?'指标库当前清单.csv':'岗位指标配置模板.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function dl(kind,ctx){exportFile(kind,ctx)}
function searchText(m){return [m.name,m.job,m.role,m.source,m.business,PFSource.summary(m)].filter(Boolean).join(' ').toLowerCase()}
function readSourceColumns(m,r,h){const start=h.indexOf('输入1·用途');if(start<0){if(h.some(x=>/^输入[0-9]+·/.test(x)))throw Error('来源列不完整，请重新下载模板');return}
 const v=[];for(let i=start;i<h.length;i+=4){const names=srccols((i-start)/4+1);if(!names.every((k,j)=>h[i+j]===k))throw Error('来源列不匹配，请重新下载模板');const a=names.map((_,j)=>r[i+j]||'');if(a.some(Boolean))v.push({input:a[0],kind:a[1],ref:a[2],field:a[3]})}
 m.sourceBindings=v.length?v:[{input:'实际值',kind:'待确认',ref:'',field:''}];if(!m.source)m.source=PFSource.summary(m);const err=PFScoring.isManual(m)?'':PFSource.validation(m);if(err)throw Error(err);
}

function readScoringColumns(m,row,header) {
 const col=key=>row[header.indexOf(key)]??'';
 const legacy=col('取值方式');
 if(legacy){
  const kind=Object.keys(PFCalc.modes).find(key=>PFCalc.modes[key]===legacy);
  if(!kind)throw Error('取值方式无效');
  m.rule={kind,a:col('字段一'),b:col('字段二')};
  if(kind==='behavior')Object.assign(m.rule,{base:col('行为基准分'),min:col('行为最低调整'),max:col('行为最高调整')});
 }
 if(PFScoring.isManual(m)){
  if(header.includes('最低分')){
   if(!scoreCols.every(label=>header.includes(label)))throw Error('评分设置列不完整');
   const [min,max,base,criteria]=scoreCols.map(col);
   m.manualScore={min:min===''?'':Number(min),max:max===''?'':Number(max),base:base===''?null:Number(base),criteria};
  }
  if(!m.sourceBindings?.some(b=>b.kind!=='待确认')){m.source='人工评分';m.sourceBindings=PFSource.manualBindings()}
 }
}
function readCSV(s){const rows=[];let row=[],cell='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cell+='"';i++}else{q=!q}}else if(!q&&c===','){row.push(cell.trim());cell=''}else if(!q&&(c==='\r'||c==='\n')){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}if(q)throw Error('引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows}
function checkLibrary(m) {
 if (!m.name || !m.business || !m.definition) return '请填写指标名称、业务和定义。';
 if (m.type && !types.includes(m.type)) return '请选择有效的指标类型。';
 if (m.algorithm && !alg.includes(m.algorithm)) return '请选择有效的计分方式。';
 if (m.weight !== '' && m.weight != null && (!Number.isFinite(+m.weight) || +m.weight < 0 || +m.weight > 100)) return '权重须在 0 至 100% 之间。';
 if (PFScoring.isManual(m)) return PFScoring.validateManual(m);
 if (m.target !== '' && m.target != null && (!Number.isFinite(+m.target) || (m.algorithm === alg[0] && +m.target <= 0))) return '达成率目标须大于零。';
 if (alg.slice(1,4).includes(m.algorithm)) return PFCalc.bandError(m);
 return PFSource.validation(m);
}
const identity=m=>`${m.scope||'通用'}::${m.business||'通用'}::${m.job||''}::${m.name}`;const allowed=c=>c.plan?.stage==='draft'&&c.role==='方案配置人';const job=c=>c.plan?.business||c.plan?.biz||'通用';
function ruleRef(ctx,m,base={}){return PFExchange.effective(base)||PFExchange.effective(m)||ctx.data.library.find(x=>x.name===m.name&&[m.business,'通用'].includes(x.business)&&(!x.scope||x.scope===m.scope)&&(!x.job||x.job===ctx.plan.job))}
function queueRule(ctx,m,base={},reason=''){if(!window.PFExchange)throw Error('指标同步服务不可用。');const ref=ruleRef(ctx,m,base);const structural=['name','type','definition','algorithm','formula','source','sourceBindings','bands','rule','weight','manualScore'];const value=(v,k)=>{if(k==='manualScore'){if(!PFScoring.isManual(v))return '';const {min,max,base,criteria}=PFScoring.manual(v);return JSON.stringify([String(min??''),String(max??''),String(base??''),criteria??''])}if(PFScoring.isManual(v)&&['formula','rule','source','sourceBindings','bands'].includes(k))return '';const field=v[k];return field&&typeof field==='object'?JSON.stringify(field):String(field??'')};if(ref&&structural.every(k=>value(ref,k)===value(m,k))){if(ref.exchangeKey){m.exchangeKey=ref.exchangeKey;m.exchangeVersion=ref.exchangeVersion}return}const proposal={...m,job:ctx.plan.job,scope:ctx.plan.scope};delete proposal.exchangeKey;delete proposal.exchangeVersion;const local=PFExchange.effective(proposal);if(PFExchange.protectedSource(ref))proposal.origin='大数据';const k=local?.exchangeKey||JSON.stringify([proposal.business,proposal.scope||'',proposal.job||'',proposal.name]);const pending=ctx.data.exchange?.changes?.find(x=>x.key===k&&x.status!=='已生效');if(pending&&!structural.every(k=>value(pending.metric,k)===value(proposal,k)))throw Error('此岗位指标已有待处理的同步变更，请先取得回执。');if(!pending)PFExchange.stageWriteback(proposal,reason,ref);const c=ctx.data.exchange?.changes?.find(x=>x.key===k);if(!c)throw Error('未生成规则版本，请在指标库维护后重试。');m.exchangeKey=c.key;m.exchangeVersion=c.version}
function form(ctx) {
 const library=ctx.view==='library', m=editor.m;
 const field=(k,label,v,numeric=false)=>`<label class="pf-field">${label}<input id="pfc-f-${k}" type="${numeric?'number':'text'}" ${numeric?'step="any"':''} value="${escape(v??'')}"></label>`;
 const typeSelect=`<label class="pf-field">指标类型<select id="pfc-f-type">${opts(types,m.type)}</select></label>`;
 const algorithm=PFScoring.isManual(m)?'人工评分':m.algorithm;
 const algorithmSelect=`<label class="pf-field">计分方式<select id="pfc-f-algorithm">${!algorithm?'<option value="">请选择计分方式</option>':''}${opts(alg,algorithm)}</select></label>`;
 const title=library?(editor.i==null?'新增指标':'编辑指标'):(editor.i==null?'加入岗位指标':'修改岗位指标');
 const scoring=PFScoring.isManual(m)?PFScoring.manual(m):{min:0,max:100,base:null,criteria:''};
 const scoreNumber=(k,label)=>`<label class="pf-field">${label}<input type="number" step="any" id="pfc-score-${k}" value="${escape(scoring[k]??'')}"></label>`;
 return `<section class="pf-panel"><h3>${title}</h3>${details(m)}<form id="pfc-form"><div class="pf-grid">
  ${field('name','指标名称',m.name)}<label class="pf-field">业务类型<select id="pfc-f-business">${opts(['通用','销售','交付','售后','新媒体','市场'],m.business||job(ctx))}</select></label>
  ${library?`<label class="pf-field">适用层级<select id="pfc-lib-scope"><option value="">通用</option>${opts(['区域中台','一线（1+N）'],m.scope)}</select></label><label class="pf-field">适用岗位<select id="pfc-f-job" aria-label="适用岗位"></select></label>`:''}
  ${typeSelect}${field('definition','指标定义',m.definition)}${algorithmSelect}${field('weight',library?'默认权重（%）':'本岗位权重（%）',m.weight,true)}
  ${field('target','目标值',m.target,true)}${field('formula','计算口径',m.formula)}${field('source','来源说明（选填）',m.source)}
 </div><fieldset id="pfc-manual-score" class="pf-panel"><legend><strong>人工评分设置</strong></legend><div class="pf-grid">
  ${scoreNumber('min','最低分')}${scoreNumber('max','最高分')}${scoreNumber('base','基准分（选填）')}
 </div><label class="pf-field">评分标准<textarea id="pfc-score-criteria" rows="2" placeholder="填写评分依据及对应分值">${escape(scoring.criteria??'')}</textarea></label></fieldset>
 <div id="pfc-source-block">${PFSource.form(m)}</div>${PFBands.box(m)}
 <p id="pfc-error" role="alert"></p><div class="pf-row"><button class="pf-btn pf-primary" type="submit">保存指标</button>${btn('cancel','取消')}</div></form></section>`;
}
function metricFromForm() {
 const m={...editor.m};
 keys.forEach(k=>m[k]=id('f-'+k).value.trim());
 if(id('lib-scope')) {m.scope=id('lib-scope').value;m.job=id('f-job').value.trim()}
 const numeric=value=>value===''?'':Number(value);
 m.weight=numeric(m.weight);
 const manual=m.type==='行为评价'||m.algorithm==='人工评分';
 if(manual){
  m.algorithm='人工评分';
  m.manualScore={min:numeric(id('score-min').value),max:numeric(id('score-max').value),base:id('score-base').value===''?null:Number(id('score-base').value),criteria:id('score-criteria').value.trim()};
  m.target=''; m.bands='';
  if(!PFScoring.isManual(editor.m)){delete m.rule;delete m.tested;m.formula='';}
  if(PFExchange.protectedSource(editor.m))m.origin='大数据';
  if(!m.sourceBindings?.length || !PFScoring.isManual(editor.m)){m.sourceBindings=PFSource.manualBindings();m.source='人工评分'}
 }else{
  delete m.manualScore;
  if(PFScoring.isManual(editor.m)){delete m.rule;delete m.tested}
  m.target=numeric(m.target);
  m.sourceBindings=PFSource.read();
  if(!m.source)m.source=PFSource.summary(m);
  if(!alg.slice(1,4).includes(m.algorithm))m.bands='';
 }
 return m;
}
function bindJobSelect(ctx) {
 const select = id('f-job');
 if (!select) return;
 const business = id('f-business'), level = id('lib-scope'), original = editor.m;
 const data = window.PFEngine.reviewData();
 const positions = [...(data.templates || []), ...(data.plans || []), ...window.pfRoster(ctx.filters.month)];

 function update(selected, needsChoice = false) {
  const names = new Set(positions.filter(position =>
   (!business.value || business.value === '通用' || position.biz === business.value || position.biz === '通用') &&
   scopeMatch(position, level.value)
  ).map(position => position.job).filter(Boolean));
  // An imported position can predate the current list of jobs.
  if (original.job && business.value === (original.business || job(ctx)) && level.value === (original.scope || ''))
   names.add(original.job);
  const options = [...names].sort((a,b) => a.localeCompare(b,'zh-CN')).map(name => new Option(name, name));
  select.replaceChildren(new Option('全部岗位', ''), ...options);
  if (needsChoice || (selected && !names.has(selected))) {
   const prompt = new Option('请重新选择岗位');
   prompt.disabled = true;
   select.prepend(prompt);
   select.selectedIndex = 0;
   select.setCustomValidity('请重新选择适用岗位。');
  } else {
   select.value = selected;
   select.setCustomValidity('');
  }
 }
 const refresh = () => update(select.value, !!select.selectedOptions[0]?.disabled);
 business.addEventListener('change', refresh);
 level.addEventListener('change', refresh);
 select.addEventListener('change', () => select.setCustomValidity(''));
 update(original.job || '');
}
function wireForm(ctx) {
 bindJobSelect(ctx);
 PFSource.wire();PFBands.bind();
 const type=id('f-type'), algorithm=id('f-algorithm');
 let previous=algorithm.value==='人工评分'?'达成率':algorithm.value, wasBehavior=type.value==='行为评价';
 const toggle=()=>{
  const behavior=type.value==='行为评价';
  if(behavior){if(algorithm.value!=='人工评分')previous=algorithm.value;algorithm.value='人工评分'}
  else if(wasBehavior)algorithm.value=previous;
  wasBehavior=behavior;algorithm.disabled=behavior;
  const manual=behavior||algorithm.value==='人工评分';
  id('manual-score').hidden=!manual;id('manual-score').disabled=!manual;
  for(const key of ['target','formula','source'])id('f-'+key).closest('label').hidden=manual;
  id('source-block').hidden=manual;
  id('band-box').hidden=manual||!alg.slice(1,4).includes(algorithm.value);
 };
 type.addEventListener('change',toggle);algorithm.addEventListener('change',toggle);toggle();
}
function reset(ctx,isLib){const key=[isLib?'lib':'job',isLib?(ctx.editorKey||''):ctx.plan?.id,ctx.role,ctx.filters?.biz,ctx.filters?.scope].join('|');if(key!==current){current=key;editor=null;pending=null;note='';keyword='';sourceFilter='';statusFilter='';destination=null;picker=false}}
const str=escape;
function reviewReason(m,rows=[]) {
 if(rows.some(v=>v!==m&&identity(v)===identity(m)))return '同业务、层级和岗位存在同名指标';
 return checkLibrary(m)||PFScoring.validate(m);
}
function destinations(m,s){return (window.PFEngine?.reviewData()?.plans||[]).filter(p=>p.stage==='draft'&&p.month===s.month&&(!s.org||s.org==='全部组织'||s.org===p.org)&&(!s.scope||s.scope==='全部层级'||s.scope===p.scope)&&(!s.biz||s.biz==='全部业务'||s.biz===p.biz)&&(m.business==='通用'||m.business===p.biz)&&scopeMatch(m,p.scope)&&(!m.job||m.job===p.job)&&p.metrics.length<10&&!p.metrics.some(v=>v.name===m.name))}
function destinationBox(ctx){if(destination==null)return '';const m=ctx.data.library[destination];if(!m)return '';const available=destinations(m,ctx.filters);return `<div class="pfc-pick" id="pfc-destination"><strong>选用指标：${str(m.name)}</strong><label class="pf-field">选择本期岗位草稿<select id="pfc-target"><option value="">请选择岗位方案</option>${available.map(p=>`<option value="${str(p.id)}">${[p.org,p.biz,p.job,p.month].map(str).join(' / ')}</option>`).join('')}</select></label>${available.length?btn('continue','进入岗位配置',true):'<p>当前筛选范围无可选草稿。需有相符岗位、剩余指标名额，且未关联此指标。<a href="#performance/jobs">前往岗位方案新建草稿</a></p>'}${btn('dismiss','取消')}</div>`}

const scopeMatch=(m,s)=>!m.scope||!s||s==='全部层级'||m.scope===s||String(m.scope).includes('一线')&&String(s).includes('一线')||String(m.scope).includes('区域')&&String(s).includes('区域');
function libRecords(ctx,isLib){const biz=isLib?ctx.filters?.biz:job(ctx),scope=isLib?ctx.filters?.scope:ctx.plan?.scope;return (ctx.data.library||[]).map((m,i)=>({m,i})).filter(({m})=>(!biz||biz==='全部业务'||m.business==='通用'||m.business===biz)&&scopeMatch(m,scope)&&(isLib||!m.job||m.job===ctx.plan?.job))}
function ds(m){return m.definition||m.formula||'未填写定义'}
function details(m){if(!m.sourceRow&&!m.sourceType)return '';const a=[['适用岗位',m.job],['原表类型',m.sourceType],['权重或占比',m.sourceWeight],['原表目标',m.sourceTarget],['取值及公式',m.formula],['原表分档',m.sourceBands],['数据来源',m.source],['原表行',m.sourceRow]].filter(([,v])=>v!=null&&v!=='');return `<details class="pfc-source"><summary>查看原表口径</summary><dl>${a.map(([label,value])=>`<dt>${str(label)}</dt><dd>${str(value)}</dd>`).join('')}</dl></details>`}

function catalog(ctx,isLib,writable){
 const rec=libRecords(ctx,isLib),attrs=ctx.plan?.metrics||[];
 const toolbar=isLib?`<div class="pf-row">${writable?btn('lib-new','新增指标',true)+btn('lib-in','上传指标库模板'):''}${btn('lib-dl','下载指标库模板')}${btn('lib-export','导出当前清单')}</div>`:btn('close-picker','关闭');
 return `<div class="pfc-catalog"><div class="pf-row pf-split"><div><h3>${isLib?'指标库':'从指标库选用'}</h3><small>${isLib?'':('当前岗位：'+str(ctx.plan.job)+'。选择后带入指标定义和取值来源。')}</small></div>${toolbar}</div>${isLib&&writable?destinationBox(ctx):''}
 <div class="pf-row"><label class="pfc-search">搜索指标<input type="search" id="pfc-query" value="${str(keyword)}" placeholder="名称、岗位、来源或字段"></label><label class="pf-field">取值来源<select id="pfc-src-filter"><option value="">全部来源</option>${[...PFSource.kinds,'人工评分'].map(v=>'<option'+(sourceFilter===v?' selected':'')+'>'+v+'</option>').join('')}</select></label>${isLib?`<label class="pf-field">口径状态<select id="pfc-status-filter"><option value="">全部状态</option>${opts(['可选用','待核对'],statusFilter)}</select></label>`:''}</div>
 <div class="pfc-scroll"><table class="pf-table"><thead><tr><th>指标名称 / 业务定义</th><th>取值来源</th><th>业务 / 层级</th><th>指标类型</th><th>计算逻辑 / 初始权重</th>${isLib?'<th>口径状态</th>':''}${writable?'<th>操作</th>':''}</tr></thead><tbody>
 ${rec.map(({m,i})=>{const issue=reviewReason(m,ctx.data.library);return `<tr data-pfc-status="${issue?'待核对':'可选用'}" data-pfc-search="${str(searchText(m))}" data-pfc-kinds="${str(PFSource.bindings(m).map(b=>b.kind).join('|'))}"><td><strong>${str(m.name)}</strong><small class="pfc-desc">${str(ds(m))}</small>${details(m)}</td><td>${PFSource.display(m)}</td><td>${str(m.business)}<small class="pfc-desc">${str(m.scope||'通用')}${m.job?' · '+str(m.job):''}</small></td><td>${str(m.type||'待配置')}</td><td>${str(m.algorithm||'待核对')}<small class="pfc-desc">${str(PFScoring.isManual(m)?PFScoring.summary(m):m.formula||'')}${m.bands?' · '+str(PFBands.summary(m)):''}</small><small class="pfc-desc">${m.weight!=null&&m.weight!==''?str(m.weight)+'%':'权重待配置'}</small></td>${isLib?`<td><strong>${issue?'待核对':'可选用'}</strong><small class="pfc-desc">${str(issue||'当前生效口径')}</small></td>`:''}${writable?`<td>${isLib?`${issue?'':`<button class="pf-btn" data-pfc-route="${i}" type="button">选入岗位方案</button>`}<button class="pf-btn" data-pfc-libedit="${i}" type="button">${PFExchange.protectedSource(m)?'申请变更':'调整指标'}</button>`:attrs.some(a=>a.name===m.name)?'<span class="pf-muted">已关联</span>':`<button class="pf-btn" type="button" data-pfc-pick="${i}">选用</button>`}</td>`:''}</tr>`}).join('')}</tbody></table></div><p id="pfc-nohits" class="pf-muted" ${rec.length?'hidden':''}>没有匹配的指标。</p></div>`;
}
function tail(ctx,writable){return `<input type="file" accept=".csv,text/csv" id="pfc-file" hidden>${writable&&pending?`<section class="pf-panel"><h3>导入预览 · ${pending.kind==='lib'?'指标库':'本岗位'}</h3><p>${pending.list.map(m=>str(m.name)+'（'+str(m.weight)+'%）').join('、')}</p><p>同范围、同名的指标将更新，其他指标保留。</p>${btn('accept','确认导入',true)} ${btn('abort','取消导入')}</section>`:''}<p role="status" id="pfc-msg" class="pf-muted">${str(note)}</p>`}
function renderLibrary(ctx){reset(ctx,true);const can=ctx.role==='方案配置人';return `${can&&editor?form({...ctx,view:'library'}):''}<section class="pf-panel">${catalog(ctx,true,can)}</section>${tail(ctx,can)}`}
let handoff=null;
function render(ctx){reset(ctx,false);if(handoff&&ctx.plan?.id===handoff.target&&allowed(ctx)){editor={m:{...handoff.m},i:null};handoff=null;picker=true;note='核对本岗位的指标设置后保存。'}if(!ctx.plan)return '<section class="pf-panel">请选择需要配置的岗位。</section>';const p=ctx.plan,writable=allowed(ctx),ms=p.metrics||[],sum=ms.reduce((acc,m)=>acc+(Number(m.weight)||0),0);const rows=ms.map((m,i)=>`<tr><td><strong>${str(m.name)}</strong><small class="pfc-desc">${str(m.definition||'')}</small>${details(m)}</td><td>${str(m.type||'待配置')}</td><td>${str(m.algorithm||'待配置')}${m.exchangeKey?`<small class="pfc-desc">V${str(m.exchangeVersion)} · ${ctx.data.exchange?.changes?.find(c=>c.key===m.exchangeKey&&c.version===m.exchangeVersion)?.status||'已生效'}</small>`:''}<small class="pfc-desc">${str(PFScoring.isManual(m)?PFScoring.summary(m):m.formula||'')}</small>${m.bands?`<small class="pfc-desc">${str(PFBands.summary(m))}</small>`:''}</td><td>${str(PFScoring.isManual(m)?'—':m.target!==''&&m.target!=null?m.target:'待配置')}</td><td>${m.weight!=null&&m.weight!==''?str(m.weight)+'%':'待配置'}</td>${writable?`<td class="pfc-actions"><button type="button" class="pf-btn" data-pfc-edit="${i}">编辑</button><button type="button" class="pf-btn" data-pfc-del="${i}">移除</button></td>`:''}</tr>`).join('');return `<section class="pf-panel"><div class="pf-row pf-split"><div><small>${str(p.biz||p.business)} · ${str(p.scope)} · ${str(p.month||'')}</small><h3>${str(p.job)} · 已关联指标</h3></div><div class="pf-row">${writable?btn('add','＋ 给岗位新增指标',true)+btn('plan-in','导入岗位配置'):''}${btn('plan-dl','下载岗位模板')}</div></div><div class="pfc-meter"><span>已配置 <b>${ms.length}</b> / 10 项</span><span>已分配权重 <b>${+sum.toFixed(2)}%</b></span>${!writable?`<span>只读 · ${p.stage!=='draft'?'仅草稿方案可编辑':'由方案配置人维护'}</span>`:''}</div>${writable&&picker&&!editor?`<div class="pfc-pick"><div class="pf-row pf-split"><strong>给「${str(p.job)}」新增指标</strong>${btn('new','手动新建指标')}</div>${catalog(ctx,false,true)}</div>`:''}${writable&&editor?form(ctx):''}<div class="pfc-scroll"><table class="pf-table"><thead><tr><th>指标名称 / 定义</th><th>类型</th><th>计分方式</th><th>岗位目标值</th><th>岗位权重</th>${writable?'<th>操作</th>':''}</tr></thead><tbody>${rows||'<tr><td colspan="6">本岗位暂未关联指标。</td></tr>'}</tbody></table></div></section>${tail(ctx,writable)}`}
function bind(ctx,isLib=false){const {plan,data}=ctx;if(plan)plan.metrics??=[];data.library??=[];const writable=isLib?ctx.role==='方案配置人':allowed(ctx),save=(msg,reason)=>{note=msg;editor=null;pending=null;picker=false;ctx.save(reason);ctx.refresh()}, action=(key,f)=>{let el=id(key);if(el)el.onclick=f};action('lib-dl',()=>dl('lib',ctx));action('lib-export',()=>dl('export',ctx));action('plan-dl',()=>dl('plan',ctx));const search=id('query');if(search){const filter=()=>{keyword=search.value;const q=keyword.trim().toLowerCase();let count=0;document.querySelectorAll('[data-pfc-search]').forEach(tr=>{tr.hidden=!tr.dataset.pfcSearch.includes(q)||!!statusFilter&&tr.dataset.pfcStatus!==statusFilter||!!sourceFilter&&!tr.dataset.pfcKinds.split('|').includes(sourceFilter);if(!tr.hidden)count++});id('nohits').hidden=!!count};search.oninput=filter;if(id('status-filter'))id('status-filter').onchange=e=>{statusFilter=e.target.value;filter()};id('src-filter').onchange=e=>{sourceFilter=e.target.value;filter()};filter()}if(!writable)return;const open=(m,i)=>{editor={m:{...m},i};pending=null;note='';ctx.refresh();id('pfc')?.focus();id('f-name')?.focus()};const notify=s=>{note=s;id('msg').textContent=s;id('msg').scrollIntoView({block:'nearest'})};if(isLib){document.querySelectorAll('[data-pfc-route]').forEach(el=>el.onclick=()=>{destination=+el.dataset.pfcRoute;editor=null;ctx.refresh();id('target')?.focus()});action('dismiss',()=>{destination=null;ctx.refresh()});action('continue',()=>{const target=id('target').value,m=data.library[destination];if(!target||!m||reviewReason(m,data.library)||!destinations(m,ctx.filters).some(p=>p.id===target))return notify('请选择可用的岗位草稿。');handoff={target,m:JSON.parse(JSON.stringify(m))};destination=null;window.portalNavigate('performance/jobs');const sel=document.getElementById('pf-plan');if(sel&&Array.from(sel.options).some(o=>o.value===target)){sel.value=target;sel.dispatchEvent(new Event('change'));id('f-name')?.focus()}else handoff=null})}action('lib-new',()=>open({business:ctx.filters?.biz&&ctx.filters.biz!=='全部业务'?ctx.filters.biz:'通用',type:types[0],algorithm:alg[0],weight:'',target:100}));document.querySelectorAll('[data-pfc-libedit]').forEach(el=>el.onclick=()=>open(data.library[+el.dataset.pfcLibedit],+el.dataset.pfcLibedit));action('add',()=>{if(plan.metrics.length>=10)return notify('本岗位已配置 10 项，无法新增。');picker=true;editor=null;keyword='';ctx.refresh();id('query')?.focus()});action('close-picker',()=>{picker=false;keyword='';ctx.refresh()});action('new',()=>plan.metrics.length>=10?notify('本岗位已配置 10 项，无法新增。'):open({business:job(ctx),type:types[0],algorithm:alg[0],weight:0,target:100}));document.querySelectorAll('[data-pfc-pick]').forEach(el=>el.onclick=()=>{let m=data.library[+el.dataset.pfcPick];if(plan.metrics.some(x=>x.name===m.name))return notify('本岗位已选用此指标，可直接编辑。');if(plan.metrics.length>=10)return notify('本岗位已配置 10 项，无法新增。');open({...m,business:job(ctx),scope:plan.scope})});document.querySelectorAll('[data-pfc-edit]').forEach(el=>el.onclick=()=>{const i=+el.dataset.pfcEdit;open(plan.metrics[i],i)});document.querySelectorAll('[data-pfc-del]').forEach(el=>el.onclick=()=>{plan.metrics.splice(+el.dataset.pfcDel,1);save('已移除岗位指标，库中定义不受影响。')});action('cancel',()=>{editor=null;ctx.refresh()});if(editor&&id('form')){wireForm(ctx);id('form').onsubmit=async e=>{e.preventDefault();const m=metricFromForm();if(isLib){let err=checkLibrary(m);if(!err&&m.weight!==''&&(!Number.isFinite(+m.weight)||+m.weight<0||+m.weight>100))err='默认权重应为 0 至 100%。';if(!err&&m.algorithm==='达成率'&&m.target!==''&&!(+m.target>0))err='达成率算法的目标必须大于0。';if(!err&&data.library.some((v,i)=>editor.i!==i&&identity(v)===identity(m)))err='同业务、层级和岗位已存在同名指标。';if(err){id('error').textContent=err;return}const why=await PFExchange.confirmChanges([[editor.i==null?null:data.library[editor.i],m]]);if(why===null)return;if(editor.i==null)data.library.push(m);else data.library[editor.i]=m;save('已保存库指标「'+m.name+'」；已选入岗位的方案未改动。',why);return}let err=checkLibrary(m)||PFScoring.validate(m);if(!err&&plan.metrics.some((x,i)=>i!==editor.i&&x.name===m.name))err='同一岗位不能重复配置同名指标';if(err){id('error').textContent=err;return}if(m.business!==job(ctx)&&m.business!=='通用'){id('error').textContent='请选择当前岗位所属业务，或使用通用指标';return}m.scope=plan.scope;m.weight=+m.weight;if(m.target!=='')m.target=+m.target;if(!alg.slice(1,4).includes(m.algorithm))m.bands='';if(editor.i==null&&plan.metrics.length>=10){id('error').textContent='岗位指标最多 10 项';return}const why=await PFExchange.confirmChanges([[ruleRef(ctx,m,editor.m),m]]);if(why===null)return;try{queueRule(ctx,m,editor.m,why)}catch(ex){id('error').textContent=ex.message;return}if(editor.i==null){if(plan.metrics.length>=10){id('error').textContent='岗位指标最多 10 项';return}plan.metrics.push(m)}else plan.metrics[editor.i]=m;save('岗位指标已保存。')}}let mode='';for(const [key,kind] of [['plan-in','plan'],['lib-in','lib']])action(key,()=>{mode=kind;id('file').value='';id('file').click()});id('file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1024*1024)throw Error('单个模板最大 1 MB');const [header,...rows]=readCSV((await f.text()).replace(/^\uFEFF/,''));if(!header||!columns.every((v,i)=>header[i]===v)||!rows.length)throw Error('请使用下载的模板，并至少填写一行');const seen=new Set();const list=rows.map((r,i)=>{let m=Object.fromEntries(keys.map((key,j)=>[key,r[j]??'']));try{readSourceColumns(m,r,header)}catch(ex){throw Error('第 '+(i+2)+' 行：'+ex.message)}if(header.includes('适用层级'))m.scope=r[header.indexOf('适用层级')]||'';if(header.includes('适用岗位'))m.job=r[header.indexOf('适用岗位')]||'';let err='';try{readScoringColumns(m,r,header);err=checkLibrary(m)||(mode==='plan'?PFScoring.validate(m):'')}catch(ex){err=ex.message}if(mode==='plan'){if(m.business!==job(ctx)&&m.business!=='通用')err='业务与当前岗位不一致';m.scope=plan.scope}else if(!m.scope&&ctx.filters?.scope&&ctx.filters.scope!=='全部层级')m.scope=ctx.filters.scope;const uid=mode==='lib'?identity(m):m.name;if(seen.has(uid))err='同一模板中有重复指标';seen.add(uid);if(err)throw Error(`第 ${i+2} 行：${err}`);m.weight=m.weight===''?'':+m.weight;m.target=m.target===''?'':+m.target;return m});if(mode==='plan'&&new Set([...plan.metrics.map(m=>m.name),...list.map(m=>m.name)]).size>10)throw Error('导入后将超过每岗 10 项的上限');pending={kind:mode,list};editor=null;note='请确认导入预览，确认前不会写入。';ctx.refresh();id('accept')?.focus()}catch(err){pending=null;notify('导入失败：'+err.message)}};action('abort',()=>{pending=null;ctx.refresh()});action('accept',async()=>{if(!pending)return;const lib=pending.kind==='lib',dest=lib?data.library:plan.metrics;const imported=pending.list.map(row=>{
 const base=dest.find(x=>lib?identity(x)===identity(row):x.name===row.name);
 if(!base)return {...row};
 const m={...base,...row};
 if(PFExchange.protectedSource(base))m.origin='大数据';
 if(!PFScoring.isManual(m)){delete m.manualScore;if(PFScoring.isManual(base)&&!row.rule)delete m.rule}
 if(PFScoring.isManual(m)&&!row.manualScore&&row.rule?.kind==='behavior')delete m.manualScore;
 return m;
});const pairs=imported.map(m=>{const base=dest.find(x=>lib?identity(x)===identity(m):x.name===m.name);return [lib?base:ruleRef(ctx,m,base),m]});const why=await PFExchange.confirmChanges(pairs);if(why===null)return;if(!lib){try{PFExchange.batchWriteback(()=>{for(const m of imported)queueRule(ctx,m,dest.find(x=>x.name===m.name),why)})}catch(ex){notify('岗位导入未提交：'+ex.message);return}}for(const m of imported){const i=dest.findIndex(x=>lib?identity(x)===identity(m):x.name===m.name);if(i<0)dest.push({...m});else dest[i]=m}save('模板已导入。',why)})}
window.PFConfig={reviewReason,render:ctx=>ctx.view==='library'?renderLibrary(ctx):render(ctx),bind:ctx=>bind(ctx,ctx.view==='library'),renderLibrary,bindLibrary:ctx=>bind(ctx,true)};})();
