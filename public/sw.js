/*
 * Service Worker。
 *
 * **何もキャッシュしない。** ここにあるのは Android の Chrome が
 * 「アプリとしてインストールできる」と判定するために fetch ハンドラを必要とするため。
 *
 * 家賃・契約・手続きは常に最新であることが前提の情報で、
 * 古い内容を掴んだまま親が判断してしまうほうが、オフラインで見られないことより危ない。
 * オフライン対応を足すときは、まずどの画面なら古くてよいかを決めてから。
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // 既定の動作（ネットワークへそのまま流す）に任せる
});
