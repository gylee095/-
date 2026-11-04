// 모바일 우선 대시보드.
// 순서: 지금 얼마나 위험한가 → 감지된 패턴 → 가장 최근 속보(몇 분 전, 무엇을 몇 발 어디로, 지도) → 징후판 → 클로드 분석 → 시스템.
// 데이터는 /api/state 에서 토큰으로 조회. 지도는 Leaflet + Esri 회색 지도.
// 주의: 아래 클라이언트 코드는 String.raw 템플릿 안에 있으므로 템플릿 리터럴(백틱·${})을 쓰지 않는다.
export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="한반도 경보">
<meta name="theme-color" content="#0f1115">
<title>한반도 조기경보</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon.svg">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--bg:#f3f4f6;--card:#fff;--fg:#111418;--mute:#5f6773;--line:#e2e5e9;--chip:#eef0f3;--viz:#1f5fbf;
--l1:#2e7d32;--l2:#b58105;--l3:#e0650b;--l4:#d32f2f;--l5:#8e0000;--on1:#fff;--on2:#111418;--on3:#111418;--on4:#fff;--on5:#fff;--fresh:#d32f2f;--warm:#e0650b;--old:#8a929c;--link:#1f5fbf;--learn:#8a929c;--down:#1565c0}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--fg:#eceef1;--mute:#9aa3ae;--line:#2a2f37;--chip:#232830;--viz:#5a96e8;
--l1:#4caf50;--l2:#f2b632;--l3:#ff8a3d;--l4:#ff5252;--l5:#ff1744;--on1:#111418;--on2:#111418;--on3:#111418;--on4:#111418;--on5:#111418;--fresh:#ff5252;--warm:#ff8a3d;--old:#8a929c;--link:#7fb0ff;--learn:#6b7380;--down:#7fb0ff}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;padding:0 16px 48px;padding-top:env(safe-area-inset-top)}
.wrap{max-width:720px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;padding:12px 0 8px;font-size:13px;color:var(--mute)}
.top b{color:var(--fg);font-size:15px}
.threat{border-radius:16px;padding:18px 18px 16px;color:#fff;margin-bottom:12px}
.threat .k{font-size:13px;opacity:.9}.threat .v{font-size:34px;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin:2px 0 6px}
.threat .s{font-size:16px;font-weight:600}.threat .m{font-size:13px;opacity:.9;margin-top:8px}
.bg1{background:var(--l1);color:var(--on1)}.bg2{background:var(--l2);color:var(--on2)}.bg3{background:var(--l3);color:var(--on3)}.bg4{background:var(--l4);color:var(--on4)}.bg5{background:var(--l5);color:var(--on5);animation:pulse 1.6s infinite}
@keyframes pulse{50%{filter:brightness(1.25)}}
.scale{display:flex;gap:4px;margin-top:12px}.scale i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.3)}.scale i.on{background:#fff}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0}
.sec{font-size:13px;font-weight:700;color:var(--mute);margin:22px 2px 6px;letter-spacing:.2px}
.ago{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:22px}
.ago.f{color:var(--fresh)}.ago.w{color:var(--warm)}.ago.o{color:var(--old)}
.ago .dot{width:10px;height:10px;border-radius:50%;background:currentColor}.ago.f .dot{animation:pulse 1s infinite}
.abs{font-size:13px;color:var(--mute);margin-left:4px;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.chip{font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px;background:var(--chip);color:var(--fg)}
.chip.d1{background:var(--l1);color:var(--on1)}.chip.d2{background:var(--l2);color:var(--on2)}.chip.d3{background:var(--l3);color:var(--on3)}.chip.d4{background:var(--l4);color:var(--on4)}.chip.d5{background:var(--l5);color:var(--on5)}
.hl{font-size:21px;font-weight:800;line-height:1.3;margin:8px 0 4px;letter-spacing:-.3px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
.fact{background:var(--chip);border-radius:12px;padding:10px 12px}.fact .fk{font-size:12px;color:var(--mute)}.fact .fv{font-size:16px;font-weight:700;margin-top:2px}
.fact.na .fv{color:var(--mute);font-weight:500}
#map{height:260px;border-radius:12px;overflow:hidden;margin-top:6px;border:1px solid var(--line)}
.rch{display:flex;justify-content:space-between;align-items:flex-end;gap:8px}.rv{font-size:30px;font-weight:700;line-height:1.1;margin-top:2px}
.dlt{font-size:14px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--chip);white-space:nowrap}.up{color:var(--l4)}.down{color:var(--down)}.flat{color:var(--mute)}
.rng{display:flex;gap:6px;margin:12px 0 4px}.rng button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 12px;min-height:32px}.rng button.on{background:var(--fg);color:var(--card);border-color:var(--fg)}
.vs{font-size:15px;margin-top:10px}.chg{margin:6px 0 0;padding-left:0;list-style:none;font-size:14px}.chg li{padding:3px 0}.chg li span{display:inline-block;width:18px;font-weight:700}
.rtab{width:100%;font-size:13px;border-collapse:collapse;margin-top:6px}.rtab td,.rtab th{padding:4px 6px;border-top:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums}.rtab th:first-child,.rtab td:first-child{text-align:left}
.legend{font-size:12px;color:var(--mute);margin-top:6px}
.latest{font-size:14px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.latest a,.src a,.pat a{color:var(--link);text-decoration:none}
details summary{cursor:pointer;color:var(--link);font-size:14px;margin-top:10px;list-style:none}details summary::-webkit-details-marker{display:none}
.src{font-size:14px;padding:8px 0;border-top:1px dashed var(--line)}.src small{color:var(--mute)}
.row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);cursor:pointer}.row:first-child{border-top:0}
.row .t{flex:none;width:76px;font-size:13px;font-weight:700}.row .t.f{color:var(--fresh)}.row .t.w{color:var(--warm)}.row .t.o{color:var(--old)}
.row .b{flex:1;min-width:0}.row .h{font-weight:600;font-size:15px}.row .x{font-size:12px;color:var(--mute);margin-top:2px}
.lv{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}.lv1{background:var(--l1)}.lv2{background:var(--l2)}.lv3{background:var(--l3)}.lv4{background:var(--l4)}.lv5{background:var(--l5)}
.ex .hd{font-size:18px;font-weight:800;line-height:1.3;margin-bottom:8px}.ex p{margin:6px 0;font-size:15px;line-height:1.55}
.hint{border-top:1px solid var(--line);padding:10px 0}.hint .ht{font-weight:700;font-size:15px}.hint .hr{font-size:14px;margin-top:3px}.hint .hc{font-size:13px;color:var(--mute);margin-top:3px}
.hint.warning .ht{color:var(--l3)}.hint.reassuring .ht{color:var(--l1)}.hint.gap .ht{color:var(--mute)}
.ctx{font-size:12px;color:var(--mute);margin-top:8px}
.wr{word-break:keep-all}.wr .wrh{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.wr .wrh b{font-size:28px;font-weight:800;letter-spacing:-.5px}.wr .wrh span{font-size:14px;color:var(--mute)}
.ladder{display:flex;gap:3px;margin:10px 0 4px}.ladder div{flex:1;text-align:center;font-size:12px;color:var(--mute);padding-top:6px;border-top:6px solid var(--chip);border-radius:2px}
.ladder div.on{color:var(--fg);font-weight:800}.ladder .p1.on{border-color:var(--l1)}.ladder .p2.on{border-color:var(--l2)}.ladder .p3.on{border-color:var(--l3)}.ladder .p4.on{border-color:var(--l4)}.ladder .p5.on{border-color:var(--l5)}
.probs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.probs>div{background:var(--chip);border-radius:12px;padding:10px 12px}
.probs .pk{font-size:13px;color:var(--mute)}.probs .pv{font-size:24px;font-weight:800;margin:2px 0}.probs .ps{font-size:12px;color:var(--mute)}
.fm{font-size:15px;padding:10px 12px;border-radius:12px;margin:8px 0;border-left:5px solid var(--old);background:var(--chip)}.fm.warning{border-left-color:var(--l4)}.fm.caveat{border-left-color:var(--l2)}.fm.reassuring{border-left-color:var(--l1)}
.dom{display:grid;grid-template-columns:7.5em 3.4em 1fr;gap:8px;align-items:start;padding:8px 0;border-top:1px solid var(--line);font-size:14px}.dom:first-child{border-top:0}
.dom .dl{font-weight:700}.dom .dv{font-size:12px;font-weight:800;border-radius:999px;text-align:center;padding:2px 0;color:#fff}.dom .v0{background:var(--l1)}.dom .v1{background:var(--l2)}.dom .v2{background:var(--l3)}.dom .v3{background:var(--l4)}
.dom .dd{color:var(--mute);font-size:13px;min-width:0;overflow-wrap:anywhere}.wr ul{margin:6px 0 0 18px;padding:0;font-size:14px}.wr li{margin:3px 0}.wr .mk{font-size:13px;color:var(--mute);margin-top:10px}.wr .mk a{color:var(--link);text-decoration:none}
.tm{word-break:keep-all}.tm .th{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.tm .th b{font-size:28px;font-weight:800;letter-spacing:-.5px}.tm .th span{font-size:14px;color:var(--mute)}
.tm .parts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.tm .parts>div{background:var(--chip);border-radius:12px;padding:8px 10px}.tm .pk{font-size:12px;color:var(--mute)}.tm .pv{font-size:18px;font-weight:800}
.tm .chart{position:relative;margin-top:6px}.tm svg{display:block;width:100%;height:auto;touch-action:pan-y}.tm .tip{position:absolute;top:0;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.12);display:none;max-width:220px}
.tm .tip b{font-size:14px}.tm ol{margin:6px 0 0 20px;padding:0;font-size:14px}.tm li{margin:3px 0}.tm .mk{font-size:13px;color:var(--mute);margin-top:10px}
.deep{border-left:5px solid var(--link)}.deep .dt{font-size:18px;font-weight:800;line-height:1.35}.deep p{font-size:15px;margin:8px 0}.deep .pr{font-size:15px;font-weight:700;margin:8px 0}
.deep ul{margin:6px 0 0 18px;padding:0;font-size:14px}.deep li{margin:3px 0;overflow-wrap:anywhere}.deep a{color:var(--link);text-decoration:none}.deep .us,.use{font-size:13px;color:var(--mute);margin-top:10px}.deep{word-break:keep-all}
.use table{width:100%;border-collapse:collapse;font-size:14px}.use td{padding:6px 4px;border-top:1px solid var(--line)}.use td:last-child{text-align:right}
.pat{border-left:5px solid var(--l2)}.pat.high{border-left-color:var(--l4)}.pat.low{border-left-color:var(--old);opacity:.85}
.pat .pn{font-size:17px;font-weight:800}.pat .ps{font-size:14px;margin:6px 0}.pat ul{margin:6px 0 0 18px;padding:0;font-size:13px;color:var(--mute)}
.board{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ind{background:var(--chip);border-radius:12px;padding:10px 12px;position:relative;cursor:pointer}
.ind .il{font-size:12px;color:var(--mute);line-height:1.3;min-height:30px;padding-right:14px}.ind .iv{font-size:18px;font-weight:800;margin-top:4px}.ind .ib{font-size:11px;color:var(--mute)}
.ind .st{position:absolute;top:10px;right:10px;width:10px;height:10px;border-radius:50%}
.st.normal{background:var(--l1)}.st.elevated{background:var(--l2)}.st.anomalous{background:var(--l4);animation:pulse 1.2s infinite}.st.learning{background:var(--learn);opacity:.5}.st.unavailable{background:transparent;border:2px solid var(--learn)}
.ind svg{display:block;width:100%;height:26px;margin-top:4px}
.ind .why{display:none;font-size:12px;color:var(--fg);margin-top:8px;line-height:1.4}.ind.open .why{display:block}
.grp{font-size:12px;font-weight:700;color:var(--mute);margin:14px 2px 6px}
.as .ov{font-size:17px;font-weight:800;margin-bottom:6px}.as .hy{border-top:1px solid var(--line);padding:10px 0}.as .hy b{font-size:15px}
.as .ev{font-size:13px;margin-top:4px}.as .ev span{display:inline-block;width:38px;color:var(--mute)}
.lk{font-size:12px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:6px;color:#fff}.lk.high{background:var(--l4)}.lk.medium{background:var(--l2)}.lk.low{background:var(--old)}
.note{white-space:pre-wrap;font-size:15px}
.bnote{font-size:13px;color:var(--mute);margin-top:4px}
.sum .lead{font-size:13px;color:var(--mute);font-weight:700}
.sum .gq{font-size:14px;font-weight:700;margin:14px 0 0}
.sum .gnum{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 10px;margin:2px 0 0}.sum .gnum b{font-size:44px;font-weight:800;letter-spacing:-1px;line-height:1.05}.sum .gnum .gx{font-size:20px;font-weight:800}.sum .gnum .gu{font-size:14px;color:var(--mute)}
.gauge{position:relative;margin:30px 2px 4px;padding-bottom:4px}
.gtrack{position:relative;height:14px;border-radius:7px;background:var(--chip);overflow:visible}
.gfill{position:absolute;left:0;top:0;bottom:0;border-radius:7px 0 0 7px}
.gdiv{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--card)}
.gmark{position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--card);border:4px solid;box-sizing:border-box}
.gnow{position:absolute;top:-26px;transform:translateX(-50%);white-space:nowrap}.gnow span{display:inline-block;font-size:12px;font-weight:800;padding:2px 8px;border-radius:999px}
.gusual{position:absolute;top:18px;transform:translateX(-50%);font-size:12px;font-weight:800;color:var(--fg);white-space:nowrap}
.gzones{display:flex;margin-top:24px}.gzones span{flex:1;text-align:center;font-size:12px;color:var(--mute);line-height:1.25}.gzones b{display:block;font-weight:600}.gzones small{font-size:11px}.gzones span.on b{color:var(--fg);font-weight:800}
.sum .gfoot{font-size:13px;color:var(--mute);margin-top:8px}
.sum .phase{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 10px;margin:2px 0 0}.sum .phase b{font-size:30px;font-weight:800;letter-spacing:-.5px}.sum .phase span{font-size:13px;color:var(--mute)}
.sum .hero{display:flex;align-items:baseline;gap:10px;margin:14px 0 2px}.sum .hero .n{font-size:48px;font-weight:800;letter-spacing:-1px;line-height:1}.sum .hero .u{font-size:14px;color:var(--mute);line-height:1.4}
.sum .delta{font-size:14px;margin:8px 0 2px;display:flex;gap:6px;align-items:flex-start}.sum .delta i{font-style:normal;font-weight:800;white-space:nowrap}.sum .delta .same{color:var(--old)}.sum .delta .up{color:var(--l4)}.sum .delta .dn{color:var(--down)}
.sum h3{font-size:14px;margin:16px 0 6px}
.sum .why{display:grid;grid-template-columns:1fr auto;gap:8px 10px;align-items:start;font-size:14px}.sum .why .t b{display:block}.sum .why .t span{color:var(--mute);font-size:13px}
.sum .calm{font-size:13px;color:var(--mute);margin-top:8px}
.sum ul{margin:0;padding-left:18px;font-size:14px}
.sum .ev{margin-top:14px;padding:10px 12px;border-radius:12px;background:var(--chip);font-size:14px}.sum .ev span{color:var(--mute)}
.sum .do{margin-top:12px;padding:12px;border-radius:12px;border:1px solid var(--line);font-size:14px}.sum .do>b{display:block;margin-bottom:2px}
.sum .data{margin-top:10px;font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px 10px}.sum .data .ok{color:var(--l1);font-weight:700}.sum .data.fail{color:var(--l3);font-weight:700}
.sum .wrd{margin-top:12px}.sum .wrd>summary{font-size:13px;color:var(--link);cursor:pointer}
.more{margin:0 0 10px}.more>summary{font-size:15px;font-weight:700;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:14px;list-style:none;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;cursor:pointer}
.more>summary::-webkit-details-marker{display:none}.more>summary::after{content:"펼치기 ▾";font-size:13px;color:var(--mute);font-weight:600;white-space:nowrap}.more[open]>summary::after{content:"접기 ▴"}
.more>summary span{font-weight:400;color:var(--mute);font-size:13px;display:block;margin-top:2px}.more .gbody{padding:2px 0 4px}
.ib.fail{color:var(--l3);font-weight:700}
.since{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--chip);font-size:13px;line-height:1.5}.since ul{margin:2px 0 6px 18px;padding:0}.since div{margin-top:4px;color:var(--mute)}
.btn{display:inline-block;border:1px solid var(--line);background:var(--card);color:var(--link);border-radius:10px;padding:8px 12px;font-size:14px;margin:4px 6px 4px 0;text-decoration:none}
table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px}td,th{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.ok{color:var(--l1)}.bad{color:var(--l4)}
#login{display:none}#login input{width:100%;padding:12px;font-size:16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);margin:8px 0}
.foot{font-size:12px;color:var(--mute);margin-top:20px}
.leaflet-container{background:var(--chip);font:inherit}.leaflet-tooltip{font-weight:700;font-size:12px}.leaflet-control-attribution{font-size:9px!important;line-height:1.2}
</style></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b><span id="upd"></span></div>
<div id="app"></div>
<details id="login" class="card" style="display:none"><summary>운영자 로그인 — 지금은 공개 화면으로 열려 있어요</summary><p style="font-size:13px;color:var(--mute)">운영자만 씁니다. 보는 데는 필요 없어요. 비밀값을 넣으면 이 휴대폰의 알림이 운영자용으로 올라가요.</p><input id="tok" type="password" autocomplete="current-password" placeholder="접속 비밀값"><button class="btn" onclick="saveTok()">확인</button></details>
</div>
<script>
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var ST=null, map=null, LAST=0;
function ago(ms){var d=Math.max(0,Date.now()-ms),m=Math.floor(d/60000);if(m<1)return "방금";if(m<60)return m+"분 전";var h=Math.floor(m/60);if(h<3)return h+"시간 "+(m%60)+"분 전";if(h<24)return h+"시간 전";var dd=Math.floor(h/24);return dd<2?dd+"일 "+(h%24)+"시간 전":dd+"일 전"}
function fresh(ms){var h=(Date.now()-ms)/3600000;return h<1?"f":h<24?"w":"o"}
function kst(ms){if(!ms)return "—";var d=new Date(ms+9*3600000);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")}
function when(ms){if(!ms)return "—";return kst(ms)+" · "+ago(ms)}
function kday(ms){var d=new Date(ms+9*3600000);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()}
function bwhen(b){return b.selfReport?kday(b.selfReport.day)+" (시각 미상)":kst(b.at)+" KST"}
function bago(b){if(!b.selfReport)return ago(b.at);var n=Math.round((Date.now()-b.selfReport.day)/86400000-0.5);return n<=0?"오늘":n===1?"어제":n+"일 전"}
var CODE_RE=/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
function normCode(c){c=String(c||"").toUpperCase().replace(/[^A-Z2-9]/g,"");return c.length===12?c.slice(0,4)+"-"+c.slice(4,8)+"-"+c.slice(8):""}
function actCode(){try{var q=normCode(new URLSearchParams(location.search).get("code"));if(q){localStorage.setItem("kew_code",q);var s=pushSupport();if(!(s.ios&&!s.standalone))history.replaceState(null,"",location.pathname+location.hash)}var c=localStorage.getItem("kew_code");return CODE_RE.test(c||"")?c:null}catch(e){return null}}
function codeManifest(){var c=actCode();if(!c)return;var l=document.querySelector('link[rel="manifest"]');if(l)l.href="/manifest.webmanifest?code="+encodeURIComponent(c)}
function saveCode(){var v=normCode($("#codein")&&$("#codein").value);if(!v){alert("코드 12자리를 확인해 주세요. 예: ABCD-EFGH-JKLM");return}try{localStorage.setItem("kew_code",v)}catch(e){}codeManifest();render()}
function tok(){try{var q=new URLSearchParams(location.search).get("key");if(q){localStorage.setItem("kew_token",q);history.replaceState(null,"",location.pathname+location.hash)}return localStorage.getItem("kew_token")}catch(e){return null}}
function saveTok(){try{localStorage.setItem("kew_token",$("#tok").value)}catch(e){}resyncPush();load()}
// 로그인 뒤: 이미 켜 둔 알림 구독을 토큰과 함께 다시 등록해 운영자 구독으로 올린다 (켜기 → 로그인 순서여도 되게)
async function resyncPush(){try{var t=tok();if(!t||!pushSupport().ok)return;var reg=await navigator.serviceWorker.getRegistration();var sub=reg&&await reg.pushManager.getSubscription();if(!sub)return;
  await fetch("/api/push/subscribe",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+t},body:JSON.stringify({subscription:sub.toJSON()})})}catch(e){}}
var STATUS={CONFIRMED:"정부 공식확인",CORROBORATED:"복수 출처 교차확인",UNVERIFIED:"단일 출처"};
var CONF={high:"신뢰도 높음",medium:"신뢰도 보통",low:"신뢰도 낮음"};
function basisText(e){if(e.brief&&e.brief.sourceLabel)return e.brief.sourceLabel;if(e.basis==="official_quote")return e.status==="CORROBORATED"?"언론 "+e.sources.length+"곳이 공식발표 인용":"속보 1곳 (교차확인 전)";if(e.basis==="media")return "언론 보도만";return STATUS[e.status]}
// ── 웹 푸시: 브라우저가 직접 알림을 띄운다 (앱·건당 비용 없음, 2026-11-04) ──
function pushSupport(){var ios=/iPhone|iPad|iPod/.test(navigator.userAgent);var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;var ok="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;return {ios:ios,standalone:standalone,ok:ok}}
function pushCard(){var s=pushSupport();var code=actCode(),owner=!!tok();var h='<div class="do" id="pushcard"><b>휴대폰 알림 받기</b>';
  if(!code&&!owner){
    h+='<span id="pushmsg">전쟁 위험 단계가 바뀌는 순간 휴대폰이 울립니다. <b>4,900원 한 번, 평생.</b> 앱 설치·문자 요금 없음.</span><div style="margin-top:8px"><a class="btn" href="/buy" style="display:inline-block;text-decoration:none">알림 받기 · 4,900원</a></div>';
    h+='<details style="margin-top:8px"><summary>이미 결제했어요 (활성화 코드 입력)</summary><input id="codein" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" autocomplete="one-time-code" style="width:100%;padding:12px;font-size:17px;letter-spacing:1px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);margin:8px 0"><button class="btn" onclick="saveCode()">확인</button></details>';
    return h+'</div>'}
  if(code)h+='<div style="margin:4px 0 6px;font-size:13px;color:var(--mute)">결제 확인됨 · 활성화 코드 <b style="letter-spacing:1px">'+esc(code)+'</b></div>';
  if(!s.ok&&s.ios&&!s.standalone)h+='아이폰은 <strong>한 단계만 더</strong> 하면 끝나요.<ol style="margin:6px 0 0;padding-left:20px"><li>화면 아래 <b>공유</b> 버튼(네모에 위쪽 화살표)</li><li><b>홈 화면에 추가</b> → 추가</li><li>홈 화면에 생긴 <b>조기경보</b> 아이콘을 열고 <b>알림 켜기</b></li></ol><p style="font-size:12px;color:var(--mute);margin:6px 0 0">애플 규칙상 홈 화면에 추가한 앱만 알림을 받을 수 있어요. 코드는 자동으로 함께 옮겨져요.</p>';
  else if(!s.ok)h+='이 브라우저는 알림을 지원하지 않아요. 크롬(안드로이드)이나 사파리(아이폰, 홈 화면에 추가)에서 열어 주세요.';
  else if(Notification.permission==="denied")h+='알림이 꺼져 있어요. 휴대폰 설정 → 알림에서 이 앱(조기경보)의 알림을 켜 주세요.';
  else h+='<span id="pushmsg">단계가 바뀌거나 실제 발사·경보가 있을 때만 옵니다. 평소엔 조용해요.</span><div style="margin-top:8px"><button class="btn" id="pushbtn" onclick="enablePush()">알림 켜기</button> <button class="btn" id="pushtest" onclick="testMyPush()" style="display:none">내 휴대폰으로 테스트</button></div>';
  return h+'</div>'}
function goPush(){var c=document.getElementById("pushcard");if(c)c.scrollIntoView({behavior:"smooth",block:"center"});return false}
function b64uToU8(s){var p=s.replace(/-/g,"+").replace(/_/g,"/");p+="=".repeat((4-p.length%4)%4);var b=atob(p),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
async function pushState(){try{if(!pushSupport().ok)return "unsupported";var reg=await navigator.serviceWorker.getRegistration();var sub=reg&&await reg.pushManager.getSubscription();return sub?"on":"off"}catch(e){return "off"}}
async function refreshPushUi(){var st=await pushState();var el=$("#pushst");if(el)el.textContent=st==="on"?"알림 켜짐":st==="off"?"알림 꺼짐":"지원 안 함";var b=$("#pushbtn"),t=$("#pushtest"),m=$("#pushmsg");if(b&&st==="on"){b.textContent="알림 끄기";b.onclick=disablePush;if(t)t.style.display="";if(m)m.textContent="이 휴대폰으로 알림이 옵니다. 단계가 바뀌거나 실제 발사·경보가 있을 때만."}}
async function enablePush(){var b=$("#pushbtn");try{b.disabled=true;b.textContent="켜는 중…";
  var perm=await Notification.requestPermission();if(perm!=="granted"){alert("알림이 허용되지 않았어요. 휴대폰 설정에서 허용해 주세요.");b.disabled=false;b.textContent="알림 켜기";return}
  var reg=await navigator.serviceWorker.register("/sw.js");await navigator.serviceWorker.ready;
  var key=(await (await fetch("/api/push/key")).json()).publicKey;
  var sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToU8(key)});
  var hd={"content-type":"application/json"};var t=tok();if(t)hd.authorization="Bearer "+t;
  var code=actCode(),r,j={};
  if(code){r=await fetch("/api/billing/activate",{method:"POST",headers:hd,body:JSON.stringify({code:code,subscription:sub.toJSON()})});j=await r.json().catch(function(){return {}});
    if(!r.ok){try{await sub.unsubscribe()}catch(e){}throw new Error(j.error||("활성화 실패 "+r.status))}}
  else{r=await fetch("/api/push/subscribe",{method:"POST",headers:hd,body:JSON.stringify({subscription:sub.toJSON()})});if(!r.ok)throw new Error("등록 실패 "+r.status)}
  b.disabled=false;await refreshPushUi();
  if(t)testMyPush();else alert("알림이 켜졌어요. 단계가 바뀌면 이 휴대폰이 울립니다."+(j.devicesMax?"\n(이 코드로 켠 기기 "+j.devicesUsed+"/"+j.devicesMax+"대)":""))}
  catch(e){alert("알림을 켜지 못했어요: "+(e&&e.message||e));b.disabled=false;b.textContent="알림 켜기"}}
async function disablePush(){try{var reg=await navigator.serviceWorker.getRegistration();var sub=reg&&await reg.pushManager.getSubscription();if(sub){await fetch("/api/push/unsubscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}}catch(e){}var b=$("#pushbtn");if(b){b.textContent="알림 켜기";b.onclick=enablePush}var t=$("#pushtest");if(t)t.style.display="none";refreshPushUi()}
async function testMyPush(){var r=await fetch("/api/test-push",{method:"POST",headers:{authorization:"Bearer "+tok()}});var j=await r.json();var w=j.find&&j.find(function(x){return x.channel==="webpush"});alert(w&&w.ok?"보냈어요. 잠시 뒤 잠금화면을 확인하세요.":"실패: "+JSON.stringify(j))}
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){});
codeManifest();
async function load(){
  var st=window.__KEW_STATE__;
  if(!st){var t=tok();
    var r,body=null;
    try{r=t?await fetch("/api/state?hours=168",{headers:{authorization:"Bearer "+t}}):await fetch("/api/public-state")}catch(e){showErr("서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.",false);return}
    if(r.status===401){try{localStorage.removeItem("kew_token")}catch(e){}alert("접속 비밀값이 맞지 않아요. 공개 화면으로 엽니다.");load();return}
    try{body=await r.json()}catch(e){}
    if(!r.ok||!body||body.error){showErr(body&&body.message?body.message:"서버 오류 ("+r.status+") — 잠시 뒤 다시 열어 보세요.",!!body&&body.error==="storage_limit");return}
    st=body}
  LAST=Date.now();var lg=$("#login");lg.style.display=st.public?"block":"none";lg.open=!!st.public;ST=st;render();if(!st.public)resyncPush()}
// 불러오기 실패: 이미 화면이 있으면 그대로 두고 위에 알리고, 처음이면 이유를 크게 보여 준다 (빈 화면 금지)
function showErr(msg,limit){$("#login").style.display="none";
  var box='<div class="card" id="err" style="border-left:4px solid #d33"><b>'+(limit?"서버 저장소 하루 한도 초과":"불러오기 실패")+'</b><div style="font-size:14px;margin-top:6px">'+esc(msg)+'</div>'+
    (limit?'<div style="font-size:13px;margin-top:6px;opacity:.8">무료 요금제(Cloudflare D1)의 하루 읽기 한도는 500만 행입니다.'+(ST?' 아래 내용은 마지막으로 받은 화면입니다.':'')+'</div>':'')+'</div>';
  var old=$("#err");if(old)old.remove();
  if(ST){$("#upd").textContent="갱신 실패";$("#app").insertAdjacentHTML("afterbegin",box)}else{$("#upd").textContent="";$("#app").innerHTML=box}}
// 긴장 온도계: 지난 10년(2016~) 하루하루와 같은 잣대로 잰 오늘의 위치. 확률이 아니라 '긴장의 크기' 순위.
function topText(p){var t=100-p;return t<1?"상위 1% 안":t>=50?"평소 수준":"상위 "+Math.round(t)+"%"}
function tension(t){if(!t||!t.view)return "";var v=t.view,n=t;
  var h='<div class="sec">긴장 온도계 <span style="font-weight:400">· 지난 10년과 같은 잣대 · 확률 아님</span></div><div class="card tm">';
  h+='<div class="th"><b>'+esc(topText(n.pct))+'</b><span>2016년 이후 하루하루 중 지금보다 긴장된 날의 비율 · 원점수 '+n.raw.toFixed(2)+' / 9</span></div>';
  h+='<div class="parts"><div><div class="pk">북한 도발</div><div class="pv">'+n.parts.military+'</div></div><div><div class="pk">사람들의 불안</div><div class="pv">'+n.parts.public+'</div></div><div><div class="pk">한국만의 돈 움직임</div><div class="pv">'+n.parts.money+'</div></div></div>';
  if(n.note)h+='<div class="mk">'+esc(n.note)+'</div>';
  h+='<div class="chart" id="tchart"></div>';
  if(v.similar&&v.similar.length)h+='<div class="mk">비슷했던 때 · '+v.similar.map(function(x){return esc(x.d)+' '+esc(x.label)}).join(" · ")+'</div>';
  h+='<details><summary>지난 10년 가장 긴장됐던 날</summary><ol>'+v.top.map(function(x){return '<li>'+esc(x.d)+' · '+esc(x.label)+' <span style="color:var(--mute)">('+x.raw+')</span></li>'}).join("")+'</ol></details>';
  h+='<div class="mk">점수: 각 요소를 지난 10년 하루 값에 견줘 상위 2.5%면 1점, 0.5%면 2점(최대 3). 정부 경보·북한 담화·항공·선박 신호는 과거 자료가 없어 빠졌고, 2026년 3월 미-이란 전쟁·2018년 정상회담처럼 한반도 밖 사건이나 큰 뉴스에도 오를 수 있습니다.</div></div>';
  return h}
// 전쟁 위험 차트 (주식 차트처럼): 시간마다 남긴 '앞으로 30일 국지 충돌 확률' + 어제 이맘때와 비교.
// 단일 계열이라 범례 없이 제목이 이름. ▲(빨강)=위험 증가, ▼(파랑)=위험 감소 — 한국 증시의 상승·하락 색과 같은 방향, 아이콘·글자를 함께 쓴다.
var RANGE_H={"1일":24,"7일":168,"30일":720,"전체":1e9};
function pct1(x){return x>=99.5?"진행 중":x<0.1?"0.1% 미만":x.toFixed(1)+"%"}
function getRange(){try{var r=localStorage.getItem("kew:range");if(r&&RANGE_H[r])return r}catch(e){}return "7일"}
function setRange(k){try{localStorage.setItem("kew:range",k)}catch(e){}
  var bs=document.querySelectorAll(".rng button");for(var i=0;i<bs.length;i++)bs[i].className=bs[i].textContent===k?"on":"";
  try{drawRiskChart(ST,k)}catch(e){}}
function seriesOf(st){var s=(st.riskSeries||[]).slice(),w=st.warRisk;
  if(w){var last=s[s.length-1];if(!last||st.now-last.t>10*60000)s.push({t:st.now,ph:w.phase,c:w.clash30d.point,w:w.war30d.point,live:1})}
  return s}
function riskChart(st){var w=st.warRisk,c=st.vsYesterday;
  var h='<div class="sec">전쟁 위험 차트 <span style="font-weight:400">· 시간마다 기록 · 주식 차트처럼</span></div><div class="card tm rc">';
  var d=c&&c.ago?w.clash30d.point-c.ago.clash:null,dir=d==null?"none":d>=0.05?"up":d<=-0.05?"down":"flat";
  // 그 사이 판정 방식이 바뀐 탓이면 색 없이 숫자만 (나아짐·악화로 세지 않는다)
  var sys=c&&(c.changes||[]).some(function(x){return x.dir===0&&/^30일 국지 충돌/.test(x.text)});
  var badge=dir==="none"?'<span class="dlt flat">비교 기록 없음</span>':dir==="flat"?'<span class="dlt flat">– 변화 없음</span>':sys?'<span class="dlt flat">'+(d>0?"+":"−")+Math.abs(d).toFixed(1)+'%p · 측정 변경 포함</span>':'<span class="dlt '+dir+'">'+(dir==="up"?"▲ ":"▼ ")+Math.abs(d).toFixed(1)+'%p '+(dir==="up"?"위험 증가":"위험 감소")+'</span>';
  h+='<div class="rch"><div><div class="pk">앞으로 30일 · 국지 충돌 확률</div><div class="rv">'+pct1(w.clash30d.point)+'</div></div>'+badge+'</div>';
  h+='<div class="ps">'+(c&&c.ago?'비교 기준 '+esc(c.agoLabel||"어제 이맘때")+' '+pct1(c.ago.clash)+(c.ago.war?' · 전면전 '+pct1(c.ago.war)+' → '+pct1(w.war30d.point):'')+' · '+c.ago.phase+'단계 → '+w.phase+'단계':'비교할 과거 기록이 아직 없습니다')+'</div>';
  var cur=getRange();
  h+='<div class="rng" role="group" aria-label="기간">'+Object.keys(RANGE_H).map(function(k){return '<button type="button" class="'+(k===cur?'on':'')+'" onclick="setRange(\''+k+'\')">'+k+'</button>'}).join("")+'</div>';
  h+='<div class="legend"><span style="color:var(--viz);font-weight:700">━</span> 자동 판정 (시간마다 · 11/1 저녁부터) &nbsp; <span style="color:var(--viz);font-weight:700">┅</span> 그 전: 클로드 판단을 이은 선 &nbsp; <span style="color:var(--viz);font-weight:700">○</span> 클로드 분석관 판단</div>';
  h+='<div class="chart" id="rchart"></div>';
  if(c){var cls=c.verdict==="worse"?"up":c.verdict==="better"?"down":"flat";
    h+='<div class="vs"><span class="'+cls+'" style="font-weight:700">'+(cls==="up"?"▲":cls==="down"?"▼":"–")+'</span> <b>'+esc(c.headline)+'</b></div>';
    var items=(c.changes||[]).filter(function(x){return c.headline.indexOf(x.text)<0}).map(function(x){var k=x.dir>0?"up":x.dir<0?"down":"flat";return '<li><span class="'+k+'">'+(x.dir>0?"▲":x.dir<0?"▼":"–")+'</span>'+esc(x.text)+'</li>'});
    (c.movers||[]).forEach(function(m){var k=m.dir>0?"up":"down";items.push('<li><span class="'+k+'">'+(m.dir>0?"▲":"▼")+'</span>'+esc(m.label)+': '+esc(m.from)+' → '+esc(m.to)+'</li>')});
    (c.newEvents||[]).forEach(function(e){items.push('<li><span class="flat">●</span>'+esc(kst(e.at))+' '+esc(e.headline)+'</li>')});
    if(items.length)h+='<ul class="chg">'+items.join("")+'</ul>';else if(c.ago)h+='<div class="ps" style="margin-top:4px">영역 수준·징후 상태 모두 어제 이맘때와 같습니다.</div>'}
  h+='<details><summary>표로 보기 (날마다 최고값)</summary>'+riskTable(seriesOf(st))+'</details>';
  h+='<div class="mk">실선은 시간마다 남긴 자동 판정, 점선은 그 전 며칠을 클로드 분석관·심층 분석 판단(속 빈 점)으로 이은 것입니다. 확률은 근거를 밝힌 판단값이고, 세로 점선은 비교 기준 시각, 아래쪽 ◆는 북한 도발·경보 사건입니다.</div></div>';
  return h}
function riskTable(s){var by={};s.forEach(function(p){var d=new Date(p.t+9*3600000).toISOString().slice(0,10),x=by[d]||(by[d]={c:0,ph:0,w:0});x.c=Math.max(x.c,p.c);x.ph=Math.max(x.ph,p.ph);x.w=Math.max(x.w,p.w)});
  var days=Object.keys(by).sort().reverse().slice(0,30);if(!days.length)return '<div class="ps">기록 없음</div>';
  return '<table class="rtab"><tr><th>날짜</th><th>최고 단계</th><th>국지 충돌 최고</th><th>전면전 최고</th></tr>'+days.map(function(d){var x=by[d];return '<tr><td>'+esc(d.slice(5).replace("-","/"))+'</td><td>'+x.ph+'</td><td>'+pct1(x.c)+'</td><td>'+pct1(x.w)+'</td></tr>'}).join("")+'</table>'}
function niceTop(v){v=Math.max(v,5);var m=Math.pow(10,Math.floor(Math.log(v)/Math.LN10)),st=[1,2,2.5,5,10];for(var i=0;i<st.length;i++)if(st[i]*m>=v)return st[i]*m;return 10*m}
function drawRiskChart(st,rk){var el=$("#rchart");if(!el||!st.warRisk)return;var all=seriesOf(st),hrs=RANGE_H[rk||getRange()]||168,t1=st.now;
  var js=(st.judgments||[]).filter(function(j){return j.at<=t1});
  var first=Math.min(all.length?all[0].t:t1,js.length?js[0].at:t1);
  var t0=Math.max(first,t1-hrs*3600000),s=all.filter(function(p){return p.t>=t0});js=js.filter(function(j){return j.at>=t0});
  if(s.length+js.length<2){el.innerHTML='<div class="ps">아직 점이 '+(s.length+js.length)+'개뿐입니다 — 시간마다 하나씩 쌓입니다.</div>';return}
  if(t1-t0<6*3600000)t0=t1-6*3600000;
  var W=Math.max(280,el.clientWidth||320),H=190,L=36,R=12,T=16,B=26,ns="http://www.w3.org/2000/svg";
  var top=niceTop(Math.max.apply(null,s.map(function(p){return p.c}).concat(js.map(function(j){return j.clash})))*1.25);
  var X=function(ms){return L+(ms-t0)/Math.max(1,t1-t0)*(W-L-R)},Y=function(v){return T+(1-v/top)*(H-T-B)};
  var svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("role","img");svg.setAttribute("aria-label","시간별 앞으로 30일 국지 충돌 확률");
  function rmk(tag,a){var e=document.createElementNS(ns,tag);for(var k in a)e.setAttribute(k,a[k]);svg.appendChild(e);return e}
  function rlabel(x,y,txt,anchor,weight,color){var e=rmk("text",{x:x,y:y,"font-size":11,"text-anchor":anchor,fill:color||"var(--mute)","font-weight":weight||400,stroke:"var(--card)","stroke-width":3,"paint-order":"stroke","stroke-linejoin":"round"});e.textContent=txt;return e}
  // 가로 눈금 (0, 가운데, 위) — 가는 회색
  [0,top/2,top].forEach(function(v){var y=Y(v);rmk("line",{x1:L,x2:W-R,y1:y,y2:y,stroke:"var(--line)","stroke-width":1});rlabel(L-4,y+4,(v%1?v.toFixed(1):v)+"%","end")});
  // 세로 눈금: 기간에 따라 6시간·하루·한 주
  var span=t1-t0,step=span<=36*3600000?6*3600000:span<=10*86400000?86400000:7*86400000;
  var k0=Math.ceil((t0+9*3600000)/step)*step-9*3600000;
  for(var tk=k0;tk<=t1;tk+=step){var x=X(tk),dt=new Date(tk+9*3600000);rmk("line",{x1:x,x2:x,y1:T,y2:H-B,stroke:"var(--line)","stroke-width":1,"stroke-opacity":.6});
    rlabel(x,H-8,step<86400000?(dt.getUTCHours()===0?(dt.getUTCMonth()+1)+"/"+dt.getUTCDate():dt.getUTCHours()+"시"):(dt.getUTCMonth()+1)+"/"+dt.getUTCDate(),"middle")}
  // 비교 기준 시각 (어제 이맘때, 없으면 가장 가까운 과거 기록)
  var vc=st.vsYesterday,yx=vc&&vc.agoAt?vc.agoAt:t1-24*3600000;if(yx>=t0){var xx=X(yx);rmk("line",{x1:xx,x2:xx,y1:T,y2:H-B,stroke:"var(--mute)","stroke-width":1,"stroke-dasharray":"3 3"});rlabel(Math.min(W-R-30,Math.max(L+30,xx)),T-4,vc&&vc.basis&&vc.basis!=="same-time"?"비교 기준":"어제 이맘때","middle")}
  // 한 줄로 잇는다: 자동 판정 기록이 시작되기 전은 클로드 판단 점들을 점선으로 잇고, 그 뒤는 자동 판정 실선
  var autoStart=s.length?s[0].t:t1+1,pre=js.filter(function(j){return j.at<autoStart}).map(function(j){return {t:j.at,c:j.clash}});
  var line=pre.concat(s.map(function(p){return {t:p.t,c:p.c}}));
  if(line.length){var a="M"+X(line[0].t).toFixed(1)+","+Y(0);line.forEach(function(p){a+="L"+X(p.t).toFixed(1)+","+Y(p.c).toFixed(1)});a+="L"+X(line[line.length-1].t).toFixed(1)+","+Y(0)+"Z";
    rmk("path",{d:a,fill:"var(--viz)","fill-opacity":.1,stroke:"none"})}
  if(pre.length){var dp="";pre.concat(s.length?[s[0]]:[]).forEach(function(p,i){dp+=(i?"L":"M")+X(p.t).toFixed(1)+","+Y(p.c).toFixed(1)});
    rmk("path",{d:dp,fill:"none",stroke:"var(--viz)","stroke-width":2,"stroke-dasharray":"5 4","stroke-linejoin":"round","stroke-linecap":"round"})}
  if(s.length>1){var d="";s.forEach(function(p,i){d+=(i?"L":"M")+X(p.t).toFixed(1)+","+Y(p.c).toFixed(1)});
    rmk("path",{d:d,fill:"none",stroke:"var(--viz)","stroke-width":2,"stroke-linejoin":"round","stroke-linecap":"round"})}
  // 북한 도발·경보 사건 (아래쪽 ◆)
  var evs=(st.events||[]).map(function(e){return e.brief}).filter(function(b){return b&&b.at>=t0&&b.at<=t1&&((b.isProvocation&&b.danger.level>=3)||b.danger.level>=4||b.evacuation||b.posture)});
  evs.forEach(function(b){var ex=X(b.at),ey=H-B-6;rmk("path",{d:"M"+ex+","+(ey-5)+"L"+(ex+5)+","+ey+"L"+ex+","+(ey+5)+"L"+(ex-5)+","+ey+"Z",fill:"var(--l3)",stroke:"var(--card)","stroke-width":2})});
  // 클로드 분석관·심층 분석 판단 (속 빈 점)
  js.forEach(function(j){rmk("circle",{cx:X(j.at),cy:Y(j.clash),r:4.5,fill:"var(--card)",stroke:"var(--viz)","stroke-width":2})});
  // 지금
  var lp=s.length?s[s.length-1]:{t:t1,c:st.warRisk.clash30d.point,w:st.warRisk.war30d.point,ph:st.warRisk.phase,live:1},nx=X(lp.t),ny=Y(lp.c);rmk("circle",{cx:nx,cy:ny,r:5,fill:"var(--viz)",stroke:"var(--card)","stroke-width":2});
  rlabel(nx-8,Math.max(12,ny-9),"지금 "+pct1(lp.c),"end",700,"var(--fg)");
  // 십자선 + 툴팁 (가까운 시각에 붙는다)
  var cross=rmk("line",{x1:0,x2:0,y1:T,y2:H-B,stroke:"var(--mute)","stroke-width":1,visibility:"hidden"});
  var hit=rmk("rect",{x:0,y:0,width:W,height:H,fill:"transparent"});
  el.innerHTML="";el.appendChild(svg);var tip=document.createElement("div");tip.className="tip";el.appendChild(tip);
  function rshow(ev){var r=svg.getBoundingClientRect(),sx=(ev.clientX-r.left)*W/r.width,ms=t0+(sx-L)/(W-L-R)*(t1-t0);
    var pts=s.map(function(p){return {t:p.t,c:p.c,w:p.w,ph:p.ph,live:p.live,who:"자동 판정"}}).concat(js.map(function(j){return {t:j.at,c:j.clash,w:j.war,ph:j.phase,who:"클로드 "+j.source}}));
    var best=0,bd=1e18;pts.forEach(function(p,i){var dd=Math.abs(p.t-ms);if(dd<bd){bd=dd;best=i}});var p=pts[best],px=X(p.t);
    cross.setAttribute("x1",px);cross.setAttribute("x2",px);cross.setAttribute("visibility","visible");
    tip.textContent="";var b=document.createElement("b");b.textContent="국지 충돌 "+pct1(p.c);tip.appendChild(b);
    var l1=document.createElement("div");l1.textContent=(p.live?"지금":kst(p.t))+" · "+p.ph+"단계"+(p.w!=null?" · 전면전 "+pct1(p.w):"");tip.appendChild(l1);
    var l0=document.createElement("div");l0.textContent=p.who;l0.style.color="var(--mute)";tip.appendChild(l0);
    evs.filter(function(e){return Math.abs(e.at-p.t)<=90*60000}).slice(0,2).forEach(function(e){var l2=document.createElement("div");l2.textContent="◆ "+e.headline;tip.appendChild(l2)});
    tip.style.display="block";var left=px*r.width/W+8;if(left>r.width-210)left=px*r.width/W-218;tip.style.left=Math.max(0,left)+"px"}
  hit.addEventListener("pointermove",rshow);hit.addEventListener("pointerdown",rshow);hit.addEventListener("pointerleave",function(){tip.style.display="none";cross.setAttribute("visibility","hidden")})}
// 10년 달마다 최고값 선 그래프 (단일 계열: 범례 없음, 제목이 이름) + 상위 2.5% 기준선 + 지금 점 + 십자선 툴팁
function drawTension(t){var el=$("#tchart");if(!el||!t||!t.view)return;var w=t.view.monthly;if(!w||!w.length)return;
  var W=Math.max(280,el.clientWidth||320),H=170,L=6,R=10,T=22,B=22,ns="http://www.w3.org/2000/svg";
  var max=Math.max(6,Math.ceil(Math.max.apply(null,w.map(function(p){return p.raw}))));
  var t0=Date.parse(w[0].d),t1=Date.now(),X=function(ms){return L+(ms-t0)/(t1-t0)*(W-L-R)},Y=function(v){return T+(1-v/max)*(H-T-B)};
  var svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("role","img");svg.setAttribute("aria-label","2016년 이후 달마다 최고 긴장 온도계 원점수");
  function mk(tag,a){var e=document.createElementNS(ns,tag);for(var k in a)e.setAttribute(k,a[k]);svg.appendChild(e);return e}
  // 해마다 눈금(가는 회색), 상위 2.5% 기준선
  for(var y=new Date(t0).getUTCFullYear()+1;y<=new Date(t1).getUTCFullYear();y++){var x=X(Date.UTC(y,0,1));mk("line",{x1:x,x2:x,y1:T,y2:H-B,stroke:"var(--line)","stroke-width":1});
    if(y%2===0){var tx=mk("text",{x:x,y:H-6,"font-size":11,"text-anchor":"middle",fill:"var(--mute)"});tx.textContent=String(y)}}
  var ref=Y(t.view.levels.top2_5);mk("line",{x1:L,x2:W-R,y1:ref,y2:ref,stroke:"var(--mute)","stroke-width":1,"stroke-opacity":.6});
  mk("line",{x1:L,x2:W-R,y1:Y(0),y2:Y(0),stroke:"var(--line)","stroke-width":1});
  var d="",a="M"+X(Date.parse(w[0].d))+","+Y(0);
  w.forEach(function(p,i){var px=X(Date.parse(p.d)),py=Y(p.raw);d+=(i?"L":"M")+px.toFixed(1)+","+py.toFixed(1);a+="L"+px.toFixed(1)+","+py.toFixed(1)});
  a+="L"+X(Date.parse(w[w.length-1].d))+","+Y(0)+"Z";
  mk("path",{d:a,fill:"var(--viz)","fill-opacity":.1,stroke:"none"});
  mk("path",{d:d,fill:"none",stroke:"var(--viz)","stroke-width":2,"stroke-linejoin":"round","stroke-linecap":"round"});
  // 글자는 선 위에 테두리(카드 색)를 둘러 겹쳐도 읽히게. 10년 최고점 하나만 이름표 (나머지는 툴팁·목록)
  function label(x,y,txt,anchor,weight,color){var e=mk("text",{x:x,y:y,"font-size":11,"text-anchor":anchor,fill:color||"var(--mute)","font-weight":weight||400,stroke:"var(--card)","stroke-width":3,"paint-order":"stroke","stroke-linejoin":"round"});e.textContent=txt;return e}
  label(W-R,ref-5,"상위 2.5%","end");
  var top=t.view.top[0];if(top){var tx2=X(Date.parse(top.d)),ty2=Y(top.raw);label(Math.min(W-R-40,Math.max(L+34,tx2)),Math.max(12,ty2-6),top.d.slice(0,4)+" 6차 핵실험","middle")}
  // 지금
  var nx=X(t1),ny=Y(t.raw);mk("circle",{cx:nx,cy:ny,r:5,fill:"var(--viz)",stroke:"var(--card)","stroke-width":2});
  label(nx-8,ny-9,"지금","end",700,"var(--fg)");
  // 십자선 + 툴팁 (가까운 주에 붙는다)
  var cross=mk("line",{x1:0,x2:0,y1:T,y2:H-B,stroke:"var(--mute)","stroke-width":1,visibility:"hidden"});
  var hit=mk("rect",{x:0,y:0,width:W,height:H,fill:"transparent"});
  el.innerHTML="";el.appendChild(svg);var tip=document.createElement("div");tip.className="tip";el.appendChild(tip);
  function show(ev){var r=svg.getBoundingClientRect(),sx=(ev.clientX-r.left)*W/r.width,ms=t0+(sx-L)/(W-L-R)*(t1-t0);
    var best=0,bd=1e18;w.forEach(function(p,i){var dd=Math.abs(Date.parse(p.d)-ms);if(dd<bd){bd=dd;best=i}});var p=w[best],px=X(Date.parse(p.d));
    cross.setAttribute("x1",px);cross.setAttribute("x2",px);cross.setAttribute("visibility","visible");
    var ep=t.view.top.filter(function(x){return x.d.slice(0,7)===p.d.slice(0,7)})[0];
    tip.textContent="";var b=document.createElement("b");b.textContent=p.raw.toFixed(2);tip.appendChild(b);
    var s1=document.createElement("div");s1.textContent=p.d.slice(0,7).replace("-","년 ")+"월 최고";tip.appendChild(s1);if(ep){var s2=document.createElement("div");s2.textContent=ep.d.slice(5).replace("-","/")+" "+ep.label;tip.appendChild(s2)}
    tip.style.display="block";var left=px*r.width/W+8;if(left>r.width-200)left=px*r.width/W-208;tip.style.left=Math.max(0,left)+"px"}
  hit.addEventListener("pointermove",show);hit.addEventListener("pointerdown",show);hit.addEventListener("pointerleave",function(){tip.style.display="none";cross.setAttribute("visibility","hidden")})}
// 전쟁 직전의 지문: 다른 전쟁 직전 공개적으로 보였던 것 중 지금 켜진 것 (켜짐을 위로)
function fingerprints(f){var on=f.checks.filter(function(c){return c.status==="on"}),rest=f.checks.filter(function(c){return c.status!=="on"});
  var h='<div class="sec">전쟁 직전 지문 <span style="font-weight:400">· 다른 전쟁 직전에 보였던 것</span></div><div class="card tm">';
  h+='<div class="th"><b>'+f.on+' / '+f.watched+'</b><span>자동으로 보는 지문 중 지금 켜진 것'+(f.on?'':' — 없음')+'</span></div>';
  function fpRow(c){var mark=c.status==="on"?'<b style="color:var(--l4)">●</b>':c.status==="off"?'<span style="color:var(--mute)">○</span>':'<span style="color:var(--mute)">?</span>';
    return '<li style="list-style:none;margin-left:-18px">'+mark+' '+esc(c.label)+(c.evidence?' — <b>'+esc(c.evidence)+'</b>':'')+(c.status==="unknown"?' <span style="color:var(--mute)">('+(c.watch==="analyst"?"분석관 확인":"공개 자료 없음")+')</span>':'')+'<div style="font-size:12px;color:var(--mute);margin-left:16px">'+esc(c.precedent)+'</div></li>'}
  if(on.length)h+='<ul>'+on.map(fpRow).join("")+'</ul>';
  h+='<details><summary>지문 '+f.checks.length+'개 모두 보기</summary><ul>'+rest.map(fpRow).join("")+'</ul></details>';
  h+='<div class="mk">1950년 한국전쟁·2023년 하마스 10·7 기습처럼 지문 없이 오는 경우도 있습니다. 그때 목표는 \'미리\'가 아니라 \'몇 분 안에\' 알리는 것입니다.</div></div>';
  return h}
// 스스로 채점하는 예측: 다음 30일·7일 큰 도발 확률 (최근 180일 빈도, 지난 10년으로 보정) + 예측 성적
function forecastLine(f,sc){if(!f)return "";
  var s='<div class="mk"><b>다음 30일 큰 도발</b>(ICBM·일본 상공·포격·위성·핵실험급) 약 <b>'+f.p30+'%</b> · 7일 '+f.p7+'% <span>(지난 10년 평균 '+f.base30+'%)</span> — 최근 180일 큰 도발 '+f.count180+'번'+(f.last?', 마지막 '+esc(f.last.d):'')+' 기준, 지난 10년 실제 비율로 보정. 전쟁 확률이 아니라 자주 일어나는 일로 실력을 재는 예측입니다.';
  if(sc&&sc.n)s+=' <b>예측 성적</b>: '+sc.n+'일 채점, 평균값보다 '+(sc.skill>=0?Math.round(sc.skill*100)+'% 덜 틀림':Math.round(-sc.skill*100)+'% 더 틀림')+'.';
  else if(sc&&sc.firstDue)s+=' 첫 채점 '+esc(sc.firstDue)+'.';
  return s+'</div>'}
// 판정 기록 (2026-11-01부터 영구 보관): 오늘 하루 최고값과 기록된 날 중 순위
function histLine(hs){if(!hs||!hs.today)return "";var t=hs.today,d=t.d.slice(5).replace("-","/");
  var s='<div class="mk">판정 기록 · 오늘('+esc(d)+') 최고 '+t.phase+'단계, 국지 충돌 '+pct(t.clash);
  s+=hs.days<7?' — '+esc(hs.since||"")+'부터 쌓는 중 ('+hs.days+'일째). 1주일이 지나면 지난 기록 중 순위를 보여 줍니다.':' — 지난 '+hs.rank.of+'일 중 '+hs.rank.clash+'번째로 높음';
  return s+'</div>'}
function pickTop(evs){var p=evs.filter(function(e){return e.brief.isProvocation||e.brief.danger.level>=2});return p[0]||null}
function pct(x){return x>=99.5?"진행 중":x<0.1?"0.1% 미만":x<1?x.toFixed(1)+"%":Math.round(x)+"%"}
// 온도계: 평온·긴장·위기·임박·교전 다섯 칸(같은 폭) 위에 '평소'와 '지금' 자리를 찍는다. 확률을 그대로 그리면 4%가 바닥에 붙어 짐작이 안 된다 (2026-11-02)
function gauge(w){var names=["평온","긴장","위기","임박","교전"],rng=["1~3%","2~4%","8~25%","25~60%","교전 중"];
  var g=w.gauge||{now:(w.phase-1+0.6)/5,usual:0.08},now=Math.max(0.01,Math.min(0.99,g.now)),us=g.usual,col="var(--l"+w.phase+")";
  var r=w.vsUsual!=null?w.vsUsual:w.clash30d.point/w.usual.clash;
  var times=r<1.15?"평소 수준":r<10?"평소의 "+(Math.abs(r-Math.round(r))<0.05?Math.round(r):r.toFixed(1))+"배":"평소의 "+Math.round(r)+"배";
  var odds=w.clash30d.point>=99.5?"":"약 "+Math.max(2,Math.round(100/w.clash30d.point))+"번에 1번꼴";
  var fighting=w.clash30d.point>=99.5;
  var h='<div class="gq">앞으로 30일 안에 남북 무력 충돌이 일어날 가능성</div>';
  h+=fighting?'<div class="gnum"><b>교전 중</b><span class="gx" style="color:'+col+'">남북이 지금 서로 쏘고 있음</span></div>':'<div class="gnum"><b>약 '+pct(w.clash30d.point)+'</b><span class="gx" style="color:'+col+'">'+times+'</span><span class="gu">평소 약 '+pct(w.usual.clash)+'</span></div>';
  h+='<div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+w.clash30d.point+'" aria-label="앞으로 30일 국지 충돌 가능성 약 '+pct(w.clash30d.point)+', 평소 약 '+pct(w.usual.clash)+', '+w.phase+'단계 '+esc(w.phaseLabel)+'">';
  h+='<div class="gnow" style="left:'+(now*100).toFixed(1)+'%"><span style="background:'+col+';color:var(--on'+w.phase+')">지금</span></div>';
  h+='<div class="gtrack"><div class="gfill" style="width:'+(now*100).toFixed(1)+'%;background:'+col+'"></div>';
  for(var i=1;i<5;i++)h+='<i class="gdiv" style="left:'+(i*20)+'%"></i>';
  h+='<i class="gmark" style="left:'+(now*100).toFixed(1)+'%;border-color:'+col+'"></i></div>';
  h+='<div class="gusual" style="left:'+(us*100).toFixed(1)+'%">▲ 평소 '+pct(w.usual.clash)+'</div>';
  h+='<div class="gzones">'+names.map(function(n,i){return '<span class="'+(i+1===w.phase?"on":"")+'" title="'+n+': 30일 국지 충돌 '+rng[i]+'"><b>'+n+'</b><small>'+rng[i]+'</small></span>'}).join("")+'</div></div>';
  h+='<div class="gfoot">'+(odds&&!fighting?odds+' — 한 달 동안 아무 일 없이 지나갈 가능성 약 '+pct(100-w.clash30d.point)+' · ':'')+'전면전 '+pct(w.war30d.point)+' (평소 '+pct(w.usual.war)+')</div>';
  return h}
// 첫 화면 한 장: 지금 단계 · 30일 국지 충돌 확률 · 어제와 비교 · 왜 · 오를 조건 · 마지막 도발 · 클로드 의견 · 할 일 · 데이터 상태 (2026-11-02)
function summary(st){var w=st.warRisk,c=st.vsYesterday,th=st.threat,names=["평온","긴장","위기","임박","교전"],LV=["평소","주의","경계","심각"];
  var h='<div class="card sum"><div class="lead">지금 한반도 · 자동 판정 '+esc(when(w.at))+'</div>';
  h+='<div class="phase"><b>'+w.phase+'단계 '+esc(w.phaseLabel)+'</b><span>5단계 중 · 1953년 이후 전면전 없음</span></div>';
  h+=gauge(w);
  if(c&&c.headline){var vd=c.verdict==="worse"?["up","▲ 나빠짐"]:c.verdict==="better"?["dn","▼ 나아짐"]:["same","● 비슷"];var parts=c.headline.split(" — ");
    h+='<div class="delta"><i class="'+vd[0]+'">'+vd[1]+'</i><span>'+(c.agoLabel?esc(c.agoLabel)+'와 비교'+(parts[1]?' — '+esc(parts.slice(1).join(" — ")):''):esc(c.headline))+'</span></div>'}
  var hot=w.domains.filter(function(d){return d.level>0}).sort(function(a,b){return b.level-a.level});
  var calm=w.domains.filter(function(d){return d.level===0}).map(function(d){return d.label});
  if(hot.length){h+='<h3>왜 '+esc(w.phaseLabel)+'인가</h3><div class="why">'+hot.map(function(d){return '<div class="t"><b>'+esc(d.label)+'</b><span>'+esc((d.drivers[0]||"근거 확인 중").replace(/\s*\((이상|상승|주의|경계|심각|위급)\)(?=\s*(—|$))/,""))+'</span></div><span class="chip d'+(d.level+1)+'">'+LV[Math.min(3,d.level)]+'</span>'}).join("")+'</div>';
    if(calm.length)h+='<div class="calm">✓ '+esc(calm.join("·"))+'은 평소대로'+(calm.indexOf("정부의 행동")>=0?' — 정보를 가진 쪽(정부)은 아직 움직이지 않음':'')+'</div>'}
  else h+='<h3>여섯 영역 모두 평소대로</h3>';
  if(w.phase<5&&w.tripwires&&w.tripwires.length)h+='<h3>이렇게 되면 단계가 오른다</h3><ul>'+w.tripwires.slice(0,3).map(function(t){return '<li>'+esc(t)+'</li>'}).join("")+'</ul>';
  var lp=th.lastProvocation;
  h+='<div class="ev">'+(th.level>1?'<b>'+esc(th.summary)+'</b>':'최근 24시간 북한 발사·포격 없음')+(lp?'<br><span>마지막 도발 '+(lp.dateOnly?bago({selfReport:{day:lp.dateOnly},at:lp.at}):ago(lp.at))+' · '+esc(lp.headline)+'</span>':'')+'</div>';
  var a=st.assessment,d=st.deepReport,op=[];
  if(a&&a.data&&a.data.overall_level!=null)op.push('분석관('+kst(a.at)+') '+(Number(a.data.overall_level)===w.phase?'같은 단계':a.data.overall_level+'단계로 봄'));
  if(d&&d.data&&d.data.war_phase!=null)op.push('심층 분석('+kst(d.at)+') '+(Number(d.data.war_phase)===w.phase?'같은 단계':d.data.war_phase+'단계로 봄')+(d.data.p_clash_30d!=null&&Math.abs(d.data.p_clash_30d-w.clash30d.point)>=1?', 국지 충돌 '+d.data.p_clash_30d+'%로 봄':''));
  if(op.length)h+='<div class="calm">🧑‍💻 클로드: '+esc(op.join(" · "))+' <span style="opacity:.8">(전문은 아래 \'클로드 분석 전문\')</span></div>';
  var DO={1:"평소대로 지내면 됩니다.",2:"평소대로 지내면 됩니다. 시간이 날 때 가까운 대피소 위치만 확인해 두세요.",3:"비상용품(물·약·손전등·보조배터리)과 가족 연락 방법을 확인하고, 재난문자 수신을 켜 두세요.",4:"정부·지자체 안내를 따르고 대피소와 이동 경로를 확인하세요.",5:"재난문자·민방위 경보에 따라 바로 대피하세요."};
  h+='<div class="do"><b>지금 할 일</b>'+(DO[w.phase]||DO[2])+' <a href="https://www.safekorea.go.kr" target="_blank" rel="noopener">국민재난안전포털 → 대피소 찾기</a></div>';
  h+=pushCard();
  var la=(st.alerts||[]).filter(function(a){return a.ok})[0];
  if(la)h+='<div class="calm">🔔 마지막 알림 '+esc(when(la.sentAt))+' · '+(/테스트/.test(la.title)?'<b>테스트</b>':'<b>실제</b>')+' · '+esc(la.title.slice(0,60))+'</div>';
  var dh=st.dataHealth;
  if(dh){h+='<div class="data"><span class="'+(dh.failing.length?'':'ok')+'">수집 정상 '+dh.ok+'/'+dh.total+'</span><span>마지막 수집 '+ago(st.lastCycle?st.lastCycle.at:st.now)+'</span>'+(dh.learning?'<span>평소를 배우는 중 '+dh.learning+'개</span>':'')+'</div>';
    if(dh.failing.length)h+='<div class="data fail">⚠ 지금 못 받는 것: '+dh.failing.map(function(f){return esc(f.name)+(f.since?' (마지막 성공 '+ago(f.since)+')':'')}).join(", ")+'</div>'}
  h+='<details class="wrd"><summary>판정 근거 전체 — 여섯 영역 · 누가 먼저 움직였나 · 억제 요인</summary>'+warRiskDetail(w)+'</details>';
  return h+'</div>'}
function warRiskDetail(w){var h='<div class="fm '+w.firstMover.kind+'"><b>누가 먼저 움직였나</b> · '+esc(w.firstMover.text)+'</div>';
  h+='<div>'+w.domains.map(function(d){return '<div class="dom"><div class="dl">'+esc(d.label)+'</div><div class="dv v'+d.level+'">'+esc(d.levelLabel)+'</div><div class="dd">'+(d.drivers.length?esc(d.drivers.join(" · ")):"특이 없음")+(d.measured<d.total?' <span style="opacity:.8">('+d.measured+'/'+d.total+' 측정)</span>':'')+'</div></div>'}).join("")+'</div>';
  h+='<b style="font-size:14px;display:block;margin-top:10px">이 단계로 본 이유</b><ul>'+w.phaseReasons.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  h+='<b style="font-size:14px;display:block;margin-top:8px">이런 신호가 나오면 단계가 바뀜</b><ul>'+w.tripwires.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  if(w.restraints.length)h+='<b style="font-size:14px;display:block;margin-top:8px">억제·완화 요인</b><ul>'+w.restraints.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  if(w.blindSpots.length)h+='<b style="font-size:14px;display:block;margin-top:8px">못 보는 곳</b><ul>'+w.blindSpots.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  h+='<b style="font-size:14px;display:block;margin-top:8px">영역별로 왜 보나</b><ul>'+w.domains.map(function(d){return '<li><b>'+esc(d.label)+'</b> — '+esc(d.why)+'</li>'}).join("")+'</ul>';
  h+='<div class="mk">범위: 국지 충돌 '+pct(w.clash30d.low)+'~'+pct(w.clash30d.high)+' · 전면전 '+pct(w.war30d.low)+'~'+pct(w.war30d.high)+' (평소 '+pct(w.usual.war)+')</div>';
  if(w.market)h+='<div class="mk">예측시장 \''+esc(w.market.question)+'\' '+w.market.pct+'%'+(w.market.usualPct!=null?' (지난 한 달 평소 '+w.market.usualPct+'%)':'')+(w.market.daysLeft!=null?' · 만기 '+w.market.daysLeft+'일':'')+' — 수 % 대 가격은 실제보다 높게 매겨지는 경향이라 변화만 봅니다'+(w.market.url?' · <a href="'+esc(w.market.url)+'" target="_blank" rel="noopener">시장 보기</a>':'')+'</div>';
  h+='<div class="mk">확률은 근거를 밝힌 판단값입니다(통계 예측 아님). 국지 충돌 = 남북 교전·영토 직접 공격.</div>';
  return h}
/** 카드 하나가 오류를 내도 나머지 화면은 그린다 */
function safe(fn,arg,name){try{return fn(arg)}catch(e){return '<div class="card" style="color:var(--l3);font-size:14px">⚠ '+esc(name)+' 표시 오류: '+esc(String(e&&e.message||e))+'</div>'}}
function money(x){return x==null?"—":"$"+Number(x).toFixed(2)}
function ktok(n){n=Number(n||0);return n>=1e6?(n/1e6).toFixed(1)+"백만":n>=1e4?Math.round(n/1e4)+"만":String(n)}
function usageLine(u){if(!u)return "";return "입력 "+ktok(u.input_tokens)+" · 출력 "+ktok(u.output_tokens)+" · 캐시 쓰기 "+ktok(u.cache_write_tokens)+" · 캐시 읽기 "+ktok(u.cache_read_tokens)+" 토큰"+(u.model?" · "+esc(u.model):"")}
function tokTotals(t,strict){var tr=strict?(t.tokenRuns||0):t.tokenRuns;var miss=tr!=null&&t.runs>tr?" (토큰 기록 "+tr+"회분 — 나머지는 기록 안 됨)":"";return "출력 "+ktok(t.output_tokens)+" · 입력 "+ktok(t.input_tokens+t.cache_write_tokens)+" · 캐시 읽기 "+ktok(t.cache_read_tokens)+miss}
// 분석이 나온 뒤 새로 확인된 일 + 분석에 없는 최근 도발 (2026-11-02: 09시 심층 분석이 10/31 발사를 10/29 발사와 같은 것으로 본 채 그대로 보였다)
function sinceNote(at,text){
  var evs=(ST.events||[]).map(function(e){return e.brief}).filter(function(b){return b&&((b.isProvocation&&b.danger.level>=2)||b.danger.level>=3||b.evacuation||b.posture)});
  var known=function(b){return b.selfReport?b.selfReport.reportedAt:b.at};
  var md=function(ms){var d=new Date(ms+9*3600000),m=d.getUTCMonth()+1,dd=d.getUTCDate();return [m+"/"+dd,m+"월 "+dd+"일"]};
  var after=evs.filter(function(b){return known(b)>at+60000});
  // 분석이 나온 때 알려져 있던 가장 최근 도발 하나만 본다 (그 날짜를 분석이 한 번도 쓰지 않았으면 빠뜨린 것) — 더 오래된 것까지 보면 일부러 안 쓴 것도 걸린다
  var lastKnown=evs.filter(function(b){return b.isProvocation&&known(b)<=at&&at-b.at<7*86400000}).sort(function(x,y){return y.at-x.at})[0];
  var missed=lastKnown&&!md(lastKnown.at).some(function(x){return text.indexOf(x)>=0})?[lastKnown]:[];
  if(!after.length&&!missed.length)return "";
  var li=function(b){return '<li>'+esc(bwhen(b))+' · '+esc(b.headline)+'</li>'};
  return '<div class="since"><b>이 분석 뒤 바뀐 것 (자동 확인)</b>'+(after.length?'<div>분석 뒤 새로 확인된 일</div><ul>'+after.map(li).join("")+'</ul>':'')+(missed.length?'<div>이 분석이 다루지 않은 가장 최근 도발</div><ul>'+missed.map(li).join("")+'</ul>':'')+'</div>';
}
function deep(n){var d=n.data,L=function(a,f){return a&&a.length?'<ul>'+a.map(f).join("")+'</ul>':''};
  var h='<div class="sec">클로드 심층 분석 · '+esc(when(n.at))+' <span style="font-weight:400">· 특이한 날에만 자동 실행</span></div><div class="card deep">';
  h+='<div class="dt">'+esc(d.title)+'</div><p>'+esc(d.summary)+'</p>';
  h+='<div class="pr">전쟁 위험 '+d.war_phase+'단계 · 30일 국지 충돌 '+d.p_clash_30d+'% · 전면전 '+d.p_war_30d+'%</div><p style="color:var(--mute);font-size:14px">'+esc(d.reasoning)+'</p>';
  h+='<details open><summary>확인한 사실 · 지켜볼 것</summary>'+L(d.findings,function(f){return '<li>'+esc(f.fact)+(f.source?(/^https?:/.test(f.source)?' <a href="'+esc(f.source)+'" target="_blank" rel="noopener">출처</a>':' <span style="color:var(--mute)">('+esc(f.source)+')</span>'):'')+'</li>'})+'<b style="font-size:14px;display:block;margin-top:8px">지켜볼 것</b>'+L(d.watch,function(x){return '<li>'+esc(x)+'</li>'})+'</details>';
  var more=L(d.timeline,function(t){return '<li><b>'+esc(t.date)+'</b> '+esc(t.event)+'</li>'});
  more+=(d.hypotheses||[]).map(function(x){return '<div style="margin-top:8px;font-size:14px"><b>'+esc(x.hypothesis)+'</b><br><span style="color:var(--l1)">찬성</span> '+esc((x.for||[]).join(" / ")||"-")+'<br><span style="color:var(--l3)">반대</span> '+esc((x.against||[]).join(" / ")||"-")+'</div>'}).join("");
  more+=L(d.analogs,function(a){return '<li><b>'+esc(a.case)+'</b> — 닮은 점: '+esc(a.similar)+' / 다른 점: '+esc(a.different)+'</li>'});
  more+=L(d.open_questions,function(x){return '<li>❓ '+esc(x)+'</li>'});
  if(more)h+='<details><summary>시간순 정리 · 가설 · 과거 사례 · 못 푼 질문</summary>'+more+'</details>';
  h+=sinceNote(n.at,JSON.stringify(d));
  if(d.usage)h+='<div class="us">이번 분석 사용량: '+usageLine(d.usage)+'</div>';
  return h+'</div>'}
function usagePanel(u){if(!u)return "";var b=u.budget;
  return '<details class="card use"><summary>Claude 사용량 (이번 달 '+esc(u.month)+')</summary><table><tr><td>심층 분석 '+u.deep.runs+'회</td><td>'+tokTotals(u.deep)+'</td></tr><tr><td>정기 분석(아침·저녁) '+u.scheduled.runs+'회</td><td>'+tokTotals(u.scheduled,true)+'</td></tr></table><p style="margin:10px 0 0">토큰 수입니다. Claude 구독의 사용 한도에서 차감되며, 조직에 추가 사용 크레딧이 켜져 있지 않으면 따로 결제되지 않습니다. 심층 분석은 하루 최대 '+(b?b.dailyMax:2)+'회, 한 달 최대 '+(b?b.monthlyMax:30)+'회이고, 다 쓰면 자동으로 멈춥니다.</p></details>'}
function render(){
  var st=ST,th=st.threat,evs=st.events,top=pickTop(evs);
  $("#upd").textContent="업데이트 "+when(st.lastCycle?st.lastCycle.at:st.now);
  var h="";
  // 0) 사건이나 징후 조합이 있을 때만 맨 위 띠 (사건 기반 위험도와 패턴 신뢰도 중 높은 쪽)
  var pats=st.patterns||[];var patLvl=pats.some(function(p){return p.confidence==="high"})?3:pats.some(function(p){return p.confidence==="medium"})?2:1;
  var lvl=Math.max(th.level,patLvl);var label=lvl===th.level?th.label:(lvl===3?"경계":"주의");
  if(lvl>1){h+='<div class="threat bg'+lvl+'"><div class="k">지금 한반도 상황</div><div class="v">'+esc(label)+'</div><div class="s">'+esc(lvl>th.level?"징후 조합이 감지됨 — 아래 '자동 해설' 확인":th.summary)+'</div>';
    h+='<div class="scale">';for(var i=1;i<=5;i++)h+='<i class="'+(i<=lvl?"on":"")+'"></i>';h+='</div></div>'}
  // 1) 첫 화면: 지금 한반도 — 단계·확률·어제와 비교·이유·오를 조건·할 일·데이터 상태 (2026-11-02 새 화면)
  if(st.warRisk)h+=safe(summary,st,"지금 한반도");
  // 2) 전쟁 위험 차트 (그대로)
  if(st.warRisk)h+=safe(riskChart,st,"전쟁 위험 차트");
  // 3) 자세히 — 여섯 묶음, 접혀 있고 연 것은 기억한다
  var an="";
  // 2) 클로드 분석관 판단 — 맨 위. 아래는 전부 세부사항이다
  if(st.assessment&&st.assessment.data){var stale=Date.now()-st.assessment.at>14*3600000;
    an+='<div class="sec">클로드 분석관 판단 · '+esc(when(st.assessment.at))+(stale?' <span style="color:var(--l3)">(오래됨)</span>':'')+' · 다음 분석 08:09 / 20:09</div><div class="card as">'+assessment(st.assessment.data)+sinceNote(st.assessment.at,JSON.stringify(st.assessment.data))+'</div>'}
  else if(st.notes&&st.notes.length){var n=st.notes[0];an+='<div class="sec">클로드 분석관 판단 · '+esc(when(n.at))+'</div><div class="card note">'+esc(n.text)+'</div>'}
  if(st.deepReport&&st.deepReport.data)an+=safe(deep,st.deepReport,"클로드 심층 분석");
  h+=group("analysis","클로드 분석 전문","분석관 판단 · 심층 분석 · 분석 뒤 바뀐 것",an);
  var ev="";
  // 3) 가장 최근 속보
  if(top){var b=top.brief;
    ev+='<div class="sec">가장 최근 주요 소식</div><div class="card" id="'+esc(top.id)+'">';
    ev+='<div><span class="ago '+fresh(b.at)+'"><span class="dot"></span>'+bago(b)+'</span><span class="abs">'+bwhen(b)+'</span></div>';
    ev+='<div class="chips"><span class="chip d'+b.danger.level+'">위험도 '+esc(b.danger.label)+'</span><span class="chip">'+esc(b.danger.reason)+'</span><span class="chip">'+esc(basisText(top))+'</span></div>';
    ev+='<div class="hl">'+esc(b.headline)+'</div>'+(b.note?'<div class="bnote">'+esc(b.note)+'</div>':'');
    ev+='<div class="facts">'+fact("🚀 종류",b.weapon)+fact("🔢 발수",b.count)+fact("📍 발사 지점",b.launchArea&&b.launchArea.name)+fact("🎯 낙하·방향",b.impactArea&&(b.impactArea.name+(b.impactArea.note?" ("+b.impactArea.note+")":"")))+(b.distanceKm?fact("↔ 비행거리","약 "+b.distanceKm+" km"):"")+(b.apogeeKm?fact("⤴ 최고고도","약 "+b.apogeeKm+" km"):"")+'</div>';
    if(b.launchArea||b.impactArea)ev+='<div id="map"></div><div class="legend">● 발사 지점 → ◎ 낙하·방향 (보도된 지명 기준 대략 위치)</div>';
    if(b.latest&&b.latest.at>b.at+60000)ev+='<div class="latest">최신 보도 <b>'+ago(b.latest.at)+'</b> · '+(b.latest.url?'<a href="'+esc(b.latest.url)+'" target="_blank" rel="noopener">'+esc(b.latest.title)+'</a>':esc(b.latest.title))+'</div>';
    ev+=sources(top)+'</div>';
  }
  // 6) 이전 소식
  var rest=evs.filter(function(e){return e!==top&&Date.now()-e.brief.at<30*86400000});
  var main=rest.filter(function(e){return e.brief.isProvocation||e.brief.danger.level>=2});
  var ref=rest.filter(function(e){return !(e.brief.isProvocation||e.brief.danger.level>=2)});
  if(main.length){ev+='<div class="sec">이전 주요 소식 (최근 30일)</div><div class="card">'+main.slice(0,8).map(row).join("")+'</div>'}
  if(ref.length)ev+='<details class="card"><summary>참고 기사 '+ref.length+'건 (논평·분석, 알림 대상 아님)</summary>'+ref.slice(0,30).map(row).join("")+'</details>';
  h+=group("events","사건","가장 최근 소식 · 이전 30일 · 참고 기사",ev,lvl>1);
  var bd=st.board||[];var abn=bd.filter(function(r){return r.reading&&(r.reading.state==="anomalous"||r.reading.state==="elevated")&&r.stateLabel!=="측정 불가"}).length;var fl=bd.filter(function(r){return r.failing}).length;
  h+=group("board","징후판 — 숫자","평소와 다른 것 "+abn+"개"+(fl?" · 못 받는 것 "+fl+"개":"")+" · 전체 "+bd.length+"개",'<div class="card">'+board(bd)+'</div>');
  var ys="";if(st.tension)ys+=safe(tension,st.tension,"긴장 온도계");if(st.fingerprints)ys+=safe(fingerprints,st.fingerprints,"전쟁 직전 지문");
  ys+='<div class="sec">앞으로 30일 큰 도발 예측</div><div class="card">'+forecastLine(st.forecast,st.history&&st.history.score)+histLine(st.history)+'</div>';
  h+=group("yard","다른 잣대","긴장 온도계 · 전쟁 직전 지문 · 30일 큰 도발 예측",ys);
  var au="";
  // 2a) 지금 상황 해설 (규칙 기반, 5분마다 갱신)
  var it=st.interpretation;
  if(it){var ICON={warning:"⚠️",reassuring:"✅",caveat:"🔍",gap:"⬜"};var KIND={warning:"위험 쪽 힌트",reassuring:"안심 쪽 힌트",caveat:"해석 주의",gap:"사각지대"};
    au+='<div class="sec">지금 상황 해설 <span style="font-weight:400">· 자동(규칙 기반) · 5분마다 갱신</span></div><div class="card ex"><div class="hd">'+esc(it.headline)+'</div>'+it.narrative.map(function(p){return '<p>'+esc(p)+'</p>'}).join("");
    if(it.hints.length){au+='<details open><summary>힌트 '+it.hints.length+'개 — 근거와 반대 해석</summary>'+it.hints.map(function(x){return '<div class="hint '+x.kind+'"><div class="ht">'+ICON[x.kind]+' '+esc(x.title)+' <span class="chip" style="font-size:11px;padding:1px 7px">'+KIND[x.kind]+'</span></div><div class="hr">'+esc(x.reasoning)+'</div>'+(x.counter?'<div class="hc">↔ 반대 해석: '+esc(x.counter)+'</div>':'')+(x.check?'<div class="hc">🔎 확인: '+esc(x.check)+'</div>':'')+'</div>'}).join("")+'</details>'}
    if(it.context&&it.context.length)au+='<div class="ctx">맥락: '+esc(it.context.join(" · "))+'</div>';
    au+='</div>'}
  // 2b) 패턴
  if(pats.length){au+='<div class="sec" id="patterns">감지된 징후 조합 · '+ago(st.patternsAt)+'</div>';
    au+=pats.map(function(p){return '<div class="card pat '+p.confidence+'"><div class="pn">'+esc(p.name)+' <span class="chip">'+CONF[p.confidence]+' · '+p.score+'점</span></div><div class="ps">'+esc(p.summary)+'</div>'+
      '<details><summary>다른 설명 가능성 · 확인 방법</summary><ul>'+p.alternatives.map(function(a){return '<li>'+esc(a)+'</li>'}).join("")+'</ul><ul style="margin-top:6px">'+p.checks.map(function(c){return '<li>🔎 '+esc(c)+'</li>'}).join("")+'</ul></details></div>'}).join("")}
  h+=group("auto","자동 해설","규칙 기반 힌트 · 징후 조합"+(pats.length?" "+pats.length+"개":""),au,patLvl>1);
  var sy="";
  // 7) 시스템
  if(st.usage)sy+=safe(usagePanel,st.usage,"Claude 사용량");
  sy+='<details class="card"><summary>시스템 상태 · 데이터 출처</summary>'+health(st)+'</details>';
  // 지금 쓰는 채널의 실패만 경고한다 (예전 ntfy 실패가 Bark 로 바꾼 뒤에도 남아 있던 문제)
  var chans=((st.setup&&st.setup.pushChannels)||[]).map(function(c){return c.split("(")[0]});
  var mine=(st.alerts||[]).filter(function(a){return !chans.length||chans.indexOf(a.channel)>=0});
  var lastFail=mine.find(function(a){return !a.ok});var lastOk=mine.find(function(a){return a.ok});
  var pushWarn=lastFail&&(!lastOk||lastFail.sentAt>lastOk.sentAt)?'<p style="font-size:13px;color:var(--l4)">⚠ 최근 알림 발송 실패('+esc(lastFail.channel||"")+') '+ago(lastFail.sentAt)+': '+esc(lastFail.error||"원인 미기록")+(lastFail.channel==="ntfy"&&chans.indexOf("bark")<0?'<br>ntfy.sh 는 발신 IP 단위 제한이 있어 서버에서 가끔 막힙니다. 확실히 하려면 Bark 앱(무료·계정 불필요) 키를 추가하세요 (docs/DEPLOY.md).':'')+'</p>':"";
  var ntfyUi=chans.indexOf("ntfy")>=0&&st.setup?'<p style="font-size:14px">ntfy 앱 구독 주소</p><button class="btn" onclick="copy(\''+esc(st.setup.ntfySubscribeUrl)+'\')">토픽 주소 복사</button>':'';
  sy+='<details class="card"'+(pushWarn?' open':'')+'><summary>알림 설정'+(pushWarn?' ⚠':'')+'</summary>'+pushWarn+'<p style="font-size:13px">휴대폰 알림은 <b>전쟁 위험 단계가 실제로 바뀔 때</b>(올라가면 5분 주기 두 번 확인 뒤, 내려가면 6시간 이어진 뒤)와 <b>실제 사건</b>(발사 속보·민방위 경보·철수 권고)일 때만 갑니다. 확률 숫자의 작은 흔들림, 징후 조합, 결론이 같은 심층 분석은 화면에만 남깁니다. <b>테스트 푸시와 시스템 경고는 운영자 기기(Bark·운영자 구독)에만</b> 가고, 다른 구독자에게는 실제 알림(단계 변화·사건·심층 분석)만 갑니다. 이 휴대폰: <b id="pushst">확인 중</b> · 로그인: <b>'+(st.public?"안 됨 (공개 화면)":"운영자")+'</b> <a href="#pushcard" onclick="return goPush()">알림 켜기·끄기는 첫 화면 카드에서 ↑</a></p><p style="font-size:13px">'+(st.phaseNotify?' 지금 기억한 단계: <b>'+st.phaseNotify.phase+'단계</b> ('+esc(kst(st.phaseNotify.at))+'부터)'+(st.phaseNotify.pending?' · 확인 중: '+st.phaseNotify.pending.phase+'단계':''):'')+'</p>'+(st.setup&&tok()?'<p style="font-size:13px;color:var(--mute)">설정된 채널: '+esc((st.setup.pushChannels||[]).join(", ")||"없음")+'</p>'+ntfyUi+'<button class="btn" onclick="testPush()">테스트 푸시</button>':"")+'</details>';
  h+=group("sys","시스템","사용량 · 수집 상태 · 알림 설정"+(pushWarn?" ⚠":""),sy,!!pushWarn);
  h+='<div class="foot">공개 정보만 사용합니다. 위험도와 패턴은 관측 사실의 요약·추론이며 전쟁 예측이 아닙니다. 대피 등 행동은 정부 재난문자·국민재난안전포털 안내를 따르세요.</div>';
  $("#app").innerHTML=h;
  bindGroups(top);
  refreshPushUi();
  try{drawRiskChart(st)}catch(e){}
}
// 접힌 묶음: 연 것은 이 기기에 기억한다 (5분마다 다시 그려도 그대로)
var OPEN={};try{OPEN=JSON.parse(localStorage.getItem("kew:open")||"{}")||{}}catch(e){OPEN={}}
function group(id,title,sub,inner,force){if(!inner)return "";
  return '<details class="more" data-g="'+id+'"'+(OPEN[id]||force?' open':'')+'><summary><div>'+esc(title)+'<span>'+esc(sub)+'</span></div></summary><div class="gbody">'+inner+'</div></details>'}
function bindGroups(top){document.querySelectorAll("details.more").forEach(function(d){
  var draw=function(){if(!d.open)return;var g=d.getAttribute("data-g");
    if(g==="events"&&top&&!d.getAttribute("data-drawn")){d.setAttribute("data-drawn","1");drawMap(top.brief)}
    if(g==="yard"){try{drawTension(ST.tension)}catch(e){}}};
  draw();
  d.addEventListener("toggle",function(){var g=d.getAttribute("data-g");if(d.open)OPEN[g]=1;else delete OPEN[g];try{localStorage.setItem("kew:open",JSON.stringify(OPEN))}catch(e){}draw()})})}
function fact(k,v){return '<div class="fact'+(v?"":" na")+'"><div class="fk">'+k+'</div><div class="fv">'+(v?esc(v):"보도 없음")+'</div></div>'}
function sgn(x){return (x>0?"+":"")+Math.round(x)+"%"}
function fmtVal(r){var v=r.reading.value,m=r.reading.meta||{};if(m.learning)return m.departures!=null?"어제 "+m.departures+"대":"기록 중";if(r.id==="sea.gfw_cn_change_pct"||r.id.indexOf("nk.")===0)return sgn(v);if(r.id==="elite.foreign_net_kospi"&&m.net5dEok!=null)return "5일 "+(m.net5dEok>=0?"+":"−")+(Math.abs(m.net5dEok)/10000).toFixed(1)+"조";if(r.id.indexOf("psych.")===0||r.id==="market.pm_war_prob")return "평소의 "+(v>=1000?Math.round(v/100):(v/100).toFixed(1))+"배";if(r.unit==="%")return v.toFixed(2)+"%";return (Number.isInteger(v)?v:v.toFixed(1))+(r.unit||"")}
function spark(hist){if(!hist||hist.length<2)return "";var vs=hist.map(function(p){return p.avg});var mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs);var W=100,H=26;
  var pts=hist.map(function(p,i){var x=i/(hist.length-1)*W;var y=mx===mn?H/2:H-2-((p.avg-mn)/(mx-mn))*(H-4);return x.toFixed(1)+","+y.toFixed(1)}).join(" ");
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.5" points="'+pts+'"/></svg>'}
function board(rows){var groups={};rows.forEach(function(r){(groups[r.groupLabel]=groups[r.groupLabel]||[]).push(r)});
  var order=["정부 공식","엘리트·큰손","접경 사건","시장","사람들의 관심","항공","항행경보","북한 수사","북한 내부 (장마당·불빛)","언론 템포","해상","지진","GPS 교란","위성 열점","SNS","인터넷"];
  var abn=rows.filter(function(r){return r.reading&&(r.reading.state==="anomalous"||r.reading.state==="elevated")&&r.stateLabel!=="측정 불가"});
  var fl=rows.filter(function(r){return r.failing});
  var h="";
  if(fl.length)h+='<div class="grp" style="color:var(--l3)">⚠ 지금 못 받는 징후 '+fl.length+'개 — 마지막으로 받은 값을 보여 줍니다</div><div class="board">'+fl.map(ind).join("")+'</div>';
  if(abn.length)h+='<div class="grp" style="color:var(--l3)">⚠ 평소와 다른 징후 '+abn.length+'개</div><div class="board">'+abn.map(ind).join("")+'</div>';
  else h+='<div class="grp" style="color:var(--l1)">✓ 측정 가능한 징후가 모두 평소 범위 안</div>';
  order.forEach(function(g){if(!groups[g])return;h+='<div class="grp">'+g+'</div><div class="board">'+groups[g].map(ind).join("")+'</div>'});
  var learning=rows.filter(function(r){return r.reading&&r.reading.state==="learning"}).length;
  h+='<p style="font-size:12px;color:var(--mute);margin:12px 0 0">● 정상 · ● 상승 · ● 이상 · ○ 학습 중/측정 불가. '+esc((ST&&ST.rules&&ST.rules.learning)||"")+(learning?' (지금 평소를 다 배우지 못한 징후 '+learning+'개)':'')+' 항목을 누르면 왜 중요한지 설명이 나옵니다.</p>';
  return h}
/** 고정 문턱으로 판정하는 징후: '학습 중' 대신 문턱을 보여 준다 (값과 같은 모양으로) */
function thr(r){var a=r.absolute;if(!a)return "";var f=function(x){return fmtVal({id:r.id,unit:r.unit,reading:{value:r.direction==="low"?-x:x,meta:{}}})};
  // 정수로만 나오는 값(단계·건·켜짐)에서 두 문턱이 같은 정수로 올라가면 한 문턱으로 쓴다 (예: 철수 권고 0.5/1 → '1부터 이상')
  var one=a.elevated===a.anomalous||(r.unit!=="%"&&r.unit!=="%p"&&r.unit!=="z"&&Math.ceil(a.elevated)===Math.ceil(a.anomalous));
  return one?"기준: "+f(Math.ceil(a.anomalous))+"부터 이상":"기준: "+f(a.elevated)+" 상승 · "+f(a.anomalous)+" 이상"}
function ind(r){var rd=r.reading,unavail=!rd||r.stateLabel==="측정 불가";var stc=unavail?"unavailable":rd.state;
  var bv=function(x){return r.unit==="%"?x.toFixed(2)+"%":Math.round(x)+(r.unit||"")};
  var base=unavail?"측정 불가":rd&&rd.state==="learning"&&rd.meta&&rd.meta.learningDays!=null?"평소 학습 중 "+rd.meta.learningDays+"/"+(rd.meta.need||8)+"일":r.absolute?thr(r):rd&&rd.days!=null&&rd.state==="learning"?"평소 기준 "+rd.days+"/7일째"+(rd.days>=2?" · 아주 큰 변화만 판정":""):rd&&rd.baseline!=null&&rd.state!=="learning"?"평소 "+bv(rd.baseline)+(rd.days!=null?" (최근 "+rd.days+"일)":"")+(rd.z!=null?" · z "+rd.z.toFixed(1):""):"기준선 학습 중 "+(rd?rd.n:0)+"/10";
  var extra="";if(rd&&rd.meta){var m=rd.meta;if(m.aircraft&&m.aircraft.length)extra=m.aircraft.slice(0,3).map(function(a){return a.what.split("(")[0]}).join(", ");else if(m.titles&&m.titles.length)extra=m.titles[0];else if(m.note)extra=m.note;else if(m.signedPct!=null)extra=(m.signedPct>0?"+":"")+m.signedPct+"% · "+m.price+"원"}
  if(rd&&rd.meta&&rd.meta.cnChangePct!=null)base="중국 "+sgn(rd.meta.cnChangePct)+(rd.meta.otherChangePct!=null?" · 다른 배 "+sgn(rd.meta.otherChangePct):"")+" (직전 2주 대비)";
  if(r.failing){stc="unavailable";base="⚠ 수집 실패 · 마지막 성공 "+ago(r.failing.since)+" — 아래 값은 그때 것"}
  var attr=rd&&rd.meta&&rd.meta.attribution&&/Global Fishing Watch/.test(rd.meta.attribution)?'<div class="ib" style="margin-top:2px"><a href="https://globalfishingwatch.org" target="_blank" rel="noopener" onclick="event.stopPropagation()">Powered by Global Fishing Watch</a></div>':"";
  var meaning=ST&&ST.interpretation&&ST.interpretation.perIndicator?ST.interpretation.perIndicator[r.id]:"";
  var narrow=r.coverage&&rd&&!unavail&&rd.value===0?'<span class="chip" style="font-size:11px;padding:1px 7px;background:var(--l2);color:#fff;vertical-align:2px">범위 제한</span>':'';
  return '<div class="ind" onclick="this.classList.toggle(\'open\')"><span class="st '+stc+'"></span><div class="il">'+esc(r.label)+'</div><div class="iv">'+(unavail?"—":fmtVal(r))+' '+narrow+'</div><div class="ib'+(r.failing?' fail':'')+'">'+esc(base)+'</div>'+spark(r.history)+(extra?'<div class="ib" style="margin-top:2px">'+esc(extra).slice(0,70)+'</div>':"")+attr+'<div class="why">'+(meaning?'<b>뜻:</b> '+esc(meaning)+'<br>':'')+'<b>왜 보나:</b> '+esc(r.why)+'<br><b>지연:</b> '+esc(r.latency)+'<br><b>주의:</b> '+esc(r.caveats)+(r.coverage?'<br><b>범위 제한:</b> '+esc(r.coverage):'')+(rd?'<br><b>관측:</b> '+kst(rd.at):'')+'</div></div>'}
function assessment(a){var LK={high:"가능성 높음",medium:"가능성 보통",low:"가능성 낮음"};
  var h='<div class="ov"><span class="lv lv'+a.overall_level+'"></span>'+a.overall_level+'단계 · '+esc(a.overall)+'</div>';
  var hy=a.hypotheses||[];
  if(hy.length){h+='<div style="font-size:13px;color:var(--mute);margin:10px 0 2px">클로드가 세운 가설과 판단</div>';
    hy.forEach(function(x){h+='<div class="hy"><b>'+esc(x.hypothesis)+'</b><span class="lk '+x.likelihood+'">'+LK[x.likelihood]+'</span>';
      var det='';
      if(x.evidence_for&&x.evidence_for.length)det+='<div class="ev"><span>근거</span>'+esc(x.evidence_for.join(" · "))+'</div>';
      if(x.evidence_against&&x.evidence_against.length)det+='<div class="ev"><span>반대</span>'+esc(x.evidence_against.join(" · "))+'</div>';
      if(x.next_checks&&x.next_checks.length)det+='<div class="ev"><span>확인</span>'+esc(x.next_checks.join(" · "))+'</div>';
      if(det)h+='<details><summary style="margin-top:4px;font-size:13px">근거 · 반대 해석 · 다음 확인</summary>'+det+'</details>';
      h+='</div>'})}
  if(a.anomalies&&a.anomalies.length)h+='<div class="hy"><b>새로 눈에 띈 것</b><div class="ev">'+esc(a.anomalies.join(" · "))+'</div></div>';
  if(a.gaps&&a.gaps.length)h+='<details class="hy"><summary style="margin:0;font-size:14px;color:var(--mute)">지금 못 보고 있는 것 '+a.gaps.length+'개</summary><div class="ev">'+esc(a.gaps.join(" · "))+'</div></details>';
  return h}
function row(e){var b=e.brief;return '<div class="row" onclick="this.querySelector(\'.more\').hidden=!this.querySelector(\'.more\').hidden"><div class="t '+fresh(b.at)+'">'+bago(b)+'</div><div class="b"><div class="h"><span class="lv lv'+b.danger.level+'"></span>'+esc(b.headline)+'</div><div class="x">'+bwhen(b)+' · 위험도 '+esc(b.danger.label)+' · '+esc(basisText(e))+'</div>'+(b.note?'<div class="x">'+esc(b.note)+'</div>':'')+'<div class="more" hidden>'+sources(e,true)+'</div></div></div>'}
function sources(e,open){var s=e.signals.slice().sort(function(a,b){return (b.publishedTime||b.detectedTime)-(a.publishedTime||a.detectedTime)});
  var inner=s.map(function(x){return '<div class="src"><small>'+ago(x.publishedTime||x.detectedTime)+' · '+esc(x.summary||x.source)+'</small><br>'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.title)+'</a>':esc(x.title))+'</div>'}).join("");
  return open?inner:'<details><summary>근거 기사·데이터 '+s.length+'건 보기</summary>'+inner+'</details>'}
function storage(st){var u=st.storage;if(!u)return "";var m=function(n){return n>=10000?Math.round(n/10000)+"만":String(n)};
  var pr=Math.round(u.read/u.limitRead*100),pw=Math.round(u.written/u.limitWritten*100);
  return '<p style="font-size:13px">서버 저장소 오늘 사용 (무료 한도, 오전 9시 초기화): 읽기 '+m(u.read)+'/500만 행 ('+pr+'%) · 쓰기 '+m(u.written)+'/10만 행 ('+pw+'%)'+(Math.max(pr,pw)>=70?' <b class="bad">한도 주의</b>':'')+'</p>'}
function health(st){return storage(st)+'<p style="font-size:13px">마지막 수집 '+(st.lastCycle?ago(st.lastCycle.at):"없음")+' '+(tok()?'<button class="btn" id="runbtn" onclick="runNow()">지금 수집</button>':'')+'</p><table>'+st.sources.map(function(s){var h=st.health.find(function(x){return x.source===s.id});
  var stt=!h?'<span>대기</span>':h.skipped?'<span>꺼짐 <small>'+esc(h.skipped).slice(0,40)+'</small></span>':h.ok?'<span class="ok">정상</span>'+(h.error?' <small class="bad">'+esc(h.error).slice(0,50)+'</small>':''):'<span class="bad">오류</span> <small>'+esc(h.error||"").slice(0,60)+'</small>';
  return '<tr><td>'+esc(s.name)+'<br><small>'+esc(s.latency)+'</small></td><td>'+stt+'<br><small>'+(h?ago(h.fetchedAt):"")+'</small></td></tr>'}).join("")+'</table>'}
function drawMap(b){var el=$("#map");if(!el||!window.L)return;if(map){map.remove();map=null}
  var dark=matchMedia("(prefers-color-scheme: dark)").matches;
  map=L.map(el,{zoomControl:false,attributionControl:true,scrollWheelZoom:false});
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/"+(dark?"World_Dark_Gray_Base":"World_Light_Gray_Base")+"/MapServer/tile/{z}/{y}/{x}",{attribution:"Esri, HERE, Garmin, © OpenStreetMap",maxZoom:10}).addTo(map);
  var pts=[];var red=getComputedStyle(document.documentElement).getPropertyValue("--l4").trim()||"#d32f2f";
  var from=b.launchArea||{name:"북한 (지점 미상)",lat:39.6,lon:126.6};
  L.circleMarker([from.lat,from.lon],{radius:8,color:"#fff",weight:2,fillColor:red,fillOpacity:1}).addTo(map).bindTooltip("발사 · "+from.name,{permanent:true,direction:"top",offset:[0,-6]});pts.push([from.lat,from.lon]);
  if(b.impactArea){var to=b.impactArea;L.circleMarker([to.lat,to.lon],{radius:16,color:red,weight:2,dashArray:"3 3",fillColor:red,fillOpacity:.15}).addTo(map).bindTooltip("낙하 · "+to.name,{permanent:true,direction:"bottom",offset:[0,10]});
    L.polyline([[from.lat,from.lon],[to.lat,to.lon]],{color:red,weight:3,dashArray:"8 6"}).addTo(map);pts.push([to.lat,to.lon])}
  L.circleMarker([37.5665,126.978],{radius:4,color:"#888",fillColor:"#888",fillOpacity:1}).addTo(map).bindTooltip("서울",{permanent:true,direction:"bottom"});pts.push([37.5665,126.978]);
  map.fitBounds(pts,{paddingTopLeft:[30,50],paddingBottomRight:[30,50],maxZoom:6})}
async function runNow(){var b=$("#runbtn");b.disabled=true;b.textContent="수집 중…";try{await fetch("/api/run",{method:"POST",headers:{authorization:"Bearer "+tok()}})}catch(e){}load()}
async function testPush(){var r=await fetch("/api/test-push",{method:"POST",headers:{authorization:"Bearer "+tok()}});var j=await r.json();alert(j.some&&j.some(function(x){return x.ok})?"보냈습니다. 휴대폰을 확인하세요.":JSON.stringify(j))}
function copy(t){navigator.clipboard.writeText(t).then(function(){alert("복사됨")},function(){prompt("복사하세요",t)})}
// 5분마다 갱신 (서버도 5분 주기로 판단한다). 화면이 꺼져 있으면 건너뛰고, 다시 볼 때 2분 넘게 지났으면 바로 갱신 — 저장소 읽기 절약
load();setInterval(function(){if(!window.__KEW_STATE__&&!document.hidden)load()},300000);
var rsz=0;window.addEventListener("resize",function(){clearTimeout(rsz);rsz=setTimeout(function(){if(ST){try{drawTension(ST.tension)}catch(e){}try{drawRiskChart(ST)}catch(e){}}},200)});
document.addEventListener("visibilitychange",function(){if(!document.hidden&&!window.__KEW_STATE__&&Date.now()-LAST>120000)load()});
</script></body></html>`;
