/* Demo organizations and the one-time upgrade of the original store ledger. */
(() => {
  "use strict";
  const lines = ["销售", "交付", "售后", "新媒体", "市场"];
  const levels = ["后台", "区域", "一线"];
  const roles = {后台: "总部一级负责人", 区域: "区域总", 一线: "1+N店长"};
  const accounts = { "总部 HRBP": "HQ-HRBP" };
  const budgetAccount = { id:accounts["总部 HRBP"], organization:"运营管理中心", handlesOperations:true };
  const total = (rows, field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const money = n => "¥" + Number(n || 0).toLocaleString("zh-CN");
  const round = x => Math.round(x * 100) / 100;
  function storeSeeds(){return [['东湖','华东大区'],['临江','华南大区'],['江北','华中大区'],['西岸','华东大区']].map(([name,region],idx)=>{const id='pc-'+(idx+1),active=idx!==3;
 const ls=lines.map((biz,j)=>{const cap=active?[12,8,10,4,3][j]+idx:0,used=active?cap-[2,1,2,1,1][j]:0,reserved=0;return {biz,cap,used,reserved,out:active&&j<3?1:0,usedCost:used*(5100+400*j)*11,reservedCost:reserved*6500}}),cap=total(ls,'cap'),costFixed=active?cap*69000:0,costOther=active?cap*9000:0;
 const history=[];if(active)for(let m=1;m<=11;m++)ls.forEach((l,j)=>{const filled=Math.max(1,l.used-(m<5?1:0)),avgPeople=filled,threshold=[11,18,65,30,45][j],eff=idx===0&&j===2&&m>=10?threshold-6:threshold+2+idx*2+j%3+(m%2);history.push({month:'2026-'+String(m).padStart(2,'0'),biz:l.biz,output:Math.round(eff*avgPeople),avgPeople,threshold,quota:l.cap,filled,cost:Math.round(l.usedCost/11),accrualBudget:l.cap*6500})});
 return {id,name:name+' 1+N 利润中心',region,year:2026,authorized:active,reviewLocked:false,standard:active?'2026 门店编制配置标准（演示版）':'',cap,costFixed,costOther,costCap:costFixed+costOther,lines:ls,outLimit:.25,requests:[],tasks:[],reviews:[],history,logs:active?[{time:'2026-01-05 09:00',actor:'总部 HRBP · HQ-HRBP',action:'年初核定',note:'按年度门店配置标准下达编制 '+cap+' 人、刚性成本包 '+money(costFixed+costOther)+'；示例初始记录。',month:'2026-01'}]:[]}})}
  const jobNames = {
    后台: ["销售运营专员", "交付运营专员", "售后运营专员", "新媒体运营专员", "市场运营专员"],
    区域: ["区域销售经理", "区域交付经理", "区域售后经理", "区域新媒体经理", "区域市场经理"],
    一线: ["产品专家", "交付体验专家", "服务顾问", "门店主播", "市场专员"]
  };
  const jobId = (level, biz) => "J-" + levels.indexOf(level) + "-" + lines.indexOf(biz);
  function makeCatalog() {
    const templates = levels.flatMap((level, i) => lines.map((biz, j) => ({
      id:jobId(level,biz), name:jobNames[level][j], biz, levels:[level],
      unitBudget: [92000, 85000, 70000][i] + j*1000, active:true
    })));
    return templates.concat([
      {id:"J-paint",name:"钣喷技师",biz:"售后",levels:["一线"],unitBudget:72000,active:true},
      {id:"J-sales",name:"销售顾问",biz:"销售",levels:["一线"],unitBudget:68000,active:true}
    ]);
  }
  function addPositions(center, level) {
    Object.assign(center, {level, owner:roles[level], staffRequests:[]});
    const allocated = total(center.lines,"usedCost") + total(center.lines,"reservedCost");
    const free = Math.max(0, center.costCap - allocated);
    center.jobs = center.lines.filter(l=>l.cap || l.used || l.reserved).map(l => {
      const held = l.used + l.reserved;
      const extra = Math.min(1, Math.max(0,l.cap-held));
      // The remainder can be assigned to another position by headquarters HRBP.
      const share = center.cap ? Math.floor(free*l.cap/center.cap*0.82) : 0;
      return {jobId:jobId(level,l.biz),cap:held+extra,
        budget:round(l.usedCost+l.reservedCost+share),used:l.used,reserved:l.reserved,
        usedCost:l.usedCost,reservedCost:l.reservedCost};
    });
    return center;
  }
  function makeOrg(id,name,region,level,businesses,offset) {
    const orgLines=businesses.map((biz,i)=>{
      const used=level==="后台"?3+offset%3:2+(i+offset)%3, cap=used+3;
      return {biz,cap,used,reserved:0,out:0,usedCost:used*(level==="后台"?77000:72000),reservedCost:0};
    });
    const cap=total(orgLines,"cap"), costFixed=cap*90000,costOther=cap*11000;
    const history = [];
    for(let m=1;m<=11;m++) for(const l of orgLines){
      const filled=Math.max(1,l.used-(m<=3?1:0));
      history.push({month:"2026-"+String(m).padStart(2,"0"),biz:l.biz,quota:l.cap,filled,avgPeople:filled,
        output:(31+offset+m%3)*filled,threshold:29,cost:Math.round(l.usedCost/11),
        accrualBudget:Math.round((costFixed+costOther)*l.cap/cap/12)});
    }
    return addPositions({id,name,region,year:2026,authorized:true,reviewLocked:false,
      standard:"2026 年度示例授权",cap,costFixed,costOther,costCap:costFixed+costOther,
      lines:orgLines,outLimit:.25,requests:[],tasks:[],reviews:[],history,
      logs:[{time:"2026-01-05 09:00",month:"2026-01",actor:"总部 HRBP · HQ-HRBP",action:"期初授权",note:name+" · 接收负责人："+roles[level]}]},level);
  }
  function initialize(previous) {
    const stores=(previous?previous.centers:storeSeeds()).map(c=>addPositions(c,"一线"));
    const departments=lines.map((biz,i)=>makeOrg("dept-"+i,biz+"部","总部","后台",[biz],i));
    const regions=["华东大区","华南大区","华中大区"].map((name,i)=>makeOrg("region-"+i,name+"中台",name,"区域",lines,i));
    const catalog=makeCatalog();
    if(previous){
      // Earlier releases held most opening balances by business line, without position IDs.
      // Keep the original balances visible instead of attributing them to a named position.
      for(const c of stores) {
        const carried=[];
        for(const slot of c.jobs){
          if(!slot.used&&!slot.reserved&&!slot.usedCost&&!slot.reservedCost)continue;
          const template=catalog.find(j=>j.id===slot.jobId);
          const id="opening-"+template.biz;
          if(!catalog.some(j=>j.id===id))catalog.push({
            id,name:template.biz+" · 历史占用待分岗",biz:template.biz,levels:["一线"],unitBudget:0,active:false,openingBalance:true
          });
          const people=slot.used+slot.reserved,amount=round(slot.usedCost+slot.reservedCost);
          carried.push({...slot,jobId:id,cap:people,budget:amount});
          slot.cap-=people;slot.budget=round(slot.budget-amount);
          slot.used=0;slot.reserved=0;slot.usedCost=0;slot.reservedCost=0;
        }
        c.jobs.push(...carried);
      }
    }
    return {schema:2,staffFlowVersion:2,catalog,centers:[...departments,...regions,...stores]};
  }
  window.BModel = {lines, levels, roles, accounts, budgetAccount, total, money, initialize};
})();
