/* One calculation path for configuring, trialling, publishing and settling a metric.
 * The imported formula text is business documentation, never program input. */
(()=>{'use strict';
const modes={'ratio':'两字段求比率（%）','sum':'明细数值求和','distinct':'明细编号去重计数','manual':'人工核定实际值','behavior':'关键行为评分'};
const finite=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=Number.MAX_SAFE_INTEGER;
function need(v,message){if(!v)throw Error(message)}
function value(v,title){need(finite(v),title+'须为有效数字');return Number(v)}
const num=v=>Number(Number(v).toFixed(8));
function bands(m){let end=null;const out=String(m.bands||'').split(/[;；]/).map(row=>{const b=row.split(/[:：]/).map(v=>v.trim());need(b.length===3&&b.every(Boolean),'分档应填写下限、上限和绩效值');const lo=value(b[0],'下限'),hi=b[1]==='*'?Infinity:value(b[1],'上限'),rate=value(b[2],'绩效值');need(hi>lo&&(end===null||lo===end),'分档必须连续、不重叠，区间左闭右开');end=hi;return [lo,hi,rate]});if(m.algorithm==='分段累进')need(out[0][0]===0,'分段累进须从 0 起算');return out}
function config(m){need(m&&m.name&&m.source&&m.definition,'指标名称、定义和来源不能为空');const r=m.rule||{};need(Object.hasOwn(modes,r.kind),'尚未配置实际值的取值规则');need(String(r.a||'').trim(),'未绑定原始字段名称');if(r.kind==='ratio'){need(String(r.b||'').trim()&&r.a.trim()!==r.b.trim(),'分子和分母须绑定不同字段')}need(['达成率','区间取值','全量阶梯','分段累进','人工评分'].includes(m.algorithm),'尚未选择计分算法');if(m.algorithm==='达成率')need(value(m.target,'目标值')>0,'达成率目标必须大于 0');if(['区间取值','全量阶梯','分段累进'].includes(m.algorithm))bands(m);const w=value(m.weight,'权重');need(w>=0&&w<=100,'指标权重须在 0 至 100% 范围内');if(m.type==='行为评价'||r.kind==='behavior'){need(m.type==='行为评价'&&r.kind==='behavior'&&m.algorithm==='人工评分','行为评价须绑定关键行为评分，并选择人工评分算法');const base=value(r.base,'基准分'),lo=value(r.min,'最低调整'),hi=value(r.max,'最高调整');need(lo<=0&&hi>=0&&base+lo>=0&&base+hi<=100,'行为基准与加减范围必须使得分落在 0 至 100 分内')}}
function describe(m){const r=m.rule||{};return ({ratio:`${r.a} ÷ ${r.b} × 100`,sum:`求和（${r.a}）`,distinct:`去重计数（${r.a}）`,manual:`人工核定：${r.a}`,behavior:`${r.base} 分 + ${r.a}（调整范围 ${r.min} 至 ${r.max}）`})[r.kind]||'取值规则待配置'}
function score(m,v){const a=m.algorithm;if(a==='人工评分'){need(v>=0&&v<=100,'人工核定分须在 0 至 100 分内');return v}if(a==='达成率')return v/Number(m.target)*100;const bs=bands(m),hit=bs.find(([l,h])=>v>=l&&v<h);need(hit,'实际值未命中任何分档');if(a==='区间取值')return hit[2];if(a==='全量阶梯')return v*hit[2];return bs.reduce((t,[l,h,rate])=>t+Math.max(0,Math.min(v,h)-l)*rate,0)}
function calculate(m,input){config(m);const r=m.rule,i=input||{};let actual;if(r.kind==='ratio'){const a=value(i.a,r.a),b=value(i.b,r.b);need(b!==0,'分母为 0，无法计算');actual=a/b*100}else if(r.kind==='sum'||r.kind==='distinct'){need(i.empty===true||String(i.a??'').trim(),'缺少明细；无业务记录请明确勾选');if(i.empty){need(!String(i.a??'').trim(),'已勾选无记录，不能同时填写明细');actual=0}else{const items=String(i.a).split(/[,，;；\n]/).map(v=>v.trim());need(items.length<=1000&&items.every(Boolean),'明细不能有空行、空项，且不能超过 1000 项');actual=r.kind==='sum'?items.reduce((t,v)=>t+value(v,r.a),0):new Set(items).size}}else if(r.kind==='behavior'){const d=value(i.a,r.a);need(d>=Number(r.min)&&d<=Number(r.max),'行为调整超出本岗位配置的范围');actual=Number(r.base)+d}else{actual=value(i.a,r.a);need(String(i.evidence||'').trim(),'人工实际值须填写核定依据')}need(finite(actual),'实际值超出可计算范围');const sc=score(m,actual),weighted=sc*Number(m.weight)/100;need(finite(sc)&&finite(weighted),'得分超出可计算范围');return {actual:num(actual),score:num(sc),weighted:num(weighted)}}
function trial(m,input,expected){const result=calculate(m,input),wanted=value(expected,'预期指标分');need(Math.abs(wanted-result.score)<=0.000001,'预期 '+wanted+' 分，实际 '+result.score+' 分；请检查规则或样本');return {...result,expected:wanted,input:{...input},signature:signature(m)}}
function signature(m){const r=m.rule||{};return JSON.stringify([m.name,m.source,m.definition,m.formula||'',m.type,m.algorithm,String(m.target??''),String(m.weight??''),m.bands||'',r.kind,r.a,r.b||'',String(r.base??''),String(r.min??''),String(r.max??''),...(Array.isArray(m.sourceBindings)?[m.sourceBindings.map(b=>['input','kind','ref','field'].map(k=>String(b?.[k]??'').trim()))]:[])])}
function validateMetric(m) {
  const scoring = typeof window !== 'undefined' ? window.PFScoring : require('./scoring.js');
  return scoring.validate(m);
}
function planErrors(p) {
  const metrics = p.metrics || [], errors = [];
  if (metrics.length < 1 || metrics.length > 10) errors.push('岗位须配置 1 至 10 个指标');
  if (new Set(metrics.map(m => m.name)).size !== metrics.length) errors.push('岗位包含重复指标');
  for (const m of metrics) {
    const issue = validateMetric(m);
    if (issue) errors.push((m.name || '未命名指标') + '：' + issue);
  }
  const weight = metrics.reduce((sum,m) => sum + Number(m.weight), 0);
  if (!Number.isFinite(weight) || Math.abs(weight - 100) > 0.000001) errors.push('岗位权重合计须为 100%');
  return errors;
}
function demoRule(m){const x={...m};const behavior=x.type==='行为评价';x.rule=behavior?{kind:'behavior',a:'行为调整分',base:80,min:-20,max:20}:{kind:'distinct',a:'有效业务记录编号'};const input={a:behavior?'0':'DEMO-A,DEMO-A,DEMO-B'};x.tested=trial(x,input,behavior?80:200/Number(x.target));return x}
const bandError=m=>{try{bands(m);return ""}catch(err){return err.message}};
const api={bandError,scoreFromActual:score,modes,config,describe,calculate,trial,validateMetric,planErrors,demoRule,signature};if(typeof window!=='undefined')window.PFCalc=api;if(typeof module!=='undefined')module.exports=api;
})();
