// scripts/verify-deals.mjs
//
// 「API 找便宜、爬蟲驗證」的驗證那一半：只對 /api/scan 剛找到的少數幾筆
// 便宜機票，開一個真的瀏覽器連去 Google Flights 的搜尋結果，把畫面上顯示
// 的價格抓下來，回寫到後端。不是全站爬蟲，一天可能只開瀏覽器個位數次。
//
// 這支程式碼「跑在哪裡」很重要：Cloudflare Pages Functions 開不了真的瀏覽器，
// 所以這支程式碼是設計成在 GitHub Actions 的 Ubuntu Runner 上執行（一台真的
// Linux 虛擬機，可以裝 Chromium），不是部署到 Cloudflare 上。
//
// ⚠️ 誠實聲明：這支腳本是照 Google Flights 目前一般的頁面結構寫的，但我在
// 產生這份程式碼的環境裡連不到 google.com，沒辦法實際打開頁面測試過。
// Google Flights 是會改版的動態網站，第一次跑、或跑一陣子後價格抓不到／抓錯，
// 都不代表你設定錯了，多半是他們改了頁面結構，需要打開瀏覽器實際看一次現在
// 的畫面、更新下面 PRICE_SELECTORS 或 extractPrice() 的邏輯。腳本設計成
// 「抓不到就跳過、不寫入不確定的資料」，寧可少驗證幾筆，也不要回寫錯的價格。
//
// 用法（本機測試）：
//   SITE_URL=https://your-site.pages.dev SCAN_TOKEN=xxx node scripts/verify-deals.mjs --limit=3 --debug
// --debug 會把每一步截圖存到 ./verify-debug/，方便你比對頁面實際長怎樣、調整程式。

import { chromium } from "playwright";
import fs from "fs";

const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
const SCAN_TOKEN = process.env.SCAN_TOKEN || "";
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const LIMIT = Math.max(1, Math.min(10, Number(args.limit) || 5)); // 每次最多驗證幾筆，故意設小
const DEBUG = !!args.debug;
const NAV_TIMEOUT = 25000;

if (!SITE_URL || !SCAN_TOKEN) {
  console.error("缺少環境變數：SITE_URL、SCAN_TOKEN 都要設定。");
  process.exit(1);
}
if (DEBUG) fs.mkdirSync("verify-debug", { recursive: true });

async function fetchJSON(path, opts = {}) {
  const r = await fetch(SITE_URL + path, opts);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}：${j?.error || "未知錯誤"}`);
  return j;
}

// 從頁面可見文字裡，抓「NT$」「$」後面接數字的片段，取出看起來合理的最低價。
// 用「可見文字」而不是特定 CSS class，是因為 class 名稱在這類前端框架產出的頁面
// 幾乎每次改版都會變，文字內容（貨幣符號＋數字）相對穩定，抓錯的代價也比較容易
// 用「價格是否落在合理範圍」這個檢查擋下來。
function extractPrice(text) {
  const matches = [...text.matchAll(/(?:NT\$|TWD|\$)\s?([\d,]{3,7})/g)].map((m) => Number(m[1].replace(/,/g, "")));
  // 過濾掉太離譜的數字（例如誤抓到年份、電話號碼），機票價格抓一個粗略合理範圍。
  const plausible = matches.filter((n) => n >= 500 && n <= 300000);
  if (!plausible.length) return null;
  return Math.min(...plausible);
}

async function verifyOne(browser, deal) {
  const page = await browser.newPage({ locale: "zh-TW" });
  try {
    await page.goto(deal.deepLink, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    // Google Flights 是重度 SPA，價格是非同步跑出來的；等一下讓它有機會渲染完。
    await page.waitForTimeout(4000);
    if (DEBUG) await page.screenshot({ path: `verify-debug/${deal.id}.png`, fullPage: true }).catch(() => {});
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
    const price = extractPrice(bodyText);
    return price;
  } catch (e) {
    console.log(`  ${deal.origin}→${deal.destination} ${deal.flightDate}：開頁面失敗（${e.message}），跳過`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  console.log(`讀取最近的撿便宜結果（最多 ${LIMIT} 筆）…`);
  const { deals } = await fetchJSON(`/api/deals?limit=${LIMIT}`);
  const todo = deals.filter((d) => !d.verifiedAt); // 已經核對過的不用重驗
  if (!todo.length) { console.log("目前沒有還沒核對過的便宜機票，結束。"); return; }
  console.log(`有 ${todo.length} 筆還沒核對，開始逐一打開瀏覽器查看…`);

  const browser = await chromium.launch();
  let okCount = 0, mismatchCount = 0, skipCount = 0;
  for (const deal of todo) {
    const actual = await verifyOne(browser, deal);
    if (actual == null) { skipCount++; continue; }
    const diffPct = Math.round((Math.abs(actual - deal.price) / deal.price) * 100);
    const tag = diffPct <= 15 ? "接近，判定為核對通過" : "跟系統記錄差距較大，仍回寫但請自己再看一眼";
    if (diffPct > 15) mismatchCount++; else okCount++;
    console.log(`  ${deal.origin}→${deal.destination} ${deal.flightDate}：系統記錄 NT$${deal.price}，Google Flights 目前約 NT$${actual}（差 ${diffPct}%，${tag}）`);
    try {
      await fetchJSON("/api/deals/verify", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + SCAN_TOKEN },
        body: JSON.stringify({ id: deal.id, actualPrice: actual }),
      });
    } catch (e) {
      console.log(`    回寫失敗：${e.message}`);
    }
  }
  await browser.close();
  console.log(`\n完成。核對通過 ${okCount} 筆、價差較大 ${mismatchCount} 筆、抓不到價格跳過 ${skipCount} 筆。`);
  if (skipCount === todo.length && todo.length > 0) {
    console.log("這次全部都抓不到價格，很可能是 Google Flights 改了頁面結構，去看看 verify-debug/ 底下的截圖（要加 --debug 才會存），對照 extractPrice() 需不需要調整。");
  }
}

main().catch((e) => { console.error("執行失敗：", e); process.exit(1); });
