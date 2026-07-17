// ============================================================
//  Service Worker：讓遊戲在沒網路時也能玩。
//
//  只在 HTTPS（或 localhost）底下才會生效 —— 區網的 http:// 註冊不了，
//  這是瀏覽器的安全規定，不是設定錯誤。所以它是「推上 GitHub Pages 之後」
//  才開始工作的東西。
//
//  ★ 策略是「網路優先」，不是常見的「快取優先」。
//
//  快取優先比較快，但會把玩家鎖在舊版本 —— 你改了 content.js、
//  重新整理卻看到舊畫面，而從主畫面啟動的 App 連重新整理都按不到。
//  這個遊戲還在頻繁改動，那個代價太大。
//
//  網路優先的代價只是「有網路時多一次連線」，對 232K 來說無感。
// ============================================================

const CACHE = "wendao-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/content.js",
  "./js/economy.js",
  "./js/state.js",
  "./js/ui.js",
  "./js/main.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      // 不要等舊的 worker 收工，直接接手
      .then(() => self.skipWaiting())
      .catch(() => {}) // 少一個檔案不該讓整個安裝失敗
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 有網路 → 用最新的，順手把快取更新掉
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        // 沒網路 → 吃快取。連快取都沒有就退回首頁（例如直接開某個子路徑）
        caches.match(e.request).then((r) => r || caches.match("./index.html"))
      )
  );
});
