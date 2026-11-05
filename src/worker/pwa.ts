// 홈 화면 앱(PWA)과 서비스 워커 — 웹 푸시를 받으려면 둘 다 있어야 한다 (아이폰은 홈 화면에 추가한 사이트만 알림 허용, 2026-11-04)
export const WEB_MANIFEST = {
  name: "한반도 조기경보",
  short_name: "조기경보",
  description: "한반도 전쟁 위험 단계가 바뀌는 순간 알려 드립니다 — 받은 리포트는 알림함에",
  start_url: "/me",
  scope: "/",
  display: "standalone",
  background_color: "#f3f4f6",
  theme_color: "#1f5fbf",
  icons: [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml" },
    { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" },
  ],
};

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#1f5fbf"/><circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="28"/><circle cx="256" cy="256" r="60" fill="#fff"/><path d="M256 40v60M256 412v60M40 256h60M412 256h60" stroke="#fff" stroke-width="28" stroke-linecap="round"/></svg>`;

/** 서비스 워커: 푸시를 받아 알림을 띄우고, 누르면 대시보드를 연다. 페이지 캐시는 하지 않는다(늘 최신 화면) */
export const SERVICE_WORKER_JS = String.raw`
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function(e){
  var d = { title: "한반도 조기경보", body: "" };
  try { d = Object.assign(d, e.data ? e.data.json() : {}); } catch (err) { try { d.body = e.data ? e.data.text() : ""; } catch (e2) {} }
  var counted = !/^kew-(test|welcome)/.test(d.tag || "");
  var badge = counted ? caches.open("kew-badge").then(function(c){ return c.match("/badge").then(function(r){ return r ? r.text() : "0"; }).then(function(t){ var n = (parseInt(t, 10) || 0) + 1; return c.put("/badge", new Response(String(n))).then(function(){ if (self.navigator.setAppBadge) return self.navigator.setAppBadge(n); }); }); }).catch(function(){}) : Promise.resolve();
  e.waitUntil(badge.then(function(){ return self.registration.showNotification(d.title, {
    body: d.body, icon: "/icon.svg", badge: "/icon.svg", tag: d.tag || "kew", renotify: true,
    data: { url: d.url || "/me" }
  }); }));
});
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list){
    for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
`;
