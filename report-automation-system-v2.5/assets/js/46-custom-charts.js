/* ═══════════════════════════════════════════════════════════
   customCharts — نمودارهای SVG مستقل نسخه ۲٫۲ (بدون کتابخانه بیرونی)
   • infographic: نمایش تصویری شاخص‌ها با آیکون انسان (مثل مقایسه جنسیت)
   • treemap: سلسله‌مراتب و سهم نسبی دسته‌ها (الگوریتم squarified)
   • heatmap: شدت مقدار در تقاطع دو بعد
   • gauge: مقدار شاخص در مقایسه با هدف/حداقل/حداکثر
   همه خروجی‌ها SVG خالص‌اند تا در گزارش و خروجی چاپی هم درست نمایش داده شوند.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const customCharts = (function () {

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* آیکون انسان (برای Infographic) */
  function personSVG(color, filled) {
    return `<svg viewBox="0 0 24 32" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.8" aria-hidden="true">
      <circle cx="12" cy="6" r="4.4"/>
      <path d="M4.5 30V16.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3V30"/>
      ${filled ? '' : '<line x1="4.5" y1="30" x2="4.5" y2="16.5"/>'}
    </svg>`;
  }

  /* ---------- Infographic ----------
     data: [{label, value}]، opts: {perIcon, maxIcons, colors, iconShape}
     هر گروه = ردیف آیکون‌ها؛ هر آیکون = perIcon واحد */
  function infographic(container, data, opts) {
    const o = Object.assign({ perIcon: null, maxIconsPerGroup: 60, colors: ['#2f6fed', '#d23b7a', '#0e7f96', '#b9770e'], unit: '' }, opts || {});
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const per = o.perIcon || nicePer(maxVal);
    let h = '<div class="cc-infographic">';
    data.forEach((d, gi) => {
      const color = o.colors[gi % o.colors.length];
      const icons = Math.min(Math.ceil(d.value / per), o.maxIconsPerGroup);
      const full = Math.floor(d.value / per);
      let figures = '';
      for (let i = 0; i < icons; i++) figures += personSVG(color, i < full);
      h += `<div class="cc-ig-group">
        <div class="cc-ig-figures">${figures}</div>
        <div class="cc-ig-label">${esc(d.label)}</div>
        <div class="cc-ig-value">${Utils.fmtInt(d.value)} ${esc(o.unit)} <span class="text-muted">(${Utils.fmtPct((d.value / data.reduce((s, x) => s + x.value, 0)) * 100, 1)}) — هر آیکون ${Utils.fmtCompact(per)} ${esc(o.unit)}</span></div>
      </div>`;
    });
    h += '</div>';
    container.innerHTML = h;
  }

  function nicePer(maxVal) {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 100000, 1000000];
    for (const s of steps) { if (maxVal / s <= 30) return s; }
    return Math.ceil(maxVal / 30);
  }

  /* ---------- Treemap (squarified) ---------- */
  function treemap(container, data, opts) {
    const o = Object.assign({ colors: ['#2f6fed', '#0e7f96', '#178a50', '#b9770e', '#d23b3b', '#7c3aed', '#0891b2', '#be185d'], showLabels: true }, opts || {});
    const W = Math.max(container.clientWidth || 460, 300);
    const H = Math.max(parseInt((o.height || 280), 10) || 280, 180);
    const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0);
    if (!total) { container.innerHTML = ''; return; }
    const items = data.map(d => ({ ...d, norm: (Math.max(d.value, 0) / total) * W * H })).filter(d => d.norm > 0);
    const rects = squarify(items.slice(), { x: 0, y: 0, w: W, h: H }, []);
    let svg = `<div class="cc-treemap-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:${H}px">`;
    rects.forEach((r, i) => {
      const color = o.colors[i % o.colors.length];
      const share = total ? (r.value / total) * 100 : 0;
      const dark = '#ffffff';
      svg += `<g class="tm-cell" data-tm-label="${esc(r.label)}" style="cursor:pointer" role="button" aria-label="${esc(r.label)}: ${Utils.fmtInt(r.value)}">
        <rect x="${r.x + 1}" y="${r.y + 1}" width="${Math.max(r.w - 2, 0)}" height="${Math.max(r.h - 2, 0)}" rx="6" fill="${color}" fill-opacity="0.88" stroke="#fff" stroke-width="1.5">`;
      if (r.w > 46 && r.h > 34) {
        const fs = Math.min(Math.max(Math.sqrt(r.w * r.h) / 7, 8), 14);
        svg += `<title>${esc(r.label)}: ${Utils.fmtInt(r.value)} (${Utils.fmtPct(share, 1)})</title>`;
        svg += `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 3}" text-anchor="middle" font-size="${fs}" fill="${dark}" font-weight="700" style="pointer-events:none">${esc(truncate(r.label, Math.floor(r.w / (fs * 0.62))))}</text>`;
        svg += `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + fs + 2}" text-anchor="middle" font-size="${fs - 2}" fill="${dark}" fill-opacity=".85" style="pointer-events:none">${Utils.fmtCompact(r.value)} (${Utils.fmtPct(share, 0)})</text>`;
      } else {
        svg += `<title>${esc(r.label)}: ${Utils.fmtInt(r.value)} (${Utils.fmtPct(share, 1)})</title>`;
      }
      svg += `</rect></g>`;
    });
    svg += '</svg></div>';
    container.innerHTML = svg;
  }

  function truncate(s, n) { s = String(s == null ? '' : s); return n > 3 && s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function squarify(items, area, out) {
    if (!items.length) return out;
    if (items.length === 1) { out.push({ ...items[0], ...area }); return out; }
    const horizontal = area.w >= area.h;
    const totalArea = items.reduce((s, d) => s + d.norm, 0);
    /* یک ردیف بساز که نسبتش به بدترین حالت نزدیک مربع باشد */
    let row = [items[0]];
    let rest = items.slice(1);
    const worst = (r, len) => {
      const s = r.reduce((x, d) => x + d.norm, 0);
      const side = horizontal ? area.h : area.w;
      const thick = s / side;
      return Math.max(...r.map(d => Math.max((side * thick * side) / (d.norm * thick), (d.norm * thick) / (side * thick))));
    };
    while (rest.length) {
      const cand = row.concat([rest[0]]);
      if (worst(cand) <= worst(row) || row.length === 0) { row = cand; rest = rest.slice(1); }
      else break;
    }
    const rowSum = row.reduce((s, d) => s + d.norm, 0);
    const side = horizontal ? area.h : area.w;
    const thick = rowSum / side;
    let off = 0;
    row.forEach(d => {
      const len = (d.norm / rowSum) * side;
      const rect = horizontal ? { x: area.x, y: area.y + off, w: thick, h: len } : { x: area.x + off, y: area.y, w: len, h: thick };
      out.push({ ...d, ...rect });
      off += len;
    });
    const restArea = horizontal ? { x: area.x + thick, y: area.y, w: area.w - thick, h: area.h } : { x: area.x, y: area.y + thick, w: area.w, h: area.h - thick };
    if (restArea.w <= 0 || restArea.h <= 0) { rest.forEach(d => out.push({ ...d, ...restArea })); return out; }
    return squarify(rest, restArea, out);
  }

  /* ---------- Heatmap (ماتریس دو بعدی) ----------
     data: {rows: [نام سطر], cols: [نام ستون], values: Map "r|c" → num} */
  function heatmap(container, data, opts) {
    const o = Object.assign({ baseColor: '#2f6fed', cellSize: 34, gap: 3, fmt: (v) => Utils.fmtCompact(v) }, opts || {});
    const { rows, cols, values } = data;
    if (!rows.length || !cols.length) { container.innerHTML = ''; return; }
    const labelW = Math.min(110, Math.max(...rows.map(r => r.length)) * 7 + 14);
    const cell = o.cellSize, gap = o.gap;
    const W = labelW + cols.length * (cell + gap) + 8;
    const H = 34 + rows.length * (cell + gap) + 8;
    const vals = [];
    rows.forEach(r => cols.forEach(c => { const v = values.get(r + '|' + c); if (v != null) vals.push(v); }));
    const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
    const colorOf = (v) => {
      if (v == null) return 'var(--surface-2)';
      const t = max === min ? 0.5 : 0.14 + 0.86 * ((v - min) / (max - min));
      return mixColor('#eef2fb', o.baseColor, t);
    };
    let svg = `<div class="cc-heatmap-wrap"><div style="overflow:auto"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px;width:100%;max-width:${W}px">`;
    cols.forEach((c, ci) => {
      svg += `<text x="${labelW + ci * (cell + gap) + cell / 2}" y="22" text-anchor="middle" font-size="10.5" fill="var(--text-soft)" font-weight="600">${esc(truncate(c, 10))}</text>`;
    });
    rows.forEach((r, ri) => {
      const y = 34 + ri * (cell + gap);
      svg += `<text x="${labelW - 6}" y="${y + cell / 2 + 3.5}" text-anchor="end" font-size="10.5" fill="var(--text-soft)" font-weight="600">${esc(truncate(r, 14))}</text>`;
      cols.forEach((c, ci) => {
        const v = values.get(r + '|' + c);
        const x = labelW + ci * (cell + gap);
        svg += `<g class="hm-cell" data-hm-r="${esc(r)}" data-hm-c="${esc(c)}" style="cursor:default">
          <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="5" fill="${colorOf(v)}" stroke="var(--border)" stroke-width="1">
            <title>${esc(r)} × ${esc(c)}: ${v == null ? 'بدون داده' : Utils.fmtInt(v)}</title></rect>
          ${v != null && cell >= 30 ? `<text x="${x + cell / 2}" y="${y + cell / 2 + 3.5}" text-anchor="middle" font-size="9.5" fill="${v != null && ((v - min) / (max - min || 1)) > 0.55 ? '#fff' : 'var(--text)'}" style="pointer-events:none">${esc(o.fmt(v))}</text>` : ''}
        </g>`;
      });
    });
    svg += '</svg></div>';
    svg += `<div class="flex" style="gap:6px;align-items:center;margin-top:6px;font-size:10.5px;color:var(--text-faint)">
      کم <span style="width:80px;height:9px;border-radius:5px;display:inline-block;background:linear-gradient(to left,#eef2fb,${o.baseColor})"></span> زیاد
      <span style="margin-inline-start:8px">خانه‌های خاکستری = بدون داده</span></div>`;
    container.innerHTML = svg + '</div>';
  }

  /* ---------- Gauge ---------- */
  function gauge(container, d, opts) {
    /* d: {value, min, max, target?, label} */
    const o = Object.assign({ baseColor: '#2f6fed', size: 220, unit: '' }, opts || {});
    const min = d.min != null ? d.min : 0;
    const max = d.max != null ? d.max : Math.max(d.value * 1.5, 100);
    const W = o.size, H = o.size * 0.68;
    const cx = W / 2, cy = H * 0.92, R = Math.min(W / 2 - 12, H * 0.86);
    const clamp = (x) => Math.min(1, Math.max(0, x));
    const frac = clamp((d.value - min) / ((max - min) || 1));
    const targetFrac = d.target != null ? clamp((d.target - min) / ((max - min) || 1)) : null;
    const arc = (f, color, width, opacity) => {
      const a0 = Math.PI * (1 + f); /* از چپ (۱۸۰°) */
      const a1 = Math.PI;
      const x0 = cx + R * Math.cos(a1), y0 = cy + R * Math.sin(a1);
      const x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0);
      return `<path d="M ${x0} ${y0} A ${R} ${R} 0 ${f > 0.5 ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${opacity ? `opacity="${opacity}"` : ''}/>`;
    };
    let svg = `<div class="cc-gauge-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%">
      <svg viewBox="0 0 ${W} ${H + 34}" style="width:100%;max-width:${W}px">
        <title>${esc(d.label || '')}: ${Utils.fmtInt(d.value)} از ${Utils.fmtInt(max)}</title>
        ${arc(1, 'var(--surface-2)', 16)}
        ${arc(frac, o.baseColor, 16)}
        ${targetFrac != null ? `<line x1="${cx + (R - 14) * Math.cos(Math.PI * (1 + targetFrac))}" y1="${cy + (R - 14) * Math.sin(Math.PI * (1 + targetFrac))}" x2="${cx + (R + 14) * Math.cos(Math.PI * (1 + targetFrac))}" y2="${cy + (R + 14) * Math.sin(Math.PI * (1 + targetFrac))}" stroke="#d23b3b" stroke-width="3" stroke-linecap="round"><title>هدف: ${Utils.fmtInt(d.target)}</title></line>` : ''}
        <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${Utils.fmtCompact(d.value)} ${esc(o.unit)}</text>
        <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="11.5" fill="var(--text-soft)">${esc(truncate(d.label || '', 24))} — ${Utils.fmtPct(frac * 100, 0)} از سقف</text>
        <text x="14" y="${H + 20}" text-anchor="start" font-size="10.5" fill="var(--text-faint)">${Utils.fmtInt(min)}</text>
        <text x="${W - 14}" y="${H + 20}" text-anchor="end" font-size="10.5" fill="var(--text-faint)">${Utils.fmtInt(max)}${d.target != null ? ` — هدف: ${Utils.fmtInt(d.target)}` : ''}</text>
      </svg></div>`;
    container.innerHTML = svg;
  }

  function mixColor(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
    const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  return { infographic, treemap, heatmap, gauge, mixColor };
})();
