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
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--bg:#f3f4f6;--card:#fff;--fg:#111418;--mute:#5f6773;--line:#e2e5e9;--chip:#eef0f3;--viz:#1f5fbf;
--l1:#2e7d32;--l2:#b58105;--l3:#e0650b;--l4:#d32f2f;--l5:#8e0000;--fresh:#d32f2f;--warm:#e0650b;--old:#8a929c;--link:#1f5fbf;--learn:#8a929c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--fg:#eceef1;--mute:#9aa3ae;--line:#2a2f37;--chip:#232830;--viz:#5a96e8;
--l1:#4caf50;--l2:#f2b632;--l3:#ff8a3d;--l4:#ff5252;--l5:#ff1744;--fresh:#ff5252;--warm:#ff8a3d;--old:#8a929c;--link:#7fb0ff;--learn:#6b7380}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;padding:0 16px 48px;padding-top:env(safe-area-inset-top)}
.wrap{max-width:720px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;padding:12px 0 8px;font-size:13px;color:var(--mute)}
.top b{color:var(--fg);font-size:15px}
.threat{border-radius:16px;padding:18px 18px 16px;color:#fff;margin-bottom:12px}
.threat .k{font-size:13px;opacity:.9}.threat .v{font-size:34px;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin:2px 0 6px}
.threat .s{font-size:16px;font-weight:600}.threat .m{font-size:13px;opacity:.9;margin-top:8px}
.bg1{background:var(--l1)}.bg2{background:var(--l2)}.bg3{background:var(--l3)}.bg4{background:var(--l4)}.bg5{background:var(--l5);animation:pulse 1.6s infinite}
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
.chip.d1{background:var(--l1);color:#fff}.chip.d2{background:var(--l2);color:#fff}.chip.d3{background:var(--l3);color:#fff}.chip.d4{background:var(--l4);color:#fff}.chip.d5{background:var(--l5);color:#fff}
.hl{font-size:21px;font-weight:800;line-height:1.3;margin:8px 0 4px;letter-spacing:-.3px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
.fact{background:var(--chip);border-radius:12px;padding:10px 12px}.fact .fk{font-size:12px;color:var(--mute)}.fact .fv{font-size:16px;font-weight:700;margin-top:2px}
.fact.na .fv{color:var(--mute);font-weight:500}
#map{height:260px;border-radius:12px;overflow:hidden;margin-top:6px;border:1px solid var(--line)}
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
.btn{display:inline-block;border:1px solid var(--line);background:var(--card);color:var(--link);border-radius:10px;padding:8px 12px;font-size:14px;margin:4px 6px 4px 0;text-decoration:none}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}.ok{color:var(--l1)}.bad{color:var(--l4)}
#login{display:none}#login input{width:100%;padding:12px;font-size:16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);margin:8px 0}
.foot{font-size:12px;color:var(--mute);margin-top:20px}
.leaflet-container{background:var(--chip);font:inherit}.leaflet-tooltip{font-weight:700;font-size:12px}.leaflet-control-attribution{font-size:9px!important;line-height:1.2}
</style></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b><span id="upd"></span></div>
<div id="login" class="card"><b>접속 비밀값을 입력하세요</b><input id="tok" type="password" autocomplete="current-password"><button class="btn" onclick="saveTok()">확인</button></div>
<div id="app"></div>
</div>
<script>
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var ST=null, map=null, LAST=0;
function ago(ms){var d=Math.max(0,Date.now()-ms),m=Math.floor(d/60000);if(m<1)return "방금";if(m<60)return m+"분 전";var h=Math.floor(m/60);if(h<3)return h+"시간 "+(m%60)+"분 전";if(h<24)return h+"시간 전";var dd=Math.floor(h/24);return dd<2?dd+"일 "+(h%24)+"시간 전":dd+"일 전"}
function fresh(ms){var h=(Date.now()-ms)/3600000;return h<1?"f":h<24?"w":"o"}
function kst(ms){if(!ms)return "—";var d=new Date(ms+9*3600000);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")}
function tok(){try{var q=new URLSearchParams(location.search).get("key");if(q){localStorage.setItem("kew_token",q);history.replaceState(null,"",location.pathname+location.hash)}return localStorage.getItem("kew_token")}catch(e){return null}}
function saveTok(){try{localStorage.setItem("kew_token",$("#tok").value)}catch(e){}load()}
var STATUS={CONFIRMED:"정부 공식확인",CORROBORATED:"복수 출처 교차확인",UNVERIFIED:"단일 출처"};
var CONF={high:"신뢰도 높음",medium:"신뢰도 보통",low:"신뢰도 낮음"};
function basisText(e){if(e.basis==="official_quote")return e.status==="CORROBORATED"?"언론 "+e.sources.length+"곳이 공식발표 인용":"속보 1곳 (교차확인 전)";if(e.basis==="media")return "언론 보도만";return STATUS[e.status]}
async function load(){
  var st=window.__KEW_STATE__;
  if(!st){var t=tok();if(!t){$("#login").style.display="block";return}
    var r,body=null;
    try{r=await fetch("/api/state?hours=168",{headers:{authorization:"Bearer "+t}})}catch(e){showErr("서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.",false);return}
    if(r.status===401){$("#login").style.display="block";return}
    try{body=await r.json()}catch(e){}
    if(!r.ok||!body||body.error){showErr(body&&body.message?body.message:"서버 오류 ("+r.status+") — 잠시 뒤 다시 열어 보세요.",!!body&&body.error==="storage_limit");return}
    st=body}
  LAST=Date.now();$("#login").style.display="none";ST=st;render()}
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
  h+='<div class="chart" id="tchart"></div>';
  if(v.similar&&v.similar.length)h+='<div class="mk">비슷했던 때 · '+v.similar.map(function(x){return esc(x.d)+' '+esc(x.label)}).join(" · ")+'</div>';
  h+='<details><summary>지난 10년 가장 긴장됐던 날</summary><ol>'+v.top.map(function(x){return '<li>'+esc(x.d)+' · '+esc(x.label)+' <span style="color:var(--mute)">('+x.raw+')</span></li>'}).join("")+'</ol></details>';
  h+='<div class="mk">점수: 각 요소를 지난 10년 하루 값에 견줘 상위 2.5%면 1점, 0.5%면 2점(최대 3). 정부 경보·북한 담화·항공·선박 신호는 과거 자료가 없어 빠졌고, 2026년 3월 미-이란 전쟁·2018년 정상회담처럼 한반도 밖 사건이나 큰 뉴스에도 오를 수 있습니다.</div></div>';
  return h}
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
  var s='<div class="mk"><b>다음 30일 큰 도발</b>(ICBM·일본 상공·포격·위성·핵실험급) 약 <b>'+f.p30+'%</b> · 7일 '+f.p7+'% <span>(아무 날 평균 '+f.base30+'%)</span> — 최근 180일 큰 도발 '+f.count180+'번'+(f.last?', 마지막 '+esc(f.last.d):'')+' 기준, 지난 10년 실제 비율로 보정. 전쟁 확률이 아니라 자주 일어나는 일로 실력을 재는 예측입니다.';
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
function warRisk(w){var names=["평온","긴장","위기","임박","교전"];
  var h='<div class="sec">전쟁 위험 <span style="font-weight:400">· 자동 판정 · 5분마다 갱신</span></div><div class="card wr">';
  h+='<div class="wrh"><b>'+w.phase+'단계 '+esc(w.phaseLabel)+'</b><span>5단계 중 · 1953년 이후 전면전 없음</span></div>';
  h+='<div class="ladder">';for(var i=1;i<=5;i++)h+='<div class="p'+i+(i===w.phase?' on':'')+'">'+names[i-1]+'</div>';h+='</div>';
  h+='<div class="probs"><div><div class="pk">앞으로 30일 · 국지 충돌</div><div class="pv">약 '+pct(w.clash30d.point)+'</div><div class="ps">평소 약 '+pct(w.usual.clash)+' · 범위 '+pct(w.clash30d.low)+'~'+pct(w.clash30d.high)+'</div></div>';
  h+='<div><div class="pk">앞으로 30일 · 전면전</div><div class="pv">'+pct(w.war30d.point)+'</div><div class="ps">평소 '+pct(w.usual.war)+' · 범위 '+pct(w.war30d.low)+'~'+pct(w.war30d.high)+'</div></div></div>';
  h+=histLine(ST&&ST.history);
  h+=forecastLine(ST&&ST.forecast,ST&&ST.history&&ST.history.score);
  h+='<div class="fm '+w.firstMover.kind+'"><b>누가 먼저 움직였나</b> · '+esc(w.firstMover.text)+'</div>';
  h+='<div>'+w.domains.map(function(d){return '<div class="dom"><div class="dl">'+esc(d.label)+'</div><div class="dv v'+d.level+'">'+esc(d.levelLabel)+'</div><div class="dd">'+(d.drivers.length?esc(d.drivers.join(" · ")):"특이 없음")+(d.measured<d.total?' <span style="opacity:.8">('+d.measured+'/'+d.total+' 측정)</span>':'')+'</div></div>'}).join("")+'</div>';
  h+='<details><summary>이 단계로 본 이유 · 지켜볼 신호 · 억제 요인</summary><b style="font-size:14px">이유</b><ul>'+w.phaseReasons.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  h+='<b style="font-size:14px;display:block;margin-top:8px">이런 신호가 나오면 단계가 바뀜</b><ul>'+w.tripwires.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  h+='<b style="font-size:14px;display:block;margin-top:8px">억제·완화 요인</b><ul>'+w.restraints.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  if(w.blindSpots.length)h+='<b style="font-size:14px;display:block;margin-top:8px">못 보는 곳</b><ul>'+w.blindSpots.map(function(r){return '<li>'+esc(r)+'</li>'}).join("")+'</ul>';
  h+='<b style="font-size:14px;display:block;margin-top:8px">영역별로 왜 보나</b><ul>'+w.domains.map(function(d){return '<li><b>'+esc(d.label)+'</b> — '+esc(d.why)+'</li>'}).join("")+'</ul></details>';
  if(w.market)h+='<div class="mk">예측시장 \''+esc(w.market.question)+'\' '+w.market.pct+'%'+(w.market.usualPct!=null?' (지난 한 달 평소 '+w.market.usualPct+'%)':'')+(w.market.daysLeft!=null?' · 만기 '+w.market.daysLeft+'일':'')+' — 수 % 대 가격은 실제보다 높게 매겨지는 경향이라 변화만 봅니다'+(w.market.url?' · <a href="'+esc(w.market.url)+'" target="_blank" rel="noopener">시장 보기</a>':'')+'</div>';
  h+='<div class="mk">확률은 근거를 밝힌 판단값입니다(통계 예측 아님). 국지 충돌 = 남북 교전·영토 직접 공격.</div></div>';
  return h}
/** 카드 하나가 오류를 내도 나머지 화면은 그린다 */
function safe(fn,arg,name){try{return fn(arg)}catch(e){return '<div class="card" style="color:var(--l3);font-size:14px">⚠ '+esc(name)+' 표시 오류: '+esc(String(e&&e.message||e))+'</div>'}}
function money(x){return x==null?"—":"$"+Number(x).toFixed(2)}
function ktok(n){n=Number(n||0);return n>=1e6?(n/1e6).toFixed(1)+"백만":n>=1e4?Math.round(n/1e4)+"만":String(n)}
function usageLine(u){if(!u)return "";return "입력 "+ktok(u.input_tokens)+" · 출력 "+ktok(u.output_tokens)+" · 캐시 쓰기 "+ktok(u.cache_write_tokens)+" · 캐시 읽기 "+ktok(u.cache_read_tokens)+" 토큰"+(u.model?" · "+esc(u.model):"")}
function tokTotals(t){return "출력 "+ktok(t.output_tokens)+" · 입력 "+ktok(t.input_tokens+t.cache_write_tokens)+" · 캐시 읽기 "+ktok(t.cache_read_tokens)}
function deep(n){var d=n.data,L=function(a,f){return a&&a.length?'<ul>'+a.map(f).join("")+'</ul>':''};
  var h='<div class="sec">클로드 심층 분석 · '+ago(n.at)+' <span style="font-weight:400">· 특이한 날에만 자동 실행</span></div><div class="card deep">';
  h+='<div class="dt">'+esc(d.title)+'</div><p>'+esc(d.summary)+'</p>';
  h+='<div class="pr">전쟁 위험 '+d.war_phase+'단계 · 30일 국지 충돌 '+d.p_clash_30d+'% · 전면전 '+d.p_war_30d+'%</div><p style="color:var(--mute);font-size:14px">'+esc(d.reasoning)+'</p>';
  h+='<details open><summary>확인한 사실 · 지켜볼 것</summary>'+L(d.findings,function(f){return '<li>'+esc(f.fact)+(f.source?(/^https?:/.test(f.source)?' <a href="'+esc(f.source)+'" target="_blank" rel="noopener">출처</a>':' <span style="color:var(--mute)">('+esc(f.source)+')</span>'):'')+'</li>'})+'<b style="font-size:14px;display:block;margin-top:8px">지켜볼 것</b>'+L(d.watch,function(x){return '<li>'+esc(x)+'</li>'})+'</details>';
  var more=L(d.timeline,function(t){return '<li><b>'+esc(t.date)+'</b> '+esc(t.event)+'</li>'});
  more+=(d.hypotheses||[]).map(function(x){return '<div style="margin-top:8px;font-size:14px"><b>'+esc(x.hypothesis)+'</b><br><span style="color:var(--l1)">찬성</span> '+esc((x.for||[]).join(" / ")||"-")+'<br><span style="color:var(--l3)">반대</span> '+esc((x.against||[]).join(" / ")||"-")+'</div>'}).join("");
  more+=L(d.analogs,function(a){return '<li><b>'+esc(a.case)+'</b> — 닮은 점: '+esc(a.similar)+' / 다른 점: '+esc(a.different)+'</li>'});
  more+=L(d.open_questions,function(x){return '<li>❓ '+esc(x)+'</li>'});
  if(more)h+='<details><summary>시간순 정리 · 가설 · 과거 사례 · 못 푼 질문</summary>'+more+'</details>';
  if(d.usage)h+='<div class="us">이번 분석 사용량: '+usageLine(d.usage)+'</div>';
  return h+'</div>'}
function usagePanel(u){if(!u)return "";var b=u.budget;
  return '<details class="card use"><summary>Claude 사용량 (이번 달 '+esc(u.month)+')</summary><table><tr><td>심층 분석 '+u.deep.runs+'회</td><td>'+tokTotals(u.deep)+'</td></tr><tr><td>정기 분석(아침·저녁) '+u.scheduled.runs+'회</td><td>'+tokTotals(u.scheduled)+'</td></tr></table><p style="margin:10px 0 0">토큰 수입니다. Claude 구독의 사용 한도에서 차감되며, 조직에 추가 사용 크레딧이 켜져 있지 않으면 따로 결제되지 않습니다. 심층 분석은 하루 최대 '+(b?b.dailyMax:2)+'회, 한 달 최대 '+(b?b.monthlyMax:30)+'회이고, 다 쓰면 자동으로 멈춥니다.</p></details>'}
function render(){
  var st=ST,th=st.threat,evs=st.events,top=pickTop(evs);
  $("#upd").textContent="업데이트 "+ago(st.lastCycle?st.lastCycle.at:st.now);
  var h="";
  // 1) 지금 상황 (사건 기반 위험도와 패턴 신뢰도 중 높은 쪽)
  var pats=st.patterns||[];var patLvl=pats.some(function(p){return p.confidence==="high"})?3:pats.some(function(p){return p.confidence==="medium"})?2:1;
  var lvl=Math.max(th.level,patLvl);var label=lvl===th.level?th.label:(lvl===3?"경계":"주의");
  h+='<div class="threat bg'+lvl+'"><div class="k">지금 한반도 상황</div><div class="v">'+esc(label)+'</div><div class="s">'+esc(lvl>th.level?"징후 조합이 감지됨 — 아래 패턴 확인":th.summary)+'</div>';
  if(th.lastProvocation)h+='<div class="m">마지막 북한 도발 · <b>'+ago(th.lastProvocation.at)+'</b> · '+esc(th.lastProvocation.headline)+'</div>';
  h+='<div class="scale">';for(var i=1;i<=5;i++)h+='<i class="'+(i<=lvl?"on":"")+'"></i>';h+='</div></div>';
  // 1a) 전쟁 위험 — 다섯 영역 → 국면 5단계 → 30일 확률 (자동, 5분마다)
  if(st.warRisk)h+=safe(warRisk,st.warRisk,"전쟁 위험");
  if(st.tension)h+=safe(tension,st.tension,"긴장 온도계");
  if(st.fingerprints)h+=safe(fingerprints,st.fingerprints,"전쟁 직전 지문");
  // 1b) 클로드 심층 분석 — 특이한 날에만 (72시간 안 보고서)
  if(st.deepReport&&st.deepReport.data)h+=safe(deep,st.deepReport,"클로드 심층 분석");
  // 2) 클로드 분석관 판단 — 맨 위. 아래는 전부 세부사항이다
  if(st.assessment&&st.assessment.data){var stale=Date.now()-st.assessment.at>14*3600000;
    h+='<div class="sec">클로드 분석관 판단 · '+ago(st.assessment.at)+(stale?' <span style="color:var(--l3)">(오래됨)</span>':'')+' · 다음 분석 08:09 / 20:09</div><div class="card as">'+assessment(st.assessment.data)+'</div>'}
  else if(st.notes&&st.notes.length){var n=st.notes[0];h+='<div class="sec">클로드 분석관 판단 · '+ago(n.at)+'</div><div class="card note">'+esc(n.text)+'</div>'}
  // 2a) 지금 상황 해설 (규칙 기반, 5분마다 갱신)
  var it=st.interpretation;
  if(it){var ICON={warning:"⚠️",reassuring:"✅",caveat:"🔍",gap:"⬜"};var KIND={warning:"위험 쪽 힌트",reassuring:"안심 쪽 힌트",caveat:"해석 주의",gap:"사각지대"};
    h+='<div class="sec">지금 상황 해설 <span style="font-weight:400">· 자동(규칙 기반) · 5분마다 갱신</span></div><div class="card ex"><div class="hd">'+esc(it.headline)+'</div>'+it.narrative.map(function(p){return '<p>'+esc(p)+'</p>'}).join("");
    if(it.hints.length){h+='<details open><summary>힌트 '+it.hints.length+'개 — 근거와 반대 해석</summary>'+it.hints.map(function(x){return '<div class="hint '+x.kind+'"><div class="ht">'+ICON[x.kind]+' '+esc(x.title)+' <span class="chip" style="font-size:11px;padding:1px 7px">'+KIND[x.kind]+'</span></div><div class="hr">'+esc(x.reasoning)+'</div>'+(x.counter?'<div class="hc">↔ 반대 해석: '+esc(x.counter)+'</div>':'')+(x.check?'<div class="hc">🔎 확인: '+esc(x.check)+'</div>':'')+'</div>'}).join("")+'</details>'}
    if(it.context&&it.context.length)h+='<div class="ctx">맥락: '+esc(it.context.join(" · "))+'</div>';
    h+='</div>'}
  // 2b) 패턴
  if(pats.length){h+='<div class="sec" id="patterns">감지된 징후 조합 · '+ago(st.patternsAt)+'</div>';
    h+=pats.map(function(p){return '<div class="card pat '+p.confidence+'"><div class="pn">'+esc(p.name)+' <span class="chip">'+CONF[p.confidence]+' · '+p.score+'점</span></div><div class="ps">'+esc(p.summary)+'</div>'+
      '<details><summary>다른 설명 가능성 · 확인 방법</summary><ul>'+p.alternatives.map(function(a){return '<li>'+esc(a)+'</li>'}).join("")+'</ul><ul style="margin-top:6px">'+p.checks.map(function(c){return '<li>🔎 '+esc(c)+'</li>'}).join("")+'</ul></details></div>'}).join("")}
  // 3) 가장 최근 속보
  if(top){var b=top.brief;
    h+='<div class="sec">가장 최근 주요 소식</div><div class="card" id="'+esc(top.id)+'">';
    h+='<div><span class="ago '+fresh(b.at)+'"><span class="dot"></span>'+ago(b.at)+'</span><span class="abs">'+kst(b.at)+' KST</span></div>';
    h+='<div class="chips"><span class="chip d'+b.danger.level+'">위험도 '+esc(b.danger.label)+'</span><span class="chip">'+esc(b.danger.reason)+'</span><span class="chip">'+esc(basisText(top))+'</span></div>';
    h+='<div class="hl">'+esc(b.headline)+'</div>';
    h+='<div class="facts">'+fact("🚀 종류",b.weapon)+fact("🔢 발수",b.count)+fact("📍 발사 지점",b.launchArea&&b.launchArea.name)+fact("🎯 낙하·방향",b.impactArea&&(b.impactArea.name+(b.impactArea.note?" ("+b.impactArea.note+")":"")))+(b.distanceKm?fact("↔ 비행거리","약 "+b.distanceKm+" km"):"")+(b.apogeeKm?fact("⤴ 최고고도","약 "+b.apogeeKm+" km"):"")+'</div>';
    if(b.launchArea||b.impactArea)h+='<div id="map"></div><div class="legend">● 발사 지점 → ◎ 낙하·방향 (보도된 지명 기준 대략 위치)</div>';
    if(b.latest&&b.latest.at>b.at+60000)h+='<div class="latest">최신 보도 <b>'+ago(b.latest.at)+'</b> · '+(b.latest.url?'<a href="'+esc(b.latest.url)+'" target="_blank" rel="noopener">'+esc(b.latest.title)+'</a>':esc(b.latest.title))+'</div>';
    h+=sources(top)+'</div>';
  }
  // 4) 징후판
  h+='<div class="sec" id="board">징후판 — 숫자 (항목을 누르면 뜻풀이)</div><div class="card">'+board(st.board||[])+'</div>';
  // 6) 이전 소식
  var rest=evs.filter(function(e){return e!==top&&Date.now()-e.brief.at<30*86400000});
  var main=rest.filter(function(e){return e.brief.isProvocation||e.brief.danger.level>=2});
  var ref=rest.filter(function(e){return !(e.brief.isProvocation||e.brief.danger.level>=2)});
  if(main.length){h+='<div class="sec">이전 주요 소식 (최근 30일)</div><div class="card">'+main.slice(0,8).map(row).join("")+'</div>'}
  if(ref.length)h+='<details class="card"><summary>참고 기사 '+ref.length+'건 (논평·분석, 알림 대상 아님)</summary>'+ref.slice(0,30).map(row).join("")+'</details>';
  // 7) 시스템
  h+=safe(usagePanel,st.usage,"Claude 사용량");
  h+='<details class="card"><summary>시스템 상태 · 데이터 출처</summary>'+health(st)+'</details>';
  var lastFail=(st.alerts||[]).find(function(a){return !a.ok});var lastOk=(st.alerts||[]).find(function(a){return a.ok});
  var pushWarn=lastFail&&(!lastOk||lastFail.sentAt>lastOk.sentAt)?'<p style="font-size:13px;color:var(--l4)">⚠ 최근 알림 발송 실패 '+ago(lastFail.sentAt)+': '+esc(lastFail.error||"원인 미기록")+'<br>ntfy.sh 는 발신 IP 단위 제한이 있어 서버에서 가끔 막힙니다. 재시도를 넣었지만 확실히 하려면 Bark 앱(무료·계정 불필요) 키를 추가하세요 (docs/DEPLOY.md).</p>':"";
  h+='<details class="card"'+(pushWarn?' open':'')+'><summary>알림 설정'+(pushWarn?' ⚠':'')+'</summary>'+pushWarn+(st.setup?'<p style="font-size:13px;color:var(--mute)">설정된 채널: '+esc((st.setup.pushChannels||[]).join(", ")||"없음")+'</p><p style="font-size:14px">ntfy 앱 구독 주소</p><button class="btn" onclick="copy(\''+esc(st.setup.ntfySubscribeUrl)+'\')">토픽 주소 복사</button><button class="btn" onclick="testPush()">테스트 푸시</button>':"")+'</details>';
  h+='<div class="foot">공개 정보만 사용합니다. 위험도와 패턴은 관측 사실의 요약·추론이며 전쟁 예측이 아닙니다. 대피 등 행동은 정부 재난문자·국민재난안전포털 안내를 따르세요.</div>';
  $("#app").innerHTML=h;
  if(top)drawMap(top.brief);
  try{drawTension(st.tension)}catch(e){}
}
function fact(k,v){return '<div class="fact'+(v?"":" na")+'"><div class="fk">'+k+'</div><div class="fv">'+(v?esc(v):"보도 없음")+'</div></div>'}
function sgn(x){return (x>0?"+":"")+Math.round(x)+"%"}
function fmtVal(r){var v=r.reading.value,m=r.reading.meta||{};if(r.id==="sea.gfw_cn_change_pct")return sgn(v);if(r.id==="elite.foreign_net_kospi"&&m.net5dEok!=null)return "5일 "+(m.net5dEok>=0?"+":"−")+(Math.abs(m.net5dEok)/10000).toFixed(1)+"조";if(r.id.indexOf("psych.")===0||r.id==="market.pm_war_prob")return "평소의 "+(v>=1000?Math.round(v/100):(v/100).toFixed(1))+"배";if(r.unit==="%")return v.toFixed(2)+"%";return (Number.isInteger(v)?v:v.toFixed(1))+(r.unit||"")}
function spark(hist){if(!hist||hist.length<2)return "";var vs=hist.map(function(p){return p.avg});var mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs);var W=100,H=26;
  var pts=hist.map(function(p,i){var x=i/(hist.length-1)*W;var y=mx===mn?H/2:H-2-((p.avg-mn)/(mx-mn))*(H-4);return x.toFixed(1)+","+y.toFixed(1)}).join(" ");
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.5" points="'+pts+'"/></svg>'}
function board(rows){var groups={};rows.forEach(function(r){(groups[r.groupLabel]=groups[r.groupLabel]||[]).push(r)});
  var order=["정부 공식","엘리트·큰손","접경 사건","시장","사람들의 관심","항공","항행경보","북한 수사","언론 템포","해상","지진","GPS 교란","위성 열점","SNS","인터넷"];
  var abn=rows.filter(function(r){return r.reading&&(r.reading.state==="anomalous"||r.reading.state==="elevated")&&r.stateLabel!=="측정 불가"});
  var h="";
  if(abn.length)h+='<div class="grp" style="color:var(--l3)">⚠ 평소와 다른 징후 '+abn.length+'개</div><div class="board">'+abn.map(ind).join("")+'</div>';
  else h+='<div class="grp" style="color:var(--l1)">✓ 측정 가능한 징후가 모두 평소 범위 안</div>';
  order.forEach(function(g){if(!groups[g])return;h+='<div class="grp">'+g+'</div><div class="board">'+groups[g].map(ind).join("")+'</div>'});
  var learning=rows.filter(function(r){return r.reading&&r.reading.state==="learning"}).length;
  h+='<p style="font-size:12px;color:var(--mute);margin:12px 0 0">● 정상 · ● 상승 · ● 이상 · ○ 학습 중/측정 불가. 기준선은 같은 시간대의 최근 며칠 평균입니다'+(learning?' (아직 학습 중인 징후 '+learning+'개 — 하루쯤 지나면 안정됩니다)':'')+'. 항목을 누르면 왜 중요한지 설명이 나옵니다.</p>';
  return h}
function ind(r){var rd=r.reading,unavail=!rd||r.stateLabel==="측정 불가";var stc=unavail?"unavailable":rd.state;
  var base=rd&&rd.baseline!=null&&!unavail&&rd.state!=="learning"?"평소 "+(r.unit==="%"?rd.baseline.toFixed(2)+"%":(Math.round(rd.baseline)+(r.unit||"")))+(rd.z!=null?" · z "+rd.z.toFixed(1):""):(unavail?"측정 불가":"기준선 학습 중 "+(rd?rd.n:0)+"/10");
  var extra="";if(rd&&rd.meta){var m=rd.meta;if(m.aircraft&&m.aircraft.length)extra=m.aircraft.slice(0,3).map(function(a){return a.what.split("(")[0]}).join(", ");else if(m.titles&&m.titles.length)extra=m.titles[0];else if(m.note)extra=m.note;else if(m.signedPct!=null)extra=(m.signedPct>0?"+":"")+m.signedPct+"% · "+m.price+"원"}
  if(rd&&rd.meta&&rd.meta.cnChangePct!=null)base="중국 "+sgn(rd.meta.cnChangePct)+(rd.meta.otherChangePct!=null?" · 다른 배 "+sgn(rd.meta.otherChangePct):"")+" (직전 2주 대비)";
  var attr=rd&&rd.meta&&rd.meta.attribution&&/Global Fishing Watch/.test(rd.meta.attribution)?'<div class="ib" style="margin-top:2px"><a href="https://globalfishingwatch.org" target="_blank" rel="noopener" onclick="event.stopPropagation()">Powered by Global Fishing Watch</a></div>':"";
  var meaning=ST&&ST.interpretation&&ST.interpretation.perIndicator?ST.interpretation.perIndicator[r.id]:"";
  var narrow=r.coverage&&rd&&!unavail&&rd.value===0?'<span class="chip" style="font-size:11px;padding:1px 7px;background:var(--l2);color:#fff;vertical-align:2px">범위 제한</span>':'';
  return '<div class="ind" onclick="this.classList.toggle(\'open\')"><span class="st '+stc+'"></span><div class="il">'+esc(r.label)+'</div><div class="iv">'+(unavail?"—":fmtVal(r))+' '+narrow+'</div><div class="ib">'+esc(base)+'</div>'+spark(r.history)+(extra?'<div class="ib" style="margin-top:2px">'+esc(extra).slice(0,70)+'</div>':"")+attr+'<div class="why">'+(meaning?'<b>뜻:</b> '+esc(meaning)+'<br>':'')+'<b>왜 보나:</b> '+esc(r.why)+'<br><b>지연:</b> '+esc(r.latency)+'<br><b>주의:</b> '+esc(r.caveats)+(r.coverage?'<br><b>범위 제한:</b> '+esc(r.coverage):'')+(rd?'<br><b>관측:</b> '+kst(rd.at):'')+'</div></div>'}
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
function row(e){var b=e.brief;return '<div class="row" onclick="this.querySelector(\'.more\').hidden=!this.querySelector(\'.more\').hidden"><div class="t '+fresh(b.at)+'">'+ago(b.at)+'</div><div class="b"><div class="h"><span class="lv lv'+b.danger.level+'"></span>'+esc(b.headline)+'</div><div class="x">'+kst(b.at)+' · 위험도 '+esc(b.danger.label)+' · '+esc(basisText(e))+'</div><div class="more" hidden>'+sources(e,true)+'</div></div></div>'}
function sources(e,open){var s=e.signals.slice().sort(function(a,b){return (b.publishedTime||b.detectedTime)-(a.publishedTime||a.detectedTime)});
  var inner=s.map(function(x){return '<div class="src"><small>'+ago(x.publishedTime||x.detectedTime)+' · '+esc(x.summary||x.source)+'</small><br>'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.title)+'</a>':esc(x.title))+'</div>'}).join("");
  return open?inner:'<details><summary>근거 기사·데이터 '+s.length+'건 보기</summary>'+inner+'</details>'}
function storage(st){var u=st.storage;if(!u)return "";var m=function(n){return n>=10000?Math.round(n/10000)+"만":String(n)};
  var pr=Math.round(u.read/u.limitRead*100),pw=Math.round(u.written/u.limitWritten*100);
  return '<p style="font-size:13px">서버 저장소 오늘 사용 (무료 한도, 오전 9시 초기화): 읽기 '+m(u.read)+'/500만 행 ('+pr+'%) · 쓰기 '+m(u.written)+'/10만 행 ('+pw+'%)'+(Math.max(pr,pw)>=70?' <b class="bad">한도 주의</b>':'')+'</p>'}
function health(st){return storage(st)+'<p style="font-size:13px">마지막 수집 '+(st.lastCycle?ago(st.lastCycle.at):"없음")+' <button class="btn" id="runbtn" onclick="runNow()">지금 수집</button></p><table>'+st.sources.map(function(s){var h=st.health.find(function(x){return x.source===s.id});
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
var rsz=0;window.addEventListener("resize",function(){clearTimeout(rsz);rsz=setTimeout(function(){if(ST)try{drawTension(ST.tension)}catch(e){}},200)});
document.addEventListener("visibilitychange",function(){if(!document.hidden&&!window.__KEW_STATE__&&Date.now()-LAST>120000)load()});
</script></body></html>`;
