import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

/* =====================================================================
   票價守望 — 機票價格追蹤 App（單檔 React 元件）
   - 不依賴 Tailwind 或其他套件，樣式全部寫在下方 CSS 字串裡
   - 目前價格來自「示範資料引擎」(下方 DEMO ENGINE)，要接真實票價時，
     只需要替換 dayInfo() / lyDay() 這兩個函式的資料來源
   ===================================================================== */

/* ============================ 工具函式 ============================ */
const DAY = 864e5;
const p2 = (n) => String(n).padStart(2, "0");
const utc = (y, m, d) => Date.UTC(y, m, d);
const parse = (s) => { const a = s.split("-").map(Number); return utc(a[0], a[1] - 1, a[2]); };
const NOW = new Date();
const TODAY = utc(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const NDAYS = 400;
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const md = (ms) => { const d = new Date(ms); return d.getUTCMonth() + 1 + "/" + d.getUTCDate(); };
const mdw = (ms) => md(ms) + " 週" + WD[new Date(ms).getUTCDay()];
const ymd = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + "/" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
const ymOf = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1); };
const money = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const ymLabel = (ym) => { const a = ym.split("-"); return a[0] + "年" + Number(a[1]) + "月"; };
const monthObj = (ym) => { const a = ym.split("-").map(Number); return { ym, y: a[0], m: a[1] - 1, s: utc(a[0], a[1] - 1, 1), e: utc(a[0], a[1], 0) }; };
const MONTHS = (() => {
  const out = [], y = NOW.getFullYear(), m = NOW.getMonth();
  for (let i = 0; i < 12; i++) { const yy = y + Math.floor((m + i) / 12), mm = (m + i) % 12; out.push(monthObj(yy + "-" + p2(mm + 1))); }
  return out;
})();
/* 月份標籤：第一個月與每年 1 月顯示年份，例如「27年1月」 */
const mLabel = (mo, i) => (i === 0 || mo.m === 0 ? String(mo.y).slice(2) + "年" : "") + (mo.m + 1) + "月";
const winRange = (ym) => {
  if (!ym) return [0, 364];
  const o = monthObj(ym);
  return [Math.max(0, Math.round((o.s - TODAY) / DAY)), Math.min(NDAYS - 1, Math.round((o.e - TODAY) / DAY))];
};
const h32 = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0; };
const rnd = (s) => h32(s) / 4294967296;
const quant = (a, q) => { if (!a.length) return null; const x = (a.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return a[lo] + (a[hi] - a[lo]) * (x - lo); };

/* ============================ 航線資料 ============================ */
const AL = { JX: ["星宇航空", "星宇"], BR: ["長榮航空", "長榮"], CI: ["中華航空", "華航"], IT: ["台灣虎航", "虎航"], MM: ["樂桃航空", "樂桃"], GK: ["捷星日本", "捷星"], TR: ["酷航", "酷航"], "7C": ["濟州航空", "濟州"], AK: ["亞洲航空", "亞航"], CX: ["國泰航空", "國泰"], UA: ["聯合航空", "聯航"] };
const AF = { JX: 1.12, BR: 1.08, CI: 1.0, IT: 0.82, MM: 0.7, GK: 0.68, TR: 0.78, "7C": 0.75, AK: 0.7, CX: 1.05, UA: 1.1 };
/* 各航空公司「最遠開放到哪天」的預設值；個別航線可用 HZO 覆寫 */
const DEFH = { BR: "2027-08-17", CI: "2027-09-12", JX: "2027-06-27", IT: "2027-03-27", MM: "2027-03-27", GK: "2027-03-27", TR: "2027-05-14", "7C": "2027-03-27", AK: "2027-04-10", CX: "2027-09-14", UA: "2027-08-20" };
const HZO = { "RMQ-UKB": { JX: "2027-04-30" }, "TPE-CTS": { JX: "2027-04-30" }, "TPE-NGO": { IT: "2027-02-13" }, "KHH-KIX": { CI: "2027-06-05" } };
const CT = { TW: ["台灣", "台灣"], JP: ["日本", "東北亞"], KR: ["韓國", "東北亞"], HK: ["香港", "港澳"], TH: ["泰國", "東南亞"], VN: ["越南", "東南亞"], SG: ["新加坡", "東南亞"], MY: ["馬來西亞", "東南亞"], PH: ["菲律賓", "東南亞"], US: ["美國", "北美"], CA: ["加拿大", "北美"], GB: ["英國", "歐洲"], FR: ["法國", "歐洲"], AU: ["澳洲", "大洋洲"] };
const REGIONS = ["台灣", "東北亞", "港澳", "東南亞", "北美", "歐洲", "大洋洲"];
const AP = { TPE: ["台北桃園", "TW"], TSA: ["台北松山", "TW"], RMQ: ["台中", "TW"], KHH: ["高雄", "TW"], NRT: ["東京成田", "JP"], HND: ["東京羽田", "JP"], KIX: ["大阪關西", "JP"], UKB: ["神戶", "JP"], NGO: ["名古屋", "JP"], FUK: ["福岡", "JP"], CTS: ["札幌新千歲", "JP"], OKA: ["沖繩那霸", "JP"], ICN: ["首爾仁川", "KR"], GMP: ["首爾金浦", "KR"], PUS: ["釜山", "KR"], CJU: ["濟州", "KR"], HKG: ["香港", "HK"], BKK: ["曼谷", "TH"], CNX: ["清邁", "TH"], HKT: ["普吉", "TH"], SGN: ["胡志明市", "VN"], HAN: ["河內", "VN"], DAD: ["峴港", "VN"], SIN: ["新加坡", "SG"], KUL: ["吉隆坡", "MY"], BKI: ["亞庇", "MY"], MNL: ["馬尼拉", "PH"], CEB: ["宿霧", "PH"], LAX: ["洛杉磯", "US"], SFO: ["舊金山", "US"], JFK: ["紐約", "US"], SEA: ["西雅圖", "US"], YVR: ["溫哥華", "CA"], LHR: ["倫敦", "GB"], CDG: ["巴黎", "FR"], SYD: ["雪梨", "AU"] };
const RT = [
  "TPE NRT 3200 JX BR CI IT MM", "TPE HND 4200 JX BR CI", "TPE KIX 2900 JX BR CI IT MM GK", "TPE UKB 3300 JX IT", "TPE NGO 3300 JX BR CI IT", "TPE FUK 2700 JX BR CI IT", "TPE CTS 4500 JX BR CI IT", "TPE OKA 2300 JX BR CI IT MM",
  "TPE ICN 3000 BR CI IT 7C", "TPE GMP 3800 BR CI", "TPE PUS 2600 BR CI IT 7C", "TPE CJU 2800 CI IT 7C", "TPE HKG 1800 BR CI CX IT",
  "TPE BKK 3300 JX BR CI IT", "TPE CNX 3900 BR CI", "TPE HKT 4300 CI IT", "TPE SGN 2900 BR CI JX", "TPE HAN 3000 BR CI IT", "TPE DAD 3100 BR CI IT", "TPE SIN 3500 JX BR CI TR", "TPE KUL 3100 BR CI AK", "TPE BKI 3800 AK", "TPE MNL 2600 BR CI JX", "TPE CEB 3400 CI IT",
  "TPE LAX 8500 JX BR CI", "TPE SFO 9000 JX BR CI UA", "TPE JFK 11000 BR CI", "TPE SEA 9000 JX BR", "TPE YVR 9500 BR CI", "TPE LHR 11500 BR CI", "TPE CDG 12000 BR CI", "TPE SYD 9500 BR CI",
  "TSA HND 4300 BR CI JX", "TSA GMP 3900 BR CI",
  "RMQ UKB 3600 JX IT", "RMQ KIX 3200 IT JX", "RMQ OKA 2800 IT", "RMQ NRT 3700 IT", "RMQ HKG 2100 CI CX", "RMQ ICN 3300 IT 7C",
  "NRT KIX 2400 MM GK", "NRT CTS 2800 MM GK", "KIX CTS 3000 MM GK", "KIX OKA 2400 MM GK", "NRT OKA 3200 MM GK", "NRT ICN 3400 7C TR", "KIX ICN 3200 7C TR", "ICN CJU 1400 7C", "ICN PUS 1500 7C", "BKK CNX 1300 AK", "BKK HKT 1400 AK",
  "KHH KIX 3100 IT CI MM", "KHH NRT 3600 IT CI", "KHH OKA 2500 IT CI", "KHH FUK 3000 IT", "KHH ICN 3200 IT 7C", "KHH PUS 2800 IT 7C", "KHH HKG 1900 CI CX IT", "KHH BKK 3500 IT CI", "KHH SGN 3200 CI",
];
const FWD_ROUTES = RT.map((line) => {
  const a = line.split(" "), k = a[0] + "-" + a[1], als = a.slice(3), hz = {};
  als.forEach((x) => { hz[x] = parse((HZO[k] && HZO[k][x]) || DEFH[x]); });
  return { k, o: a[0], d: a[1], base: Number(a[2]), als, hz };
});
/* 每條航線都自動建立反方向（回程、國外出發都會用到） */
const ROUTES = FWD_ROUTES.concat(FWD_ROUTES.map((r) => ({ ...r, k: r.d + "-" + r.o, o: r.d, d: r.o })));
const routeOf = (o, d) => ROUTES.find((r) => r.k === o + "-" + d) || null;
const revOf = (R) => routeOf(R.d, R.o);
const destsFor = (o) => ROUTES.filter((r) => r.o === o).map((r) => r.d);
const countriesFor = (o) => {
  const set = {}; destsFor(o).forEach((d) => { set[AP[d][1]] = 1; });
  const out = []; REGIONS.forEach((rg) => Object.keys(CT).forEach((c) => { if (CT[c][1] === rg && set[c]) out.push(c); }));
  return out;
};
const routesOf = (o, kind, dest) => ROUTES.filter((r) => r.o === o && (kind === "airport" ? r.d === dest : AP[r.d][1] === dest));
const ORIG_CODES = Array.from(new Set(ROUTES.map((r) => r.o)));
const ORIG = {}; ORIG_CODES.forEach((c) => { ORIG[c] = AP[c][0]; });
/* 出發地依國家分組：台灣排第一 */
const ORIGIN_GROUPS = (() => {
  const out = [];
  REGIONS.forEach((rg) => Object.keys(CT).forEach((c) => { if (CT[c][1] === rg) { const list = ORIG_CODES.filter((o) => AP[o][1] === c); if (list.length) out.push([c, list]); } }));
  return out;
})();

/* ======================= DEMO ENGINE（示範資料） =======================
   下面這一段用「雜湊亂數」產生穩定的模擬票價。
   接真實資料時：讓 dayInfo() 的每個航空公司欄位改讀 API 結果、
   讓 lyDay() 改讀去年同期或歷史觀測值即可，其他計算都不用動。 */
const MF = [1.25, 1.35, 1, 1.15, 0.95, 0.95, 1.2, 1.25, 0.9, 1.1, 0.85, 1.05];
const CNY = { 2025: [124, 202], 2026: [213, 222], 2027: [204, 213] };
const DOWF = [1.15, 1, 0.9, 0.9, 0.98, 1.12, 1.05];
function seasonal(ms) {
  const d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(), k = m * 100 + dd, c = CNY[y];
  let f = MF[m - 1];
  if (c && k >= c[0] && k <= c[1]) f *= 1.35; else if (m === 12 && dd >= 23) f *= 1.15; else if (m === 10 && dd >= 8 && dd <= 11) f *= 1.12;
  return f;
}
const OPC = {};
function opDays(R, a) {
  const k = R.k + a; if (OPC[k]) return OPC[k];
  const trunk = (a === "BR" || a === "CI") && (R.o === "TPE" || R.d === "TPE");
  const f = trunk ? 7 : 3 + Math.floor(rnd("f" + k) * 5);
  const order = [0, 1, 2, 3, 4, 5, 6].map((d) => [rnd("d" + k + d), d]).sort((x, y) => x[0] - y[0]).slice(0, f).map((x) => x[1]);
  OPC[k] = new Set(order); return OPC[k];
}
function rawFare(R, a, ms, lead, tag) {
  const dow = new Date(ms).getUTCDay(), key = R.k + a + tag + ms;
  let p = R.base * AF[a] * seasonal(ms) * DOWF[dow];
  p *= 1 + (rnd("n" + key) - 0.5) * 0.26;
  if (rnd("s" + key) < 0.06) p *= 0.72;
  if (lead < 21) p *= 1 + ((21 - lead) / 21) * 0.35;
  if (tag) p *= 0.93;
  return Math.round(p / 10) * 10;
}
const offKey = (off) => (off && off.size ? Array.from(off).sort().join(",") : "");
function dayInfo(R, ms, off) {
  const dow = new Date(ms).getUTCDay(), lead = (ms - TODAY) / DAY;
  let p = null, al = null, closed = false; const list = [];
  R.als.forEach((a) => {
    const op = opDays(R, a).has(dow); let st, price = null;
    if (!op) st = "none"; else if (ms > R.hz[a]) st = "closed"; else { st = "ok"; price = rawFare(R, a, ms, lead, ""); }
    list.push({ a, st, price });
    if (off && off.has(a)) return;
    if (st === "ok" && (p === null || price < p)) { p = price; al = a; }
    if (st === "closed") closed = true;
  });
  return { ms, p, al, closed, list };
}
function lyDay(R, ms) {
  const s = ms - 364 * DAY, dow = new Date(s).getUTCDay(); let best = null;
  R.als.forEach((a) => { if (!opDays(R, a).has(dow)) return; const p = rawFare(R, a, s, 30, "ly"); if (best === null || p < best) best = p; });
  return best;
}
/* ======================= /DEMO ENGINE ======================= */

const IDX = new Map();
function getIndex(R, off) {
  const key = R.k + "|" + offKey(off); let a = IDX.get(key); if (a) return a;
  a = []; for (let i = 0; i < NDAYS; i++) a.push(dayInfo(R, TODAY + i * DAY, off));
  IDX.set(key, a); return a;
}
/* 來回：去程第 i 天 + 回程第 i+N 天（N = 停留天數）。N = 0 代表單程 */
const IDXT = new Map();
function getIndexT(R, off, N) {
  if (!N) return getIndex(R, off);
  const key = R.k + "|" + offKey(off) + "|" + N; let a = IDXT.get(key); if (a) return a;
  const Rb = revOf(R), A = getIndex(R, off), B = Rb ? getIndex(Rb, off) : null; a = [];
  for (let i = 0; i < NDAYS; i++) {
    const o = A[i], b = B && i + N < NDAYS ? B[i + N] : null;
    if (!b) { a.push({ ms: o.ms, p: null, al: null, al2: null, closed: false, list: o.list, listIn: [] }); continue; }
    const ok = o.p != null && b.p != null;
    const closed = ok ? o.closed || b.closed : (o.p != null || o.closed) && (b.p != null || b.closed);
    a.push({ ms: o.ms, p: ok ? o.p + b.p : null, al: o.al, al2: b.al, closed, list: o.list, listIn: b.list });
  }
  IDXT.set(key, a); return a;
}
function lyDayT(R, ms, N) {
  if (!N) return lyDay(R, ms);
  const Rb = revOf(R), a = lyDay(R, ms), b = Rb ? lyDay(Rb, ms + N * DAY) : null;
  return a != null && b != null ? a + b : null;
}
const LYC = new Map();
function lySeries(Rs, ym, N) {
  const key = Rs.map((r) => r.k).join("+") + "|" + (ym || "") + "|" + N; const c = LYC.get(key); if (c) return c;
  const r = winRange(ym), out = [];
  for (let i = r[0]; i <= r[1]; i++) {
    const ms = TODAY + i * DAY; let best = null;
    Rs.forEach((R) => { const p = lyDayT(R, ms, N); if (p != null && (best === null || p < best)) best = p; });
    if (best != null) out.push(best);
  }
  LYC.set(key, out); return out;
}
function fwdSeries(Rs, ym, off, N) {
  const r = winRange(ym), out = [];
  for (let i = r[0]; i <= r[1]; i++) {
    let best = null;
    Rs.forEach((R) => { const di = getIndexT(R, off, N)[i]; if (di.p != null && (!best || di.p < best.p)) best = { p: di.p, al: di.al, al2: di.al2 || null, rk: R.k, i }; });
    if (best) out.push(best);
  }
  return out;
}
function stats(Rs, ym, off, N = 0) {
  const f = fwdSeries(Rs, ym, off, N), l = lySeries(Rs, ym, N).slice().sort((a, b) => a - b);
  const ps = f.map((x) => x.p).sort((a, b) => a - b); let cur = null;
  f.forEach((x) => { if (!cur || x.p < cur.p) cur = x; });
  return { cur, med: ps.length ? quant(ps, 0.5) : null, lyMed: l.length ? quant(l, 0.5) : null, lyMin: l.length ? l[0] : null, p10: l.length ? Math.round(quant(l, 0.1) / 10) * 10 : null, n: f.length };
}
function verdict(p, st) {
  if (p == null || st.lyMin == null) return null;
  if (p <= st.lyMin) return { label: "低於去年同期最低", cls: "v0" };
  if (st.p10 != null && p <= st.p10) return { label: "統計低檔以下", cls: "v1" };
  if (p <= st.lyMed) return { label: "一般", cls: "v2" };
  return { label: "偏貴", cls: "v3" };
}
function closedList(R, ym, N = 0) {
  const out = [], maxHz = Math.max(...R.als.map((a) => R.hz[a]));
  if (ym) {
    const o = monthObj(ym);
    R.als.forEach((a) => { const hz = R.hz[a]; if (hz < o.e) out.push({ a, hz, none: hz < o.s }); });
    if (N) R.als.forEach((a) => { const hz = R.hz[a]; if (!out.some((x) => x.a === a) && hz < o.e + N * DAY) out.push({ a, hz, none: hz < o.s + N * DAY, ret: true }); });
  } else R.als.forEach((a) => { const hz = R.hz[a]; if (hz < maxHz - 7 * DAY) out.push({ a, hz, none: false }); });
  return out;
}
function closedMsg(R, c, ym, withAp) {
  const nm = AL[c.a][0], ap = (withAp ? AP[R.d][0] + " " : "") + (c.ret ? "回程 " : "");
  if (c.ret && c.none) return ap + nm + "尚未更新回程日期的班次";
  if (ym && c.none) { const o = monthObj(ym); return ap + nm + "尚未更新 " + o.y + "年" + (o.m + 1) + "月班次"; }
  return ap + nm + "只更新到 " + ymd(c.hz);
}
/* 顏色分 4 級：便宜（淺藍）→ 較便宜（藍）→ 偏貴（淺橘紅）→ 最貴（深橘紅） */
const thr = (idx) => { const a = []; for (let i = 0; i < 365; i++) if (idx[i].p != null) a.push(idx[i].p); a.sort((x, y) => x - y); return [quant(a, 0.2), quant(a, 0.5), quant(a, 0.8)]; };
const heat = (p, t) => (p <= t[0] ? 0 : p <= t[1] ? 1 : p <= t[2] ? 2 : 3);
const MMC = new Map();
function monthMins(R, N = 0) {
  const ck = R.k + "|" + N, c0 = MMC.get(ck); if (c0) return c0;
  const idx = getIndexT(R, null, N);
  const c = MONTHS.map((mo) => {
    const r = winRange(mo.ym); let p = null, at = null;
    for (let i = r[0]; i <= r[1]; i++) { const x = idx[i].p; if (x != null && (p === null || x < p)) { p = x; at = i; } }
    return { ym: mo.ym, m: mo.m, p, i: at };
  });
  MMC.set(ck, c); return c;
}
const alTxt = (c) => (c && c.al ? AL[c.al][1] + (c.al2 && c.al2 !== c.al ? "／" + AL[c.al2][1] : "") : "");
const tripDates = (ms, N) => (N ? mdw(ms) + " 去 " + md(ms + N * DAY) + " 回" : mdw(ms));

/* ======================= 多地點行程 ======================= */
function legInfo(L) {
  const R = routeOf(L.o, L.d);
  if (!R) return { L, st: "noroute", cls: [] };
  const i = Math.round((L.ms - TODAY) / DAY);
  if (i < 0 || i >= NDAYS) return { L, R, st: "past", cls: [] };
  const idx = getIndex(R, null), di = idx[i], st = di.p != null ? "ok" : di.closed ? "closed" : "none";
  let alt = null;
  for (let k = Math.max(0, i - 3); k <= Math.min(NDAYS - 1, i + 3); k++) { const x = idx[k]; if (x.p != null && (alt === null || x.p < alt.p)) alt = { p: x.p, i: k }; }
  const dow = new Date(L.ms).getUTCDay();
  const cls = R.als.filter((a) => opDays(R, a).has(dow) && L.ms > R.hz[a]);
  return { L, R, i, di, st, alt, ly: lyDay(R, L.ms), cls };
}
function mcStats(legs) {
  const infos = legs.map(legInfo), ok = infos.length > 0 && infos.every((x) => x.st === "ok");
  const lys = infos.map((x) => x.ly), lyOk = lys.length > 0 && lys.every((v) => v != null);
  const ly = lyOk ? lys.reduce((a, b) => a + b, 0) : null;
  return { cur: ok ? { p: infos.reduce((a, x) => a + x.di.p, 0), mc: true } : null, infos, med: null, lyMed: ly, lyMin: ly, p10: null, n: ok ? 1 : 0 };
}
function firstAvail(o, d, ms) {
  const R = routeOf(o, d); let m = Math.max(ms, TODAY); if (!R) return m;
  for (let k = 0; k < 21; k++) { const i = Math.round((m - TODAY) / DAY); if (i >= NDAYS) break; if (getIndex(R, null)[i].p != null) return m; m += DAY; }
  return Math.max(ms, TODAY);
}
function defaultLegs() {
  const a = firstAvail("TPE", "NRT", TODAY + 40 * DAY), b = firstAvail("NRT", "KIX", a + 4 * DAY), c = firstAvail("KIX", "TPE", b + 4 * DAY);
  return [{ o: "TPE", d: "NRT", ms: a }, { o: "NRT", d: "KIX", ms: b }, { o: "KIX", d: "TPE", ms: c }];
}
const legsTitle = (legs) => {
  let s = "";
  legs.forEach((L, i) => {
    if (i === 0) s = AP[L.o][0] + " → " + AP[L.d][0];
    else if (legs[i - 1].d === L.o) s += " → " + AP[L.d][0];
    else s += "、" + AP[L.o][0] + " → " + AP[L.d][0];
  });
  return s;
};
const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ============================ 追蹤邏輯 ============================ */
const stayOf = (w) => (w.trip === "rt" ? w.stay || 5 : 0);
const wTitle = (w) => {
  if (w.trip === "mc") return legsTitle(w.legs || []);
  return ORIG[w.o] + (w.trip === "rt" ? " ⇄ " : " → ") + (w.kind === "airport" ? AP[w.dest][0] : CT[w.dest][0] + "（全部機場）");
};
const wPeriod = (w) => {
  if (w.trip === "mc") return "多地點　" + (w.legs || []).map((L) => md(L.ms)).join("、");
  return (w.trip === "rt" ? "來回　停留 " + (w.stay || 5) + " 天　" : "單程　") + (w.ym ? ymLabel(w.ym) : "不限時間（未來 12 個月）");
};
const ruleName = (r) => (r === "stat" ? "統計低檔" : r === "ly" ? "去年同期最低" : "自訂金額");
const targetOf = (rule, custom, st) => (rule === "stat" ? st.p10 : rule === "ly" ? st.lyMin : custom || null);
function statusOf(st, target) {
  if (!st.cur) return "wait";
  if (target == null) return "far";
  return st.cur.p <= target ? "hit" : st.cur.p <= target * 1.08 ? "near" : "far";
}
function wview(w) {
  if (w.trip === "mc") {
    const st = mcStats(w.legs || []), rule = w.rule === "stat" ? "ly" : w.rule, target = targetOf(rule, w.custom, st), cl = [];
    st.infos.forEach((x, i) => {
      const t = "第 " + (i + 1) + " 段 ";
      if (x.st === "closed") x.cls.forEach((a) => cl.push(t + AL[a][0] + "尚未更新 " + md(x.L.ms) + " 的班次"));
      else if (x.st === "none") cl.push(t + md(x.L.ms) + " 沒有航班");
      else if (x.st === "noroute") cl.push(t + "示範資料沒有這條航線");
      else if (x.st === "past") cl.push(t + "日期已過");
    });
    return { w, Rs: [], st, target, status: statusOf(st, target), cl, rule };
  }
  const N = stayOf(w), Rs = routesOf(w.o, w.kind, w.dest), st = stats(Rs, w.ym, null, N), target = targetOf(w.rule, w.custom, st);
  const cl = []; Rs.forEach((R) => closedList(R, w.ym, N).forEach((c) => cl.push(closedMsg(R, c, w.ym, w.kind === "country"))));
  return { w, Rs, st, target, status: statusOf(st, target), cl, rule: w.rule };
}
const PILL = { hit: "已到最低價格", near: "接近預期價", far: "尚未到價", wait: "尚未開賣" };
const newId = () => "w" + Date.now().toString(36) + Math.floor(Math.random() * 1000);

/* ============================ 儲存 ============================ */
const STORAGE_KEY = "flight-watch:v1";
const DEFAULT_NOTIFY = { email: { on: false, address: "" }, line: { on: false, userId: "" }, hour: 8, onNear: false, onlyLower: true };
const store = {
  async load() {
    try { if (typeof window !== "undefined" && window.storage && window.storage.get) { const r = await window.storage.get(STORAGE_KEY); if (r && r.value) return JSON.parse(r.value); } } catch (e) { /* 沒有資料或不支援 */ }
    try { const v = window.localStorage.getItem(STORAGE_KEY); if (v) return JSON.parse(v); } catch (e) { /* 忽略 */ }
    return null;
  },
  async save(data) {
    const s = JSON.stringify(data);
    try { if (typeof window !== "undefined" && window.storage && window.storage.set) { await window.storage.set(STORAGE_KEY, s); return; } } catch (e) { /* 改用 localStorage */ }
    try { window.localStorage.setItem(STORAGE_KEY, s); } catch (e) { /* 忽略 */ }
  },
};

/* ======================= LIVE DATA（後端保護層） =======================
   這一段只對「每日票價」畫面的當月格子生效，其餘畫面（探索、多地點、
   統計低檔、去年同期）仍固定用上面的 DEMO ENGINE，理由寫在對應位置。

   後端（/api/status、/api/calendar）不是這個檔案的一部分，是搭配的
   Cloudflare Pages Functions；沒有部署那組後端時，下面兩個 fetch 都會
   失敗或逾時，App 會自動、安靜地維持在示範資料模式，行為跟以前一樣。
   ======================= LIVE DATA ======================= */
async function fetchJSON(url, ms) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status); return j; }
  finally { clearTimeout(t); }
}
async function fetchLiveStatus() {
  try { return await fetchJSON("/api/status", 4000); } catch (e) { return null; }
}
const LIVE_CACHE = new Map();
function fetchLiveMonth(origin, destination, ym) {
  const key = origin + "-" + destination + "-" + ym;
  if (LIVE_CACHE.has(key)) return LIVE_CACHE.get(key);
  const p = fetchJSON(`/api/calendar?origin=${origin}&destination=${destination}&month=${ym}`, 9000)
    .then((j) => { if (!j || !j.days) throw new Error("empty"); return j; });
  LIVE_CACHE.set(key, p);
  p.catch(() => LIVE_CACHE.delete(key));
  return p;
}
const dkey = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); };
/* 從當月即時資料自己算便宜／貴的門檻，跟 DEMO 的 thr() 分開算，因為
   即時資料通常只有一個月、樣本數很少，混在一起算會失真。 */
function liveThr(days) {
  const vals = Object.values(days).map((l) => l[0].price).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  return [quant(vals, 0.2), quant(vals, 0.5), quant(vals, 0.8)];
}

/* ---- 撿便宜：後端 hunts／deals CRUD（同樣是選配；沒有後端就整個畫面顯示提示） ---- */
async function fetchHunts() { return fetchJSON("/api/hunts", 6000); }
async function createHunt(payload) {
  return fetchJSON2("/api/hunts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}
async function deleteHunt(id) { return fetchJSON2("/api/hunts?id=" + encodeURIComponent(id), { method: "DELETE" }); }
async function fetchDeals(huntId) { return fetchJSON("/api/deals" + (huntId ? "?huntId=" + encodeURIComponent(huntId) : ""), 6000); }
async function fetchJSON2(url, opts) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status); return j; }
  finally { clearTimeout(t); }
}

/* ============================ 樣式 ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap');
.fw-root{
  --fuji:#3F73B5;--fuji-deep:#2F5C96;--fuji-mid:#8DB0DC;--fuji-soft:#DCE9F7;--fuji-mist:#EEF4FB;
  --snow:#FFFFFF;--warm:#F6F2EE;--warm-line:#E7E1DA;--warm-deep:#D9D1C8;
  --ink:#4B4540;--muted:#8B837B;
  --c0:#EAF3FC;--c0t:#2F5C96;--c1:#CFE1F5;--c1t:#2A4E7C;--c2:#F3DCCB;--c2t:#6A4A35;--c3:#E9AE93;--c3t:#5E3524;
  --p0:#3F73B5;--p0t:#FFFFFF;--p1:#8DB0DC;--p1t:#23466F;--p2:#EEF1F4;--p2t:#4B4540;--p3:#F3DCCB;--p3t:#6A4A35;
  --warn:#FFF1D0;--warn-t:#8A5A00;--dot:#E0A020;
  position:relative;min-height:100vh;box-sizing:border-box;color:var(--ink);
  font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:400;line-height:1.6;font-size:15px;
  background:linear-gradient(180deg,#DCE9F7 0,#EAF2FB 260px,#F6F2EE 640px,#F6F2EE 100%);
  padding-top:env(safe-area-inset-top,0px);-webkit-text-size-adjust:100%;
}
.fw-root *,.fw-root *::before,.fw-root *::after{box-sizing:border-box}
.fw-root button,.fw-root select,.fw-root input{font:inherit;color:inherit}
.fw-root button{cursor:pointer}
.fw-root :focus-visible{outline:3px solid var(--fuji-mid);outline-offset:2px}
.fw-bg{position:absolute;left:0;right:0;top:0;height:300px;overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(#000 35%,transparent 100%);mask-image:linear-gradient(#000 35%,transparent 100%)}
.fw-bg svg{position:absolute;left:50%;top:0;transform:translateX(-50%);width:max(100%,430px);height:300px}
.fw-shell{position:relative;max-width:430px;margin:0 auto;padding:16px 16px calc(132px + env(safe-area-inset-bottom,0px))}
.fw-head{display:flex;flex-direction:column;gap:10px;margin-bottom:10px}
.fw-title{margin:0;font-size:26px;line-height:1.2;font-weight:700;color:var(--fuji-deep);letter-spacing:.06em;white-space:nowrap}
.fw-sub{margin:2px 0 0;font-size:13px;color:var(--muted)}
.fw-selw{position:relative;display:inline-block;max-width:100%}
.fw-selw::after{content:"";position:absolute;right:14px;top:50%;width:7px;height:7px;border-right:2.5px solid var(--fuji);border-bottom:2.5px solid var(--fuji);transform:translateY(-70%) rotate(45deg);pointer-events:none}
.fw-select{appearance:none;-webkit-appearance:none;background:var(--snow);border:2px solid var(--fuji-soft);border-radius:999px;padding:8px 36px 8px 16px;min-height:42px;font-weight:700;max-width:100%}
.fw-selw.block,.fw-selw.block .fw-select{width:100%}
.fw-lab{display:block;font-size:12.5px;color:var(--muted);margin:0 0 4px 6px}
.fw-demo{margin:0 0 14px;padding:8px 14px;border-radius:22px;background:var(--snow);border:2px dashed var(--fuji-mid);font-size:12.5px;color:var(--fuji-deep);text-align:center}
.fw-h2{margin:6px 0 2px;font-size:19px;font-weight:700;color:var(--ink)}
.fw-lead{margin:0 0 12px;font-size:13.5px;color:var(--muted)}
.fw-card{background:var(--snow);border-radius:24px;padding:16px;margin:0 0 14px;box-shadow:0 8px 22px rgba(63,115,181,.10);border:2px solid #fff}
.fw-card h3{margin:0 0 4px;font-size:16px;font-weight:700}
.fw-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;background:var(--fuji-soft);border-radius:999px;margin:0 0 14px}
.fw-seg button{border:0;background:transparent;border-radius:999px;padding:9px 6px;font-weight:700;color:var(--fuji-deep);min-height:42px}
.fw-seg button[aria-pressed="true"]{background:var(--snow);box-shadow:0 2px 8px rgba(63,115,181,.18)}
.fw-seg.three{grid-template-columns:repeat(3,1fr)}
.fw-tripbar{margin:0 0 4px}
.fw-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 10px}
.fw-legh{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px}
.fw-legh h3{margin:0}
.fw-btn.sm{min-height:34px;padding:2px 14px;font-size:13px}
.fw-legres{margin:10px 0 0;padding:8px 14px;border-radius:16px;background:var(--fuji-mist);font-size:13.5px}
.fw-legres b{color:var(--fuji-deep);font-size:16px}
.fw-total{font-size:26px;font-weight:700;color:var(--fuji-deep);margin:0 0 4px}
.fw-seg small{display:block;font-size:11px;font-weight:500;color:var(--muted);line-height:1.2}
.fw-hscroll{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 10px;margin:0 -2px;scrollbar-width:none}
.fw-hscroll::-webkit-scrollbar{display:none}
.fw-chip{flex:0 0 auto;border:2px solid var(--fuji-soft);background:var(--snow);border-radius:999px;padding:6px 15px;min-height:38px;font-weight:700;font-size:14px;color:var(--fuji-deep)}
.fw-chip[aria-pressed="true"]{background:var(--fuji);border-color:var(--fuji);color:#fff}
.fw-mchip{flex:0 0 auto;min-width:84px;border:2px solid transparent;border-radius:10px;background:var(--snow);padding:6px 10px 7px;text-align:left;position:relative;box-shadow:inset 0 0 0 1px rgba(63,115,181,.14)}
.fw-mchip.t0{background:var(--c0);color:var(--c0t)}.fw-mchip.t1{background:var(--c1);color:var(--c1t)}.fw-mchip.t2{background:var(--c2);color:var(--c2t)}.fw-mchip.t3{background:var(--c3);color:var(--c3t)}
.fw-mchip .mm{display:block;font-size:12px;opacity:.85}
.fw-mchip b{display:block;font-size:15px}
.fw-mchip[aria-pressed="true"]{border-color:var(--fuji-deep);box-shadow:0 0 0 2px #fff,0 0 0 4px var(--fuji-mid)}
.fw-mchip .pd{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 1.5px #fff}
.fw-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}
.fw-stat{background:var(--snow);border-radius:20px;padding:10px 12px;box-shadow:0 6px 16px rgba(63,115,181,.08);min-width:0}
.fw-stat small{display:block;font-size:11.5px;color:var(--muted);line-height:1.35}
.fw-stat b{display:block;font-size:16px;font-weight:700;white-space:nowrap;color:var(--fuji-deep)}
.fw-stat span{display:block;font-size:11.5px;color:var(--muted);line-height:1.35;margin-top:2px}
.fw-btns{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.fw-btn{border:2px solid var(--fuji-soft);background:var(--snow);border-radius:999px;padding:9px 18px;min-height:44px;font-weight:700;color:var(--fuji-deep)}
.fw-btn.pri{background:var(--fuji);border-color:var(--fuji);color:#fff}
.fw-btn.ghost{background:transparent;border-color:var(--warm-deep);color:var(--muted)}
.fw-btn:disabled{opacity:.4}
.fw-calhead{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px}
.fw-calhead h3{margin:0;font-size:18px}
.fw-calhead .fw-btn{min-width:44px;padding:6px 12px}
.fw-dow,.fw-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.fw-dow{margin-bottom:4px;text-align:center;font-size:12px;color:var(--muted)}
.fw-cell{aspect-ratio:1/1.1;border:0;border-radius:14px;padding:4px 4px 5px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;position:relative;text-align:left;min-width:0}
.fw-cell .dn{font-size:11px;opacity:.85}
.fw-cell.c0 .pr,.fw-cell.c1 .pr{color:var(--fuji-deep)}
.fw-cell .pr{font-size:11.5px;font-weight:700;align-self:flex-end;letter-spacing:-.03em}
.fw-cell.c0{background:var(--c0);color:var(--c0t)}.fw-cell.c1{background:var(--c1);color:var(--c1t)}.fw-cell.c2{background:var(--c2);color:var(--c2t)}.fw-cell.c3{background:var(--c3);color:var(--c3t)}
.fw-cell.c0,.fw-cell.c1{box-shadow:inset 0 0 0 1px rgba(63,115,181,.18)}
.fw-cell.low{box-shadow:inset 0 0 0 2.5px var(--fuji-deep)}
.fw-cell.sel{box-shadow:0 0 0 2px #fff,0 0 0 5px var(--fuji-mid)}
.fw-cell.low.sel{box-shadow:inset 0 0 0 2.5px var(--fuji-deep),0 0 0 2px #fff,0 0 0 5px var(--fuji-mid)}
.fw-cell.closed{background:repeating-linear-gradient(135deg,var(--warm-line) 0 4px,#fff 4px 8px);color:var(--muted)}
.fw-cell.closed .pr{font-size:10px;font-weight:500}
.fw-cell.none{background:transparent;border:2px dashed var(--warm-line);color:var(--muted)}
.fw-cell.past{opacity:.3;pointer-events:none;background:transparent}
.fw-cell.blank{visibility:hidden}
.fw-cell .dot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--dot)}
.fw-cell .dot.live{background:var(--fuji);box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.fw-livebar{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:0 0 12px;padding:8px 14px;border-radius:16px;background:var(--fuji-mist);font-size:12.5px;color:var(--fuji-deep)}
.fw-livebar.locked,.fw-livebar.err{background:var(--warn);color:var(--warn-t)}
.fw-livebar b{font-weight:700}
.fw-legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:12px 0 0;font-size:12px;color:var(--muted)}
.fw-legend .sw{display:inline-flex;gap:2px;vertical-align:middle}
.fw-legend .sw i{width:16px;height:12px;border-radius:4px;display:inline-block}
.fw-legend .k{display:inline-block;width:14px;height:12px;border-radius:4px;vertical-align:middle;margin-right:4px}
.fw-notice{margin:0 0 14px;padding:12px 16px;border-radius:20px;background:var(--warn);color:var(--warn-t);font-size:13.5px}
.fw-notice div{margin:0 0 2px}
.fw-notice p{margin:6px 0 0;font-size:12.5px}
.fw-dl{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:2px dotted var(--warm-line);font-size:14.5px}
.fw-dl:last-child{border-bottom:0}
.fw-dl .best{font-weight:700;color:var(--fuji)}
.fw-dl.off{opacity:.5}
.fw-hz-row{display:grid;grid-template-columns:88px 1fr;gap:4px 10px;align-items:center;padding:6px 0}
.fw-hz-name{display:flex;align-items:center;gap:6px;font-size:14px}
.fw-hz-name input{width:18px;height:18px;accent-color:var(--fuji)}
.fw-hz-track{height:14px;border-radius:7px;background:repeating-linear-gradient(135deg,var(--warm-line) 0 4px,#fff 4px 8px);position:relative;overflow:hidden}
.fw-hz-fill{position:absolute;left:0;top:0;bottom:0;background:var(--fuji-mid);border-radius:7px}
.fw-hz-note{grid-column:2;font-size:12px;color:var(--muted)}
.fw-hz-axis{display:grid;grid-template-columns:88px 1fr;gap:10px}
.fw-hz-axis div{display:grid;grid-template-columns:repeat(12,1fr);font-size:11px;color:var(--muted);text-align:center}
.fw-list{background:var(--snow);border-radius:24px;box-shadow:0 8px 22px rgba(63,115,181,.10);overflow:hidden;margin:0 0 14px}
.fw-grp{display:flex;justify-content:space-between;padding:9px 18px;background:var(--fuji-mist);font-size:13px;font-weight:700;color:var(--fuji-deep)}
.fw-row{display:grid;grid-template-columns:1fr auto;align-items:center;border-top:2px dotted var(--warm-line)}
.fw-grp+.fw-row{border-top:0}
.fw-row-main{display:grid;grid-template-columns:1fr auto;gap:4px 10px;background:none;border:0;padding:13px 4px 13px 18px;text-align:left;width:100%}
.fw-row-main .nm{font-weight:700;font-size:16px}
.fw-row-main .nm small{font-weight:500;color:var(--muted);font-size:12.5px;margin-left:6px}
.fw-row-main .pz{font-size:20px;font-weight:700;text-align:right;line-height:1.2;color:var(--fuji-deep)}
.fw-row-main .pz small{font-size:11.5px;color:var(--muted);font-weight:500;display:block}
.fw-row-main .mt{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:12.5px;color:var(--muted)}
.fw-wn .ln{display:block}
.fw-wn{grid-column:1/-1;font-size:12.5px;color:var(--warn-t);background:var(--warn);border-radius:14px;padding:6px 12px}
.fw-star{width:48px;height:48px;margin-right:8px;border:0;background:none;color:var(--fuji-mid);display:grid;place-items:center;border-radius:50%}
.fw-star svg{width:24px;height:24px}
.fw-pill{display:inline-block;padding:1px 10px;border-radius:999px;font-size:12px;font-weight:700;line-height:21px}
.fw-pill.v0{background:var(--p0);color:var(--p0t)}.fw-pill.v1{background:var(--p1);color:var(--p1t)}.fw-pill.v2{background:var(--p2);color:var(--p2t)}.fw-pill.v3{background:var(--p3);color:var(--p3t)}
.fw-pill.hit{background:var(--fuji);color:#fff}.fw-pill.near{background:var(--warn);color:var(--warn-t)}.fw-pill.far{background:var(--warm);color:var(--muted)}.fw-pill.wait{background:var(--warn);color:var(--warn-t)}
.fw-bars{display:inline-flex;align-items:flex-end;gap:2px;height:30px}
.fw-bars .b{display:block;width:6px;background:var(--c1);border-radius:3px 3px 0 0}
.fw-bars .b.lo{background:var(--fuji)}
.fw-bars .b.nb{height:8px;background:repeating-linear-gradient(135deg,var(--warm-line) 0 2px,#fff 2px 4px);border:1px solid var(--warm-line)}
.fw-empty{padding:28px 18px;text-align:center;color:var(--muted);background:var(--snow);border:2px dashed var(--fuji-mid);border-radius:24px;margin:0 0 14px}
.fw-empty p{margin:0 0 12px}
.fw-wc{background:var(--snow);border-radius:24px;padding:16px;margin:0 0 14px;box-shadow:0 8px 22px rgba(63,115,181,.10);border:2px solid #fff}
.fw-wc.hit{border-color:var(--fuji)}
.fw-wc-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.fw-wc-head h3{margin:0;font-size:17px}
.fw-wc-head p{margin:0;font-size:12.5px;color:var(--muted)}
.fw-wc-nums{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 4px}
.fw-wc-nums small{display:block;font-size:12px;color:var(--muted)}
.fw-wc-nums b{display:block;font-size:22px;font-weight:700;line-height:1.25;color:var(--fuji-deep)}
.fw-wc-nums span{font-size:12px;color:var(--muted)}
.fw-spark{width:100%;height:64px;display:block;margin:6px 0 2px}
.fw-spark .ln{fill:none;stroke:var(--ink);stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.fw-spark .tg{stroke:var(--fuji);stroke-width:1.6;stroke-dasharray:4 3}
.fw-spark .pt{fill:var(--fuji)}
.fw-wc-ref{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--muted);margin:4px 0 8px}
.fw-wc-ref b{color:var(--ink)}
.fw-rules{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.fw-rules .fw-chip{min-height:34px;padding:4px 13px;font-size:13px}
.fw-input{width:100%;border:2px solid var(--fuji-soft);border-radius:16px;padding:10px 14px;background:var(--snow);min-height:44px}
.fw-input.sm{width:110px;min-height:36px;padding:4px 12px}
.fw-note{margin:6px 0;padding:8px 14px;border-radius:16px;background:var(--warn);color:var(--warn-t);font-size:12.5px}
.fw-note div{margin:1px 0}
.fw-wc-act{display:flex;gap:8px;margin-top:8px}
.fw-wc-act .fw-btn{min-height:38px;padding:4px 16px;font-size:13.5px}
.fw-field{margin:0 0 12px}
.fw-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:2px dotted var(--warm-line)}
.fw-toggle:last-child{border-bottom:0}
.fw-toggle span small{display:block;font-size:12px;color:var(--muted);font-weight:500}
.fw-switch{flex:0 0 auto;width:52px;height:30px;border-radius:999px;border:0;background:var(--warm-deep);position:relative;transition:background .15s}
.fw-switch::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.fw-switch[aria-checked="true"]{background:var(--fuji)}
.fw-switch[aria-checked="true"]::after{transform:translateX(22px)}
.fw-kv dt{font-size:12.5px;color:var(--muted);margin-top:10px}
.fw-kv dd{margin:0;font-size:14.5px}
.fw-help{font-size:12.5px;color:var(--muted);margin:6px 0 0}
.fw-nav{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));width:calc(100% - 20px);max-width:460px;height:68px;border-radius:34px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(47,92,150,.22);border:2px solid #fff;display:grid;grid-template-columns:1fr 1fr 1fr 66px 1fr 1fr 1fr;align-items:center;z-index:10;padding:0 4px}
.fw-navbtn{position:relative;border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 0;color:var(--muted);font-size:10.5px;font-weight:700;border-radius:20px}
.fw-navbtn svg{width:21px;height:21px}
.fw-navbtn[aria-current="page"]{color:var(--fuji)}
.fw-navbtn[aria-current="page"] .ic{background:var(--fuji-soft)}
.fw-navbtn .ic{display:grid;place-items:center;width:38px;height:26px;border-radius:13px}
.fw-fab{justify-self:center;width:54px;height:54px;border-radius:50%;border:4px solid #fff;background:var(--fuji);color:#fff;display:grid;place-items:center;transform:translateY(-14px);box-shadow:0 8px 20px rgba(47,92,150,.35)}
.fw-fab svg{width:25px;height:25px}
.fw-badge{position:absolute;top:0;right:calc(50% - 21px);min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dot);color:#fff;font-size:10px;line-height:16px;text-align:center}
.fw-ov{position:fixed;inset:0;background:rgba(47,70,100,.4);z-index:30;display:flex;align-items:flex-end;justify-content:center}
.fw-sheet{width:100%;max-width:430px;max-height:92%;overflow:auto;background:var(--warm);border-radius:32px 32px 0 0;padding:14px 18px calc(20px + env(safe-area-inset-bottom,0px));font-family:inherit}
.fw-grab{width:44px;height:5px;border-radius:3px;background:var(--warm-deep);margin:0 auto 12px}
.fw-sheet h2{margin:0 0 10px;font-size:20px}
.fw-opt{border:2px solid var(--fuji-soft);background:var(--snow);border-radius:20px;padding:10px 14px;margin:0 0 8px}
.fw-opt.on{border-color:var(--fuji);background:var(--fuji-mist)}
.fw-opt-btn{display:block;width:100%;text-align:left;background:none;border:0;padding:0}
.fw-opt b{display:flex;justify-content:space-between;gap:8px}
.fw-opt span.s{display:block;font-size:12.5px;color:var(--muted);font-weight:500}
.fw-preview{margin:10px 0 4px;padding:10px 14px;border-radius:18px;background:var(--fuji-soft);font-size:13.5px}
.fw-preview.ok{background:var(--fuji);color:#fff}
.fw-sheet .fw-btns{margin:14px 0 0;justify-content:flex-end}
.fw-ta{width:100%;min-height:180px;border:2px solid var(--fuji-soft);border-radius:16px;padding:10px;background:var(--snow);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.fw-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(100px + env(safe-area-inset-bottom,0px));background:var(--ink);color:#fff;padding:9px 18px;border-radius:999px;font-size:13.5px;z-index:40;max-width:calc(100% - 40px)}
@media (prefers-reduced-motion:reduce){.fw-switch,.fw-switch::after{transition:none}}
.fw-titlebtn{background:none;border:0;padding:0;text-align:left;cursor:pointer;border-radius:10px;align-self:flex-start}
.fw-titlebtn:hover .fw-title{text-decoration:underline}
.fw-gear{width:40px;height:40px;flex:0 0 auto;border-radius:50%;border:2px solid var(--fuji-soft);background:var(--snow);color:var(--fuji-deep);display:grid;place-items:center}
.fw-gear svg{width:20px;height:20px}
.fw-headrow{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.fw-home-hero{text-align:center;padding:18px 6px 6px}
.fw-home-hero h2{margin:0 0 4px;font-size:21px}
.fw-home-hero p{margin:0;color:var(--muted);font-size:13.5px}
.fw-entry{display:block;width:100%;text-align:left;background:var(--snow);border:2px solid #fff;border-radius:26px;padding:20px;margin:0 0 16px;box-shadow:0 10px 26px rgba(63,115,181,.12);position:relative;overflow:hidden}
.fw-entry .ic{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;margin-bottom:12px}
.fw-entry .ic svg{width:26px;height:26px}
.fw-entry.a .ic{background:var(--fuji-soft);color:var(--fuji-deep)}
.fw-entry.b .ic{background:var(--c3);color:var(--c3t)}
.fw-entry h3{margin:0 0 4px;font-size:18px}
.fw-entry p{margin:0;color:var(--muted);font-size:13.5px;line-height:1.6}
.fw-entry .go{position:absolute;right:20px;top:20px;color:var(--fuji-mid);font-size:22px}
.fw-hunt-form{display:grid;gap:10px}
.fw-hunt-card{background:var(--snow);border-radius:20px;padding:14px 16px;margin:0 0 12px;box-shadow:0 6px 16px rgba(63,115,181,.08)}
.fw-hunt-card h3{margin:0 0 2px;font-size:16px}
.fw-hunt-card p{margin:0;font-size:12.5px;color:var(--muted)}
.fw-hunt-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--muted);margin:8px 0}
.fw-deal-card{background:var(--snow);border-radius:20px;padding:14px 16px;margin:0 0 12px;box-shadow:0 6px 16px rgba(63,115,181,.08);border-left:5px solid var(--fuji)}
.fw-deal-card .rt{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.fw-deal-card h3{margin:0;font-size:16px}
.fw-deal-card .when{font-size:12.5px;color:var(--muted);margin-top:2px}
.fw-deal-card .price{font-size:22px;font-weight:700;color:var(--fuji-deep)}
.fw-deal-card .base{font-size:12px;color:var(--muted)}
.fw-deal-link{display:inline-flex;align-items:center;gap:6px;margin-top:10px;color:var(--fuji-deep);font-weight:700;font-size:13.5px;text-decoration:none}
.fw-verified{margin:8px 0 0;font-size:12.5px;font-weight:700}
.fw-deal-link svg{width:16px;height:16px}
.fw-unavail{padding:16px 18px;border-radius:20px;background:var(--warn);color:var(--warn-t);font-size:13.5px;margin:0 0 14px}
`;

/* ============================ 小元件 ============================ */
/* 齒輪：8 個齒，用極座標算出外框 */
const GEAR_PATH = (() => {
  const n = 8, ro = 9.6, ri = 7.3, w = Math.PI / n, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    [[-0.6 * w, ri], [-0.34 * w, ro], [0.34 * w, ro], [0.6 * w, ri]].forEach(([d, r]) => pts.push([12 + r * Math.sin(a + d), 12 - r * Math.cos(a + d)]));
  }
  return "M" + pts.map((q) => q[0].toFixed(2) + " " + q[1].toFixed(2)).join("L") + "Z";
})();
const ICONS = {
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="4" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  watch: <><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z" /></>,
  settings: <><path d={GEAR_PATH} /><circle cx="12" cy="12" r="3.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />,
  home: <><path d="M4 11.5L12 4l8 7.5" /><path d="M6 10v9.5h12V10" /><path d="M10 19.5v-6h4v6" /></>,
  spark: <path d="M12 2.5c.6 4 2.2 6.3 5.5 7.5-3.3 1.2-4.9 3.5-5.5 7.5-.6-4-2.2-6.3-5.5-7.5 3.3-1.2 4.9-3.5 5.5-7.5z" />,
  link: <><path d="M9.5 14.5l5-5" /><path d="M13 6.5h4.5V11" /><path d="M17.5 6.5L11 13" /><path d="M8 9H5.5A2.5 2.5 0 0 0 3 11.5v7A2.5 2.5 0 0 0 5.5 21h7a2.5 2.5 0 0 0 2.5-2.5V16" /></>,
};
function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
function Backdrop() {
  return (
    <div className="fw-bg" aria-hidden="true">
      <svg viewBox="0 0 430 300" preserveAspectRatio="xMidYMin slice">
        <ellipse cx="56" cy="72" rx="46" ry="15" fill="#fff" opacity=".85" /><ellipse cx="86" cy="62" rx="30" ry="14" fill="#fff" opacity=".85" />
        <ellipse cx="380" cy="60" rx="34" ry="11" fill="#fff" opacity=".8" /><ellipse cx="356" cy="53" rx="20" ry="9" fill="#fff" opacity=".8" />
        <ellipse cx="150" cy="232" rx="38" ry="12" fill="#fff" opacity=".7" /><ellipse cx="176" cy="224" rx="22" ry="10" fill="#fff" opacity=".7" />
        <path d="M70 288 C 140 284, 200 268, 268 232" fill="none" stroke="#8DB0DC" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 9" opacity=".8" />
        <g transform="translate(322 208) rotate(58) scale(5.2) translate(-12 -12)">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#fff" stroke="#B4CCE9" strokeWidth=".5" strokeLinejoin="round" />
        </g>
        <circle cx="30" cy="30" r="2.5" fill="#fff" /><circle cx="150" cy="40" r="2" fill="#fff" /><circle cx="260" cy="26" r="3" fill="#fff" /><circle cx="410" cy="120" r="2" fill="#fff" />
      </svg>
    </div>
  );
}
function Spark({ id, cur, target }) {
  const pts = [];
  for (let i = 30; i >= 0; i--) {
    if (i === 0) { pts.push(cur); continue; }
    pts.push(Math.round((cur * (1 + (i / 30) * 0.12) * (1 + (rnd("o" + id + i) - 0.45) * 0.16)) / 10) * 10);
  }
  const all = pts.concat(target != null ? [target] : []), lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03;
  const W = 240, H = 64, px = (i) => 4 + (i * (W - 8)) / 30, py = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const d = pts.map((v, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1)).join("");
  return (
    <svg className="fw-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="近 30 天最低價走勢（示範）">
      {target != null && <line className="tg" x1="0" x2={W} y1={py(target)} y2={py(target)} />}
      <path className="ln" d={d} />
      <circle className="pt" cx={px(30)} cy={py(cur)} r="3.5" />
    </svg>
  );
}
function Switch({ checked, onChange, label, disabled }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} style={disabled ? { opacity: 0.55 } : undefined} className="fw-switch" onClick={() => onChange(!checked)} />;
}

/* ============================ 共用選單 ============================ */
const TRIPS = [["ow", "單程"], ["rt", "來回"], ["mc", "多地點"]];
const STAYS = [2, 3, 4, 5, 7, 10, 14];
function OriginSelect({ id, value, onChange, block, short }) {
  return (
    <span className={"fw-selw" + (block ? " block" : "")}>
      <select id={id} className="fw-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {ORIGIN_GROUPS.map(([c, list]) => (
          <optgroup key={c} label={CT[c][0]}>{list.map((o) => <option key={o} value={o}>{short ? ORIG[o] : ORIG[o] + "（" + o + "）"}</option>)}</optgroup>
        ))}
      </select>
    </span>
  );
}
function DestSelect({ id, origin, value, onChange, short }) {
  const dests = destsFor(origin), groups = {};
  dests.forEach((d) => { const c = AP[d][1]; (groups[c] = groups[c] || []).push(d); });
  return (
    <span className="fw-selw block">
      <select id={id} className="fw-select" value={dests.includes(value) ? value : dests[0]} onChange={(e) => onChange(e.target.value)}>
        {countriesFor(origin).map((cc) => (
          <optgroup key={cc} label={CT[cc][0]}>{groups[cc].map((d) => <option key={d} value={d}>{short ? AP[d][0] : AP[d][0] + "（" + d + "）"}</option>)}</optgroup>
        ))}
      </select>
    </span>
  );
}
function TripBar({ trip, setTrip }) {
  return (
    <div className="fw-tripbar">
      <div className="fw-seg three" role="group" aria-label="行程類型">
        {TRIPS.map(([k, l]) => <button key={k} aria-pressed={trip.type === k} onClick={() => setTrip({ ...trip, type: k })}>{l}</button>)}
      </div>
      {trip.type === "rt" && (
        <>
          <span className="fw-lab">停留天數（去程出發後幾天回來）</span>
          <div className="fw-hscroll" role="group" aria-label="停留天數">
            {STAYS.map((n) => <button key={n} className="fw-chip" aria-pressed={trip.stay === n} onClick={() => setTrip({ ...trip, stay: n })}>{n} 天</button>)}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ 日曆（知道去哪） ============================ */
function CalendarScreen({ origin, trip, cal, setCal, onWatch, live }) {
  const N = trip.type === "rt" ? trip.stay : 0;
  const dests = destsFor(origin);
  const dest = dests.includes(cal.dest) ? cal.dest : dests[0];
  const R = routeOf(origin, dest), off = cal.off, idx = getIndexT(R, off, N), M = monthObj(cal.ym);
  const st = useMemo(() => stats([R], cal.ym, off, N), [R, cal.ym, off, N]);
  const sel = cal.sel != null && cal.sel >= M.s && cal.sel <= M.e ? cal.sel : st.cur ? TODAY + st.cur.i * DAY : null;
  const stripRef = useRef(null);

  /* LIVE：只有單程才打真實資料，因為後端的 /api/calendar 是照 Travelpayouts
     的月曆端點接的，不支援回程日期。來回、多地點永遠用示範資料。 */
  const liveOn = live && live.mode === "live" && !N;
  const [liveData, setLiveData] = useState(null);
  useEffect(() => {
    let alive = true;
    setLiveData(null);
    if (!liveOn) return;
    fetchLiveMonth(origin, dest, cal.ym).then((j) => { if (alive) setLiveData(j); }).catch(() => { if (alive) setLiveData({ error: true }); });
    return () => { alive = false; };
  }, [liveOn, origin, dest, cal.ym]);
  const liveDays = liveData && liveData.days ? liveData.days : null;
  const liveT = liveDays ? liveThr(liveDays) : null;
  const liveCovered = liveDays ? Object.keys(liveDays).length : 0;
  const liveHist = liveData && liveData.history && liveData.history.n > 0 ? liveData.history : null;

  useEffect(() => {
    const box = stripRef.current; if (!box) return;
    const on = box.querySelector('[aria-pressed="true"]');
    if (on) box.scrollLeft = on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2;
  }, [cal.ym]);

  const mins = MONTHS.map((mo) => { const r = winRange(mo.ym); let p = null; for (let i = r[0]; i <= r[1]; i++) { const x = idx[i].p; if (x != null && (p === null || x < p)) p = x; } return p; });
  const sorted = mins.filter((v) => v != null).sort((a, b) => a - b);
  const rank = (v) => (v == null ? "tn" : "t" + Math.min(3, Math.floor((sorted.indexOf(v) / Math.max(1, sorted.length - 1)) * 4)));
  const v = st.cur ? verdict(st.cur.p, st) : null;
  const t = thr(idx), first = new Date(M.s).getUTCDay(), days = new Date(M.e).getUTCDate();
  const mi = MONTHS.findIndex((x) => x.ym === cal.ym);
  const setMonth = (ym) => setCal({ ...cal, dest, ym, sel: null });
  const notes = closedList(R, cal.ym, N).filter((c) => !off.has(c.a)).map((c) => {
    const nm = AL[c.a][0];
    if (c.ret) return c.none ? "回程 " + nm + "尚未更新回程日期的班次" : "回程 " + nm + "只更新到 " + ymd(c.hz) + "，之後的班次還沒出來";
    return nm + (c.none ? "尚未更新 " + M.y + "年" + (M.m + 1) + "月班次" : "只更新到 " + ymd(c.hz) + "，之後的班次還沒出來");
  });
  const pos = (ms) => { for (let k = 0; k < 12; k++) { const mo = MONTHS[k]; if (ms <= mo.e) return Math.max(0, k + (ms - mo.s + DAY) / (mo.e - mo.s + DAY)); } return 12; };
  const cells = [];
  for (let b = 0; b < first; b++) cells.push(<span key={"b" + b} className="fw-cell blank" />);
  for (let d = 1; d <= days; d++) {
    const ms = utc(M.y, M.m, d), i = Math.round((ms - TODAY) / DAY);
    if (i < 0) { cells.push(<span key={d} className="fw-cell past"><span className="dn">{d}</span></span>); continue; }
    const liveCell = liveDays && liveDays[dkey(ms)];
    const di = idx[i]; let cls, inner, isLive = false;
    if (liveCell && liveCell.length && liveT) { isLive = true; cls = "c" + heat(liveCell[0].price, liveT); inner = money(liveCell[0].price); }
    else if (di.p != null) { cls = "c" + heat(di.p, t); inner = money(di.p); } else if (di.closed) { cls = "closed"; inner = "未更新"; } else { cls = "none"; inner = "—"; }
    const low = !liveOn && st.cur && st.cur.i === i;
    cells.push(
      <button key={d} className={`fw-cell ${cls}${low ? " low" : ""}${sel === ms ? " sel" : ""}`} onClick={() => setCal({ ...cal, dest, sel: ms })}
        aria-label={`${M.m + 1}月${d}日 ${isLive ? "即時參考價 " + liveCell[0].price + " 元" : di.p != null ? "最低 " + di.p + " 元" : di.closed ? "尚未更新" : "無航班"}`}>
        <span className="dn">{d}</span><span className="pr">{inner}</span>
        {isLive && <i className="dot live" title="即時參考價" />}
        {!isLive && di.p != null && di.closed && <i className="dot" />}
      </button>
    );
  }
  const di2 = sel != null ? idx[Math.round((sel - TODAY) / DAY)] : null;
  const liveSel = sel != null && liveDays ? liveDays[dkey(sel)] : null;
  const legRows = (list, bestA) => list.map((x) => {
    const best = x.st === "ok" && x.a === bestA && !off.has(x.a), ex = off.has(x.a);
    return (
      <div key={x.a} className={"fw-dl" + (ex ? " off" : "")}>
        <span>{AL[x.a][0]}{ex ? "（已排除）" : ""}</span>
        <span className={best ? "best" : ""}>{x.st === "ok" ? "NT$ " + money(x.price) : x.st === "closed" ? "尚未更新（開放到 " + ymd(R.hz[x.a]) + "）" : "當天無航班"}{best ? " 最低" : ""}</span>
      </div>
    );
  });

  return (
    <section aria-label="每日票價">
      <h2 className="fw-h2">每日票價</h2>
      <p className="fw-lead">地點確定，看每個月每一天的最低價{N ? "（來回合計，日期是去程出發日）" : ""}。</p>
      {live && live.mode === "live" && N > 0 && (
        <div className="fw-livebar locked">即時資料目前只支援單程；來回還是示範資料。</div>
      )}
      {liveOn && liveData && !liveData.error && (
        <div className="fw-livebar">
          <span>● 即時參考價（Travelpayouts）</span>
          <span>這個月 {liveCovered} 天有即時資料，其餘顯示示範資料</span>
          {(liveData.safety || live) && <span>今日已用 <b>{(liveData.safety || live).used ?? live.usage}/{(liveData.safety || live).limit}</b> 次</span>}
          {liveData.cache === "stale" && <span>{liveData.note || "已達當日上限，顯示先前抓到的資料"}</span>}
        </div>
      )}
      {liveOn && liveData && liveData.error && <div className="fw-livebar err">這個月即時資料抓取失敗，暫時顯示示範資料。</div>}
      <div className="fw-field">
        <label className="fw-lab" htmlFor="fw-dest">目的地</label>
        <DestSelect id="fw-dest" origin={origin} value={dest} onChange={(d) => setCal({ ...cal, dest: d, off: new Set(), sel: null })} />
      </div>

      <div className="fw-hscroll" ref={stripRef} role="group" aria-label="選擇月份">
        {MONTHS.map((mo, i) => {
          const partial = R.als.some((a) => !off.has(a) && R.hz[a] < mo.e);
          return (
            <button key={mo.ym} className={"fw-mchip " + rank(mins[i])} aria-pressed={mo.ym === cal.ym} onClick={() => setMonth(mo.ym)}>
              <span className="mm">{mLabel(mo, i)}</span>
              <b>{mins[i] == null ? "未開賣" : money(mins[i])}</b>
              {partial && <i className="pd" title="有航空公司尚未更新" />}
            </button>
          );
        })}
      </div>

      <div className="fw-stats">
        <div className="fw-stat"><small>{M.m + 1}月最低（示範）</small><b>{st.cur ? "NT$ " + money(st.cur.p) : "尚未開賣"}</b><span>{st.cur ? tripDates(TODAY + st.cur.i * DAY, N) + " " + alTxt(st.cur) : ""}</span></div>
        <div className="fw-stat"><small>去年同期最低{liveHist ? "" : "（示範估算）"}</small><b>NT$ {money(liveHist ? liveHist.lyMin : st.lyMin)}</b><span>{liveHist ? "真實歷史資料" : "同月份"}</span></div>
        <div className="fw-stat"><small>統計低檔{liveHist ? "" : "（示範估算）"}</small><b>NT$ {money(liveHist ? liveHist.p10 : st.p10)}</b><span>去年最低 10%</span></div>
      </div>
      {v && <p className="fw-lead" style={{ marginTop: -4 }}>這個月的最低價（示範）：<span className={"fw-pill " + v.cls}>{v.label}</span></p>}
      {liveOn && liveDays && liveCovered > 0 && (() => {
        const vals = Object.values(liveDays).map((l) => l[0].price); const min = Math.min(...vals), at = Object.keys(liveDays).find((k) => liveDays[k][0].price === min);
        return (
          <p className="fw-help" style={{ marginTop: -8 }}>
            即時參考價本月最低 <b style={{ color: "var(--fuji-deep)" }}>NT$ {money(min)}</b>（{at}）。
            {liveHist ? `去年同期最低與統計低檔（NT$ ${money(liveHist.lyMin)} / NT$ ${money(liveHist.p10)}）已經是從累積的真實資料算出來的，樣本數 ${liveHist.n} 天。` : "去年同期與統計低檔目前還沒有累積到足夠的真實資料，上面三格暫時仍是示範估算，僅供對照。"}
          </p>
        );
      })()}

      <div className="fw-btns">
        <button className="fw-btn pri" onClick={() => onWatch({ o: origin, kind: "airport", dest, ym: cal.ym })}>追蹤 {M.m + 1} 月最低價</button>
        <button className="fw-btn" onClick={() => onWatch({ o: origin, kind: "airport", dest, ym: null })}>追蹤不限時間</button>
      </div>

      <div className="fw-card">
        <div className="fw-calhead">
          <button className="fw-btn" onClick={() => setMonth(MONTHS[mi - 1].ym)} disabled={mi <= 0} aria-label="上個月">‹</button>
          <h3>{M.y}年{M.m + 1}月</h3>
          <button className="fw-btn" onClick={() => setMonth(MONTHS[mi + 1].ym)} disabled={mi >= MONTHS.length - 1} aria-label="下個月">›</button>
        </div>
        <div className="fw-dow">{WD.map((x) => <span key={x}>{x}</span>)}</div>
        <div className="fw-grid">{cells}</div>
        <div className="fw-legend">
          <span>便宜 <span className="sw">{["c0", "c1", "c2", "c3"].map((c) => <i key={c} style={{ background: `var(--${c})` }} />)}</span> 貴（相對這條航線未來 12 個月）</span>
          <span><i className="k" style={{ background: "repeating-linear-gradient(135deg,var(--warm-line) 0 3px,#fff 3px 6px)" }} />尚未更新</span>
          <span><i className="k" style={{ border: "2px dashed var(--warm-line)" }} />無航班</span>
          <span><i className="k" style={{ background: "var(--dot)", width: 8, height: 8, borderRadius: "50%" }} />有航空公司未更新</span>
          {liveOn && <span><i className="k" style={{ background: "var(--fuji)", width: 8, height: 8, borderRadius: "50%" }} />即時參考價</span>}
        </div>
      </div>

      {notes.length > 0 && (
        <div className="fw-notice">
          {notes.map((n) => <div key={n}>{n}</div>)}
          <p>{liveOn ? "這是示範資料的假設，即時資料目前沒有「哪家航空公司還沒開賣」這種資訊。" : "尚未更新的航空公司開賣後，這段日期的最低價可能會改變。"}</p>
        </div>
      )}

      {liveSel && liveSel.length > 0 && (
        <div className="fw-card">
          <h3>{mdw(sel)} 即時參考價</h3>
          {liveSel.map((x, i) => (
            <div key={i} className="fw-dl">
              <span>{AL[x.airline] ? AL[x.airline][0] : x.airline || "未知航空公司"}{x.stops ? "（轉機 " + x.stops + " 次）" : "（直飛）"}</span>
              <span className={i === 0 ? "best" : ""}>NT$ {money(x.price)}{i === 0 ? " 最低" : ""}</span>
            </div>
          ))}
          <p className="fw-help" style={{ marginBottom: 0 }}>{liveData.note || "Travelpayouts Data API 為快取／參考價格，實際下單金額以航空公司或訂票網站當下顯示為準。"}</p>
        </div>
      )}
      {di2 && (
        <div className="fw-card">
          <h3>{N ? tripDates(sel, N) : mdw(sel) + " 各航空公司（示範）"}</h3>
          {N > 0 && <p className="fw-help" style={{ margin: "0 0 2px" }}>去程 {mdw(sel)}</p>}
          {legRows(di2.list, di2.al)}
          {N > 0 && (
            <>
              <p className="fw-help" style={{ margin: "10px 0 2px" }}>回程 {mdw(sel + N * DAY)}</p>
              {legRows(di2.listIn, di2.al2)}
              <div className="fw-dl"><span><b>來回合計</b></span><span className="best">{di2.p != null ? "NT$ " + money(di2.p) : "—"}</span></div>
            </>
          )}
        </div>
      )}

      <div className="fw-card">
        <h3>各航空公司開放訂位到哪一天</h3>
        <p className="fw-lead" style={{ marginBottom: 6 }}>斜線是還沒更新的部分。取消勾選可以把該航空公司排除在比價之外。</p>
        {R.als.map((a) => (
          <div key={a} className="fw-hz-row">
            <label className="fw-hz-name">
              <input type="checkbox" checked={!off.has(a)} onChange={(e) => {
                const n = new Set(off);
                if (e.target.checked) n.delete(a); else { if (n.size >= R.als.length - 1) return; n.add(a); }
                setCal({ ...cal, dest, off: n });
              }} />{AL[a][1]}
            </label>
            <div className="fw-hz-track"><span className="fw-hz-fill" style={{ width: Math.min(100, (pos(R.hz[a]) / 12) * 100) + "%" }} /></div>
            <span className="fw-hz-note">{R.hz[a] > MONTHS[11].e ? "已開放到 " + ymd(R.hz[a]) + "（超出圖表範圍）" : "更新到 " + ymd(R.hz[a])}</span>
          </div>
        ))}
        <div className="fw-hz-axis"><span /><div>{MONTHS.map((mo) => <span key={mo.ym}>{mo.m + 1}</span>)}</div></div>
        <p className="fw-help">橫軸：{ymLabel(MONTHS[0].ym)} 到 {ymLabel(MONTHS[11].ym)}</p>
      </div>
    </section>
  );
}

/* ============================ 探索（依時間／依國家） ============================ */
function Bars({ mm }) {
  const vals = mm.filter((v) => v.p != null).map((v) => v.p);
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <span className="fw-bars" aria-hidden="true">
      {mm.map((v) => v.p == null
        ? <i key={v.ym} className="b nb" title={`${v.m + 1}月 尚未開賣`} />
        : <i key={v.ym} className={"b" + (v.p === lo ? " lo" : "")} style={{ height: 8 + ((v.p - lo) / (hi - lo || 1)) * 22 }} title={`${v.m + 1}月 NT$ ${money(v.p)}`} />)}
    </span>
  );
}
function ExploreScreen({ origin, trip, exp, setExp, goCal, onWatch }) {
  const N = trip.type === "rt" ? trip.stay : 0;
  const cs = countriesFor(origin);
  const country = exp.country && cs.includes(exp.country) ? exp.country : exp.mode === "country" ? cs[0] || null : null;
  const rows = useMemo(() => {
    const list = ROUTES.filter((r) => r.o === origin && (!country || AP[r.d][1] === country)).map((R) => {
      const st = stats([R], exp.ym, null, N);
      return { R, st, v: st.cur && exp.ym ? verdict(st.cur.p, st) : null, cl: closedList(R, exp.ym, N), mm: monthMins(R, N) };
    });
    list.sort((a, b) => {
      const ap = a.st.cur, bp = b.st.cur; if (!ap && !bp) return 0; if (!ap) return 1; if (!bp) return -1;
      if (exp.sort === "deal") return ap.p / (a.st.lyMed || a.st.med) - bp.p / (b.st.lyMed || b.st.med);
      return ap.p - bp.p;
    });
    return list;
  }, [origin, country, exp.ym, exp.sort, N]);

  const setMode = (mode) => {
    if (mode === "time") setExp({ ...exp, mode, ym: exp.ym || MONTHS[1].ym, country: null });
    else setExp({ ...exp, mode, ym: null, country: country || cs[0] || null });
  };
  const renderRow = (x) => {
    const R = x.R, cur = x.st.cur;
    const best = !exp.ym && cur ? x.mm.filter((m) => m.p != null).sort((a, b) => a.p - b.p)[0] : null;
    return (
      <div className="fw-row" key={R.k}>
        <button className="fw-row-main" onClick={() => goCal(R.d, cur ? ymOf(TODAY + cur.i * DAY) : exp.ym || MONTHS[1].ym, cur ? TODAY + cur.i * DAY : null)}>
          <span className="nm">{AP[R.d][0]}<small>{country ? R.d : CT[AP[R.d][1]][0] + " " + R.d}</small></span>
          <span className="pz">{cur ? "NT$ " + money(cur.p) : "—"}<small>{(N ? "來回 " : "") + (exp.ym ? ymLabel(exp.ym) + "最低" : "未來 12 個月最低")}</small></span>
          <span className="mt">
            {cur ? (
              <>
                <span>{tripDates(TODAY + cur.i * DAY, N)} {alTxt(cur)}</span>
                {x.v && <><span className={"fw-pill " + x.v.cls}>{x.v.label}</span><span>去年同期最低 NT$ {money(x.st.lyMin)}</span></>}
                {!exp.ym && <><Bars mm={x.mm} />{best && <span>最便宜在 {best.m + 1} 月</span>}</>}
              </>
            ) : <span>這個時段還沒有可查的票價</span>}
          </span>
          {x.cl.length > 0 && <span className="fw-wn">{x.cl.map((c, i) => <span className="ln" key={i}>{closedMsg(R, c, exp.ym, false)}</span>)}</span>}
        </button>
        <button className="fw-star" aria-label={"追蹤 " + AP[R.d][0]} onClick={() => onWatch({ o: origin, kind: "airport", dest: R.d, ym: exp.ym })}><Icon name="star" /></button>
      </div>
    );
  };
  const bucket = {}; rows.forEach((x) => { const rg = CT[AP[x.R.d][1]][1]; (bucket[rg] = bucket[rg] || []).push(x); });
  const rgMin = (r) => { let m = null; bucket[r].forEach((x) => { if (x.st.cur && (m === null || x.st.cur.p < m)) m = x.st.cur.p; }); return m; };
  const rgs = REGIONS.filter((r) => bucket[r]).sort((a, b) => { const ma = rgMin(a), mb = rgMin(b); if (ma === null && mb === null) return 0; if (ma === null) return 1; if (mb === null) return -1; return ma - mb; });

  return (
    <section aria-label="探索">
      <div className="fw-seg" role="group" aria-label="探索方式">
        <button aria-pressed={exp.mode === "time"} onClick={() => setMode("time")}>依時間比較<small>知道何時</small></button>
        <button aria-pressed={exp.mode === "country"} onClick={() => setMode("country")}>依國家比較<small>只知道國家</small></button>
      </div>
      <p className="fw-lead">{exp.mode === "time" ? "時間確定，比較各地的最低價。點進去可以看那條航線的每日票價。" : "時間還沒定，選一個國家比較各機場。也可以指定月份縮小範圍。"}</p>
      <span className="fw-lab">出發時間</span>
      <div className="fw-hscroll" role="group" aria-label="出發時間">
        <button className="fw-chip" aria-pressed={!exp.ym} onClick={() => setExp({ ...exp, ym: null })}>不限時間</button>
        {MONTHS.map((mo, i) => <button key={mo.ym} className="fw-chip" aria-pressed={exp.ym === mo.ym} onClick={() => setExp({ ...exp, ym: mo.ym })}>{mLabel(mo, i)}</button>)}
      </div>
      <span className="fw-lab">國家</span>
      <div className="fw-hscroll" role="group" aria-label="國家">
        <button className="fw-chip" aria-pressed={!country} onClick={() => setExp({ ...exp, country: null })}>全部國家</button>
        {cs.map((c) => <button key={c} className="fw-chip" aria-pressed={country === c} onClick={() => setExp({ ...exp, country: c })}>{CT[c][0]}</button>)}
      </div>
      <div className="fw-field">
        <label className="fw-lab" htmlFor="fw-sort">排序</label>
        <span className="fw-selw">
          <select id="fw-sort" className="fw-select" value={exp.sort} onChange={(e) => setExp({ ...exp, sort: e.target.value })}>
            <option value="price">價格由低到高</option><option value="deal">比平常便宜的幅度</option>
          </select>
        </span>
      </div>
      {country && <div className="fw-btns"><button className="fw-btn pri" onClick={() => onWatch({ o: origin, kind: "country", dest: country, ym: exp.ym })}>追蹤{CT[country][0]}最低價（所有機場）</button></div>}
      {!rows.length ? <div className="fw-empty">{ORIG[origin]}沒有飛往這個國家的航線資料。可以換一個出發地試試。</div> : (
        <div className="fw-list">
          {country ? rows.map(renderRow) : rgs.map((r) => {
            const m = rgMin(r);
            return (
              <React.Fragment key={r}>
                <div className="fw-grp"><span>{r}</span><span>{m === null ? "尚未開賣" : "最低 NT$ " + money(m)}</span></div>
                {bucket[r].map(renderRow)}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ============================ 多地點行程 ============================ */
function MultiCityScreen({ legs, setLegs, onWatch }) {
  const infos = useMemo(() => legs.map(legInfo), [legs]);
  const st = useMemo(() => mcStats(legs), [legs]);
  const setLeg = (i, p) => setLegs(legs.map((L, k) => (k === i ? { ...L, ...p } : L)));
  const changeOrigin = (i, o) => { const ds = destsFor(o), L = legs[i]; setLeg(i, { o, d: ds.includes(L.d) ? L.d : ds[0] }); };
  const addLeg = () => {
    const last = legs[legs.length - 1], o = last.d, ds = destsFor(o), d = ds.includes(legs[0].o) ? legs[0].o : ds[0];
    setLegs([...legs, { o, d, ms: firstAvail(o, d, last.ms + 3 * DAY) }]);
  };
  const minD = dateStr(TODAY), maxD = dateStr(TODAY + 364 * DAY);
  const total = st.cur ? st.cur.p : null;
  return (
    <section aria-label="多地點行程">
      <h2 className="fw-h2">多地點行程</h2>
      <p className="fw-lead">一段一段排好行程，每一段各自查那一天的最低價，最後加總。</p>
      {legs.map((L, i) => {
        const x = infos[i], prev = legs[i - 1];
        return (
          <div className="fw-card" key={i}>
            <div className="fw-legh"><h3>第 {i + 1} 段</h3>{legs.length > 2 && <button className="fw-btn ghost sm" onClick={() => setLegs(legs.filter((_, k) => k !== i))}>移除</button>}</div>
            <div className="fw-grid2">
              <div><label className="fw-lab" htmlFor={"mo" + i}>出發地</label><OriginSelect id={"mo" + i} block short value={L.o} onChange={(o) => changeOrigin(i, o)} /></div>
              <div><label className="fw-lab" htmlFor={"md" + i}>目的地</label><DestSelect id={"md" + i} short origin={L.o} value={L.d} onChange={(d) => setLeg(i, { d })} /></div>
            </div>
            <label className="fw-lab" htmlFor={"mt" + i}>日期</label>
            <input id={"mt" + i} className="fw-input" type="date" min={minD} max={maxD} value={dateStr(L.ms)} onChange={(e) => { if (e.target.value) setLeg(i, { ms: parse(e.target.value) }); }} />
            {x.st === "ok" && (
              <p className="fw-legres"><b>NT$ {money(x.di.p)}</b> {AL[x.di.al][1]}<br />
                {x.alt && x.alt.p < x.di.p ? "前後 3 天最低 NT$ " + money(x.alt.p) + "（" + mdw(TODAY + x.alt.i * DAY) + "）" : "已經是前後 3 天內最低"}</p>
            )}
            {x.st === "closed" && <div className="fw-note">{x.cls.map((a) => <div key={a}>{AL[a][0]}尚未更新這天的班次</div>)}</div>}
            {x.st === "none" && <div className="fw-note">這天沒有航班，換個日期試試。</div>}
            {x.st === "noroute" && <div className="fw-note">示範資料沒有這條航線。</div>}
            {x.st === "past" && <div className="fw-note">這個日期已經過了。</div>}
            {prev && L.ms < prev.ms && <div className="fw-note">這一段的日期比上一段早。</div>}
          </div>
        );
      })}
      {legs.length < 5 && <div className="fw-btns"><button className="fw-btn" onClick={addLeg}>＋ 新增一段</button></div>}
      <div className="fw-card">
        <h3>行程合計</h3>
        <p className="fw-total">{total != null ? "NT$ " + money(total) : "—"}</p>
        {total == null && <p className="fw-help" style={{ marginTop: 0 }}>每一段都查得到票價，才會算出合計。</p>}
        {total != null && st.lyMin != null && <p className="fw-help" style={{ marginTop: 0 }}>去年同期同一天的合計是 NT$ {money(st.lyMin)}，現在{total <= st.lyMin ? "比去年便宜" : "比去年貴"} NT$ {money(Math.abs(total - st.lyMin))}。</p>}
        <div className="fw-btns" style={{ marginBottom: 0, marginTop: 10 }}><button className="fw-btn pri" onClick={() => onWatch({ trip: "mc", legs, rule: "ly" })}>追蹤這個行程</button></div>
      </div>
    </section>
  );
}

/* ============================ 追蹤清單 ============================ */
function WatchScreen({ watches, setWatches, goWatchTarget, addExample }) {
  const views = useMemo(() => watches.map(wview), [watches]);
  const patch = (id, p) => setWatches(watches.map((w) => (w.id === id ? { ...w, ...p } : w)));
  return (
    <section aria-label="追蹤清單">
      <h2 className="fw-h2">追蹤清單</h2>
      <p className="fw-lead">價格降到預期價以下，就會標示「已到最低價格」。預期價可以用去年同期或統計數字，也可以自己填。</p>
      {!views.length && (
        <div className="fw-empty"><p>還沒有追蹤項目。按下 ☆ 或下方的 ＋，就會出現在這裡。</p><button className="fw-btn pri" onClick={addExample}>加入範例：台中 → 神戶</button></div>
      )}
      {views.map((v) => {
        const w = v.w, st = v.st, cur = st.cur, isMc = w.trip === "mc", N = stayOf(w), rule = v.rule;
        return (
          <article key={w.id} className={"fw-wc " + v.status}>
            <div className="fw-wc-head"><div><h3>{wTitle(w)}</h3><p>{wPeriod(w)}</p></div><span className={"fw-pill " + v.status}>{PILL[v.status]}</span></div>
            <div className="fw-wc-nums">
              <div>
                <small>{isMc ? "目前合計" : "目前最低"}</small><b>{cur ? "NT$ " + money(cur.p) : "—"}</b>
                <span>{cur ? (isMc ? st.infos.length + " 段行程" : tripDates(TODAY + cur.i * DAY, N) + " " + alTxt(cur) + (w.kind === "country" ? " " + AP[cur.rk.split("-")[1]][0] : "")) : "尚未開賣"}</span>
              </div>
              <div><small>預期價（{ruleName(rule)}）</small><b>{v.target != null ? "NT$ " + money(v.target) : "—"}</b><span>{cur && v.target != null ? (cur.p <= v.target ? "已低於預期價 NT$ " + money(v.target - cur.p) : "還差 NT$ " + money(cur.p - v.target)) : ""}</span></div>
            </div>
            {cur && <Spark id={w.id} cur={cur.p} target={v.target} />}
            {isMc && (
              <div style={{ margin: "6px 0" }}>
                {st.infos.map((x, i) => (
                  <div key={i} className="fw-dl">
                    <span>第 {i + 1} 段 {AP[x.L.o][0]} → {AP[x.L.d][0]}<br /><small style={{ color: "var(--muted)" }}>{mdw(x.L.ms)}</small></span>
                    <span>{x.st === "ok" ? "NT$ " + money(x.di.p) + " " + AL[x.di.al][1] : x.st === "closed" ? "尚未更新" : x.st === "none" ? "無航班" : "—"}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="fw-wc-ref">
              <span>去年同期{isMc ? "同日合計" : "最低"} <b>NT$ {money(st.lyMin)}</b></span>
              {!isMc && <><span>統計低檔 <b>NT$ {money(st.p10)}</b></span><span>一般價 <b>NT$ {money(st.med == null ? null : Math.round(st.med / 10) * 10)}</b></span></>}
            </div>
            <div className="fw-rules" role="group" aria-label="預期價依據">
              {(isMc ? ["ly", "custom"] : ["stat", "ly", "custom"]).map((r) => (
                <button key={r} className="fw-chip" aria-pressed={rule === r} onClick={() => patch(w.id, { rule: r, custom: r === "custom" && !w.custom ? st.lyMin : w.custom })}>{ruleName(r)}</button>
              ))}
              {rule === "custom" && <input className="fw-input sm" type="number" inputMode="numeric" min="0" step="10" defaultValue={w.custom || ""} aria-label="自訂預期價" onBlur={(e) => patch(w.id, { custom: Number(e.target.value) || null })} />}
            </div>
            {v.cl.length > 0 && <div className="fw-note">{v.cl.map((c, i) => <div key={i}>{c}</div>)}</div>}
            <div className="fw-wc-act">
              <button className="fw-btn" onClick={() => goWatchTarget(w)}>看價格</button>
              <button className="fw-btn ghost" onClick={() => setWatches(watches.filter((x) => x.id !== w.id))}>移除</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ============================ 首頁（兩個入口） ============================ */
function HomeScreen({ goSearch, goCheap }) {
  return (
    <section aria-label="首頁">
      <div className="fw-home-hero">
        <h2>先想好怎麼查</h2>
        <p>兩種找便宜機票的方式，挑一個開始。</p>
      </div>
      <button className="fw-entry a" onClick={goSearch}>
        <span className="ic"><Icon name="cal" /></span>
        <h3>指定航班追蹤</h3>
        <p>已經知道要去哪裡、大概什麼時候，想盯著這條航線的價格、比較日期或城市。</p>
        <span className="go">›</span>
      </button>
      <button className="fw-entry b" onClick={goCheap}>
        <span className="ic"><Icon name="spark" /></span>
        <h3>幫我撿便宜</h3>
        <p>還沒決定要去哪、什麼時候去，只要出現划算的機票就通知我。</p>
        <span className="go">›</span>
      </button>
    </section>
  );
}

/* ============================ 撿便宜 ============================ */
function BargainScreen({ origin, say }) {
  const [state, setState] = useState("loading"); // loading | ok | unavail
  const [hunts, setHunts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [selHunt, setSelHunt] = useState(""); // "" = 全部
  const [form, setForm] = useState({ open: false, label: "", scope: "JP", monthsAhead: 3, thresholdPct: 20 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState("loading");
    Promise.all([fetchHunts(), fetchDeals()])
      .then(([h, d]) => { setHunts(h.hunts || []); setDeals(d.deals || []); setState("ok"); })
      .catch(() => setState("unavail"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shownDeals = selHunt ? deals.filter((d) => d.huntId === selHunt) : deals;

  const submitHunt = async () => {
    const destinations = destsFor(origin).filter((d) => AP[d][1] === form.scope);
    if (!destinations.length) { say("這個出發地沒有飛往這個國家的航線資料"); return; }
    setBusy(true);
    try {
      await createHunt({ origin, label: form.label || CT[form.scope][0], destinations, monthsAhead: form.monthsAhead, thresholdPct: form.thresholdPct });
      setForm({ open: false, label: "", scope: "JP", monthsAhead: 3, thresholdPct: 20 });
      say("已加入撿便宜設定");
      load();
    } catch (e) { say("加入失敗：" + e.message); }
    setBusy(false);
  };
  const removeHunt = async (id) => {
    try { await deleteHunt(id); if (selHunt === id) setSelHunt(""); load(); } catch (e) { say("刪除失敗：" + e.message); }
  };

  if (state === "unavail") {
    return (
      <section aria-label="撿便宜">
        <h2 className="fw-h2">幫我撿便宜</h2>
        <p className="fw-lead">還沒決定去哪、什麼時候去，讓系統幫忙盯著整個範圍。</p>
        <div className="fw-unavail">
          這個功能需要後端（Cloudflare Pages Functions + D1）才能運作，因為要每天在背景掃描很多航線，前端網頁自己做不到。
          目前偵測不到後端，可能是還沒部署，或是部署了但 D1／Travelpayouts 金鑰還沒設定好。部署步驟在 README 裡。
        </div>
      </section>
    );
  }

  const cs = countriesFor(origin);
  return (
    <section aria-label="撿便宜">
      <h2 className="fw-h2">幫我撿便宜</h2>
      <p className="fw-lead">設定想去的範圍，後端每天會幫你掃一輪；出現明顯划算的價格才會列在下面。</p>

      <div className="fw-card">
        <h3>正在盯的範圍</h3>
        {state === "loading" && <p className="fw-help">讀取中…</p>}
        {state === "ok" && !hunts.length && <p className="fw-help">還沒有設定。加一個範圍，例如「從{ORIG[origin]}出發、日本任何地方」。</p>}
        {hunts.map((h) => (
          <div className="fw-hunt-card" key={h.id}>
            <h3>{h.label}</h3>
            <p>{ORIG[h.origin] || h.origin} 出發・{h.destinations.length} 個機場・未來 {h.monthsAhead} 個月</p>
            <div className="fw-hunt-meta">
              <span>低於平常價 {h.thresholdPct}% 以上才通知</span>
              <button className="fw-chip" aria-pressed={selHunt === h.id} onClick={() => setSelHunt(selHunt === h.id ? "" : h.id)}>只看這個的結果</button>
              <button className="fw-btn ghost sm" onClick={() => removeHunt(h.id)}>刪除</button>
            </div>
          </div>
        ))}
        {!form.open ? (
          <button className="fw-btn pri" onClick={() => setForm((f) => ({ ...f, open: true }))}>＋ 新增範圍</button>
        ) : (
          <div className="fw-hunt-form">
            <div>
              <label className="fw-lab" htmlFor="bg-label">取個名字（選填）</label>
              <input id="bg-label" className="fw-input" value={form.label} placeholder={cs.includes(form.scope) ? CT[form.scope][0] : ""} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="fw-lab" htmlFor="bg-scope">想去的國家</label>
              <span className="fw-selw block"><select id="bg-scope" className="fw-select" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                {cs.map((c) => <option key={c} value={c}>{CT[c][0]}（{destsFor(origin).filter((d) => AP[d][1] === c).length} 個機場）</option>)}
              </select></span>
            </div>
            <div>
              <label className="fw-lab" htmlFor="bg-months">看多遠</label>
              <span className="fw-selw block"><select id="bg-months" className="fw-select" value={form.monthsAhead} onChange={(e) => setForm((f) => ({ ...f, monthsAhead: Number(e.target.value) }))}>
                <option value={3}>近 3 個月（每天都會掃）</option>
                <option value={6}>近 6 個月（第 4-6 個月掃得比較不頻繁）</option>
                <option value={12}>未來一整年</option>
              </select></span>
            </div>
            <div>
              <label className="fw-lab" htmlFor="bg-th">便宜的標準</label>
              <span className="fw-selw block"><select id="bg-th" className="fw-select" value={form.thresholdPct} onChange={(e) => setForm((f) => ({ ...f, thresholdPct: Number(e.target.value) }))}>
                <option value={15}>比平常低 15% 以上（比較常通知）</option>
                <option value={20}>比平常低 20% 以上</option>
                <option value={30}>比平常低 30% 以上（比較少但更划算）</option>
              </select></span>
            </div>
            <p className="fw-help">剛設定好的範圍要先讓後端連續掃過幾天，累積到足夠的歷史資料才會開始出現通知，不會一設定就有結果。</p>
            <div className="fw-btns" style={{ marginBottom: 0 }}>
              <button className="fw-btn" onClick={() => setForm((f) => ({ ...f, open: false }))}>取消</button>
              <button className="fw-btn pri" disabled={busy} onClick={submitHunt}>{busy ? "處理中…" : "加入"}</button>
            </div>
          </div>
        )}
      </div>

      <h3 style={{ margin: "18px 0 8px", fontSize: 16 }}>找到的便宜機票{selHunt ? "（已篩選）" : ""}</h3>
      {!shownDeals.length && <div className="fw-empty">目前還沒有符合條件的結果。設定好範圍後，等後端跑過幾輪掃描再回來看看。</div>}
      {shownDeals.map((d) => {
        const verified = d.verifiedPrice != null;
        const diffPct = verified ? Math.round((Math.abs(d.verifiedPrice - d.price) / d.price) * 100) : null;
        return (
          <div className="fw-deal-card" key={d.id}>
            <div className="rt">
              <div><h3>{ORIG[d.origin] || d.origin} → {AP[d.destination] ? AP[d.destination][0] : d.destination}</h3><p className="when">{ymd(parse(d.flightDate))}　出發</p></div>
              <div style={{ textAlign: "right" }}><div className="price">NT$ {money(d.price)}</div><div className="base">平常約 NT$ {money(d.baseline)}，便宜 {d.pctBelow}%</div></div>
            </div>
            {verified ? (
              <p className="fw-verified" style={{ color: diffPct <= 15 ? "var(--fuji-deep)" : "var(--warn-t)" }}>
                {diffPct <= 15 ? "✓ 已用瀏覽器核對過" : "⚠ 已核對，但價差較大"}：Google Flights 目前約 NT$ {money(d.verifiedPrice)}
              </p>
            ) : (
              <p className="fw-help" style={{ margin: "8px 0 0" }}>尚未自動核對，也可以自己點下面的連結確認。</p>
            )}
            <a className="fw-deal-link" href={d.deepLink} target="_blank" rel="noreferrer"><Icon name="link" />去 Google 航班核對這個價格</a>
          </div>
        );
      })}
      <p className="fw-help">價格來自 Travelpayouts 的快取資料，下單前請先點上面的連結自己核對一次；這個 App 目前還不會自動幫你買。</p>
    </section>
  );
}

/* ============================ 設定（通知） ============================ */
function SettingsScreen({ notify, setNotify, exportConfig, live }) {
  const set = (p) => setNotify({ ...notify, ...p });
  const [synced, setSynced] = useState("idle"); // idle | saving | ok | fail
  const [loadedBackend, setLoadedBackend] = useState(false);

  // 開啟設定頁時，如果後端已經存過收件地址（例如在別台裝置上設定過），
  // 而這台裝置本地還是空的，就把後端的值帶進來，兩邊才會一致。
  useEffect(() => {
    let alive = true;
    fetchJSON("/api/notify-settings", 5000).then((s) => {
      if (!alive || !s) return;
      setNotify((n) => ({
        ...n,
        email: { ...n.email, address: n.email.address || s.email || "", on: n.email.on || !!s.email },
        line: { ...n.line, userId: n.line.userId || s.lineUserId || "", on: n.line.on || !!s.lineUserId },
      }));
    }).catch(() => {}).finally(() => { if (alive) setLoadedBackend(true); });
    return () => { alive = false; };
  }, [setNotify]);

  const syncBackend = useCallback((next) => {
    setSynced("saving");
    fetchJSON2("/api/notify-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: next.email.on ? next.email.address : "", lineUserId: next.line.on ? next.line.userId : "" }) })
      .then(() => setSynced("ok")).catch(() => setSynced("fail"));
  }, []);
  const setSynced_ = (p) => { const next = { ...notify, ...p }; setNotify(next); syncBackend(next); };

  return (
    <section aria-label="設定">
      <h2 className="fw-h2">通知設定</h2>
      <p className="fw-lead">這裡設定的信箱／LINE，「幫我撿便宜」找到便宜機票時會用它通知你。</p>

      <div className="fw-card">
        <div className="fw-toggle"><span>LINE 通知<small>透過 LINE 官方帳號傳送</small></span><Switch checked={notify.line.on} label="LINE 通知" onChange={(on) => setSynced_({ line: { ...notify.line, on } })} /></div>
        {notify.line.on && (
          <div className="fw-field" style={{ marginTop: 8 }}>
            <label className="fw-lab" htmlFor="fw-line">LINE User ID</label>
            <input id="fw-line" className="fw-input" placeholder="U 開頭、共 33 個字元" defaultValue={notify.line.userId} onBlur={(e) => setSynced_({ line: { ...notify.line, userId: e.target.value.trim() } })} />
            <p className="fw-help">LINE Notify 已在 2025 年 3 月底結束服務，現在要透過 LINE 官方帳號的 Messaging API 傳送訊息。你需要自己建立一個官方帳號，並加它為好友，才能取得自己的 User ID。</p>
          </div>
        )}
        <div className="fw-toggle"><span>Email 通知<small>寄到你的信箱</small></span><Switch checked={notify.email.on} label="Email 通知" onChange={(on) => setSynced_({ email: { ...notify.email, on } })} /></div>
        {notify.email.on && (
          <div className="fw-field" style={{ marginTop: 8 }}>
            <label className="fw-lab" htmlFor="fw-mail">收件信箱</label>
            <input id="fw-mail" className="fw-input" type="email" inputMode="email" placeholder="name@example.com" defaultValue={notify.email.address} onBlur={(e) => setSynced_({ email: { ...notify.email, address: e.target.value.trim() } })} />
          </div>
        )}
        {(notify.line.on || notify.email.on) && (
          <p className="fw-help">
            {synced === "saving" ? "同步到後端中…" : synced === "ok" ? "已同步到後端。" : synced === "fail" ? "同步失敗，可能是還沒部署後端或連不到；收件地址仍會存在這個裝置上。" : ""}
          </p>
        )}
      </div>

      <div className="fw-card">
        <h3>通知時機（指定航班追蹤）</h3>
        <p className="fw-help" style={{ marginTop: 0 }}>下面這幾項是給「指定航班追蹤」清單用的，這部分的自動檢查與寄送目前還沒有做，先讓你把想要的規則設好。</p>
        <div className="fw-toggle"><span>已到最低價格時通知<small>一定會通知</small></span><Switch checked disabled label="已到最低價格時通知" onChange={() => {}} /></div>
        <div className="fw-toggle"><span>接近預期價也通知<small>差距在 8% 以內</small></span><Switch checked={notify.onNear} label="接近預期價也通知" onChange={(onNear) => set({ onNear })} /></div>
        <div className="fw-toggle"><span>同一項目只在價格再降低時通知<small>避免每天重複收到</small></span><Switch checked={notify.onlyLower} label="只在價格再降低時通知" onChange={(onlyLower) => set({ onlyLower })} /></div>
        <div className="fw-field" style={{ marginTop: 10 }}>
          <label className="fw-lab" htmlFor="fw-hour">每天檢查時間</label>
          <span className="fw-selw">
            <select id="fw-hour" className="fw-select" value={notify.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
              {[6, 8, 10, 12, 18, 20, 22].map((h) => <option key={h} value={h}>{p2(h)}:00</option>)}
            </select>
          </span>
        </div>
      </div>

      <div className="fw-card">
        <h3>資料與連線狀態</h3>
        <dl className="fw-kv" style={{ margin: 0 }}>
          <dt>每日票價資料來源</dt><dd>{live?.mode === "live" ? "Travelpayouts（即時）" : live?.mode === "locked" ? "後端已設定金鑰，但尚未綁定 D1（暫時鎖定）" : "示範資料（模擬價格）"}</dd>
          <dt>撿便宜每日掃描</dt><dd>要靠外部排程（例如 GitHub Actions）每天呼叫後端一次，詳見部署說明。</dd>
          <dt>後端 Email 寄送（Resend）</dt><dd>{live?.notify?.emailReady ? "已設定，撿便宜找到便宜機票會寄信" : "尚未設定 RESEND_API_KEY，撿便宜暫時不會寄信"}</dd>
          <dt>後端 LINE 推播</dt><dd>{live?.notify?.lineReady ? "已設定，撿便宜找到便宜機票會推播" : "尚未設定 LINE_CHANNEL_TOKEN，撿便宜暫時不會推播"}</dd>
          <dt>指定追蹤清單的通知</dt><dd>尚未接上寄送，目前只會在你打開網頁時顯示「已到最低價格」。</dd>
        </dl>
        <div className="fw-btns" style={{ marginTop: 12, marginBottom: 0 }}><button className="fw-btn" onClick={exportConfig}>匯出追蹤與通知設定</button></div>
      </div>
    </section>
  );
}

/* ============================ 新增追蹤（底部抽屜） ============================ */
function WatchSheet({ init, onClose, onSave }) {
  const [d, setD] = useState({ rule: "stat", custom: null, trip: "ow", stay: 5, ...init });
  const isMc = d.trip === "mc", N = d.trip === "rt" ? d.stay : 0;
  const okDests = d.kind === "airport" ? destsFor(d.o) : countriesFor(d.o);
  const dest = okDests.includes(d.dest) ? d.dest : okDests[0];
  const st = isMc ? mcStats(d.legs || []) : stats(routesOf(d.o, d.kind, dest), d.ym, null, N);
  const rule = isMc && d.rule === "stat" ? "ly" : d.rule, t = targetOf(rule, d.custom, st);
  let pv = "", ok = false;
  if (!st.cur) pv = "這個期間還沒有開賣的班次，開賣後才會開始比較。";
  else if (t == null) pv = "目前最低 NT$ " + money(st.cur.p) + "。請先填入預期價。";
  else if (st.cur.p <= t) { pv = "目前最低 NT$ " + money(st.cur.p) + "，已經低於預期價 NT$ " + money(t) + "。"; ok = true; }
  else pv = "目前最低 NT$ " + money(st.cur.p) + "，距離預期價 NT$ " + money(t) + " 還差 NT$ " + money(st.cur.p - t) + "。";
  const renderOpt = (r, title, sub, val, children) => (
    <div className={"fw-opt" + (rule === r ? " on" : "")} key={r}>
      <button type="button" className="fw-opt-btn" aria-pressed={rule === r} onClick={() => setD({ ...d, dest, rule: r, custom: r === "custom" && !d.custom ? st.lyMin : d.custom })}>
        <b><span>{title}</span><span>{val == null ? "—" : "NT$ " + money(val)}</span></b><span className="s">{sub}</span>
      </button>
      {children}
    </div>
  );
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const save = () => {
    if (rule === "custom" && !d.custom) return onSave(null);
    const base = { rule, custom: rule === "custom" ? d.custom : null };
    if (isMc) onSave({ ...base, trip: "mc", legs: d.legs, o: d.legs[0].o, kind: "mc", dest: "", ym: null });
    else onSave({ ...base, trip: d.trip, stay: d.trip === "rt" ? d.stay : null, o: d.o, kind: d.kind, dest, ym: d.ym });
  };
  return (
    <div className="fw-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fw-sheet" role="dialog" aria-modal="true" aria-labelledby="fw-sht">
        <div className="fw-grab" />
        <h2 id="fw-sht">加入追蹤</h2>
        {isMc ? (
          <div className="fw-preview" style={{ marginTop: 0, marginBottom: 12 }}>
            <b>多地點行程</b><br />{legsTitle(d.legs || [])}<br />{(d.legs || []).map((L) => mdw(L.ms)).join("、")}
          </div>
        ) : (
          <>
            <div className="fw-field"><label className="fw-lab" htmlFor="fw-so">出發地</label><OriginSelect id="fw-so" block value={d.o} onChange={(o) => setD({ ...d, o })} /></div>
            <div className="fw-seg" role="group" aria-label="行程類型">
              <button type="button" aria-pressed={d.trip === "ow"} onClick={() => setD({ ...d, trip: "ow" })}>單程</button>
              <button type="button" aria-pressed={d.trip === "rt"} onClick={() => setD({ ...d, trip: "rt" })}>來回</button>
            </div>
            {d.trip === "rt" && (
              <div className="fw-field"><label className="fw-lab" htmlFor="fw-ss">停留天數</label>
                <span className="fw-selw"><select id="fw-ss" className="fw-select" value={d.stay} onChange={(e) => setD({ ...d, stay: Number(e.target.value) })}>{STAYS.map((n) => <option key={n} value={n}>{n} 天</option>)}</select></span></div>
            )}
            <div className="fw-seg" role="group" aria-label="追蹤範圍">
              <button type="button" aria-pressed={d.kind === "airport"} onClick={() => setD({ ...d, kind: "airport" })}>單一機場</button>
              <button type="button" aria-pressed={d.kind === "country"} onClick={() => setD({ ...d, kind: "country" })}>整個國家</button>
            </div>
            <div className="fw-field"><label className="fw-lab" htmlFor="fw-sd">{d.kind === "airport" ? "目的地" : "國家"}</label>
              {d.kind === "airport" ? <DestSelect id="fw-sd" origin={d.o} value={dest} onChange={(x) => setD({ ...d, dest: x })} /> : (
                <span className="fw-selw block"><select id="fw-sd" className="fw-select" value={dest} onChange={(e) => setD({ ...d, dest: e.target.value })}>{okDests.map((x) => <option key={x} value={x}>{CT[x][0]}</option>)}</select></span>
              )}</div>
            <div className="fw-field"><label className="fw-lab" htmlFor="fw-sp">追蹤期間</label>
              <span className="fw-selw block"><select id="fw-sp" className="fw-select" value={d.ym || ""} onChange={(e) => setD({ ...d, dest, ym: e.target.value || null })}>
                <option value="">不限時間（未來 12 個月）</option>{MONTHS.map((mo) => <option key={mo.ym} value={mo.ym}>{ymLabel(mo.ym)}</option>)}</select></span></div>
          </>
        )}
        <span className="fw-lab">預期價（降到這個價格以下就通知）</span>
        {!isMc && renderOpt("stat", "統計低檔", "去年同期價格由低排到高，最低的 10%", st.p10)}
        {renderOpt("ly", isMc ? "去年同期同日合計" : "去年同期最低", isMc ? "去年同一天各段最低價的合計" : "去年同一段日期出現過的最低價", st.lyMin)}
        {renderOpt("custom", "自訂金額", "自己決定願意買的價格", d.custom,
          rule === "custom" && <input className="fw-input sm" type="number" inputMode="numeric" min="0" step="10" value={d.custom || ""} aria-label="自訂預期價" style={{ marginTop: 6 }} onChange={(e) => setD({ ...d, dest, custom: Number(e.target.value) || null })} />)}
        <div className={"fw-preview" + (ok ? " ok" : "")} aria-live="polite">{pv}</div>
        <div className="fw-btns">
          <button className="fw-btn" onClick={onClose}>取消</button>
          <button className="fw-btn pri" onClick={save}>加入追蹤</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ App 本體 ============================ */
export default function FlightWatchApp() {
  const [tab, setTab] = useState("home");
  const [origin, setOriginState] = useState("TPE");
  const [trip, setTrip] = useState({ type: "ow", stay: 5 });
  const [mcLegs, setMcLegs] = useState(defaultLegs);
  const [cal, setCal] = useState({ dest: "KIX", ym: MONTHS[1].ym, off: new Set(), sel: null });
  const [exp, setExp] = useState({ mode: "time", ym: MONTHS[1].ym, country: null, sort: "price" });
  const [watches, setWatches] = useState([]);
  const [notify, setNotify] = useState(DEFAULT_NOTIFY);
  const [sheet, setSheet] = useState(null);
  const [exportText, setExportText] = useState(null);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState({ mode: "demo", usage: 0, limit: 50, notify: { emailReady: false, lineReady: false } });
  const toastT = useRef(null);

  const say = useCallback((m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2200); }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  /* 有沒有部署 /api/status 這組後端，App 自己偵測，偵測不到就安靜留在示範模式，
     跟原本的行為一樣，不會因為缺後端而壞掉。 */
  useEffect(() => {
    let alive = true;
    fetchLiveStatus().then((j) => { if (alive && j) setLive({ mode: j.mode || "demo", usage: j.usage || 0, limit: j.dailyLimit || 50, notify: j.notify || { emailReady: false, lineReady: false } }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    store.load().then((d) => {
      if (!alive) return;
      if (d) {
        if (Array.isArray(d.watches)) setWatches(d.watches.map((w) => ({ trip: "ow", ...w })));
        if (d.notify) setNotify({ ...DEFAULT_NOTIFY, ...d.notify, email: { ...DEFAULT_NOTIFY.email, ...(d.notify.email || {}) }, line: { ...DEFAULT_NOTIFY.line, ...(d.notify.line || {}) } });
      }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => store.save({ watches, notify }), 300);
    return () => clearTimeout(t);
  }, [watches, notify, loaded]);

  const hits = useMemo(() => watches.map(wview).filter((v) => v.status === "hit").length, [watches]);
  const toTop = () => { try { window.scrollTo({ top: 0 }); } catch (e) { /* 忽略 */ } };
  const go = (t) => { setTab(t); toTop(); };
  const searching = tab === "cal" || tab === "explore";
  const inMc = trip.type === "mc" && searching;

  const setOrigin = (o) => {
    setOriginState(o);
    setCal((c) => ({ ...c, off: new Set(), sel: null }));
    setExp((e) => { const cs = countriesFor(o); return { ...e, country: e.country && cs.includes(e.country) ? e.country : e.mode === "country" ? cs[0] || null : null }; });
  };
  const goCal = (dest, ym, sel) => { setCal({ dest, ym, off: new Set(), sel }); go("cal"); };
  const goWatchTarget = (w) => {
    if (w.trip === "mc") { setMcLegs(w.legs || []); setTrip((t) => ({ ...t, type: "mc" })); go("cal"); return; }
    setOriginState(w.o);
    setTrip((t) => ({ type: w.trip || "ow", stay: w.stay || t.stay }));
    if (w.kind === "airport") {
      const v = wview(w);
      setCal({ dest: w.dest, ym: w.ym || (v.st.cur ? ymOf(TODAY + v.st.cur.i * DAY) : MONTHS[1].ym), off: new Set(), sel: v.st.cur ? TODAY + v.st.cur.i * DAY : null });
      go("cal");
    } else { setExp({ mode: "country", ym: w.ym, country: w.dest, sort: "price" }); go("explore"); }
  };
  const openWatch = (p) => setSheet({ o: origin, kind: "airport", dest: destsFor(origin)[0], ym: null, trip: trip.type === "mc" ? "ow" : trip.type, stay: trip.stay, ...p });
  const saveWatch = (o) => {
    if (!o) { say("請先填入自訂預期價"); return; }
    setWatches((ws) => ws.filter((w) => o.trip === "mc" || !(w.trip !== "mc" && w.o === o.o && w.kind === o.kind && w.dest === o.dest && w.ym === o.ym && w.trip === o.trip && (w.stay || null) === (o.stay || null)))
      .concat([{ ...o, id: newId(), created: new Date().toISOString().slice(0, 10) }]));
    setSheet(null); say("已加入追蹤清單");
  };
  const addExample = () => {
    const may = MONTHS.find((m) => m.ym === "2027-05") || MONTHS[MONTHS.length - 2];
    setWatches((ws) => ws.concat([
      { id: newId(), trip: "ow", o: "RMQ", kind: "airport", dest: "UKB", ym: MONTHS[2].ym, rule: "stat", custom: null },
      { id: newId(), trip: "ow", o: "RMQ", kind: "airport", dest: "UKB", ym: may.ym, rule: "ly", custom: null },
    ]));
    say("已加入 2 項範例");
  };
  const exportConfig = () => setExportText(JSON.stringify({ version: 2, notify, watches }, null, 2));
  const copyExport = async () => {
    try { await navigator.clipboard.writeText(exportText); say("已複製設定"); } catch (e) { say("無法自動複製，請長按選取文字"); }
  };
  const sub = !searching ? "單位新台幣" : trip.type === "ow" ? "單程票價，單位新台幣" : trip.type === "rt" ? "來回票價（停留 " + trip.stay + " 天），單位新台幣" : "多地點行程，單位新台幣";

  return (
    <div className="fw-root">
      <style>{CSS}</style>
      <Backdrop />
      <div className="fw-shell">
        <header className="fw-head">
          <button className="fw-titlebtn" onClick={() => go("home")} aria-label="回首頁">
            <h1 className="fw-title">票價守望</h1><p className="fw-sub">{sub}</p>
          </button>
          <div>
            <label className="fw-lab" htmlFor="fw-orig">出發地</label>
            <OriginSelect id="fw-orig" value={origin} onChange={setOrigin} />
          </div>
        </header>
        {searching && (
          <p className="fw-demo">
            {live.mode === "live" ? `LIVE：每日票價的單程日曆已接上 Travelpayouts 即時參考價（今日 ${live.usage}/${live.limit} 次），其餘畫面仍是示範資料。`
              : live.mode === "locked" ? "後端已設定金鑰但尚未綁定 D1，暫時鎖定即時資料——目前顯示的都是示範資料。"
              : "示範資料：票價是程式模擬的數字，還沒有連上真實航班資料。"}
          </p>
        )}
        {searching && <TripBar trip={trip} setTrip={setTrip} />}
        {tab === "home" && <HomeScreen goSearch={() => go("cal")} goCheap={() => go("cheap")} />}
        {tab === "cal" && !inMc && <CalendarScreen origin={origin} trip={trip} cal={cal} setCal={setCal} onWatch={openWatch} live={live} />}
        {tab === "explore" && !inMc && <ExploreScreen origin={origin} trip={trip} exp={exp} setExp={setExp} goCal={goCal} onWatch={openWatch} />}
        {inMc && <MultiCityScreen legs={mcLegs} setLegs={setMcLegs} onWatch={openWatch} />}
        {tab === "cheap" && <BargainScreen origin={origin} say={say} />}
        {tab === "watch" && <WatchScreen watches={watches} setWatches={setWatches} goWatchTarget={goWatchTarget} addExample={addExample} />}
        {tab === "settings" && <SettingsScreen notify={notify} setNotify={setNotify} exportConfig={exportConfig} live={live} />}
      </div>

      <nav className="fw-nav" aria-label="主要導覽">
        <button className="fw-navbtn" aria-current={tab === "home" ? "page" : undefined} onClick={() => go("home")}><span className="ic"><Icon name="home" /></span>首頁</button>
        <button className="fw-navbtn" aria-current={tab === "cal" ? "page" : undefined} onClick={() => go("cal")}><span className="ic"><Icon name="cal" /></span>日曆</button>
        <button className="fw-navbtn" aria-current={tab === "explore" ? "page" : undefined} onClick={() => go("explore")}><span className="ic"><Icon name="explore" /></span>探索</button>
        <button className="fw-fab" aria-label="新增追蹤" onClick={() => (inMc ? openWatch({ trip: "mc", legs: mcLegs, rule: "ly" }) : openWatch({}))}><Icon name="plus" /></button>
        <button className="fw-navbtn" aria-current={tab === "cheap" ? "page" : undefined} onClick={() => go("cheap")}><span className="ic"><Icon name="spark" /></span>撿便宜</button>
        <button className="fw-navbtn" aria-current={tab === "watch" ? "page" : undefined} onClick={() => go("watch")}>
          <span className="ic"><Icon name="watch" /></span>追蹤{hits > 0 && <span className="fw-badge" aria-label={hits + " 項已到價"}>{hits}</span>}
        </button>
        <button className="fw-navbtn" aria-current={tab === "settings" ? "page" : undefined} onClick={() => go("settings")}><span className="ic"><Icon name="settings" /></span>設定</button>
      </nav>

      {sheet && <WatchSheet init={sheet} onClose={() => setSheet(null)} onSave={saveWatch} />}
      {exportText != null && (
        <div className="fw-ov" onClick={(e) => { if (e.target === e.currentTarget) setExportText(null); }}>
          <div className="fw-sheet" role="dialog" aria-modal="true" aria-label="匯出設定">
            <div className="fw-grab" /><h2>匯出設定</h2>
            <p className="fw-lead">這份 JSON 是每天執行的排程程式要讀的設定。裡面包含你的信箱與 LINE User ID，請妥善保管。</p>
            <textarea className="fw-ta" readOnly value={exportText} onFocus={(e) => e.target.select()} aria-label="設定內容" />
            <div className="fw-btns"><button className="fw-btn" onClick={() => setExportText(null)}>關閉</button><button className="fw-btn pri" onClick={copyExport}>複製</button></div>
          </div>
        </div>
      )}
      {toast && <div className="fw-toast" role="status">{toast}</div>}
    </div>
  );
}
