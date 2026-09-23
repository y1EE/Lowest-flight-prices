// 票價守望 — 後端安全層 + 歷史價格 + 撿便宜掃描
//
// 端點一覽：
//   GET  /api/status            前端偵測模式用（demo / locked / live）
//   GET  /api/calendar          單一航線＋月份的日曆（Travelpayouts，含安全層）
//   GET  /api/hunts             列出「撿便宜」設定
//   POST /api/hunts             新增一組「撿便宜」設定
//   DELETE /api/hunts?id=       刪除一組
//   GET  /api/deals             列出目前找到的便宜機票
//   GET|POST /api/scan          真正掃描的入口，給外部排程呼叫（見下方「排程」）
//
// 排程說明（重要）：
//   Cloudflare Pages Functions 本身不支援 Cron Trigger（這是 Workers 才有的功能，
//   Pages 沒有）。所以「每天自動掃描」沒辦法只靠這個檔案自己完成，需要外部的東西
//   每天呼叫一次 /api/scan。README 裡有兩種做法：GitHub Actions（免費、建議）或另外
//   部署一個小 Worker 用它自己的 Cron Trigger 來呼叫這支端點。

const LIMIT = 50; // 每日硬上限（自訂，不是 Travelpayouts 官方額度）
const CACHE_HOURS = 24;
const SCAN_BUDGET_DEFAULT = 20; // 單次 /api/scan 最多消耗幾次外部呼叫，避免一次把全部額度用光
const NEAR_MONTHS = 3; // 「近期」：每次掃描都會盡量涵蓋的月數
const MIN_HISTORY_FOR_BASELINE = 20; // 這條航線要累積至少幾個「不同出發日」的資料點，基準價才夠穩
const MIN_SCAN_DAYS = 2; // 而且要跨過至少幾個不同的「掃描日」，才不會只憑一次快照就下判斷

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8", "cache-control": "no-store" },
  });
}
function monthStr(d) { return d.toISOString().slice(0, 7); }
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
function lastYear(ym) {
  const [y, m] = ym.split("-").map(Number);
  return (y - 1) + "-" + String(m).padStart(2, "0");
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/status") {
    if (env.DB) await initTables(env.DB);
    const mode = !env.TRAVELPAYOUTS_TOKEN ? "demo" : !env.DB ? "locked" : "live";
    const notify = { emailReady: !!env.RESEND_API_KEY, lineReady: !!env.LINE_CHANNEL_TOKEN };
    return json({ mode, dailyLimit: LIMIT, usage: env.DB ? await usageToday(env.DB) : 0, notify });
  }

  if (path === "/api/calendar") return handleCalendar(request, env, url);
  if (path === "/api/hunts") return handleHunts(request, env, url);
  if (path === "/api/deals") return handleDeals(request, env, url);
  if (path === "/api/deals/verify") return handleVerifyDeal(request, env);
  if (path === "/api/scan") return handleScan(request, env, url);
  if (path === "/api/notify-settings") return handleNotifySettings(request, env);

  return json({ error: "Not found" }, 404);
}

/* ============================ 每日票價日曆 ============================ */
async function handleCalendar(request, env, url) {
  const origin = (url.searchParams.get("origin") || "").toUpperCase();
  const destination = (url.searchParams.get("destination") || "").toUpperCase();
  const month = url.searchParams.get("month") || "";
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: "請確認 origin／destination（三碼機場代碼）與 month（YYYY-MM）。" }, 400);
  }

  if (!env.TRAVELPAYOUTS_TOKEN) return json({ ...demoCalendar(origin, destination, month), safety: { used: 0, limit: LIMIT } });
  if (!env.DB) return json({ error: "安全鎖定：已設定 TRAVELPAYOUTS_TOKEN，但尚未綁定 D1（DB），因此不會呼叫 Travelpayouts。" }, 503);

  await initTables(env.DB);
  const key = [origin, destination, month].join("|");
  const cached = await readFresh(env.DB, key);
  if (cached) {
    const history = await historyStats(env.DB, origin, destination, month);
    return json({ ...cached, history, cache: "hit", safety: { used: await usageToday(env.DB), limit: LIMIT } });
  }

  const used = await usageToday(env.DB);
  if (used >= LIMIT) {
    const stale = await readAny(env.DB, key);
    if (stale) {
      const history = await historyStats(env.DB, origin, destination, month);
      return json({ ...stale, history, cache: "stale", note: "今日已達自訂上限，顯示先前抓到的資料。", safety: { used, limit: LIMIT } });
    }
    return json({ error: `今日已達自訂 ${LIMIT} 次外部 API 上限，這條航線這個月還沒有快取可用，請明天再試。` }, 429);
  }

  await incUsage(env.DB);
  try {
    const data = await callTravelpayouts(env, origin, destination, month);
    await writeCache(env.DB, key, data);
    await recordHistory(env.DB, origin, destination, data.days);
    const history = await historyStats(env.DB, origin, destination, month);
    return json({ ...data, history, cache: "miss", safety: { used: await usageToday(env.DB), limit: LIMIT } });
  } catch (err) {
    const stale = await readAny(env.DB, key);
    if (stale) {
      const history = await historyStats(env.DB, origin, destination, month);
      return json({ ...stale, history, cache: "stale", note: "來源暫時失敗，顯示先前抓到的資料。", safety: { used: await usageToday(env.DB), limit: LIMIT } });
    }
    return json({ error: "Travelpayouts：" + err.message }, 502);
  }
}

/* ============================ 撿便宜：hunts CRUD ============================ */
// hunts：使用者設定的「幫我撿便宜」條件。單人使用，沒有帳號系統。
async function handleHunts(request, env, url) {
  if (!env.DB) return json({ error: "尚未綁定 D1（DB），無法儲存撿便宜設定。" }, 503);
  await initTables(env.DB);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM hunts ORDER BY created_at DESC").all();
    return json({ hunts: results.map(rowToHunt) });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "格式錯誤" }, 400); }
    const { origin, label, destinations, monthsAhead, thresholdPct } = body || {};
    if (!/^[A-Z]{3}$/.test(String(origin || "").toUpperCase())) return json({ error: "缺少有效的出發地機場代碼" }, 400);
    if (!Array.isArray(destinations) || !destinations.length || destinations.some((d) => !/^[A-Z]{3}$/.test(String(d).toUpperCase()))) {
      return json({ error: "destinations 需要是三碼機場代碼的陣列，至少一個" }, 400);
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO hunts(id, origin, label, destinations, months_ahead, threshold_pct, created_at) VALUES (?,?,?,?,?,?,?)"
    )
      .bind(
        id,
        origin.toUpperCase(),
        String(label || "").slice(0, 60),
        JSON.stringify(destinations.map((d) => d.toUpperCase())),
        Math.max(1, Math.min(12, Number(monthsAhead) || NEAR_MONTHS)),
        Math.max(5, Math.min(60, Number(thresholdPct) || 20)),
        new Date().toISOString()
      )
      .run();
    return json({ ok: true, id });
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "缺少 id" }, 400);
    await env.DB.prepare("DELETE FROM hunts WHERE id=?").bind(id).run();
    await env.DB.prepare("DELETE FROM deals WHERE hunt_id=?").bind(id).run();
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
function rowToHunt(r) {
  return { id: r.id, origin: r.origin, label: r.label, destinations: JSON.parse(r.destinations), monthsAhead: r.months_ahead, thresholdPct: r.threshold_pct, createdAt: r.created_at };
}

/* ============================ 撿便宜：查看目前找到的便宜機票 ============================ */
async function handleDeals(request, env, url) {
  if (!env.DB) return json({ deals: [] });
  await initTables(env.DB);
  const huntId = url.searchParams.get("huntId");
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
  const sql = huntId
    ? "SELECT * FROM deals WHERE hunt_id=? ORDER BY found_at DESC LIMIT ?"
    : "SELECT * FROM deals ORDER BY found_at DESC LIMIT ?";
  const stmt = huntId ? env.DB.prepare(sql).bind(huntId, limit) : env.DB.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return json({
    deals: results.map((r) => ({
      id: r.id,
      huntId: r.hunt_id,
      origin: r.origin,
      destination: r.destination,
      flightDate: r.flight_date,
      price: r.price,
      baseline: r.baseline_price,
      pctBelow: r.pct_below,
      foundAt: r.found_at,
      deepLink: r.deep_link,
      verifiedPrice: r.verified_price ?? null,
      verifiedAt: r.verified_at || null,
    })),
  });
}

/* ============================ 撿便宜：核對結果回寫（給爬蟲驗證腳本用） ============================
   這支端點本身不爬任何網站，只負責「收下爬蟲驗證出來的結果」。真正開瀏覽器爬
   Google Flights 之類網站的程式碼跑在別的地方（建議是 GitHub Actions，理由見 README），
   因為 Cloudflare Pages Functions 這一層的 runtime 開不了真的瀏覽器。
   用跟 /api/scan 一樣的 SCAN_TOKEN 保護，避免任何人亂寫資料進來。 */
async function handleVerifyDeal(request, env) {
  if (!env.DB) return json({ error: "尚未綁定 D1（DB）。" }, 503);
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.SCAN_TOKEN || given !== env.SCAN_TOKEN) return json({ error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body; try { body = await request.json(); } catch (e) { return json({ error: "格式錯誤" }, 400); }
  const id = String(body?.id || "");
  const price = Number(body?.actualPrice);
  if (!id) return json({ error: "缺少 id" }, 400);
  if (!Number.isFinite(price) || price <= 0) return json({ error: "actualPrice 必須是正數" }, 400);

  await initTables(env.DB);
  const res = await env.DB.prepare("UPDATE deals SET verified_price=?, verified_at=? WHERE id=?").bind(Math.round(price), new Date().toISOString(), id).run();
  if ((res.meta?.changes ?? 1) === 0) return json({ error: "找不到這筆 deal（可能已經被刪除）" }, 404);
  return json({ ok: true });
}

/* ============================ 撿便宜：掃描（給外部排程呼叫） ============================ */
async function handleScan(request, env, url) {
  if (!env.TRAVELPAYOUTS_TOKEN || !env.DB) {
    return json({ error: "掃描需要 TRAVELPAYOUTS_TOKEN 與 D1 都設定好。" }, 503);
  }
  const given = url.searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.SCAN_TOKEN || given !== env.SCAN_TOKEN) return json({ error: "unauthorized" }, 401);

  await initTables(env.DB);
  const scanBudget = Math.max(1, Math.min(LIMIT, Number(url.searchParams.get("budget")) || Number(env.SCAN_BUDGET) || SCAN_BUDGET_DEFAULT));

  const { results: hunts } = await env.DB.prepare("SELECT * FROM hunts").all();
  const thisMonth = monthStr(new Date());

  // 候選清單：每個 hunt 的每個目的地 × 每個月份，near（近 NEAR_MONTHS 個月）優先。
  // 注意這裡故意「不」去重：不同 hunt 就算盯著同一條航線同一個月，也要各自用
  // 自己的門檻判斷一次——去重的只會是下面的「要不要重打 Travelpayouts」那一步。
  const candidates = [];
  for (const h of hunts) {
    const hunt = rowToHunt(h);
    for (const dest of hunt.destinations) {
      for (let i = 0; i < hunt.monthsAhead; i++) {
        const key = [hunt.origin, dest, addMonths(thisMonth, i)].join("|");
        candidates.push({ hunt, origin: hunt.origin, destination: dest, month: addMonths(thisMonth, i), near: i < NEAR_MONTHS, key });
      }
    }
  }

  // 要「實際打 Travelpayouts」的候選才需要去重＋排序＋額度限制；
  // 越久沒更新的越優先，near（近 NEAR_MONTHS 個月）排在 far 前面。
  const uniqKeys = [...new Set(candidates.map((c) => c.key))];
  const withAge = [];
  for (const key of uniqKeys) {
    const [origin, destination, month] = key.split("|");
    const near = candidates.some((c) => c.key === key && c.near);
    const row = await env.DB.prepare("SELECT t FROM flight_cache WHERE k=?").bind(key).first();
    withAge.push({ key, origin, destination, month, near, lastScan: row ? row.t : "" }); // 空字串排最前面＝從沒掃過
  }
  withAge.sort((a, b) => (a.near === b.near ? (a.lastScan < b.lastScan ? -1 : 1) : a.near ? -1 : 1));

  let used = await usageToday(env.DB);
  const report = { checked: [], deals: [], skipped: 0, usageStart: used };
  const dataByKey = new Map(); // 這一輪抓到（或從快取讀到）的資料，之後給每個 hunt 各自比對用
  for (const c of withAge) {
    if (report.checked.length >= scanBudget) { report.skipped++; continue; }
    if (used >= LIMIT) { report.skipped++; continue; }
    // 24 小時內掃過的不用重掃（沿用跟 /api/calendar 一樣的快取規則）
    const fresh = await readFresh(env.DB, c.key);
    let data = fresh;
    if (!data) {
      await incUsage(env.DB); used++;
      try {
        data = await callTravelpayouts(env, c.origin, c.destination, c.month);
        await writeCache(env.DB, c.key, data);
        await recordHistory(env.DB, c.origin, c.destination, data.days);
      } catch (err) {
        report.checked.push({ origin: c.origin, destination: c.destination, month: c.month, error: err.message });
        continue;
      }
    }
    report.checked.push({ origin: c.origin, destination: c.destination, month: c.month, days: Object.keys(data.days).length, cache: fresh ? "hit" : "miss" });
    dataByKey.set(c.key, data);
  }

  // 對每個 hunt 自己的每個候選（不去重），只要那個 key 這輪有資料可用，就用這個 hunt
  // 自己的門檻各自判斷一次——這樣兩個 hunt 盯著同一條航線、不同門檻，才會各自正確運作。
  const foundDate = today();
  for (const c of candidates) {
    const data = dataByKey.get(c.key);
    if (!data) continue; // 這個 key 這輪沒抓到（被額度擋下或本來就失敗），跳過
    const baseline = await getBaseline(env.DB, c.origin, c.destination);
    if (baseline.n < MIN_HISTORY_FOR_BASELINE || baseline.scanDays < MIN_SCAN_DAYS) continue;
    for (const [flightDate, list] of Object.entries(data.days)) {
      const price = list[0].price;
      const pctBelow = Math.round((1 - price / baseline.median) * 100);
      if (pctBelow >= c.hunt.thresholdPct) {
        const dealId = crypto.randomUUID();
        const deepLink = googleFlightsLink(c.origin, c.destination, flightDate);
        // 同一個 hunt、同一條航線、同一個出發日、同一天掃描到，只留一筆，
        // 避免同一天內重跑掃描時一直重複插入一樣的 deal。
        const res = await env.DB.prepare(
          "INSERT OR IGNORE INTO deals(id, hunt_id, origin, destination, flight_date, price, baseline_price, pct_below, found_at, found_date, deep_link) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        )
          .bind(dealId, c.hunt.id, c.origin, c.destination, flightDate, price, Math.round(baseline.median), pctBelow, new Date().toISOString(), foundDate, deepLink)
          .run();
        if ((res.meta?.changes ?? 1) !== 0) report.deals.push({ origin: c.origin, destination: c.destination, flightDate, price, pctBelow });
      }
    }
  }
  report.usageEnd = await usageToday(env.DB);
  if (report.deals.length) report.notified = await notifyNewDeals(env, report.deals);
  return json(report);
}
function googleFlightsLink(origin, destination, flightDate) {
  // Google Flights 的搜尋深連結（單程），不需要 API key，直接打開瀏覽器讓使用者自己核對。
  const q = encodeURIComponent(`Flights from ${origin} to ${destination} on ${flightDate}`);
  return `https://www.google.com/travel/flights?q=${q}`;
}

/* ============================ 通知：Email（Resend）／LINE（Messaging API） ============================
   收件地址（要寄去哪）存在 D1 的 notify_settings，可以從前端設定頁改。
   真正負責寄送的金鑰（RESEND_API_KEY／LINE_CHANNEL_TOKEN）一律是 Cloudflare 的 Secret，
   不會出現在前端或 D1 裡——這兩件事故意分開，收件地址可以隨時改，金鑰只有你自己看得到。
   兩者都沒設定齊全時，就只是把結果存進 deals 表，網頁上看得到，但不會寄出任何通知。 */
async function notifyNewDeals(env, deals) {
  const out = { email: "skip", line: "skip" };
  let settings = null;
  try { settings = await getNotifySettings(env.DB); } catch (e) { /* 沒有設定表也沒關係，當作都沒填 */ }

  if (settings?.email && env.RESEND_API_KEY) {
    try { await sendEmail(env, settings.email, deals); out.email = "sent"; }
    catch (e) { out.email = "error: " + e.message; }
  } else if (settings?.email) out.email = "設定了收件信箱，但後端沒有 RESEND_API_KEY，略過";

  if (settings?.lineUserId && env.LINE_CHANNEL_TOKEN) {
    try { await sendLine(env, settings.lineUserId, deals); out.line = "sent"; }
    catch (e) { out.line = "error: " + e.message; }
  } else if (settings?.lineUserId) out.line = "設定了 LINE User ID，但後端沒有 LINE_CHANNEL_TOKEN，略過";

  return out;
}
function dealLines(deals, max) {
  return deals.slice(0, max).map((d) => `${d.origin} → ${d.destination}　${d.flightDate}　NT$ ${d.price}（便宜 ${d.pctBelow}%）`);
}
async function sendEmail(env, to, deals) {
  const from = env.RESEND_FROM || "onboarding@resend.dev";
  const lines = dealLines(deals, 20);
  const more = deals.length > 20 ? `\n…還有 ${deals.length - 20} 筆，上網站看完整清單。` : "";
  const html =
    `<p>這次掃描找到 ${deals.length} 筆划算的機票：</p><ul>` +
    dealLines(deals, 20).map((l) => `<li>${l}</li>`).join("") +
    `</ul>` + (deals.length > 20 ? `<p>還有 ${deals.length - 20} 筆，上網站看完整清單。</p>` : "") +
    `<p style="color:#888;font-size:12px">價格來自 Travelpayouts 的快取資料，下單前請先核對一次。</p>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.RESEND_API_KEY },
    body: JSON.stringify({ from, to: [to], subject: `票價守望：找到 ${deals.length} 筆便宜機票`, html }),
  });
  if (!res.ok) throw new Error("Resend HTTP " + res.status + "：" + (await res.text()).slice(0, 200));
}
async function sendLine(env, userId, deals) {
  const lines = dealLines(deals, 10);
  const more = deals.length > 10 ? `\n…還有 ${deals.length - 10} 筆，上網站看完整清單。` : "";
  const text = `票價守望找到 ${deals.length} 筆便宜機票：\n\n` + lines.join("\n") + more;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.LINE_CHANNEL_TOKEN },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) throw new Error("LINE HTTP " + res.status + "：" + (await res.text()).slice(0, 200));
}
async function getNotifySettings(db) {
  const r = await db.prepare("SELECT email, line_user_id FROM notify_settings WHERE id=1").first();
  return r ? { email: r.email || "", lineUserId: r.line_user_id || "" } : null;
}
async function handleNotifySettings(request, env) {
  if (!env.DB) return json({ error: "尚未綁定 D1（DB）。" }, 503);
  await initTables(env.DB);
  if (request.method === "GET") {
    const s = (await getNotifySettings(env.DB)) || { email: "", lineUserId: "" };
    return json(s);
  }
  if (request.method === "PUT") {
    let body; try { body = await request.json(); } catch (e) { return json({ error: "格式錯誤" }, 400); }
    const email = String(body?.email || "").slice(0, 200);
    const lineUserId = String(body?.lineUserId || "").slice(0, 60);
    await env.DB.prepare(
      "INSERT INTO notify_settings(id, email, line_user_id, updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, line_user_id=excluded.line_user_id, updated_at=excluded.updated_at"
    ).bind(email, lineUserId, new Date().toISOString()).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

/* ============================ D1 ============================ */
async function initTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS flight_cache(k TEXT PRIMARY KEY, p TEXT NOT NULL, t TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS api_usage(d TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)").run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS price_history(origin TEXT NOT NULL, destination TEXT NOT NULL, flight_date TEXT NOT NULL, scan_date TEXT NOT NULL, price INTEGER NOT NULL, airline TEXT, stops INTEGER, PRIMARY KEY(origin,destination,flight_date,scan_date))"
    )
    .run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_history_route_date ON price_history(origin,destination,flight_date)").run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS hunts(id TEXT PRIMARY KEY, origin TEXT NOT NULL, label TEXT, destinations TEXT NOT NULL, months_ahead INTEGER NOT NULL, threshold_pct INTEGER NOT NULL, created_at TEXT NOT NULL)"
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS deals(id TEXT PRIMARY KEY, hunt_id TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL, flight_date TEXT NOT NULL, price INTEGER NOT NULL, baseline_price INTEGER NOT NULL, pct_below INTEGER NOT NULL, found_at TEXT NOT NULL, found_date TEXT NOT NULL, deep_link TEXT, UNIQUE(hunt_id, origin, destination, flight_date, found_date))"
    )
    .run();
  await db.prepare("CREATE TABLE IF NOT EXISTS notify_settings(id INTEGER PRIMARY KEY CHECK (id=1), email TEXT, line_user_id TEXT, updated_at TEXT)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_deals_found ON deals(found_at)").run();
  // 舊版部署過的 D1 沒有這兩欄，用「試著加、加不了就當作已經有了」的方式做遷移，
  // 不用手動跑 SQL、也不會因為重複部署而報錯。
  for (const sql of ["ALTER TABLE deals ADD COLUMN verified_price INTEGER", "ALTER TABLE deals ADD COLUMN verified_at TEXT"]) {
    try { await db.prepare(sql).run(); } catch (e) { /* 欄位已經存在，忽略 */ }
  }
}
const today = () => new Date().toISOString().slice(0, 10);
async function usageToday(db) {
  const r = await db.prepare("SELECT n FROM api_usage WHERE d=?").bind(today()).first();
  return r?.n || 0;
}
async function incUsage(db) {
  await db.prepare("INSERT INTO api_usage(d,n) VALUES(?,1) ON CONFLICT(d) DO UPDATE SET n=n+1").bind(today()).run();
}
async function readFresh(db, key) {
  const cutoff = new Date(Date.now() - CACHE_HOURS * 3600000).toISOString();
  const r = await db.prepare("SELECT p FROM flight_cache WHERE k=? AND t>=?").bind(key, cutoff).first();
  return r ? JSON.parse(r.p) : null;
}
async function readAny(db, key) {
  const r = await db.prepare("SELECT p FROM flight_cache WHERE k=?").bind(key).first();
  return r ? JSON.parse(r.p) : null;
}
async function writeCache(db, key, payload) {
  await db.prepare("INSERT INTO flight_cache(k,p,t) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET p=excluded.p,t=excluded.t").bind(key, JSON.stringify(payload), new Date().toISOString()).run();
}
// 把某次月曆查詢結果，逐日寫進歷史表：每個（航線,出發日,今天）只留一筆，
// 存量跟「追蹤幾條航線」成正比，不會無限長大。
async function recordHistory(db, origin, destination, days) {
  const scanDate = today();
  const stmts = Object.entries(days).map(([flightDate, list]) =>
    db
      .prepare("INSERT INTO price_history(origin,destination,flight_date,scan_date,price,airline,stops) VALUES (?,?,?,?,?,?,?) ON CONFLICT(origin,destination,flight_date,scan_date) DO UPDATE SET price=MIN(price,excluded.price)")
      .bind(origin, destination, flightDate, scanDate, list[0].price, list[0].airline || "", list[0].stops || 0)
  );
  if (stmts.length) await db.batch(stmts);
}
// 「去年同期」統計：從歷史表抓去年同一個月，逐日最低價，算 min／median／p10。
// 資料不夠時回傳 n:0，前端會知道要繼續用示範估算頂著。
async function historyStats(db, origin, destination, month) {
  const ly = lastYear(month);
  const { results } = await db
    .prepare("SELECT flight_date, MIN(price) AS p FROM price_history WHERE origin=? AND destination=? AND flight_date LIKE ? GROUP BY flight_date")
    .bind(origin, destination, ly + "-%")
    .all();
  const vals = results.map((r) => r.p).sort((a, b) => a - b);
  if (!vals.length) return { n: 0 };
  const q = (arr, p) => { const x = (arr.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return arr[lo] + (arr[hi] - arr[lo]) * (x - lo); };
  return { n: vals.length, lyMin: vals[0], lyMed: Math.round(q(vals, 0.5)), p10: Math.round(q(vals, 0.1)) };
}
// 「這條航線目前看過的基準價」：全部已知出發日期（不限月份）逐日最低價的中位數，
// 另外回報這些資料橫跨了幾個不同的「掃描日」，用來判斷基準夠不夠穩。
async function getBaseline(db, origin, destination) {
  const { results } = await db
    .prepare("SELECT flight_date, MIN(price) AS p FROM price_history WHERE origin=? AND destination=? GROUP BY flight_date")
    .bind(origin, destination)
    .all();
  const vals = results.map((r) => r.p).sort((a, b) => a - b);
  const scanRow = await db.prepare("SELECT COUNT(DISTINCT scan_date) AS n FROM price_history WHERE origin=? AND destination=?").bind(origin, destination).first();
  if (!vals.length) return { n: 0, median: null, scanDays: 0 };
  const x = (vals.length - 1) * 0.5, lo = Math.floor(x), hi = Math.ceil(x);
  return { n: vals.length, median: vals[lo] + (vals[hi] - vals[lo]) * (x - lo), scanDays: scanRow?.n || 0 };
}

/* ---------- Travelpayouts ---------- */
async function callTravelpayouts(env, origin, destination, month) {
  const params = new URLSearchParams({ origin, destination, month: month + "-01", currency: "twd", token: env.TRAVELPAYOUTS_TOKEN });
  const res = await fetch("https://api.travelpayouts.com/v2/prices/month-matrix?" + params);
  if (res.status === 429) throw new Error("429 rate limit（Travelpayouts 官方限流）");
  const body = await res.json();
  if (!res.ok || body.success === false) throw new Error(body.error || "HTTP " + res.status);
  const days = {};
  for (const row of body.data || []) {
    const price = Math.round(Number(row.value) || 0);
    const dateStr = String(row.depart_date || "").slice(0, 10);
    if (!price || !dateStr) continue;
    (days[dateStr] ||= []).push({ price, airline: row.airline || "", stops: Number(row.number_of_changes) || 0 });
  }
  for (const list of Object.values(days)) list.sort((a, b) => a.price - b.price);
  return { mode: "live", note: "Travelpayouts Data API 為快取／參考價格，實際下單金額以航空公司或訂票網站當下顯示為準。", days };
}

/* ---------- 示範資料（只在沒有 Token 時使用） ---------- */
function demoCalendar(origin, destination, month) {
  const seed = [...(origin + destination + month)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [y, m] = month.split("-").map(Number);
  const dayCount = new Date(y, m, 0).getDate();
  const days = {};
  for (let d = 1; d <= dayCount; d++) {
    const price = 3200 + ((seed * 37 + d * 91) % 4600);
    days[month + "-" + String(d).padStart(2, "0")] = [{ price, airline: "Demo", stops: 0 }];
  }
  return { mode: "demo", note: "尚未設定 TRAVELPAYOUTS_TOKEN；這是端點本身的測試資料。", days, history: { n: 0 } };
}
