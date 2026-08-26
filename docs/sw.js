/* Buzztree Timesheet — service worker (Contractor-Companion pattern: offline-first app shell) */
const CACHE_VERSION="bt-ts-v1";
const CORE=[
"./","./index.html","./config.js","./manifest.webmanifest",
"https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
"https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
"https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"
];
self.addEventListener("install",e=>{
 e.waitUntil(caches.open(CACHE_VERSION).then(c=>Promise.all(
  CORE.map(u=>{
   const cross=u.startsWith("http");
   const req=cross?new Request(u,{mode:"no-cors"}):u;
   const p=fetch(req).then(r=>{if(r&&(r.ok||r.type==="opaque"))return c.put(u,r);throw new Error("bad "+u)});
   return cross?p.catch(()=>{}):p;
  })
 )).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
 e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const u=new URL(e.request.url);
 if(/googleapis\.com|firebaseio|identitytoolkit/.test(u.host+u.pathname))return; /* live data + auth: never intercept */
 if(e.request.mode==="navigate"){
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE_VERSION).then(c=>c.put("./index.html",cp));return r})
   .catch(()=>caches.match("./index.html")));
  return;
 }
 e.respondWith(caches.match(e.request.url,{ignoreSearch:true}).then(hit=>hit||fetch(e.request).then(r=>{
  if(r&&(r.ok||r.type==="opaque")){const cp=r.clone();caches.open(CACHE_VERSION).then(c=>c.put(e.request,cp))}
  return r;
 })));
});
