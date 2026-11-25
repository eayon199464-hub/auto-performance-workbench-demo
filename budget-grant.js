// Annual authorization is independent of in-year transfers and monthly efficiency review.
(() => {
  'use strict';
  const n = v => Number(v) || 0;
  const el = id => document.getElementById('bg-' + id);
  const total = (arr, key) => arr.reduce((v, row) => v + n(row[key]), 0);
  const basis = {销售:'按门店梯队取配置标准',新媒体:'按门店数取配置标准',售后:'按业务量及人均标准核定',交付:'按业务量及人均标准核定',市场:'具体核定标准待业务确认'};
  const tbl = (headers, body) => '<div class="tablewrap"><table><thead><tr>'+headers.map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  const row = cells => '<tr>'+cells.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
  const versions = z => Array.isArray(z.grantVersions) ? z.grantVersions : [];
  const editingYear = z => n(z.year)+(z.authorized===false?0:1);
  function ledger(c) {
    const z=c.center,e=c.esc,m=c.money,ls=z.lines||[],vis=ls.filter(l=>!c.biz||c.biz==='全部业务'||l.biz===c.biz);
    const display = (v,unit) => z.authorized===false?'待首次核定':(unit==='元'?m(v):v+' 人');
    return '<section class="panel"><h3>各业务线编制子额度</h3><p class="muted">'+e(z.name)+' · '+e(z.year)+' 年 · '+(z.authorized===false?'待首次核定':'已核定')+'</p>'+tbl(['业务线','编制上限','在岗占用','招聘预占','可用编制','已占＋预占成本'],vis.length?vis.map(l=>row([e(l.biz),display(n(l.cap),'人'),n(l.used)+' 人',n(l.reserved)+' 人',display(n(l.cap)-n(l.used)-n(l.reserved),'人'),m(n(l.usedCost)+n(l.reservedCost))])).join(''):'<tr><td colspan="6">该中心暂无此业务线。</td></tr>')+
      '<p class="muted">各业务线分别控制人数，共用中心成本包。可分享结余以半年度核定为准。'+(z.standard?'依据：'+e(z.standard)+'。':'')+'</p></section>';
  }
  function form(c) {
    const z=c.center,e=c.esc,y=editingYear(z),first=z.authorized===false, rec=versions(z).find(v=>+v.year===y);
    if(c.actor!=='总部 HRBP')return '';
    if(rec)return '<section class="panel"><h3>'+y+' 年度已核定</h3><p class="muted">已保留核定版本；如需年内调编，请使用调编审批。</p></section>';
    if(z.reviewLocked&&first)return '<section class="panel"><h3>首次年度核定</h3><p>当前处于复盘期，本期额度暂不可调整。</p></section>';
    return '<section class="panel"><h3>'+(first?'首次核定本年额度':'测算并核定下年度额度')+'</h3><p class="muted">'+(first?'按适用标准填写各业务线人数，再核定中心成本包。':'本年额度已生效。下年度核定单独留存，不覆盖当前可用额度。')+'</p><details id="bg-open"><summary>'+(first?'开始年度核定':'打开下年度测算')+'</summary><form id="bg-grant"><div class="grid"><label class="field">核定年度<input type="text" value="'+y+'" readonly></label><label class="field">生效的配置标准 / 版本<input id="bg-standard" maxlength="180" required placeholder="填写实际适用的标准或版本"></label><label class="field">核定依据编号或说明<input id="bg-evidence" maxlength="180" required placeholder="如年度批复单号或已核准的业务依据"></label></div>'+
      tbl(['业务线','配置基准参考','核定子额度（人）'],z.lines.map((l,i)=>row([e(l.biz),e(basis[l.biz]||'按适用的核定标准填写'),'<input type="number" step="1" min="0" max="1000000" required data-bg-cap="'+i+'" aria-label="'+e(l.biz)+'核定人数" value="'+n(l.cap)+'">'])).join(''))+
      '<div class="grid"><label class="field">年度固定类成本（元）<input type="number" id="bg-fixed" min="0" step="0.01" required value="'+n(z.costFixed)+'"></label><label class="field">年度其他类刚性成本（元）<input type="number" id="bg-other" min="0" step="0.01" required value="'+n(z.costOther)+'"></label></div>'+
      '<p id="bg-preview" class="notice" role="status"></p><div class="actions"><button type="button" id="bg-check">查看核定摘要</button></div><div id="bg-confirm" hidden><p id="bg-final"></p><button type="submit" class="primary">'+(first?'确认下达年度额度':'确认保存下年度核定')+'</button></div></form></details></section>';
  }
  function historyView(c) {
    const z=c.center,e=c.esc,m=c.money,vs=versions(z).slice().reverse();
    return '<section class="panel"><h3>年度核定记录</h3>'+(!vs.length?'<p class="muted">'+(z.authorized===false?'尚无年度核定记录。':'当前为期初演示基线；本页面办理的后续核定会生成版本记录。')+'</p>':tbl(['年度 / 版本','核定编制','年度成本包','生效说明','核定明细'],vs.map(v=>row([e(v.year)+' / '+e(v.version),e(v.cap)+' 人',m(v.costCap),+v.year===+z.year?'本年核定':'下年度核定，未改变本年额度','<details><summary>查看</summary><p>固定类：'+m(v.costFixed)+'；其他类：'+m(v.costOther)+'。</p><p>'+e(v.standard)+' · '+e(v.evidence)+'</p><p>'+v.lines.map(l=>e(l.biz)+' '+e(l.cap)+' 人').join('；')+'</p><p>'+e(v.actor)+' · '+e(v.time)+'</p></details>'])).join('')) )+'</section>';
  }
  function log(c) {
    const e=c.esc,z=c.center,all=(z.logs||[]).slice(),actions=[...new Set(all.map(l=>l.action).filter(Boolean))];
    return '<section class="panel"><h3>异动与审批留痕</h3><p class="muted">'+e(z.name)+'的全周期记录。按事项搜索人员、岗位、依据或审批结果。</p><div class="grid"><label class="field">操作类型<select id="bg-log-action"><option value="">全部操作</option>'+actions.map(a=>'<option value="'+e(a)+'">'+e(a)+'</option>').join('')+'</select></label><label class="field">搜索记录<input type="search" id="bg-log-find" placeholder="输入人员、审批节点或关键字"></label></div><p class="muted" id="bg-log-count" role="status"></p>'+tbl(['处理时间','业务月','办理人 / 身份','操作或审批节点','对象与变动说明'],all.map(l=>'<tr data-bg-log="'+e(l.action||'')+'">'+[l.time,l.month,l.actor,l.action,l.note].map(s=>'<td>'+e(s??'—')+'</td>').join('')+'</tr>').join(''))+'</section>';
  }
  function bind(c,k) {
    if(k==='log'&&el('log-action')){
      const q=el('log-find'),s=el('log-action'),root=s.closest('section');
      const filter=()=>{const rows=Array.from(root.querySelectorAll('[data-bg-log]')),term=q.value.trim().toLocaleLowerCase();let count=0;for(const r of rows){r.hidden=!!((s.value&&s.value!==r.dataset.bgLog)||(term&&!r.textContent.toLocaleLowerCase().includes(term)));if(!r.hidden)count++}el('log-count').textContent=count?'共 '+count+' 条记录':'没有匹配记录。'};
      q.oninput=filter;s.onchange=filter;filter();return;
    }
    const f=el('grant');if(k!=='grant'||!f)return;
    function read(){
      const z=c.center,get=id=>el(id).value.trim(),fixed=get('fixed'),other=get('other'),inputs=Array.from(f.querySelectorAll('[data-bg-cap]'));
      return {year:editingYear(z),standard:get('standard'),evidence:get('evidence'),costFixed:fixed===''?NaN:Number(fixed),costOther:other===''?NaN:Number(other),lines:inputs.map((i,j)=>({biz:z.lines[j].biz,cap:i.value===''?NaN:Number(i.value)}))};
    }
    function validate(v,z){
      if(c.actor!=='总部 HRBP')throw Error('仅总部 HRBP 可核定额度。');
      if(versions(z).some(r=>+r.year===v.year)||v.year!==editingYear(z))throw Error('该年度已核定，请重新打开最新记录。');
      if(z.reviewLocked&&v.year===+z.year)throw Error('复盘期间不能变更本期额度。');
      if(!v.standard||!v.evidence)throw Error('请补齐配置标准和核定依据。');
      if(v.lines.length!==z.lines.length||v.lines.some((l,i)=>l.biz!==z.lines[i].biz||!Number.isSafeInteger(l.cap)||l.cap<0||l.cap>1e6))throw Error('请逐业务线填写非负整数人数。');
      if(![v.costFixed,v.costOther].every(x=>Number.isFinite(x)&&x>=0&&Number.isSafeInteger(Math.round(x*100))&&Math.abs(x*100-Math.round(x*100))<0.001))throw Error('请填写有效的固定及其他类金额，最多两位小数。');
      if(!Number.isSafeInteger(Math.round(v.costFixed*100)+Math.round(v.costOther*100)))throw Error('成本包金额超出可记录范围。');
      if(v.year===+z.year&&(v.lines.some((l,i)=>l.cap<n(z.lines[i].used)+n(z.lines[i].reserved))||v.costFixed+v.costOther<total(z.lines,'usedCost')+total(z.lines,'reservedCost')))throw Error('本期核定不得低于已占用与已预占的用工额度。');
    }
    let checked='';
    function preview(){
      const v=read(),sum=total(v.lines,'cap'),cash=v.costFixed+v.costOther;
      el('preview').textContent='测算：业务线子额度合计 '+sum+' 人；刚性成本包 '+(Number.isFinite(cash)?c.money(cash):'待填写')+'。尚未下达额度。';
      el('confirm').hidden=true;checked='';
    }
    f.oninput=preview;preview();el('check').onclick=()=>{try{const v=read();validate(v,c.center);checked=JSON.stringify(v);el('final').textContent='核定 '+v.year+' 年：总上限 '+total(v.lines,'cap')+' 人，成本包 '+c.money(v.costFixed+v.costOther)+'。依据：'+v.evidence+'。';el('confirm').hidden=false;}catch(e){el('preview').textContent=e.message;}};
    f.onsubmit=ev=>{ev.preventDefault();const v=read(),cap=total(v.lines,'cap'),costCap=Math.round((v.costFixed+v.costOther)*100)/100;if(!checked||checked!==JSON.stringify(v)){el('preview').textContent='请先查看本次核定摘要。';return;}
      c.write('年度额度核定',v.year+'年；编制上限 '+cap+' 人；刚性成本包 '+c.money(costCap)+'；依据：'+v.evidence,z=>{
        validate(v,z);const record={...v,cap,costCap,version:'V1',actor:c.actor,time:new Date().toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})};
        if(v.year===+z.year){Object.assign(z,{authorized:true,cap,costCap,costFixed:v.costFixed,costOther:v.costOther,standard:v.standard});z.lines.forEach((l,i)=>{l.cap=v.lines[i].cap;});}
        (z.grantVersions||(z.grantVersions=[])).push(record);
      });
    };
  }
  window.BGrant={render:(c,k)=>k==='log'?log(c):ledger(c)+form(c)+historyView(c),bind};
})();
