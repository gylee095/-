// 모바일 우선 대시보드. "지금 얼마나 위험한가 → 가장 최근 속보(몇 분 전) → 무엇을 몇 발, 어디서 어디로" 순서로 보여준다.
// 데이터는 /api/state 에서 토큰으로 조회. 지도는 Leaflet + CARTO 타일.
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
:root{--bg:#f3f4f6;--card:#fff;--fg:#111418;--mute:#5f6773;--line:#e2e5e9;--chip:#eef0f3;
--l1:#2e7d32;--l2:#b58105;--l3:#e0650b;--l4:#d32f2f;--l5:#8e0000;--fresh:#d32f2f;--warm:#e0650b;--old:#8a929c;--link:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--fg:#eceef1;--mute:#9aa3ae;--line:#2a2f37;--chip:#232830;
--l1:#4caf50;--l2:#f2b632;--l3:#ff8a3d;--l4:#ff5252;--l5:#ff1744;--fresh:#ff5252;--warm:#ff8a3d;--old:#8a929c;--link:#7fb0ff}}
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
.latest a,.src a{color:var(--link);text-decoration:none}
details summary{cursor:pointer;color:var(--link);font-size:14px;margin-top:10px;list-style:none}details summary::-webkit-details-marker{display:none}
.src{font-size:14px;padding:8px 0;border-top:1px dashed var(--line)}.src small{color:var(--mute)}
.row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);cursor:pointer}.row:first-child{border-top:0}
.row .t{flex:none;width:76px;font-size:13px;font-weight:700}.row .t.f{color:var(--fresh)}.row .t.w{color:var(--warm)}.row .t.o{color:var(--old)}
.row .b{flex:1;min-width:0}.row .h{font-weight:600;font-size:15px}.row .x{font-size:12px;color:var(--mute);margin-top:2px}
.lv{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}.lv1{background:var(--l1)}.lv2{background:var(--l2)}.lv3{background:var(--l3)}.lv4{background:var(--l4)}.lv5{background:var(--l5)}
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
var ST=null, map=null, showAll=false;
function ago(ms){var d=Math.max(0,Date.now()-ms),m=Math.floor(d/60000);if(m<1)return "방금";if(m<60)return m+"분 전";var h=Math.floor(m/60);if(h<3)return h+"시간 "+(m%60)+"분 전";if(h<24)return h+"시간 전";var dd=Math.floor(h/24);return dd<2?dd+"일 "+(h%24)+"시간 전":dd+"일 전"}
function fresh(ms){var h=(Date.now()-ms)/3600000;return h<1?"f":h<24?"w":"o"}
function kst(ms){if(!ms)return "—";var d=new Date(ms+9*3600000);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")}
function tok(){try{var q=new URLSearchParams(location.search).get("key");if(q){localStorage.setItem("kew_token",q);history.replaceState(null,"",location.pathname+location.hash)}return localStorage.getItem("kew_token")}catch(e){return null}}
function saveTok(){try{localStorage.setItem("kew_token",$("#tok").value)}catch(e){}load()}
var STATUS={CONFIRMED:"정부 공식확인",CORROBORATED:"복수 출처 교차확인",UNVERIFIED:"단일 출처"};
function basisText(e){if(e.basis==="official_quote")return e.status==="CORROBORATED"?"언론 "+e.sources.length+"곳이 공식발표 인용":"속보 1곳 (교차확인 전)";if(e.basis==="media")return "언론 보도만";return STATUS[e.status]}
async function load(){
  var st=window.__KEW_STATE__;
  if(!st){var t=tok();if(!t){$("#login").style.display="block";return}
    try{var r=await fetch("/api/state?hours=168",{headers:{authorization:"Bearer "+t}});if(r.status===401){$("#login").style.display="block";return}st=await r.json()}catch(e){return}}
  $("#login").style.display="none";ST=st;render()}
function pickTop(evs){var p=evs.filter(function(e){return e.brief.isProvocation||e.brief.danger.level>=2});return p[0]||null}
function render(){
  var st=ST,th=st.threat,evs=st.events,top=pickTop(evs);
  $("#upd").textContent="업데이트 "+ago(st.lastCycle?st.lastCycle.at:st.now);
  var h="";
  // 1) 지금 상황
  var lvl=th.level;h+='<div class="threat bg'+lvl+'"><div class="k">지금 한반도 상황</div><div class="v">'+esc(th.label)+'</div><div class="s">'+esc(th.summary)+'</div>';
  if(th.lastProvocation)h+='<div class="m">마지막 북한 도발 · <b>'+ago(th.lastProvocation.at)+'</b> · '+esc(th.lastProvocation.headline)+'</div>';
  h+='<div class="scale">';for(var i=1;i<=5;i++)h+='<i class="'+(i<=lvl?"on":"")+'"></i>';h+='</div></div>';
  // 2) 가장 최근 속보
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
  // 3) 다른 소식 (최근순)
  var rest=evs.filter(function(e){return e!==top&&Date.now()-e.brief.at<30*86400000});
  var main=rest.filter(function(e){return e.brief.isProvocation||e.brief.danger.level>=2});
  var ref=rest.filter(function(e){return !(e.brief.isProvocation||e.brief.danger.level>=2)});
  if(main.length){h+='<div class="sec">이전 주요 소식 (최근 30일)</div><div class="card">'+main.slice(0,showAll?50:6).map(row).join("")+'</div>'}
  if(ref.length)h+='<details class="card"><summary>참고 기사 '+ref.length+'건 (논평·분석, 알림 대상 아님)</summary>'+ref.slice(0,30).map(row).join("")+'</details>';
  // 4) 클로드 분석
  if(st.notes&&st.notes.length){var n=st.notes[0];h+='<div class="sec">클로드 분석 · '+ago(n.at)+'</div><div class="card note">'+esc(n.text)+'</div>'}
  // 5) 시스템
  h+='<details class="card"><summary>시스템 상태 · 데이터 출처</summary>'+health(st)+'</details>';
  h+='<details class="card"><summary>알림 설정</summary>'+(st.setup?'<p style="font-size:14px">ntfy 앱 구독 주소</p><button class="btn" onclick="copy(\''+esc(st.setup.ntfySubscribeUrl)+'\')">토픽 주소 복사</button><button class="btn" onclick="testPush()">테스트 푸시</button>':"")+'</details>';
  h+='<div class="foot">공개 정보만 사용합니다. 위험도는 보도·관측 사실의 요약이며 전쟁 예측이 아닙니다. 대피 등 행동은 정부 재난문자·국민재난안전포털 안내를 따르세요.</div>';
  $("#app").innerHTML=h;
  if(top)drawMap(top.brief);
}
function fact(k,v){return '<div class="fact'+(v?"":" na")+'"><div class="fk">'+k+'</div><div class="fv">'+(v?esc(v):"보도 없음")+'</div></div>'}
function row(e){var b=e.brief;return '<div class="row" onclick="this.querySelector(\'.more\').hidden=!this.querySelector(\'.more\').hidden"><div class="t '+fresh(b.at)+'">'+ago(b.at)+'</div><div class="b"><div class="h"><span class="lv lv'+b.danger.level+'"></span>'+esc(b.headline)+'</div><div class="x">'+kst(b.at)+' · 위험도 '+esc(b.danger.label)+' · '+esc(basisText(e))+'</div><div class="more" hidden>'+sources(e,true)+'</div></div></div>'}
function sources(e,open){var s=e.signals.slice().sort(function(a,b){return (b.publishedTime||b.detectedTime)-(a.publishedTime||a.detectedTime)});
  var inner=s.map(function(x){return '<div class="src"><small>'+ago(x.publishedTime||x.detectedTime)+' · '+esc(x.summary||x.source)+'</small><br>'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.title)+'</a>':esc(x.title))+'</div>'}).join("");
  return open?inner:'<details><summary>근거 기사·데이터 '+s.length+'건 보기</summary>'+inner+'</details>'}
function health(st){return '<p style="font-size:13px">마지막 수집 '+(st.lastCycle?ago(st.lastCycle.at):"없음")+' <button class="btn" id="runbtn" onclick="runNow()">지금 수집</button></p><table>'+st.sources.map(function(s){var h=st.health.find(function(x){return x.source===s.id});
  var stt=!h?'<span>대기</span>':h.skipped?'<span>꺼짐</span>':h.ok?'<span class="ok">정상</span>':'<span class="bad">오류</span>';
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
load();setInterval(function(){if(!window.__KEW_STATE__)load()},60000);
</script></body></html>`;
