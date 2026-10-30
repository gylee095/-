// 모바일 우선 대시보드 (단일 HTML, 외부 의존성 없음). 데이터는 /api/state 에서 토큰으로 조회.
export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0f1115">
<title>Korea Early Warning</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#14171c;--mute:#5d6673;--line:#e3e6ea;--red:#c62828;--amber:#b26a00;--blue:#1f5fbf;--green:#2e7d32;--gray:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--fg:#e8eaed;--mute:#9aa3ae;--line:#272b33;--red:#ef5350;--amber:#ffb74d;--blue:#64a0ff;--green:#66bb6a;--gray:#9aa3ae}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;padding:env(safe-area-inset-top) 16px 40px}
header{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 6px}h1{font-size:18px;margin:0}small,.mute{color:var(--mute)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.posture{border-left:6px solid var(--gray)}.posture b{font-size:20px}.lv3,.lv4{border-left-color:var(--amber)}.lv5{border-left-color:var(--red)}.lv2{border-left-color:var(--blue)}
.badge{display:inline-block;font-size:12px;font-weight:600;border-radius:6px;padding:1px 7px;margin-right:6px;color:#fff}
.CONFIRMED{background:var(--red)}.CORROBORATED{background:var(--amber)}.UNVERIFIED{background:var(--gray)}.drill{background:var(--blue)}.retracted{background:var(--green)}
.ev h3{font-size:15px;margin:6px 0}.times{display:grid;grid-template-columns:auto 1fr;gap:0 10px;font-size:13px;margin:6px 0}.times span:nth-child(odd){color:var(--mute)}
details{margin-top:6px}summary{cursor:pointer;color:var(--blue);font-size:13px}.sig{font-size:13px;border-top:1px dashed var(--line);padding:6px 0}.sig a{color:var(--blue);word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:5px 4px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.ok{color:var(--green)}.bad{color:var(--red)}h2{font-size:15px;margin:22px 0 4px}nav{display:flex;gap:8px;overflow-x:auto;padding:4px 0}
nav button{flex:none;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:16px;padding:4px 12px;font-size:13px}nav button.on{background:var(--fg);color:var(--bg)}
.btn{display:inline-block;border:1px solid var(--line);background:var(--card);color:var(--blue);border-radius:8px;padding:6px 10px;font-size:13px;text-decoration:none;margin:2px 4px 2px 0}
#login{display:none}#login input{width:100%;padding:10px;font-size:16px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
</style></head><body>
<header><h1>🇰🇷 Korea Early Warning</h1><small id="upd"></small></header>
<div id="login" class="card"><p>KEW_SECRET 값을 입력하세요.</p><input id="tok" type="password" autocomplete="current-password"><p><button onclick="saveTok()">확인</button></p></div>
<div id="app"></div>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kst=ms=>ms?new Date(ms+9*36e5).toISOString().slice(5,19).replace("T"," ")+" KST":"—";
const LABEL={CONFIRMED:"공식확인",CORROBORATED:"교차확인",UNVERIFIED:"미확인"};
let filter="important";
function tok(){try{const q=new URLSearchParams(location.search).get("key");if(q){localStorage.setItem("kew_token",q);history.replaceState(null,"",location.pathname+location.hash)}return localStorage.getItem("kew_token")}catch{return null}}
async function runNow(){const b=$("#runbtn");b.disabled=true;b.textContent="수집 중…";
  try{const r=await fetch("/api/run",{method:"POST",headers:{authorization:"Bearer "+tok()}});const j=await r.json().catch(()=>({error:"HTTP "+r.status}));
  if(j.error)alert("오류: "+j.error)}catch(e){alert("오류: "+e)}load()}
function copy(t){navigator.clipboard.writeText(t).then(()=>alert("복사됨"),()=>prompt("복사하세요",t))}
async function testPush(){const r=await fetch("/api/test-push",{method:"POST",headers:{authorization:"Bearer "+tok()}});const j=await r.json();alert(JSON.stringify(j))}
function saveTok(){try{localStorage.setItem("kew_token",$("#tok").value)}catch{}load()}
async function load(){
  let st=window.__KEW_STATE__;
  if(!st){const t=tok();if(!t){$("#login").style.display="block";return}
    const r=await fetch("/api/state",{headers:{authorization:"Bearer "+t}});
    if(r.status===401){$("#login").style.display="block";return}st=await r.json()}
  $("#login").style.display="none";render(st)}
function render(st){
  const p=st.posture;$("#upd").textContent="갱신 "+kst(st.now);
  let evs=st.events;if(filter==="important")evs=evs.filter(e=>e.severity>=50&&!e.drill);if(filter==="confirmed")evs=evs.filter(e=>e.status==="CONFIRMED");
  const m=st.metrics;
  $("#app").innerHTML=\`
  <div class="card posture lv\${p.level}"><small>종합 관측 수준</small><br><b>\${p.level}단계 · \${esc(p.label)}</b><p class="mute" style="margin:4px 0 0;font-size:13px">\${esc(p.detail)}</p></div>
  <nav>\${[["important","중요"],["confirmed","공식확인"],["all","전체"]].map(([k,v])=>\`<button class="\${filter===k?"on":""}" onclick="filter='\${k}';load()">\${v}</button>\`).join("")}</nav>
  \${evs.length?evs.map(ev).join(""):'<div class="card mute">표시할 사건이 없습니다.</div>'}
  \${st.notes?.length?\`<h2>에이전트 분석 노트</h2>\${st.notes.slice(0,5).map(n=>\`<div class="card"><small>\${kst(n.at)} · \${esc(n.author)}</small><div style="white-space:pre-wrap">\${esc(n.text)}</div></div>\`).join("")}\`:""}
  <h2>뉴스 대비 성능</h2><div class="card" style="font-size:13px">알림 사건 \${m.alertedEvents}건 · 언론 비교 가능 \${m.withMediaComparison}건 · 언론보다 빠름 \${m.beatMediaCount}건 · 중앙 리드타임 \${m.medianLeadMin==null?"—":m.medianLeadMin.toFixed(1)+"분"}</div>
  <h2>소스 상태</h2><div class="card" style="font-size:13px">마지막 수집: \${st.lastCycle?kst(st.lastCycle.at)+" ("+(st.lastCycle.trigger==="manual"?"수동":"자동")+")":"아직 없음"}
    \${st.lastCycle?.error?'<br><span class="bad">수집 오류: '+esc(st.lastCycle.error)+'</span>':""}
    <br><button class="btn" id="runbtn" onclick="runNow()">지금 수집</button></div><div class="card"><table><tr><th>소스</th><th>상태</th><th>지연</th></tr>\${st.sources.map(s=>{const h=st.health.find(x=>x.source===s.id);
    const stt=!h?'<span class="mute">미실행</span>':h.skipped?'<span class="mute">'+esc(h.skipped)+'</span>':h.ok?'<span class="ok">정상</span> '+h.signalCount+'/'+h.rawCount:'<span class="bad">오류</span> <small>'+esc((h.error||"").slice(0,60))+'</small>';
    return \`<tr><td>\${esc(s.name)}<br><small>\${s.kind}</small></td><td>\${stt}<br><small>\${h?kst(h.fetchedAt):""}</small></td><td><small>\${esc(s.latency)}</small></td></tr>\`}).join("")}</table></div>
  \${st.setup?\`<h2>연결 설정</h2><div class="card" style="font-size:13px">
    <p style="margin:0 0 8px">① 아이폰 푸시: ntfy 앱 설치 후 아래 버튼으로 구독</p>
    <p><a class="btn" href="\${esc(st.setup.ntfySubscribeUrl)}" target="_blank" rel="noopener">ntfy 토픽 열기</a> <button class="btn" onclick="copy('\${esc(st.setup.ntfySubscribeUrl)}')">토픽 주소 복사</button> <button class="btn" onclick="testPush()">테스트 푸시</button></p>
    <p style="margin:12px 0 8px">② Claude 커넥터: claude.ai → 설정 → 커넥터 → 사용자 지정 커넥터 추가에 붙여넣기</p>
    <p><button class="btn" onclick="copy('\${esc(st.setup.connectorUrl)}')">커넥터 URL 복사</button></p></div>\`:""}
  <p class="mute" style="font-size:12px">공개 정보만 사용합니다. 군 레이더·비공개 정보에 접근하지 않습니다. 단일 이상징후는 전쟁 임박을 의미하지 않으며, 대피 등 행동은 반드시 정부 공식 안내(재난문자·국민재난안전포털)를 따르세요.</p>\`;
  if(location.hash){const el=document.getElementById(location.hash.slice(1));if(el){el.scrollIntoView();el.querySelector("details")?.setAttribute("open","")}}}
function ev(e){
  const badges=\`<span class="badge \${e.status}">\${LABEL[e.status]}</span>\${e.drill?'<span class="badge drill">훈련</span>':""}\${e.retracted?'<span class="badge retracted">정정/해제</span>':""}\`;
  return \`<div class="card ev" id="\${esc(e.id)}">\${badges}<small>심각도 \${e.severity} · \${esc(e.categories.join(", "))}</small>
  <h3>\${esc(e.title)}</h3>
  <div class="times"><span>사건 발생</span><span>\${kst(e.eventTime)}</span><span>원천 공개</span><span>\${e.firstPublishedTime?kst(e.firstPublishedTime):"원천 미제공"}</span>
  <span>시스템 감지</span><span>\${kst(e.firstDetectedTime)}</span><span>알림 발송</span><span>\${kst(e.alertedTime)}</span><span>첫 언론 보도</span><span>\${kst(e.firstMediaTime)}</span></div>
  <details><summary>출처 \${e.signals.length}건 (\${esc(e.sources.join(", "))})</summary>\${e.signals.map(s=>\`<div class="sig"><b>[\${esc(s.sourceKind)}] \${esc(s.source)}</b> \${esc(s.title)}<br><small>\${esc(s.summary)}</small>\${s.url?\`<br><a href="\${esc(s.url)}" target="_blank" rel="noopener">\${esc(s.url)}</a>\`:""}</div>\`).join("")}</details></div>\`}
load();setInterval(()=>{if(!window.__KEW_STATE__)load()},60000);
</script></body></html>`;
