(() => {
  'use strict';
  const pages = {library:'指标池',jobs:'岗位方案与下发',tracking:'过程跟踪',results:'绩效结果管理'};
  const roles = {
    '总部 HRBP': {scope:'总部 · 区域与一线', pages:['library','jobs','tracking','results'], work:'按业务核对指标，维护定义、取值来源、计算逻辑和默认权重；配置岗位方案并下发', entry:'library', action:'打开指标池'},
    '统一审批人': {scope:'待审岗位方案', pages:['jobs'], work:'核对岗位、指标、权重和目标，通过或退回', entry:'jobs', action:'审核岗位方案'},
    '区域总': {scope:'华东大区', pages:['tracking','results'], work:'查看本大区过程结果，填写区域行为评价', entry:'tracking', action:'办理区域评价'},
    '1+N店长': {scope:'华东 · 示范一店', pages:['tracking','results'], work:'查看本店员工的过程表现和月结进度', entry:'tracking', action:'查看本店绩效'},
    '业务老师': {scope:'后台业务复核', pages:['tracking','results'], work:'确认区域行为评价，核对适用的门店扣罚', entry:'tracking', action:'核对评价与申诉'},
    '结果管理员': {scope:'本期授权范围', pages:['tracking','results'], work:'查看区域和门店的绩效结果，按授权范围导出', entry:'results', action:'核对月结结果'},
    '大数据接口演示': {scope:'指标规则 · 交付业务值', pages:['library','tracking'], work:'查看指标变更、模拟大数据接收反馈；对已核实的业务值异议模拟更正与回传', entry:'tracking', action:'查看待更正业务值'},
    '员工': {scope:'本人', pages:['tracking','results'], work:'手机确认本人方案，查看结果并发起异议', entry:'mobile', action:'我的绩效'},
    '总部一级负责人': {scope:'本人负责的总部部门', pages:[], work:'在已下发的编制与预算内办理人员申请', entry:'budget', action:'查看本部门额度'}
  };
  const guides = [
    {name:'指标导入与变更', ids:['P01','P02','P04','P05','P06','P07','P08'], page:'library', desc:'首次建库、DMOC 增改、同步回执'},
    {name:'岗位方案', ids:range('P',9,16),page:'jobs',desc:'选指标、定目标与权重、校验并提交'},
    {name:'审批与批量下发',ids:range('P',17,24),page:'jobs',desc:'统一审批、范围预览、发布明细'},
    {name:'通知与员工回执',ids:range('P',25,31),page:'jobs',desc:'信息管理平台、企业微信或飞书、手机确认'},
    {name:'大数据计算',ids:range('D',1,8),page:'tracking',desc:'取数、计算、存储、异常处理'},
    {name:'过程展示与预警',ids:range('T',1,9),page:'tracking',desc:'日值、月累计、区域排名与预警'},
    {name:'月结指标',ids:range('C',1,6),page:'results',desc:'核对实绩、补录、月结结果'},
    {name:'评价与扣罚',ids:range('V',1,6),page:'results',desc:'区域总填写、业务老师确认、汇集结果'},
    {name:'申诉与导出',ids:range('A',1,7),page:'results',desc:'提出异议、处理结果、核对与导出'}
  ];
  const questions = [
    ['角色授权','统一审批人按什么规则匹配？业务老师、1+N 店长分别能看和办理哪些范围？','五条业务线、组织权限管理方'],
    ['指标同步','变更在何时同步？大数据以何种方式回执？同步中的版本能否进入岗位草稿或下发？','总部 HRBP、大数据、DMOC'],
    ['指标版本','新版从哪个考核月生效？已下发方案是否重算？','业务负责人、大数据'],
    ['员工确认','各业务分别填写 X 天；从何时起算？超时如何处理？','销售、交付、售后、市场、新媒体'],
    ['过程预警','各线排名范围、预警阈值、接收人和通知渠道如何配置？','各业务线、消息平台'],
    ['月结','综合总分由哪个系统汇总？谁可归档、重开和全量导出？','业务负责人、大数据、绩效运营'],
    ['申诉','业务值异议核实后交大数据更正。各业务从哪发起、谁核实、何时截止？','各业务线、对应业务系统']
  ];
  function range(prefix,from,to){return Array.from({length:to-from+1},(_,i)=>prefix+String(from+i).padStart(2,'0'))}
  const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleOf = s=>roles[s.actor==='方案配置人'?'总部 HRBP':s.actor]||roles[s.persona]||roles['员工'];
  const allowed = (s,page)=>Object.prototype.hasOwnProperty.call(pages,page)&&roleOf(s).pages.includes(page);
  const href = page => page==='mobile'?'#employee/performance':page==='budget'?'#budget/library':'#performance/'+page;
  const icon = (id)=>{const d={scope:'M4 7h16v13H4z M8 7V4h8v3 M8 12h8', flow:'M3 5h5v5H3z M16 14h5v5h-5z M8 7h4v9h4',check:'M4 12l5 5L20 6',page:'M6 3h9l4 4v14H6z M9 11h7 M9 15h7',layers:'M3 8l9-5 9 5-9 5z M3 13l9 5 9-5',alert:'M12 3L2 21h20z M12 9v5 M12 16v1',arrow:'M5 12h14 M14 7l5 5-5 5'};return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d[id]+'"/></svg>'};
  function summary(s,r){
    const rowIds=new Set(r.map(x=>x.id)), db=window.PFEngine.reviewData?.();
    const list=(db?.plans||[]).filter(p=>p.month===s.month&&p.people?.some(x=>rowIds.has(x.id)));
    const assigned=new Set(), signed=new Set();
    for(const p of list.filter(p=>p.stage==='active')) for(const person of p.people){
      if(!rowIds.has(person.id))continue;
      assigned.add(person.id);
      if(p.received?.includes(person.id))signed.add(person.id);
    }
    return {list,assigned,signed,review:list.filter(p=>p.stage==='review').length,total:rowIds.size};
  }
  function roleMatrix(s){
    const title=s.actor==='员工'?'员工':s.actor==='方案配置人'?'总部 HRBP':s.persona;
    return '<div class="px-role-table"><table><thead><tr><th>角色</th><th>可见范围</th><th>可办理事项</th></tr></thead><tbody>'+Object.entries(roles).map(([name,v])=>'<tr'+(name===title?' class="px-self"':'')+'><th>'+esc(name)+'</th><td>'+esc(v.scope)+'</td><td>'+esc(v.work)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function questionList(){return '<div class="px-questions">'+questions.map(([t,q,o])=>'<article><strong>'+t+'</strong><div>'+q+'<small>确认方 · '+o+'</small></div></article>').join('')+'</div>'}
  function render(s,r,supplement=''){
    const role=roleOf(s);
    if(!role.pages.length)return '';
    const scope=role.scope, {list,signed,review,total}=summary(s,r);
    const stageNames={draft:'草稿',review:'审批中',approved:'待下发',active:'已下发'};
    const totals=Object.fromEntries(Object.keys(stageNames).map(k=>[k,list.filter(p=>p.stage===k).length]));
    const stages=Object.entries(stageNames).map(([k,label])=>'<li><i class="px-dot px-'+k+'"></i>'+label+'<b>'+totals[k]+'</b></li>').join('');
    const split=s.month.split('-'), showDate=split[0]+' 年 '+Number(split[1])+' 月';
    const tiles=[['scope','应考人员',total,'人'],['layers','已下发方案',totals.active,'份'],['page','待审批方案',review,'份'],['check','已确认方案人员',signed.size,'人']];
    return '<section class="px-board" id="workbench-performance" aria-labelledby="workbench-performance-title"><header class="px-workbench-heading"><h2 id="workbench-performance-title" tabindex="-1">绩效概览</h2></header><div class="px-mainrow"><section class="px-identity"><div class="px-overline">'+icon('scope')+' 当前职责</div><h3>'+esc(s.actor==='方案配置人'?'总部 HRBP':s.persona)+'</h3><p>'+esc(role.work)+'</p><div class="px-identity-foot"><a href="'+href(role.entry)+'">'+role.action+' '+icon('arrow')+'</a><span>'+esc(scope)+'</span></div></section><section class="px-overpanel"><div class="px-sectionhead"><h3>方案进度</h3><span>'+esc(showDate)+'</span></div><p><b>'+list.length+'</b> 份岗位方案</p><div class="px-bar" aria-hidden="true">'+Object.entries(totals).filter(([,v])=>v).map(([k,v])=>'<i class="px-'+k+'" style="flex:'+v+'"></i>').join('')+'</div><ul class="px-legend">'+stages+'</ul></section></div>'+
      '<div class="px-tiles">'+tiles.map(([ic,l,v,u])=>'<section><div>'+icon(ic)+' '+l+'</div><strong>'+v+'</strong><small>'+u+'</small></section>').join('')+'</div>'+supplement+
      '<section class="px-lifecycle"><div class="px-sectionhead"><h3>绩效办理流程</h3><button type="button" data-px-panel="roles">角色分工</button></div><div class="px-flowlist">'+[
        ['月初','指标配置','维护指标口径与默认权重。','library','指标池'],
        ['月初','岗位方案与下发','配置岗位指标、提交审批并下发给员工。','jobs','岗位方案与下发'],
        ['月中','过程跟踪','查看大数据回传的指标绩效值、权重结果及缺数原因。','tracking','过程跟踪'],
        ['月结','绩效结果','查看区域和门店的本期结果。','results','绩效结果管理']
      ].map(([when,t,d,page,label])=>'<article><span>'+when+'</span><h4>'+t+'</h4><p>'+d+'</p>'+(allowed(s,page)?'<a href="'+href(page)+'">'+label+' →</a>':'<small>由对应角色办理</small>')+'</article>').join('')+'</div></section></section>';
  }
  function nodeContent(group, selected){
    const item=guides[group], byId=new Map(window.PFNodeGuide.map(n=>[n.id,n]));
    return '<div class="px-guide-layout"><nav aria-label="流程分组">'+guides.map((g,i)=>'<button type="button" data-px-group="'+i+'" aria-pressed="'+(i===group)+'">'+g.name+'<span>'+g.ids.length+'</span></button>').join('')+'</nav><div class="px-node-body"><h3>'+item.name+'</h3><p>'+item.desc+'</p>'+item.ids.map((id,i)=>{const n=byId.get(id);if(!n)return '';return '<details '+((selected?id===selected:i===0)?'open':'')+'><summary><span>'+id+'</span> '+esc(n.title)+'</summary><small>'+esc(n.actor)+'</small><dl>'+['输入','处理','输出','异常'].map((l,j)=>'<dt>'+l+'</dt><dd>'+esc(n.fields[j])+'</dd>').join('')+'</dl></details>'}).join('')+'</div></div>';
  }
  function openPanel(mode,s){
    document.querySelector('.px-guide-modal')?.close();
    const box=document.createElement('dialog');box.className='px-guide-modal';
    box.innerHTML='<header><h2>'+({roles:'角色与操作权限',questions:'待业务确认的规则',nodes:'开发流程节点'}[mode])+'</h2><button aria-label="关闭" type="button">关闭</button></header><div class="px-dialog-body"></div>';
    box.setAttribute('aria-label',box.querySelector('h2').textContent);
    const content=box.querySelector('.px-dialog-body');
    let g=Math.max(0,guides.findIndex(x=>x.page===s.page));
    content.innerHTML=mode==='roles'?roleMatrix(s):mode==='questions'?questionList():nodeContent(g);
    box.querySelector('header button').onclick=()=>box.close();
    box.addEventListener('click',e=>{const group=e.target.closest('[data-px-group]');if(group){g=Number(group.dataset.pxGroup);content.innerHTML=nodeContent(g);content.querySelector('[aria-pressed="true"]')?.focus()}});
    box.addEventListener('close',()=>box.remove(),{once:true});document.body.append(box);box.showModal();
  }
  function bind(s){document.querySelectorAll('[data-px-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.pxPanel,s))}
  window.PFDesk={pages,allowed,roleOf,render,bind};
})();
