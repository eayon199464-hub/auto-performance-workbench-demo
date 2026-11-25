/* Offline Excel import for organizational position budgets. */
(() => {
  "use strict";
  const H = BImportModel.headers,
    sheetName = "岗位预算";
  const node = (id) => document.getElementById("bo-import-" + id);
  const allowed = (ctx) =>
    ctx.actor === "总部 HRBP";
  function render(ctx) {
    if (!allowed(ctx)) return "";
    return '<section class="panel bi-card"><div class="bi-head"><div><h3>导入岗位预算</h3><p class="muted">按年度、组织、业务线和岗位，批量新增或更新编制与年度预算。</p></div><button type="button" id="bo-import-open" aria-expanded="false" aria-controls="bo-import-work">批量导入</button></div><div id="bo-import-work" hidden><div class="bi-actions"><button type="button" id="bo-import-template">下载 Excel 模板</button><label class="field">选择填好的 Excel 文件<input type="file" id="bo-import-file" accept=".xlsx"></label></div><p class="muted">请将台账粘贴至「岗位预算」工作表；组织编码、岗位目录见模板。文件未包含的岗位保持原值。单个文件不超过 5 MB、5,000 行数据。</p><p role="status" id="bo-import-status"></p><div id="bo-import-preview"></div><div class="bi-actions"><button type="button" id="bo-import-confirm" class="primary" disabled>确认导入</button><button type="button" id="bo-import-cancel">取消</button></div></div></section>';
  }
  function addSheet(book, name, head, lines, widths) {
    const s = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    s.addRow(head);
    for (const r of lines) s.addRow(r);
    widths.forEach((w, i) => (s.getColumn(i + 1).width = w));
    const h = s.getRow(1);
    h.height = 27;
    h.eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF195E51" },
      };
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.alignment = { vertical: "middle" };
    });
    return s;
  }
  async function template(ctx, current) {
    if (!current()) return;
    const w = new ExcelJS.Workbook();
    const d = addSheet(w, sheetName, H, [], [12, 22, 16, 30, 16, 24, 26]);
    d.getColumn(2).numFmt = "@";
    [6, 7].forEach((i) => (d.getColumn(i).numFmt = "#,##0.00"));
    const scope = ctx.centers.filter((c) => c.authorized);
    addSheet(
      w,
      "组织编码",
      ["年度", "组织编码", "组织名称", "组织层级", "可配置业务线"],
      scope.map((c) => [
        c.year,
        c.id,
        c.name,
        c.level,
        c.lines.map((l) => l.biz).join("、"),
      ]),
      [12, 18, 30, 16, 48],
    );
    addSheet(
      w,
      "岗位目录",
      ["业务线", "岗位名称", "适用层级", "每人年度参考预算", "岗位状态"],
      ctx.catalog
        .filter(
          (j) =>
            !j.openingBalance &&
            scope.some(
              (c) =>
                j.levels.includes(c.level) &&
                c.lines.some((l) => l.biz === j.biz),
            ),
        )
        .map((j) => [
          j.biz,
          j.name,
          j.levels.join("、"),
          j.unitBudget,
          j.active ? "启用" : "停用",
        ]),
      [18, 32, 22, 26, 16],
    );
    addSheet(
      w,
      "填写说明",
      ["字段 / 操作", "填写要求"],
      [
        [
          "导入范围",
          "仅「岗位预算」工作表参与导入，每行一个年度、组织、业务线、岗位组合。",
        ],
        [
          "年度、组织编码、业务线",
          "按「组织编码」页填写当前授权年度及业务线。",
        ],
        [
          "岗位名称",
          "填写已有岗位名称，或填写新岗位名称并提供每人年度参考预算。",
        ],
        ["岗位编制", "填写调整后的岗位总编制，非负整数；不填写增减差额。"],
        ["岗位年度预算", "填写调整后岗位全年总预算，单位元，最多两位小数。"],
        [
          "每人年度参考预算",
          "首次新增标准岗位时必填。已有岗位的参考标准请在岗位库维护。",
        ],
        [
          "更新范围",
          "未列入的岗位保持不变。请粘贴值，勿粘贴公式；校验通过后须点击确认导入。",
        ],
      ],
      [27, 96],
    );
    const blob = new Blob([await w.xlsx.writeBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    if (!current()) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "岗位预算导入模板.xlsx";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function parse(file) {
    if (!/\.xlsx$/i.test(file.name)) throw Error("请选择 .xlsx 文件。");
    if (file.size > 5 * 1024 * 1024)
      throw Error("文件超过 5 MB，请拆分后导入。");
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch (_) {
      throw Error("无法读取文件，请检查是否为有效且未加密的 .xlsx 文件。");
    }
    const sh = wb.getWorksheet(sheetName);
    if (!sh) throw Error("缺少「岗位预算」工作表，请使用模板。");
    if (sh.rowCount > 5001)
      throw Error("单次最多导入 5,000 行，请拆分后导入。");
    const header = sh.getRow(1);
    if (
      H.some((v, i) => header.getCell(i + 1).text.trim() !== v) ||
      header.values
        .slice(8)
        .some((x) => x !== null && x !== undefined && x !== "")
    )
      throw Error("表头与模板不一致，请保留七列原表头及顺序。");
    const rows = [],
      errors = [];
    for (let n = 2; n <= sh.rowCount; n++) {
      const r = sh.getRow(n);
      const vals = H.map((h, i) => {
        const v = r.getCell(i + 1).value;
        if (v === null || v === undefined) return "";
        if (typeof v === "number" || typeof v === "string") return v;
        if (v.richText) return v.richText.map((x) => x.text).join("");
        errors.push({
          row: n,
          field: h,
          message:
            v.formula || v.sharedFormula
              ? "请粘贴数值，不能使用公式。"
              : "单元格格式不支持，请填写文本或数值。",
        });
        return "";
      });
      if (
        r.values.slice(8).some((x) => x !== null && x !== undefined && x !== "")
      )
        errors.push({
          row: n,
          field: "附加列",
          message: "模板以外的列含有数据，请核对列位置。",
        });
      rows.push(vals);
    }
    return { rows, errors };
  }
  function bind(ctx) {
    const btn = node("open");
    if (!btn || !allowed(ctx)) return;
    const current = () => allowed(ctx) && btn.isConnected && node("open") === btn;
    const work = node("work"),
      msg = node("status"),
      box = node("preview"),
      confirm = node("confirm"),
      f = node("file"),
      e = ctx.esc;
    let selection = 0,
      preview,
      rows,
      page = 0;
    const clear = () => {
      selection++;
      rows = null;
      preview = null;
      box.innerHTML = "";
      msg.textContent = "";
      confirm.disabled = true;
      f.value = "";
    };
    function toggle(open) {
      clear();
      work.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) node("template").focus();
      else btn.focus();
    }
    btn.onclick = () => toggle(work.hidden);
    node("cancel").onclick = () => toggle(false);
    node("template").onclick = async () => {
      try {
        await template(ctx, current);
      } catch (_) {
        msg.textContent = "模板下载失败，请重试。";
      }
    };
    function draw() {
      const p = preview,
        invalid = new Set(p.errors.map((v) => v.row)),
        c = p.counts,
        byRow = new Map();
      for (const x of p.changes) byRow.set(x.row, x);
      for (const x of p.errors)
        if (!byRow.has(x.row)) byRow.set(x.row, { row: x.row });
      const lines = [...byRow.values()].sort((a, b) => a.row - b.row),
        sub = lines.slice(page * 50, page * 50 + 50);
      const ranges = (v) => (v == null ? "—" : e(v));
      const amount = (v) =>
        v == null
          ? "—"
          : Number(v).toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
      msg.textContent = p.ok
        ? c.created + c.updated
          ? "校验通过，请核对变更后确认导入。"
          : "全部一致，无需写入。"
        : "存在错误，整批未写入。请修改文件后重新选择。";
      box.innerHTML =
        '<h4>导入预览</h4><p class="bi-summary">新增 ' +
        c.created +
        " 项　更新 " +
        c.updated +
        " 项　不变 " +
        c.unchanged +
        " 项　错误 " +
        p.errors.length +
        " 处" +
        (c.newCatalog ? "　新建标准岗位 " + c.newCatalog + " 项" : "") +
        '</p><div class="tablewrap"><table><thead><tr>' +
        [
          "Excel 行",
          "组织 / 业务",
          "岗位",
          "结果",
          "调整前 → 后（人）",
          "调整前 → 后（元）",
          "校验说明",
        ]
          .map((v) => "<th>" + v + "</th>")
          .join("") +
        "</tr></thead><tbody>" +
        sub
          .map((x) => {
            const source = rows[x.row - 2] || [];
            const issues = p.errors.filter((z) => z.row === x.row);
            return (
              "<tr>" +
              [
                x.row || "—",
                e(x.orgName || source[1] || "") +
                  " / " +
                  e(x.biz || source[2] || ""),
                e(x.name || source[3] || ""),
                invalid.has(x.row)
                  ? "错误"
                  : e(x.type) + (x.newCatalog ? " · 新建标准岗" : ""),
                ranges(x.before?.cap) +
                  " → " +
                  ranges(x.after?.cap ?? source[4]),
                amount(x.before?.budget) +
                  " → " +
                  (x.after ? amount(x.after.budget) : e(source[5] ?? "—")),
                issues
                  .map((z) => e(z.field) + "：" + e(z.message))
                  .join("<br>") || "—",
              ]
                .map((v) => "<td>" + v + "</td>")
                .join("") +
              "</tr>"
            );
          })
          .join("") +
        "</tbody></table></div>" +
        (lines.length > 50
          ? '<div class="bi-actions"><button type="button" id="bo-import-prev" ' +
            (!page ? "disabled" : "") +
            ">上一页</button><span>" +
            String(page + 1) +
            " / " +
            Math.ceil(lines.length / 50) +
            '</span><button type="button" id="bo-import-next" ' +
            ((page + 1) * 50 >= lines.length ? "disabled" : "") +
            ">下一页</button></div>"
          : "");
      if (node("prev")) {
        node("prev").onclick = () => {
          page--;
          draw();
        };
        node("next").onclick = () => {
          page++;
          draw();
        };
      }
      confirm.disabled = !p.ok || (!c.created && !c.updated);
    }
    f.onchange = async () => {
      if(!current())return;
      const file = f.files[0],
        idx = ++selection;
      confirm.disabled = true;
      preview = null;
      box.innerHTML = "";
      if (!file) return;
      msg.textContent = "正在校验 " + file.name + "…";
      try {
        const parsed = await parse(file);
        if (idx !== selection || !current()) return;
        rows = parsed.rows;
        preview = BImportModel.preview(ctx, rows);
        if (parsed.errors.length) {
          preview.errors.push(...parsed.errors);
          preview.ok = false;
        }
        page = 0;
        draw();
      } catch (err) {
        if (idx === selection) msg.textContent = err.message;
      }
    };
    confirm.onclick = () => {
      if (!current() || !preview?.ok || confirm.disabled) return;
      confirm.disabled = true;
      const c = preview.counts,
        result = BImportModel.commit(ctx, rows, preview.fingerprint);
      const status = document.getElementById("bg-message");
      if (result.ok) {
        const feedback =
          "导入完成：新增 " +
          c.created +
          " 项，更新 " +
          c.updated +
          " 项，不变 " +
          c.unchanged +
          " 项。";
        if (status) {
          status.textContent = feedback;
          status.focus();
        } else msg.textContent = feedback;
      } else {
        const explanation = result.message;
        if (msg.isConnected) msg.textContent = explanation;
        else if (status) status.textContent = explanation;
      }
    };
  }
  window.BImportUI = { render, bind };
})();
