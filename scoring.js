/* Score settings used by the indicator catalog, job plans and evaluation forms. */
(() => {
  'use strict';

  const algorithms = ['达成率', '区间取值', '全量阶梯', '分段累进', '人工评分'];
  const known = value => value != null && String(value).trim() !== '' && !/待确认|待核对/.test(value);
  const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isFinite(Number(value));
  function isManual(metric) {
    return metric?.type === '行为评价' || metric?.algorithm === '人工评分' ||
      (!metric?.algorithm && metric?.rule?.kind === 'behavior');
  }

  // Earlier plans expressed the allowed change relative to a starting score.
  // Read those settings in place so issued plan snapshots keep their original meaning.
  function manual(metric) {
    const configured = metric?.manualScore;
    if (configured) return {
      min: configured.min ?? null, max: configured.max ?? null,
      base: configured.base === '' ? null : configured.base ?? null,
      criteria: String(configured.criteria ?? '').trim()
    };
    const rule = metric?.rule || {};
    const base = rule.kind === 'behavior' && numeric(rule.base) ? Number(rule.base) : null;
    const bound = offset => base !== null && numeric(offset) ? Math.round((base + Number(offset)) * 1e8) / 1e8 : null;
    return {min: bound(rule.min), max: bound(rule.max), base, criteria: String(metric?.definition ?? '').trim()};
  }

  function validateManual(metric) {
    const {min, max, base, criteria} = manual(metric);
    if (!numeric(min) || !numeric(max)) return '请填写最低分和最高分。';
    if (Number(min) < 0 || Number(max) > 100 || Number(min) > Number(max))
      return '评分范围须在 0 至 100 分内，最低分不能高于最高分。';
    if (base != null && (!numeric(base) || Number(base) < Number(min) || Number(base) > Number(max)))
      return '基准分须在最低分和最高分之间。';
    if (!known(criteria)) return '请填写评分标准。';
    return '';
  }

  function summary(metric) {
    if (!isManual(metric)) return '';
    const {min, max, base, criteria} = manual(metric);
    const range = numeric(min) && numeric(max) ? min + ' 至 ' + max + ' 分' : '评分范围待配置';
    return [range, numeric(base) ? '基准 ' + base + ' 分' : '', criteria].filter(Boolean).join(' · ');
  }

  function validate(metric) {
    if (!known(metric?.name) || !known(metric?.definition)) return '请填写指标名称和定义。';
    if (!numeric(metric.weight) || Number(metric.weight) < 0 || Number(metric.weight) > 100)
      return '指标权重须为 0 至 100%。';
    if (isManual(metric)) {
      if (metric.algorithm !== '人工评分') return '行为评价请选择人工评分。';
      return validateManual(metric);
    }
    if (!algorithms.includes(metric.algorithm)) return '请选择计分方式。';
    if (metric.sourceBindings?.length) {
      for (const source of metric.sourceBindings) {
        if (!source || !['人工导入', '业务系统取值', '大数据取值'].includes(source.kind)
          || ![source.input, source.ref, source.field].every(known)) return '请补齐取值来源和对应字段。';
      }
    } else if (!known(metric.source)) return '请配置取值来源。';
    if (!known(metric.formula) && !metric.rule?.kind) return '请填写计算口径。';
    if (metric.algorithm === '达成率') {
      return numeric(metric.target) && Number(metric.target) > 0 ? '' : '达成率目标须大于 0。';
    }
    const calc = typeof window !== 'undefined' ? window.PFCalc : require('./calc.js');
    return calc.bandError(metric);
  }

  const api = {isManual, manual, validateManual, summary, validate};
  if (typeof window !== 'undefined') window.PFScoring = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
