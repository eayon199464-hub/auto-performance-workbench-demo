// Public demonstration fixtures for frontline job templates.
(() => {
  const jobs = [
  [
    "销售",
    "全功能总经理"
  ],
  [
    "销售",
    "空间店长&展厅店长"
  ],
  [
    "销售",
    "全功能销售总监"
  ],
  [
    "销售",
    "销售主管"
  ],
  [
    "销售",
    "产品专家"
  ],
  [
    "交付",
    "全功能交付总监"
  ],
  [
    "交付",
    "集中交付中心A岗交付总监"
  ],
  [
    "交付",
    "集中交付中心B岗交付总监"
  ],
  [
    "交付",
    "车辆整备专家"
  ],
  [
    "交付",
    "交付服务专家"
  ],
  [
    "交付",
    "交付预约专家"
  ],
  [
    "交付",
    "交付体验专家"
  ],
  [
    "市场",
    "获客运营经理"
  ],
  [
    "市场",
    "门店主播"
  ],
  [
    "市场",
    "内容编导"
  ],
  [
    "市场",
    "直播运营"
  ],
  [
    "市场",
    "IDCC专员"
  ],
  [
    "市场",
    "用户运营专家"
  ]
];
  const quantity = {销售:'有效成交台数',交付:'交付完成量',市场:'有效线索数'};
  window.PFFrontline = jobs.map(([biz, job]) => {
    const scope = '一线（1+N）';
    const common = {business:biz, job, scope};
    const monthly = {...common, name:quantity[biz], type:'固定指标', definition:'当月归属本人的有效记录数（演示）',
      source:'示例月度台账', sourceBindings:[{kind:'业务系统取值',input:'实际值',ref:'示例业务记录',field:'记录编号'}],
      rule:{kind:'distinct',a:'记录编号'}, formula:'按有效记录编号去重计数', algorithm:'达成率', target:20, weight:70, bands:''};
    const quality = {...common, name:'服务质量评价', type:'行为评价', definition:'按服务记录评价沟通质量（演示）',
      algorithm:'人工评分', source:'人工评分', weight:30, target:'',bands:'',
      manualScore:{min:0,max:100,base:80,criteria:'结合当月服务记录评分。主动跟进可加分，遗漏反馈可扣分。'}};
    const option = {...monthly,name:'按时完成量',type:'推荐指标',definition:'本期按时完成的记录数（演示）',
      formula:'按已按时完成的有效记录编号去重计数',weight:30};
    return {biz,job,scope,mode:'weighted',metrics:[monthly,quality],options:[option]};
  });
})();
