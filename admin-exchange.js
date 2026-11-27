/* New metric definitions only. Actual business data is never accepted in this workbook. */
(() => {
  'use strict';
  const sheetName = '指标配置',
    all = '通用';
  const columns = [
    '指标名称',
    '指标分类',
    '业务线',
    '适用层级',
    '适用岗位',
    '指标定义',
    '业务值来源',
    '计分算法',
    '目标值',
    '分档口径',
    '最低分',
    '最高分',
    '基准分',
    '评分标准',
    '触发条件',
    '调整值',
    '调整单位',
  ];
  const categories = ['基础绩效', '保护机制', '扣罚项', '行为评价'];
  const key = (m) => JSON.stringify([m.name.trim(), m.biz, m.scope, [...m.jobs].sort()]);
  const values = (arr, k) => [...new Set(arr.map((p) => p[k]).filter(Boolean))];
  const dictionary = (c) => ({
    biz: [all, ...values(c.people, 'biz')],
    scope: [all, ...values(c.people, 'scope')],
    jobs: values(c.people, 'job'),
  });
  const open = (c) => c.role === '后台HRBP' && c.isOpen('config');
  function style(sheet) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const row = sheet.getRow(1);
    row.height = 24;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2356A8' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });
    sheet.columns.forEach((col, i) => {
      col.width = [0, 4, 5, 6, 9, 13, 14].includes(i) ? 27 : 15;
    });
  }
  async function template(c) {
    const wb = new ExcelJS.Workbook(),
      s = wb.addWorksheet(sheetName);
    s.addRow(columns);
    style(s);
    const guide = wb.addWorksheet('填写说明');
    guide.addRows([
      ['字段', '填写方式'],
      ['导入范围', '只新增指标配置，不修改已有指标、业务值或已下发方案。'],
      ['业务线、适用层级', '留空表示通用，可选值见「选项」页。'],
      ['适用岗位', '留空表示全部岗位；多个岗位使用中文顿号分隔，岗位见「选项」页。'],
      ['基础绩效', '填写业务值来源及算法。达成率需正目标值；其他算法需分档口径。'],
      ['分档口径', '各档填写 下限:上限:绩效值，以分号分隔，例如 0:80:0.8;80:*:1.1。'],
      ['行为评价', '必填最低分、最高分及评分标准；基准分选填。比例在岗位方案中启用后填写。'],
      ['保护机制', '填写触发条件和非负保护系数；单位为系数。'],
      ['扣罚项', '填写触发条件、非负扣罚值；单位选择系数或元。'],
      ['实际业务值', '由大数据提供；更正须走 VHOME，不纳入此模板。'],
    ]);
    style(guide);
    guide.getColumn(2).width = 86;
    const d = dictionary(c),
      choices = wb.addWorksheet('选项');
    choices.addRow(['指标分类', '业务线', '层级', '岗位', '基础绩效算法', '扣罚单位']);
    const lists = [
      categories,
      d.biz,
      d.scope,
      d.jobs,
      ['达成率', '区间取值', '全量阶梯', '分段累进'],
      ['系数', '元'],
    ];
    for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++)
      choices.addRow(lists.map((l) => l[i] || ''));
    style(choices);
    const bytes = await wb.xlsx.writeBuffer(),
      url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = '绩效指标配置模板.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function read(sheet, c) {
    if (!sheet) throw Error('未找到「指标配置」工作表，请重新下载模板。');
    if (sheet.actualRowCount > 1001 || sheet.rowCount > 1001) throw Error('单次最多导入 1000 行指标。');
    const header = sheet.getRow(1);
    if (
      header.cellCount !== columns.length ||
      !columns.every((s, i) => header.getCell(i + 1).text.trim() === s)
    )
      throw Error('表头与模板不一致。仅接收指标定义；实际业务值更正请走 VHOME。');
    const d = dictionary(c),
      seen = new Set(c.db.metrics.map(key)),
      out = [];
    sheet.eachRow((row, line) => {
      if (line === 1) return;
      const cells = columns.map((_, i) => row.getCell(i + 1));
      if (cells.every((x) => !x.text.trim()) && row.actualCellCount === 0) return;
      const [
        name,
        category,
        biz,
        scope,
        jobs,
        definition,
        source,
        algorithm,
        target,
        bands,
        min,
        max,
        base,
        criteria,
        condition,
        adjustValue,
        unit,
      ] = cells.map((x) => x.text.trim());
      const m = {
        name,
        category,
        biz: biz || all,
        scope: scope || all,
        jobs: [
          ...new Set(
            jobs
              .split(/[,，、;；\n]/)
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ],
        definition,
        source,
        algorithm,
        target,
        bands,
        condition,
        adjustValue,
        unit: unit || (category === '保护机制' ? '系数' : ''),
        version: 1,
      };
      if (category === '行为评价') {
        m.algorithm = '人工评分';
        m.manualScore = { min, max, base: base || null, criteria };
      }
      if (category === '保护机制') m.algorithm = '保底';
      if (category === '扣罚项') m.algorithm = '扣罚';
      let err = '';
      if (row.cellCount > columns.length) err = '存在模板之外的列。';
      else if (cells.some((x) => x.value && typeof x.value === 'object'))
        err = '请使用文本或数值，不支持公式、链接或日期。';
      else if (!categories.includes(category)) err = '请选择四种指标分类之一。';
      else if (
        !d.biz.includes(m.biz) ||
        !d.scope.includes(m.scope) ||
        m.jobs.some((j) => !d.jobs.includes(j))
      )
        err = '业务线、层级或岗位不在可选范围内。';
      else if (category === '保护机制' && unit && unit !== '系数') err = '保护机制单位应为系数。';
      else err = window.PerfPlans.checkMetric(m);
      if (!err && seen.has(key(m))) err = '相同名称、业务线、层级和岗位的指标已存在或在文件内重复。';
      seen.add(key(m));
      out.push({ line, m, err });
    });
    if (!out.length) throw Error('没有可导入的指标，请填写「指标配置」工作表。');
    return out;
  }
  function preview(c, items) {
    const bad = items.filter((x) => x.err).length;
    const h = c.esc;
    c.modal(
      '指标导入预览',
      `<p class="pa-note">共 ${items.length} 条，${bad} 条需修改。${bad ? '请修正文件后重新导入。' : '确认后新增到指标库。'}</p><div class="pa-scroll"><table class="pa-table"><thead><tr><th>行号</th><th>指标名称</th><th>分类</th><th>校验结果</th></tr></thead><tbody>${items.map((x) => `<tr><td>${x.line}</td><td>${h(x.m.name)}</td><td>${h(x.m.category)}</td><td>${h(x.err || '可新增')}</td></tr>`).join('')}</tbody></table></div><footer class="pa-actions"><button data-pa-cancel>取消</button><button class="pa-primary" data-pa-commit ${bad ? 'disabled' : ''}>确认导入 ${items.length} 条</button></footer>`,
      (panel) => {
        panel.querySelector('[data-pa-cancel]').onclick = () => c.close();
        panel.querySelector('[data-pa-commit]').onclick = () => {
          if (bad || !open(c)) return c.toast('当前角色或考核时间不允许配置。');
          const when = new Date().toLocaleString('zh-CN', { hour12: false });
          for (const { m } of items) {
            const item = window.PerfPlans.normalize(m);
            c.db.metrics.push(item);
            c.db.metricHistory?.unshift({
              id: item.id,
              name: item.name,
              version: item.version,
              action: '批量新增',
              time: when,
              role: c.role,
            });
          }
          c.save();
          c.close();
          c.refresh();
          c.toast('已新增 ' + items.length + ' 项指标');
        };
      },
    );
  }
  window.PerfExchangeAdmin = {
    buttons(c) {
      return c.role !== '后台HRBP'
        ? ''
        : `<button type="button" data-pa-template>下载模板</button><button type="button" data-pa-import ${open(c) ? '' : 'disabled'}>批量导入</button><input type="file" hidden accept=".xlsx" data-pa-workbook>`;
    },
    bind(c) {
      c.on('[data-pa-template]', 'click', async () => {
        try {
          await template(c);
        } catch {
          c.toast('模板未能生成，请刷新后重试。');
        }
      });
      c.on('[data-pa-import]', 'click', () => {
        if (open(c)) c.root.querySelector('[data-pa-workbook]')?.click();
      });
      c.on('[data-pa-workbook]', 'change', async (_, input) => {
        const file = input.files?.[0];
        input.value = '';
        if (!file || !open(c)) return;
        try {
          if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024)
            throw Error('请选择不超过 8 MB 的 XLSX 指标模板。');
          const wb = new ExcelJS.Workbook();
          try {
            await wb.xlsx.load(await file.arrayBuffer());
          } catch {
            throw Error('无法读取工作簿，请使用下载的 XLSX 模板。');
          }
          if (!input.isConnected) return;
          preview(c, read(wb.getWorksheet(sheetName), c));
        } catch (err) {
          c.toast(err.message);
        }
      });
    },
  };
})();
