/* ═══════════════════════════════════════════════════════════
   iranMap — نقشه ایران برای نمودارهای داده‌محور (نسخه ۲٫۵)
   • مرز واقعی ۳۱ استان از داده مرجع GeoJSON (geoBoundaries — در 47-iran-geo-data.js)
   • رنگ‌آمیزی بر اساس مقدار (Choropleth) + برچسب استان‌ها + Tooltip کامل
   • Drill-down شهرستانی برای «همه ۳۱ استان» (نسخه ۲٫۵): کلیک روی هر استان →
     مشاهده همه شهرستان‌های همان استان داخل مرز واقعی (سلول‌بندی وورونوی)
   • ۴۷۸ شهرستان از داده مرجع OSM (مرکز هر شهرستان — در 47-iran-geo-data.js)
   • منطبق‌سازی خودکار نام استان‌ها و شهرستان‌ها در داده
   ═══════════════════════════════════════════════════════════ */
'use strict';

const iranMap = (function () {

  /* ---------- مشخصات استان‌ها (مرکز + مرکز استان + نام‌های جایگزین) ---------- */
  const PROVINCES = [
    { key: 'آذربایجان شرقی',  capital: 'تبریز',      lon: 46.3,  lat: 38.0, aliases: ['آذربایجان شرقی', 'تبریز', 'شرقی آذربایجان', 'آذربایجانِ شرقی'] },
    { key: 'آذربایجان غربی',  capital: 'ارومیه',     lon: 45.2,  lat: 37.2, aliases: ['آذربایجان غربی', 'ارومیه', 'اورمیه', 'غرب آذربایجان'] },
    { key: 'اردبیل',          capital: 'اردبیل',     lon: 48.1,  lat: 38.3, aliases: ['اردبیل'] },
    { key: 'اصفهان',          capital: 'اصفهان',     lon: 52.4,  lat: 32.5, aliases: ['اصفهان', 'اصفهان', 'سپاهان'] },
    { key: 'البرز',           capital: 'کرج',        lon: 50.9,  lat: 36.0, aliases: ['البرز', 'کرج'] },
    { key: 'ایلام',           capital: 'ایلام',      lon: 46.3,  lat: 33.3, aliases: ['ایلام'] },
    { key: 'بوشهر',           capital: 'بوشهر',      lon: 51.2,  lat: 29.1, aliases: ['بوشهر', 'بندر بوشهر'] },
    { key: 'تهران',           capital: 'تهران',      lon: 51.6,  lat: 35.6, aliases: ['تهران'] },
    { key: 'چهارمحال و بختیاری', capital: 'شهرکرد',  lon: 50.8,  lat: 32.0, aliases: ['چهارمحال و بختیاری', 'چهارمحال', 'بختیاری', 'شهرکرد'] },
    { key: 'خراسان جنوبی',    capital: 'بیرجند',     lon: 58.9,  lat: 33.2, aliases: ['خراسان جنوبی', 'بیرجند'] },
    { key: 'خراسان رضوی',     capital: 'مشهد',       lon: 58.6,  lat: 35.5, aliases: ['خراسان رضوی', 'خراسان', 'مشهد', 'رضوی'] },
    { key: 'خراسان شمالی',    capital: 'بجنورد',     lon: 56.9,  lat: 37.4, aliases: ['خراسان شمالی', 'بجنورد'] },
    { key: 'خوزستان',         capital: 'اهواز',      lon: 49.3,  lat: 31.4, aliases: ['خوزستان', 'اهواز'] },
    { key: 'زنجان',           capital: 'زنجان',      lon: 48.5,  lat: 36.6, aliases: ['زنجان'] },
    { key: 'سمنان',           capital: 'سمنان',      lon: 53.6,  lat: 35.2, aliases: ['سمنان'] },
    { key: 'سیستان و بلوچستان', capital: 'زاهدان',   lon: 60.3,  lat: 29.3, aliases: ['سیستان و بلوچستان', 'سیستان', 'بلوچستان', 'زاهدان', 'زابل'] },
    { key: 'فارس',            capital: 'شیراز',      lon: 53.6,  lat: 29.2, aliases: ['فارس', 'شیراز'] },
    { key: 'قزوین',           capital: 'قزوین',      lon: 50.1,  lat: 36.2, aliases: ['قزوین'] },
    { key: 'قم',              capital: 'قم',         lon: 50.8,  lat: 34.6, aliases: ['قم'] },
    { key: 'کردستان',         capital: 'سنندج',      lon: 46.6,  lat: 35.5, aliases: ['کردستان', 'سنندج'] },
    { key: 'کرمان',           capital: 'کرمان',      lon: 57.1,  lat: 30.2, aliases: ['کرمان'] },
    { key: 'کرمانشاه',        capital: 'کرمانشاه',   lon: 47.0,  lat: 34.3, aliases: ['کرمانشاه', 'کرمانشان'] },
    { key: 'کهگیلویه و بویراحمد', capital: 'یاسوج',  lon: 51.4,  lat: 30.7, aliases: ['کهگیلویه و بویراحمد', 'کهگیلویه', 'بویراحمد', 'یاسوج'] },
    { key: 'گلستان',          capital: 'گرگان',      lon: 54.4,  lat: 36.9, aliases: ['گلستان', 'گرگان'] },
    { key: 'گیلان',           capital: 'رشت',        lon: 49.9,  lat: 37.2, aliases: ['گیلان', 'رشت'] },
    { key: 'لرستان',          capital: 'خرم‌آباد',   lon: 48.3,  lat: 33.6, aliases: ['لرستان', 'خرم آباد', 'خرم‌آباد'] },
    { key: 'مازندران',        capital: 'ساری',       lon: 52.7,  lat: 36.4, aliases: ['مازندران', 'ساری', 'بابل', 'آمل'] },
    { key: 'مرکزی',           capital: 'اراک',       lon: 49.8,  lat: 34.4, aliases: ['مرکزی', 'اراک'] },
    { key: 'هرمزگان',         capital: 'بندرعباس',   lon: 56.2,  lat: 27.5, aliases: ['هرمزگان', 'بندرعباس', 'بندر عباس'] },
    { key: 'همدان',           capital: 'همدان',      lon: 48.4,  lat: 34.7, aliases: ['همدان', 'همدان'] },
    { key: 'یزد',             capital: 'یزد',        lon: 54.3,  lat: 32.1, aliases: ['یزد'] }
  ];

  /* ---------- شهرستان‌ها (سطح Drill-down — نسخه ۲٫۵: همه استان‌ها) ----------
     مرز استان‌ها واقعی است (GeoJSON)؛ سلول‌بندی وورونوی شهرستان‌ها داخل مرز
     واقعی همان استان رسم می‌شود. داده ۴۷۸ شهرستان در 47-iran-geo-data.js
     (IRAN_COUNTIES — منبع OpenStreetMap) قرار دارد و اینجا با نام‌های
     جایگزین غنی می‌شود تا تطابق با داده کاربر ساده‌تر شود. */
  const EXTRA_ALIASES = {
    'ری': ['شهرری'],
    'تهران': ['تهران بزرگ'],
    'شمیرانات': ['شمیران', 'لواسان'],
    'بهارستان': ['نسیم‌شهر', 'نسیم شهر', 'اخترآباد']
  };
  const COUNTIES = (function () {
    const out = {};
    const SRC = (typeof IRAN_COUNTIES !== 'undefined') ? IRAN_COUNTIES : {};
    Object.keys(SRC).forEach(prov => {
      out[prov] = SRC[prov].map(c => {
        const aliases = ['شهرستان ' + c.key];
        const extra = EXTRA_ALIASES[c.key];
        if (extra) extra.forEach(a => aliases.push(a));
        return { key: c.key, lon: c.lon, lat: c.lat, aliases };
      });
    });
    return out;
  })();

  function hasCounties(provinceKey) { return !!(COUNTIES[provinceKey] && COUNTIES[provinceKey].length); }
  function countiesOf(provinceKey) { return COUNTIES[provinceKey] || []; }

  function matchCounty(provinceKey, label) {
    const list = countiesOf(provinceKey);
    const n = Utils.normalizeFa(label || '');
    if (!n || !list.length) return null;
    for (const c of list) {
      if (Utils.normalizeFa(c.key) === n) return c.key;
      for (const a of c.aliases) { if (Utils.normalizeFa(a) === n) return c.key; }
    }
    for (const c of list) {
      for (const a of c.aliases.concat([c.key])) {
        const na = Utils.normalizeFa(a);
        if (na.length >= 3 && n.includes(na)) return c.key;
      }
    }
    return null;
  }

  /* ---------- منطبق‌سازی نام استان در داده ---------- */
  function matchProvince(label) {
    const n = Utils.normalizeFa(label || '');
    if (!n) return null;
    for (const p of PROVINCES) {
      if (Utils.normalizeFa(p.key) === n) return p.key;
      for (const a of p.aliases) { if (Utils.normalizeFa(a) === n) return p.key; }
    }
    /* تطابق جزئی: استان داخل نام (مثل «استان فارس») */
    for (const p of PROVINCES) {
      for (const a of p.aliases.concat([p.key])) {
        const na = Utils.normalizeFa(a);
        if (na.length >= 4 && n.includes(na)) return p.key;
      }
    }
    return null;
  }

  function capitalOf(key) {
    const p = PROVINCES.find(x => x.key === key);
    return p ? p.capital : '';
  }

  /* ---------- رنگ‌آمیزی ---------- */
  function hex2rgb(h) { const v = h.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; }
  function mix(c1, c2, t) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }
  function valueColor(v, min, max, base) {
    if (min === max) return mix('#e8eefc', base, 0.55);
    const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return mix('#eef2fb', base, 0.14 + t * 0.86);
  }

  /* ---------- هندسه: مسیر، مرکز‌جرم، مساحت ---------- */
  function pathOf(ring) {
    if (!ring || ring.length < 3) return '';
    return 'M' + ring.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  }
  function centroidOf(ring) {
    let x = 0, y = 0, a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
      const cr = x0 * y1 - x1 * y0;
      a += cr; x += (x0 + x1) * cr; y += (y0 + y1) * cr;
    }
    if (Math.abs(a) < 1e-9) return ring[0] || [0, 0];
    a *= 0.5;
    return [x / (6 * a), y / (6 * a)];
  }
  function areaOf(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return Math.abs(a / 2);
  }

  /* وورونوی: برش نیم‌صفحه (برای سلول‌بندی شهرستان‌ها داخل مرز واقعی استان) */
  function clipHalfPlane(poly, a, b) {
    const f = (p) => ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) - ((p[0] - b[0]) ** 2 + (p[1] - b[1]) ** 2);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], nxt = poly[(i + 1) % poly.length];
      const fc = f(cur), fn = f(nxt);
      if (fc <= 0) out.push(cur);
      if ((fc < 0 && fn > 0) || (fc > 0 && fn < 0)) {
        const t = fc / (fc - fn);
        out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]);
      }
    }
    return out;
  }

  /* ---------- تصویر مختصات (equirectangular با اصلاح عرض) ---------- */
  const LAT_MID = 32.5 * Math.PI / 180;
  const KX = Math.cos(LAT_MID);
  function makeProjection(ringsByFeature, scale) {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    ringsByFeature.forEach(rings => rings.forEach(ring => ring.forEach(([lo, la]) => {
      minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    })));
    const px = (lon, lat) => [(lon - minLon) * KX * scale, (maxLat - lat) * scale];
    return { px, minLon, maxLon, minLat, maxLat };
  }

  /* ---------- رندر ---------- */
  let _drill = null;   /* { province: key } — سطح شهرستان */

  /**
   * opts: {
   *   regions: [{ key, label, value, count }],
   *   baseColor, fmtValue, fmtShare,
   *   onRegionClick: fn(key, province?),   // فیلتر بر اساس استان (یا شهرستان)
   *   selectedKey, onLevelChange: fn()
   * }
   */
  function render(el, opts) {
    const provinces = (opts && opts.regions) || [];
    const base = (opts && opts.baseColor) || '#2f6fed';
    const fmtValue = (opts && opts.fmtValue) || Utils.nf;
    const fmtShare = (opts && opts.fmtShare) || Utils.fmtPct;
    const mapData = new Map();
    provinces.forEach(r => mapData.set(r.key, r));
    const vals = provinces.filter(r => isFinite(+r.value)).map(r => +r.value);
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    const total = vals.reduce((s, v) => s + v, 0);
    const zeroCount = vals.filter(v => v === 0).length;

    if (_drill && !hasCounties(_drill.province)) _drill = null;
    const level = _drill ? 'county' : 'country';

    /* ---------- ساخت سلول‌ها بر اساس سطح ---------- */
    let cells = [];          /* [{ key, rings:[[..]], label:[x,y], showLabel }] */
    let viewBoxW = 0, viewBoxH = 0;
    let levelLabel = '', approxNote = '';

    if (level === 'country') {
      const GEO = (typeof IRAN_GEO !== 'undefined') ? IRAN_GEO : {};
      const proj = makeProjection(Object.values(GEO), 34);
      const pad = 10;
      Object.keys(GEO).forEach(key => {
        const rings = GEO[key].map(ring => ring.map(([lo, la]) => proj.px(lo, la)));
        const main = rings[0];
        const [cx, cy] = centroidOf(main);
        cells.push({ key, rings, label: [cx, cy], showLabel: areaOf(main) > 320 });
      });
      viewBoxW = (proj.maxLon - proj.minLon) * KX * 34 + pad * 2;
      viewBoxH = (proj.maxLat - proj.minLat) * 34 + pad * 2;
      cells.forEach(c => { c.rings.forEach(r => { r.forEach(p => { p[0] += pad; p[1] += pad; }); }); c.label[0] += pad; c.label[1] += pad; });
      levelLabel = 'سطح: کل کشور (۳۱ استان — مرز واقعی)';
      approxNote = 'مرز استان‌ها از داده مرجع GeoJSON (geoBoundaries) بارگذاری شده است.';
    } else {
      const list = countiesOf(_drill.province);
      const GEO = (typeof IRAN_GEO !== 'undefined') ? IRAN_GEO : {};
      const provRings = GEO[_drill.province] || [];
      const allLons = [], allLats = [];
      provRings.forEach(r => r.forEach(([lo, la]) => { allLons.push(lo); allLats.push(la); }));
      const minLon = Math.min(...allLons), maxLon = Math.max(...allLons);
      const minLat = Math.min(...allLats), maxLat = Math.max(...allLats);
      const S = 210; /* بزرگ‌نمایی سطح شهرستان */
      const pad = 8;
      const px = (lon, lat) => [(lon - minLon) * KX * S + pad, (maxLat - lat) * S + pad];
      viewBoxW = (maxLon - minLon) * KX * S + pad * 2;
      viewBoxH = (maxLat - minLat) * S + pad * 2;
      /* مرز واقعی استان + سلول‌بندی وورونوی شهرستان‌ها داخل همان مرز */
      const outline = provRings.length ? provRings[0].map(([lo, la]) => px(lo, la)) : null;
      const sites = list.map(c => ({ key: c.key, xy: px(c.lon, c.lat) }));
      sites.forEach(s => {
        let poly = outline ? outline.slice() : [[0, 0], [viewBoxW, 0], [viewBoxW, viewBoxH], [0, viewBoxH]];
        for (const other of sites) {
          if (other === s) continue;
          poly = clipHalfPlane(poly, s.xy, other.xy);
          if (!poly.length) break;
        }
        if (poly.length) {
          const [cx, cy] = centroidOf(poly);
          cells.push({ key: s.key, rings: [poly], label: [cx, cy], showLabel: areaOf(poly) > 130 });
        } else {
          /* نسخه ۲٫۵: اگر سلول وورونوی به‌طور کامل بریده شد (مرکز شهرستان بیرون از
             مرز ساده‌شده استان — معمولاً شهرستان‌های ساحلی مثل عسلویه)، دایره کوچکی
             حول مرکز واقعی شهرستان رسم می‌شود تا ناحیه گم نشود و قابل کلیک بماند. */
          const [sx, sy] = s.xy;
          const circle = [];
          for (let a = 0; a < 24; a++) {
            const ang = (a / 24) * Math.PI * 2;
            circle.push([sx + Math.cos(ang) * 9, sy + Math.sin(ang) * 9]);
          }
          circle.push(circle[0]);
          cells.push({ key: s.key, rings: [circle], label: [sx, sy], showLabel: true });
        }
      });
      levelLabel = `سطح: شهرستان‌های استان ${_drill.province}`;
      approxNote = 'مرز استان واقعی است (GeoJSON)؛ تفکیک شهرستان‌ها بر پایه موقعیت واقعی مراکز شهرستان‌ها (داده OSM) و داخل مرز واقعی استان رسم می‌شود.';
    }

    const off = 0;
    let cellSvg = '';
    cells.forEach(c => {
      const key = c.key;
      const d = mapData.get(key);
      const val = d ? +d.value : null;
      const fill = val === null ? 'var(--surface-2)' : valueColor(val, min, max, base);
      const selected = opts && opts.selectedKey === key;
      cellSvg += `<path d="${c.rings.map(r => pathOf(r)).join(' ')}" fill="${fill}" stroke="#ffffff" stroke-width="1.1"
        class="im-cell ${selected ? 'im-selected' : ''}" data-region="${Utils.esc(key)}"
        tabindex="0" role="button" aria-label="${Utils.esc(key)}"/>`;
      if (c.showLabel) {
        let short = key;
        if (level === 'country') short = key.length > 13 ? key.replace(' و بویراحمد', '').replace('چهارمحال و', 'چهارمحال') : key;
        const dark = val !== null && ((val - min) / Math.max(max - min, 1e-9)) > 0.5;
        cellSvg += `<text x="${(c.label[0] + off).toFixed(1)}" y="${(c.label[1] + off).toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          class="im-label ${dark ? 'im-label-dark' : ''}" pointer-events="none">${Utils.esc(short)}</text>`;
      }
    });

    /* ---------- چیدمان: نقشه + نوار کناری (breadcrumb، legend، جزئیات) ---------- */
    el.innerHTML = `
      <div class="im-wrap" style="flex-wrap:wrap;gap:14px;align-items:flex-start">
        <div style="flex:1;min-width:290px">
          <div class="im-breadcrumb">
            <button class="im-crumb ${level === 'country' ? 'active' : ''}" data-im-level="country">ایران (استان‌ها)</button>
            ${level === 'county' ? `<span class="im-sep">‹</span>
              <button class="im-crumb active" data-im-level="province" disabled>${Utils.esc(_drill.province)}</button>` : ''}
            <span class="im-zoom-level">${Utils.icon('mapPin', 11)} ${levelLabel}</span>
            ${level === 'county' ? `<button class="btn btn-sm btn-secondary" data-im-back>${Utils.icon('arrowRight', 12)}بازگشت به سطح استان</button>` : ''}
          </div>
          <div class="im-svg-box">
            <svg viewBox="0 0 ${viewBoxW.toFixed(0)} ${viewBoxH.toFixed(0)}" class="im-svg" dir="rtl">
              <defs>
                <filter id="im-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity=".18"/>
                </filter>
              </defs>
              <g filter="url(#im-shadow)">${cellSvg}</g>
            </svg>
            <div class="im-tooltip" hidden></div>
            <div class="im-zoom-controls" role="group" aria-label="بزرگ‌نمایی نقشه">
              <button type="button" data-im-zoom="in" title="بزرگ‌نمایی (+)">${Utils.icon('plus', 12)}</button>
              <button type="button" data-im-zoom="out" title="کوچک‌نمایی (−)">${Utils.icon('minus', 12)}</button>
              <button type="button" data-im-zoom="reset" title="بازنشانی نما">${Utils.icon('refresh', 12)}</button>
              <span class="im-zoom-pct">${Utils.faDig(100)}٪</span>
            </div>
            <div class="im-pan-hint">چرخ ماوس: بزرگ‌نمایی — کشیدن: جابه‌جایی نقشه</div>
          </div>
          <div class="small text-muted" style="margin-top:6px;font-size:10.6px">${approxNote}</div>
        </div>
        <div style="width:215px;flex:0 0 auto;display:flex;flex-direction:column;gap:10px">
          <div class="im-legend">
            <span class="im-legend-title">${Utils.icon('map', 12)} شدت بر اساس مقدار</span>
            <div class="im-legend-bar-wrap"><span class="im-min">${Utils.esc(fmtValue(min))}</span>
              <div class="im-legend-bar" style="background:linear-gradient(to left,#eef2fb,${base})"></div>
              <span class="im-max">${Utils.esc(fmtValue(max))}</span></div>
            <div class="small text-muted" style="font-size:10.4px;margin-top:3px">
              ${zeroCount ? `${Utils.faDig(zeroCount)} ناحیه با مقدار صفر (کم‌رنگ‌ترین)` : ''}
              ${vals.length < cells.length ? ` — ${Utils.faDig(cells.length - vals.length)} ناحیه بدون داده (خاکستری)` : ''}
            </div>
          </div>
          <div class="im-detail-panel" id="im-details">
            <h4>${Utils.icon('mapPin', 13)} جزئیات ناحیه</h4>
            <div class="small text-muted">نشانگر را روی ناحیه ببرید یا روی آن کلیک کنید.
            ${level === 'country' ? 'کلیک روی هر استان، همه شهرستان‌های آن را نمایش می‌دهد (Drill-down — نسخه ۲٫۵ برای هر ۳۱ استان).' : ''}</div>
          </div>
        </div>
      </div>`;

    /* ---------- Tooltip + پنل جزئیات ---------- */
    const box = el.querySelector('.im-svg-box');
    const tip = el.querySelector('.im-tooltip');
    const details = el.querySelector('#im-details');

    /* ---------- بزرگ‌نمایی/جابه‌جایی نقشه (نسخه ۲٫۴): چرخ ماوس، دکمه، درگ ---------- */
    (function wireZoomPan() {
      const svg = box.querySelector('.im-svg');
      const pct = box.querySelector('.im-zoom-pct');
      let vb = { x: 0, y: 0, w: viewBoxW, h: viewBoxH };
      let panned = false;
      const MIN_W = viewBoxW / 9, MAX_W = viewBoxW * 1.4;
      const apply = () => {
        svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
        if (pct) pct.textContent = Utils.faDig(Math.round((viewBoxW / vb.w) * 100)) + '٪';
      };
      const clampVB = () => {
        vb.w = Math.min(MAX_W, Math.max(MIN_W, vb.w));
        vb.h = vb.w * (viewBoxH / viewBoxW);
        vb.x = Math.min(Math.max(vb.x, -viewBoxW * 0.2), viewBoxW - vb.w * 0.8);
        vb.y = Math.min(Math.max(vb.y, -viewBoxH * 0.2), viewBoxH - vb.h * 0.8);
        if (vb.w >= MAX_W) { vb.x = 0; vb.y = 0; }
      };
      const zoomAt = (factor, mx, my) => {
        const nw = Math.min(MAX_W, Math.max(MIN_W, vb.w * factor));
        const k = nw / vb.w;
        vb.x = mx - (mx - vb.x) * k;
        vb.y = my - (my - vb.y) * k;
        vb.w = nw; vb.h = nw * (viewBoxH / viewBoxW);
        clampVB(); apply();
      };
      const pointInVB = (e) => {
        const r = svg.getBoundingClientRect();
        return [vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * vb.h];
      };
      box.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [mx, my] = pointInVB(e);
        zoomAt(e.deltaY < 0 ? 0.82 : 1.22, mx, my);
      }, { passive: false });
      box.querySelectorAll('[data-im-zoom]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = b.dataset.imZoom;
        if (mode === 'reset') { vb = { x: 0, y: 0, w: viewBoxW, h: viewBoxH }; apply(); return; }
        const c = [vb.x + vb.w / 2, vb.y + vb.h / 2];
        zoomAt(mode === 'in' ? 0.7 : 1.43, c[0], c[1]);
      }));
      let drag = null;
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        drag = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, moved: 0 };
        panned = false;
        svg.classList.add('is-panning');
      });
      window.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const r = svg.getBoundingClientRect();
        const dx = (e.clientX - drag.sx) * (vb.w / r.width);
        const dy = (e.clientY - drag.sy) * (vb.h / r.height);
        drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy));
        if (drag.moved > 4) panned = true;
        vb.x = drag.vx - dx; vb.y = drag.vy - dy;
        clampVB(); apply();
      });
      window.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = null;
        svg.classList.remove('is-panning');
        /* اگر درگ واقعی انجام شده، کلیک بعدی (باز شدن فیلتر) یک‌بار مصرف شود */
        if (panned) setTimeout(() => { panned = false; }, 60);
      });
      box.addEventListener('click', (e) => {
        if (panned) { e.stopImmediatePropagation(); panned = false; }
      }, true);
    })();
    const showInfo = (key, rect, e) => {
      const d = mapData.get(key);
      const share = d && total > 0 ? (+d.value / total) * 100 : null;
      const canDrill = level === 'country' && hasCounties(key);
      const tipHTML = `
        <b>${Utils.esc(key)}</b> ${level === 'country' ? `<span class="im-cap">مرکز: ${Utils.esc(capitalOf(key))}</span>` : `<span class="im-cap">شهرستان استان ${Utils.esc(_drill.province)}</span>`}
        ${d ? `<div class="im-row"><span>مقدار:</span><b>${Utils.esc(fmtValue(+d.value))}</b></div>
               ${share !== null ? `<div class="im-row"><span>سهم:</span><b>${Utils.esc(fmtShare(share))}</b></div>` : ''}
               ${d.count !== undefined ? `<div class="im-row"><span>تعداد رکورد:</span><b>${Utils.fmtInt(d.count)}</b></div>` : ''}`
             : '<div class="im-row">داده‌ای برای این ناحیه ثبت نشده (خاکستری)</div>'}
        <div class="im-hint">${canDrill ? 'کلیک: مشاهده شهرستان‌ها — ' : ''}دکمه «فیلتر» در پنل جزئیات، کل نرم‌افزار را فیلتر می‌کند</div>`;
      tip.innerHTML = tipHTML;
      tip.hidden = false;
      if (rect) {
        let x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
        if (x > rect.width - 195) x = e.clientX - rect.left - 195;
        if (y > rect.height - 135) y = e.clientY - rect.top - 125;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      }
      if (details) {
        details.innerHTML = `
          <h4>${Utils.icon('mapPin', 13)} ${Utils.esc(key)}</h4>
          ${level === 'country' ? `<div class="im-d-row"><span>مرکز استان:</span><b>${Utils.esc(capitalOf(key))}</b></div>` : ''}
          ${d ? `<div class="im-d-row"><span>مقدار:</span><b>${Utils.esc(fmtValue(+d.value))}</b></div>
                 ${share !== null ? `<div class="im-d-row"><span>سهم از کل:</span><b>${Utils.esc(fmtShare(share))}</b></div>` : ''}
                 ${d.count !== undefined ? `<div class="im-d-row"><span>تعداد رکورد:</span><b>${Utils.fmtInt(d.count)}</b></div>` : ''}`
               : '<div class="im-d-row"><span>داده‌ای ثبت نشده</span></div>'}
          <div class="flex mt-1" style="gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" data-im-filter="${Utils.esc(key)}">${Utils.icon('filter', 12)}فیلتر کل نرم‌افزار</button>
            ${canDrill ? `<button class="btn btn-sm btn-secondary" data-im-drill="${Utils.esc(key)}">${Utils.icon('plus', 12)}شهرستان‌ها</button>` : ''}
          </div>`;
      }
    };
    const hideInfo = () => { tip.hidden = true; };

    box.addEventListener('mousemove', (e) => {
      const t = e.target.closest('.im-cell');
      if (!t) { hideInfo(); return; }
      showInfo(t.dataset.region, box.getBoundingClientRect(), e);
    });
    box.addEventListener('mouseleave', hideInfo);
    box.addEventListener('click', (e) => {
      const t = e.target.closest('.im-cell');
      if (!t) return;
      const key = t.dataset.region;
      if (level === 'country' && hasCounties(key)) {
        _drill = { province: key };
        if (opts && opts.onLevelChange) opts.onLevelChange();
        return;
      }
      if (level === 'country' && opts && opts.onRegionClick) opts.onRegionClick(key);
      /* سطح شهرستان: کلیک روی شهرستان → فیلتر با نام شهرستان */
      if (level === 'county' && opts && opts.onRegionClick) opts.onRegionClick(key, _drill.province);
    });
    el.addEventListener('click', (e) => {
      const fbtn = e.target.closest('[data-im-filter]');
      if (fbtn && opts && opts.onRegionClick) {
        if (level === 'county') opts.onRegionClick(fbtn.dataset.imFilter, _drill.province);
        else opts.onRegionClick(fbtn.dataset.imFilter);
        return;
      }
      const dbtn = e.target.closest('[data-im-drill]');
      if (dbtn) { _drill = { province: dbtn.dataset.imDrill }; if (opts && opts.onLevelChange) opts.onLevelChange(); return; }
      const back = e.target.closest('[data-im-back]');
      if (back) { _drill = null; if (opts && opts.onLevelChange) opts.onLevelChange(); }
    });
  }

  function resetLevel() { _drill = null; }
  function currentLevel() { return _drill ? { level: 'county', province: _drill.province } : { level: 'country', province: null }; }

  return { render, matchProvince, matchCounty, capitalOf, hasCounties, countiesOf, resetLevel, currentLevel, PROVINCES };
})();
