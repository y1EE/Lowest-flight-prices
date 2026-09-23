# 票價守望（Cloudflare Pages 版）

這是一個 Git repo，用 GitHub 連動 Cloudflare Pages 部署：每次 `git push`，Cloudflare 會自動重新 build、重新上線，不用手動打包或上傳。裡面有：

- **前端**：原始碼在 `src/FlightWatchApp.jsx`，`npm run build` 會用 esbuild 打包成 `bundle.js`（這個檔案故意不進版控，見下面 `.gitignore` 說明，交給 Cloudflare 部署時自動 build）。
- **後端**：`functions/api/[[path]].js`，一支 Cloudflare Pages Function，包辦安全存取 Travelpayouts、累積歷史價格、以及「撿便宜」的設定、掃描與核對結果。
- **排程**：`.github/workflows/daily-scan.yml`，用 GitHub Actions 每天呼叫一次後端的掃描端點，再用真的瀏覽器核對其中幾筆結果（原因見下面「為什麼用 GitHub Actions」）。
- **驗證腳本**：`scripts/verify-deals.mjs`，GitHub Actions 用來開 Chromium 核對 Google Flights 價格的程式，細節與重要但書見下面「爬蟲核對」。

## 這一版能做什麼

App 首頁有兩個入口：

- **指定航班追蹤**：跟前一版一樣，日曆／探索／來回／多地點／追蹤清單。只有「每日票價」畫面裡、單程、當月的日曆格子會接上 Travelpayouts 真實資料，其餘畫面仍是示範資料（原因不變：50 次／天的額度撐不起全部畫面都查真實資料）。
- **幫我撿便宜**：設定「從哪裡出發、想去哪個國家、看多遠、便宜的標準」，後端會每天自動掃一輪，出現明顯划算的價格才會列出來，附一個 Google Flights 的搜尋連結讓你自己核對再訂票，GitHub Actions 也會自動核對其中幾筆。**找到便宜機票時，會直接寄 Email 或推播 LINE 通知你**（設定步驟見下面「設定通知」）。

## 額度保護機制

- 同一條航線、同一個月，24 小時內重複查詢會直接讀 D1 快取，不會再打 Travelpayouts。
- 每天最多 **50 次**外部請求，是程式自己設的硬上限（`functions/api/[[path]].js` 最上面的 `LIMIT`），不是 Travelpayouts 官方額度。
- 「撿便宜」的掃描每次最多消耗 `SCAN_BUDGET`（預設 20，可用 `/api/scan?budget=` 覆寫）次外部請求，跟你自己瀏覽日曆共用同一個每日上限，不會互相排擠到用光。
- 沒有 `TRAVELPAYOUTS_TOKEN`：整組後端只回示範資料，0 次外部呼叫。
- 有 Token、沒有綁 D1：**安全鎖定**，不會因為沒有快取機制而一直重打。
- 已經到當日上限：有舊快取就顯示舊資料，沒有就回錯誤，前端自動退回示範資料。
- 呼叫失敗（含逾時、429）也照樣計入當日次數，避免自動重試把額度打爆。

## 撿便宜的判斷邏輯

1. 每次「日曆」查詢或「撿便宜」掃描，只要真的打了 Travelpayouts，就會把那個月每一天的最低價寫進 D1 的 `price_history` 表。
2. 一條航線要**至少累積 20 個不同出發日、而且橫跨至少 2 個不同的掃描日**，基準價才會開始生效——這是故意的：只憑一次月曆快照的高低起伏就判斷「便宜」很容易誤判，所以要等後端連續掃過幾天，累積的資料橫跨了真正的時間，判斷才穩。**剛設定好的撿便宜範圍，前幾天不會有任何結果，這是正常的，不是壞掉。**
3. 基準價是這條航線目前所有已知出發日期、逐日最低價的**中位數**（不是平均數，比較不會被單一天的極端值拉走）。
4. 某一天的價格低於基準價超過設定的門檻（例如 20%），就記一筆「便宜機票」，附上這條航線、這一天的 Google Flights 搜尋連結。
5. 同一個範圍、同一條航線、同一個出發日，同一天只會記一次，不會因為重跑掃描而重複出現。

「去年同期最低」「統計低檔」這兩個數字，只要 `price_history` 裡累積到真正的去年同期資料，`/api/calendar` 就會回傳真實算出來的數字，日曆頁會自動改用真實數字並拿掉「示範估算」的標示；資料不夠時就繼續用示範引擎頂著，不會顯示錯誤或空白。這代表這兩個數字**需要實際運作一年以上**才會是真的跨年比較，這點沒有辦法加速。

## 部署步驟（用 Git 連動，之後每次 push 自動上線）

1. 到 [Travelpayouts](https://www.travelpayouts.com/developers/api) 申請一組免費的 Data API token。
2. 把這個資料夾推成一個 GitHub repo（`git init && git add -A && git commit -m "init" && git push`，或直接在 GitHub 網站上新增 repo 後照指示推上去）。
3. 到 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**，選你剛推上去的 repo。
4. Build 設定：
   - Framework preset：選 **None**
   - Build command：`npm run build`
   - Build output directory：`/`（留空或填 `/` 都代表 repo 根目錄）
5. 這一步會先部署一次，但 D1／Secret 都還沒設定，會停在示範模式，這是正常的，先繼續下一步。
6. Pages 專案 → **Settings → Functions → D1 database bindings**，新增一個綁定：Variable name 填 `DB`，指到你新建的 D1 database（沒有的話先在 Cloudflare Dashboard 建一個，例如叫 `flight-watch-db`）。
7. Pages 專案 → **Settings → Environment variables**，新增以下 **Secret**：
   - `TRAVELPAYOUTS_TOKEN`：步驟 1 拿到的 token。
   - `SCAN_TOKEN`：自己隨便設一組夠長、夠亂的字串（例如用密碼產生器產生），用來保護 `/api/scan` 與 `/api/deals/verify`，避免不知情的人一直觸發掃描把你的額度用光，或亂寫核對結果進資料庫。
   - `RESEND_API_KEY`、`LINE_CHANNEL_TOKEN`（選填）：要收到撿便宜的 Email／LINE 通知才需要，申請步驟見下面「設定通知」，不設定的話撿便宜功能照常運作，只是不會寄通知。
8. 回到 **Deployments**，對最新的部署按 **Retry deployment**（讓它套用剛剛新增的綁定與 Secret），或直接 `git push` 一次觸發新部署。
9. 打開網站，「每日票價」日曆下面出現藍色即時參考價提示，代表前端接通了。

之後每次改完 `src/FlightWatchApp.jsx` 或 `functions/api/[[path]].js`，`git push` 上去 Cloudflare 就會自動重新 build、重新部署，不用再手動打包或上傳檔案。

資料表會在第一次呼叫時自動建立（包含之後版本新加的欄位，也是用「加得進去就加、加不進去就跳過」的方式自動處理），不用手動跑 SQL。

### 不想用 Git 連動，只想手動部署

也可以不接 GitHub，本機跑 `npm install && npm run build`，然後 `npx wrangler pages deploy .` 手動部署；這種情況下 `bundle.js` 就要自己記得每次改完原始碼都重新 build。D1／Secret 的設定步驟一樣。

### 本機開發

```
npm install
npm run dev   # 會先 build 一次，再用 wrangler 在本機模擬 Pages + Functions
```
本機模擬環境預設沒有 D1、沒有 Secret，會停在示範模式；要在本機也測到 live 模式，需要額外用 `wrangler d1` 建立本機資料庫並在 `wrangler.toml` 補上 `[[d1_databases]]` 設定，這部分屬於進階用法，不是必要步驟。

## 設定通知（Email／LINE）

撿便宜找到新的便宜機票時，`/api/scan` 會自動幫你寄 Email（用 [Resend](https://resend.com)）或推播 LINE（用 LINE 官方帳號的 Messaging API）。這兩個都要**先設定收件地址、也要後端有對應的金鑰**，兩個條件都滿足才會真的寄出；只滿足一半的話（例如你在設定頁填了信箱，但後端沒有 Resend 金鑰），撿便宜結果照常顯示在網頁上，只是不會寄信，`/api/scan` 的回應會清楚寫「略過」跟原因。

### 收件地址：在網頁的設定頁填

App 的「設定」分頁可以開關 Email／LINE 通知並填入收件信箱、LINE User ID，填完會自動同步到後端（存在 D1 的 `notify_settings`），不需要另外設定。

### 寄信：申請 Resend

1. 到 [resend.com](https://resend.com) 免費註冊，拿一組 API Key。免費方案每天 100 封、每月 3,000 封，對個人用綽綽有餘。
2. 免費方案預設只能寄給你自己在 Resend 註冊時用的那個信箱，除非你去 Resend 後台驗證一個自己的網域（加幾筆 DNS 記錄）。如果你設定頁填的收件信箱就是你自己拿去註冊 Resend 的信箱，不驗證網域也能收得到；驗證了網域之後，寄件位址（`RESEND_FROM`）也可以換成你自己網域下的地址，看起來比較不像測試信。
3. Cloudflare Pages 專案 → **Settings → Environment variables**，新增 Secret：`RESEND_API_KEY`（必填）、`RESEND_FROM`（選填，預設用 Resend 提供的 `onboarding@resend.dev`）。

### LINE 推播：申請官方帳號 + Messaging API

LINE Notify 已經在 2025 年 3 月底終止服務，現在要用 LINE 官方帳號本身的 Messaging API：

1. 到 [LINE Developers](https://developers.line.biz/) 建立一個 Provider，底下新增一個 **Messaging API** 類型的 Channel（就是一個 LINE 官方帳號）。
2. 在 Channel 設定頁找到 **Channel access token**，簽發一個長期的（long-lived），這就是 `LINE_CHANNEL_TOKEN`。
3. 用手機掃這個官方帳號的 QR Code、加它為好友（Messaging API 只能推播給已經加你為好友的人）。
4. 取得你自己的 **User ID**：最簡單的做法是在 Channel 設定裡打開 Webhook，隨便架一個會印出 `event.source.userId` 的端點（或用 LINE 官方的「Messaging API 使用手冊」教學走一次），傳一則訊息給官方帳號，從 log 裡把 User ID 複製下來，填進 App 設定頁的「LINE User ID」欄位。這組 ID 是 `U` 開頭、共 33 個字元。
5. Cloudflare Pages 專案 → **Settings → Environment variables**，新增 Secret：`LINE_CHANNEL_TOKEN`。

### 確認有沒有接通

App 的「設定」分頁最下面「資料與連線狀態」會顯示「後端 Email 寄送」「後端 LINE 推播」目前是否已經設定好金鑰；`/api/scan` 每次的回應也會有一個 `notified` 欄位，寫著這次有沒有寄出、或是略過的原因，GitHub Actions 的執行紀錄裡看得到。

## 設定每天自動掃描

### 為什麼用 GitHub Actions，不是 Cloudflare 自己的 Cron

Cloudflare **Workers** 有原生的 Cron Trigger，但 **Pages Functions 沒有**——這是兩個不同的東西，Pages 目前就是不支援排程。所以「每天自動掃描」沒辦法只靠這個資料夾自己完成，需要外部的東西每天呼叫一次 `/api/scan`。

這裡選 GitHub Actions，因為：免費、你大概率已經有 GitHub 帳號（用來放這份程式碼）、設定只要一個 YAML 檔。

### 設定步驟

1. Repo → **Settings → Secrets and variables → Actions → Secrets**，新增 `SCAN_TOKEN`，值跟你在 Cloudflare 設定的 `SCAN_TOKEN` **完全一樣**。
2. 同一個頁面切到 **Variables** 分頁，新增 `SITE_URL`，值是你實際部署的 Cloudflare Pages 網址（不要有結尾斜線，例如 `https://flight-watch.pages.dev`）。這個不是密碼，用 Variables 而不是 Secrets 存就好。
3. 需要的話調整 `.github/workflows/daily-scan.yml` 裡的 `cron: "10 8 * * *"`（UTC 時間）跟 `budget=30`（這次掃描最多花幾次額度）。
4. Push 上去後，到 repo 的 **Actions** 分頁，可以手動點一次 `workflow_dispatch` 先測試，確認會回傳掃描結果、Cloudflare 的用量數字有增加。

### 如果不想用 GitHub Actions

任何「每天固定時間打一次 URL」的服務都可以，例如 cron-job.org 這類免費的外部排程服務，或是另外部署一個小小的 Cloudflare **Worker**（不是 Pages），只用它自己的原生 Cron Trigger 去 `fetch` 這個 Pages 專案的 `/api/scan`——這樣就完全留在 Cloudflare 生態系裡，但等於要多維護一個獨立的 Worker 專案。改用別的排程服務時，`scripts/verify-deals.mjs` 這個爬蟲核對的步驟就要自己想辦法找地方跑（見下一節），因為它需要一個能開真的瀏覽器的環境，cron-job.org 這類純打 URL 的服務做不到。

## 爬蟲核對（GitHub Actions 裡的 Playwright 腳本）

Travelpayouts 抓到的是快取價格，不保證跟現在真的買到的價格一樣。`scripts/verify-deals.mjs` 是「先用 API 找出可能便宜的日期，再用真的瀏覽器核對其中幾筆」這個構想裡負責核對的那一半：`daily-scan.yml` 跑完 `/api/scan` 之後，會接著在同一台 GitHub Actions 的虛擬機上裝一個 Chromium，對最近還沒核對過的便宜機票（預設最多 5 筆）逐一打開 Google Flights 的搜尋結果、把畫面上的價格抓下來，寫回 `/api/deals/verify`。核對過的機票在撿便宜頁的卡片上會多一行「已用瀏覽器核對過」。

**這支腳本我沒辦法在建立它的環境裡實際連上 google.com 測試過**，只確定了程式邏輯本身（怎麼從一段文字裡抓出合理的價格數字）沒問題，沒辦法保證它現在打開 Google Flights 抓不抓得到東西——這點要請你自己驗證：

1. 先確定 `daily-scan.yml` 已經能正常呼叫 `/api/scan` 且撿便宜清單裡有結果。
2. 到 repo 的 **Actions** 分頁，手動觸發 `workflow_dispatch`，把「驗證步驟開 --debug」打勾。
3. 跑完之後，到這次執行紀錄下面下載 `verify-debug-screenshots` 這個 artifact，看看截圖裡 Google Flights 的頁面長什麼樣、有沒有正常顯示價格。
4. 如果畫面有價格、但撿便宜頁上沒出現「已核對」，通常是 `scripts/verify-deals.mjs` 裡 `extractPrice()` 的規則抓不到那個版面的價格格式，照截圖調整那段的規則（例如換一種貨幣符號、價格前後多了其他文字）。
5. 如果 Google Flights 直接顯示驗證碼或封鎖頁面，代表這個做法在你的情況下不適合長期用（Google 的服務條款本來就不鼓勵自動化存取），這時把 `.github/workflows/daily-scan.yml` 裡「用瀏覽器核對」那幾個 step 刪掉即可，撿便宜功能本身不受影響，只是少了自動核對這一層，改成你自己點深連結手動核對。

這支腳本刻意設計成「抓不到就跳過、不確定就不回寫」，所以就算它完全失效，也只是撿便宜清單上少一行核對紀錄，不會寫入錯誤的價格，也不會讓 `/api/scan` 本身失敗（`daily-scan.yml` 裡這個 step 設了 `continue-on-error`）。

### 另一個選項：Cloudflare 自己的 Browser Rendering

如果不想依賴 GitHub Actions，Cloudflare 自己也有無伺服器的瀏覽器可以用（現在叫 Browser Run／Browser Rendering，Puppeteer／Playwright API 相容），免費方案是 Workers Free 每天 10 分鐘瀏覽器時間。這份專案沒有採用這個做法，原因是：它是 Workers 的功能，要接到 Pages Functions 需要額外設定 binding（這部分我沒有實際環境可以驗證能不能直接在這個 repo 的 Pages 專案上用），而且免費額度換算下來一天大概只夠開個位數次瀏覽器，彈性比 GitHub Actions 小。如果你想全部留在 Cloudflare 生態系裡、不想用 GitHub Actions，這是值得研究的方向，可以參考 [Browser Rendering 官方文件](https://developers.cloudflare.com/browser-rendering/)。

## 已知限制、還沒做的事

- Travelpayouts 是快取／彙整過的資料，不是即時報價，也沒有「哪家航空公司還沒開賣到哪一天」這種資訊——那是示範資料引擎才有的假設資料，畫面上都有標註是示範。
- 冷門航線可能在 Travelpayouts 上查不到資料，這時那幾天照常顯示示範資料。
- `/api/calendar` 只支援單程；來回、多地點、探索頁沒有對應的即時端點，一直都是示範資料。
- 「撿便宜」抓到便宜機票後，如果你照上面「設定通知」的步驟設定好 Resend／LINE，會直接寄信或推播；沒設定的話就只會存進 D1、顯示在網頁上。
- `scripts/verify-deals.mjs` 的 Google Flights 頁面擷取邏輯**沒有實際跑過**，部署後請照上面「爬蟲核對」的步驟自己驗證一次，並留意 Google 的服務條款本來就不鼓勵自動化存取——這支腳本刻意只對少數幾筆結果、低頻率執行，降低風險，但無法完全排除。
- 「指定航班追蹤」清單的「已到最低價格」提醒，**還沒有**接上自動寄送——這份清單目前還留在瀏覽器本機（`localStorage`），後端的 `/api/scan` 不知道它的存在，所以就算通知金鑰都設定好了，這份清單也不會主動通知你。要做到這個，需要先把這份清單也同步到 D1（類似 `hunts`的做法），再讓 `/api/scan` 一併檢查。
- 沒有帳號系統，`hunts`／`deals`／追蹤清單都是「這個網站的所有訪客共用同一份資料」的設計，適合你自己一個人用；如果之後想多人使用，需要另外加登入機制。
- 深連結目前固定連去 Google Flights 的搜尋頁（不需要 API key、任何人都看得到），不是導去某個訂票網站的聯盟連結。
