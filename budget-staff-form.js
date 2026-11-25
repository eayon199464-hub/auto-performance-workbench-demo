(() => {
  'use strict';
  function render(ctx,jobs) {
    const options=jobs.map(({row,info})=>`<option value="${ctx.esc(row.jobId)}">${ctx.esc(info.biz)} · ${ctx.esc(info.name)}（可用 ${Math.max(0,(row.cap||0)-(row.used||0)-(row.reserved||0))} 人）</option>`).join('');
    const row=`<div class="bs-row" data-bs-row>
      <div class="bs-row-top"><strong data-bs-number>候选人 1</strong>
      <button type="button" data-bs-remove disabled>移除</button></div>
      <div class="bs-fields">
        <label>姓名<input name="name" type="text" placeholder="手填姓名" required></label>
        <label>身份证号<input name="document" type="text" autocapitalize="characters" spellcheck="false" placeholder="18 位，可含 X" required></label>
        <label>申请岗位<select name="jobId" required><option value="">选择岗位</option>${options}</select></label>
        <label>年度预算（元）<input name="cost" type="text" inputmode="decimal" placeholder="手填金额" required></label></div>
      <div class="bs-err" data-bs-errors hidden></div></div>`;
    return `<form id="bs-form" class="bs-form" autocomplete="off" novalidate><p class="bs-hint">可在一张申请单内添加多人，每人可选不同岗位。演示请勿录入真实身份证号。证件仅在本机校验，HR 回执为模拟。</p>
      <details class="bs-example"><summary>查看试用资料</summary>虚构证件示例：<code>990000199001010017</code>、<code>990000199202020027</code>。可复制后手动填写。</details>
      <fieldset>
      <div data-bs-list>${row}</div>
      <template data-bs-template>${row}</template>
      <div class="bs-add-controls"><label>新增行数 <select id="bs-add-count">${[1,2,3,5,10].map(n=>`<option value="${n}">${n} 行</option>`).join('')}</select></label>
        <button type="button" id="bs-add">＋ 添加候选人</button></div>
      <div class="bs-footer"><span data-bs-total></span>
      <div class="bs-actions">

      <button class="primary" type="submit" id="bs-send">提交申请</button></div></div></fieldset><p role="status" aria-live="polite" data-bs-status></p></form>`;
  }
  function bind(ctx,actions){
    const f=document.getElementById('bs-form'); if(!f||f.dataset.bsBound)return; f.dataset.bsBound='1';
    const q=s=>f.querySelector(s), rows=()=>Array.from(f.querySelectorAll('[data-bs-row]')), status=q('[data-bs-status]'); let pending=false;
    const raw=()=>rows().map(r=>Object.fromEntries(Array.from(r.querySelectorAll('[name]'),el=>[el.name,el.value])));
    function update() {
      const list = rows();
      let cents = 0;
      list.forEach((r,i) => {
        r.querySelector('[data-bs-number]').textContent = '候选人 ' + (i+1);
        r.querySelector('[data-bs-remove]').disabled = list.length === 1;
        const n = actions.parseAmount(r.querySelector('[name=cost]').value);
        if (Number.isFinite(n)) {
          cents += Math.round(n*100);
        }
      });
      const total = (cents/100).toLocaleString('zh-CN', {maximumFractionDigits:2});
      q('[data-bs-total]').textContent = `本单 ${list.length} 人 · 年度预算合计 ${total} 元`;
    }
    function clearError(row) {
      const e = row.querySelector('[data-bs-errors]');
      e.hidden = true;
      e.textContent = '';
      row.classList.remove('bs-invalid');
    }
    function edited(e) {
      const row = e.target.closest('[data-bs-row]');
      if (row) clearError(row);
      status.textContent = '';
      update();
    }
    f.addEventListener('input', edited);
    f.addEventListener('change', edited);
    f.addEventListener('click', e => {
      if (pending) return;
      if (e.target.closest('#bs-add')) {
        const first = rows().length;
        const count = Number(q('#bs-add-count').value);
        if (![1,2,3,5,10].includes(count)) return;
        for (let i=0; i<count; i++) q('[data-bs-list]').append(q('[data-bs-template]').content.cloneNode(true));
        status.textContent = '';
        update();
        rows()[first].querySelector('input').focus();
      } else if (e.target.closest('[data-bs-remove]') && rows().length > 1) {
        const index = rows().indexOf(e.target.closest('[data-bs-row]'));
        rows()[index].remove();
        status.textContent = '';
        update();
        rows()[Math.min(index, rows().length-1)].querySelector('input').focus();

      }
    });
    f.addEventListener('submit', e => { e.preventDefault(); run(); });
    async function run() {
      if (pending) return;
      pending = true;
      const items = raw();
      q('fieldset').disabled = true;
      rows().forEach(clearError);
      status.textContent = '正在提交并获取模拟 HR 校验结果…';
      try {
        const result = await actions.submit(items);
        if (!f.isConnected) return;
        let invalid = 0;
        rows().forEach((r,i) => {
          const errors = result.rows?.[i]?.errors || [];
          if (!errors.length) return;
          invalid++;
          r.classList.add('bs-invalid');
          const e = r.querySelector('[data-bs-errors]');
          e.textContent = errors.join('；');
          e.hidden = false;
        });
        if (result.ok) status.textContent = '申请已提交。请在人员调整记录中查看每人的 HR 校验结果。';
        else status.textContent = result.message || `本单未提交，请检查${invalid?'标出的 '+invalid+' 行':'填写内容'}。`;
      } catch (err) {
        status.textContent = err?.message || '操作未完成，请重试。';
      } finally {
        pending = false;
        if (f.isConnected) q('fieldset').disabled = false;
      }
    }
    update();
  }
  window.BStaffForm = {render, bind};
})();
