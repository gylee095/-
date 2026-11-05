// 고객 알림함 /me (2026-11-05). 결제한 사람만: 활성화 코드로 들어와 ① 이 폰에서 알림 켜기 ② 받은 리포트를 날짜별로 보기.
// 사용자 경험 원칙: 결제한 사람이 "다음에 뭘 하지?"에서 멈추지 않게 지금 상황(기기·브라우저·권한)에 맞는 한 가지 할 일만 크게 보여 준다.
//  - 안드로이드 크롬: '알림 켜기' 한 번.
//  - 아이폰 사파리: 홈 화면에 추가해야 알림을 받는다(애플 규칙). 코드는 주소창·매니페스트 시작 주소에 실어 설치된 앱으로 자동으로 넘긴다.
//  - 카카오톡·인스타그램 등 앱 안 브라우저: 웹 푸시가 안 된다 → 바깥 브라우저로 열기(안드로이드 카카오톡은 바로 넘긴다).
//  - 알림 거절: 설정에서 다시 켜는 법.
// 주의: 클라이언트 코드는 String.raw 안이라 템플릿 리터럴(백틱·${})을 쓰지 않는다.
import { INSTALL_JS, ORDERS_JS, REFUND_CONSENT, SHELL_HEAD } from "./buy.js";

export function mePage(): string {
  return String.raw`${SHELL_HEAD}<title>내 알림함 — 한반도 조기경보</title>
<meta name="robots" content="noindex">
<script src="https://lite.payapp.kr/public/api/v2/payapp-lite.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
.state{border-radius:14px;padding:16px;margin:12px 0;background:var(--card);border:1px solid var(--line)}
.state.main{border:2px solid var(--brand)}
.state h2{margin:0 0 6px;font-size:19px}
.big{font-size:15px;line-height:1.6}
ol.g{padding-left:22px;margin:8px 0}ol.g li{margin:10px 0}
.share{display:inline-block;vertical-align:-4px;width:20px;height:20px}
.item{display:block;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:8px 0;color:var(--fg);font:inherit;cursor:pointer}
.item .when{font-size:13px;color:var(--mute)}.item .hl{font-weight:700;margin-top:2px}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;color:#fff;margin-right:6px;vertical-align:1px}
.rep{border-top:1px solid var(--line);margin-top:10px;padding-top:10px}
.rep h3{font-size:15px;margin:14px 0 4px}.rep ul{margin:4px 0}.rep .odds{font-size:15px;font-weight:600}
.ph{font-size:28px;font-weight:800;margin:4px 0}
.okline{color:var(--ok);font-weight:700}
input.code-in{width:100%;padding:14px;font-size:18px;letter-spacing:1px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);margin:8px 0;text-transform:uppercase}
</style></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b> · 내 알림함<span id="ops"></span></div>
<div id="app"><div class="state">불러오는 중…</div></div>
<div class="foot">알림과 리포트는 공개 정보를 자동으로 분석한 참고 정보이며 공식 안보 정보가 아닙니다. 대피 등 실제 행동은 정부 재난문자와 국민재난안전포털을 따르세요. <a href="/terms">이용약관·환불</a></div>
</div>
<script>
var $=function(s){return document.querySelector(s)};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
var COLORS=["#888","#2e7d32","#b58105","#e65100","#c62828","#7b1fa2"];
var CODE_RE=/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
function normCode(c){c=String(c||"").toUpperCase().replace(/[^A-Z2-9]/g,"");return c.length===12?c.slice(0,4)+"-"+c.slice(4,8)+"-"+c.slice(8):""}
function kst(ms){var d=new Date(ms+9*3600000);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")}
function ago(ms){var m=Math.round((Date.now()-ms)/60000);if(m<1)return "방금";if(m<60)return m+"분 전";var h=Math.round(m/60);if(h<24)return h+"시간 전";var d=Math.round(h/24);return d+"일 전"}
function env(){var ua=navigator.userAgent;var ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  var android=/Android/.test(ua);var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  var inapp=/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|BAND\//i.test(ua);
  var ok="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
  return {ios:ios,android:android,standalone:standalone,inapp:inapp,ok:ok,kakao:/KAKAOTALK/i.test(ua)}}
var ENV=env();
// 코드: 주소(?code=) → 이 기기 저장. 아이폰 사파리에선 주소에 남겨 둔다('홈 화면에 추가'가 지금 주소로 앱을 만든다)
function code(){try{var q=normCode(new URLSearchParams(location.search).get("code"));if(q){localStorage.setItem("kew_code",q);if(!(ENV.ios&&!ENV.standalone)){var u=new URL(location.href);u.searchParams.delete("code");history.replaceState(null,"",u.pathname+u.search+u.hash)}}
  var c=localStorage.getItem("kew_code");return CODE_RE.test(c||"")?c:null}catch(e){return null}}
function manifestWithCode(c){var l=document.querySelector('link[rel="manifest"]');if(l&&c)l.href="/manifest.webmanifest?code="+encodeURIComponent(c)}
function b64uToU8(s){var p=s.replace(/-/g,"+").replace(/_/g,"/");p+="=".repeat((4-p.length%4)%4);var b=atob(p),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
async function pushOn(){try{if(!ENV.ok)return false;var reg=await navigator.serviceWorker.getRegistration();var sub=reg&&await reg.pushManager.getSubscription();return !!sub}catch(e){return false}}
var SHARE_SVG='<svg class="share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

// 지금 상황에 맞는 '한 가지 할 일'
function stepCard(c,me,on){
  if(on)return '<div class="state"><div class="okline">✓ 이 휴대폰으로 알림이 와요</div><div class="mute">단계가 올라가거나 내려갈 때만 울립니다. 평소엔 조용해요. 기기 '+me.devicesUsed+'/'+me.devicesMax+'대 사용 중</div>'+(me.devicesUsed<me.devicesMax?'<button class="btn ghost" style="margin-top:10px" onclick="shareFamily()">가족 휴대폰에도 켜기 ('+(me.devicesMax-me.devicesUsed)+'대 남음)</button>':'')+'</div>';
  var h='<div class="state main"><h2>마지막 한 단계: 이 폰에서 알림 켜기</h2>';
  var g=kewGuide(kewEnv(),"/me?code="+encodeURIComponent(c));
  if(g){setTimeout(function(){kewDrawQr("/me?code="+encodeURIComponent(c))},0);return '<div>'+g+'<p class="mute">활성화 코드 <b>'+esc(c)+'</b> — 주소에 들어 있어 따로 넣을 필요는 없어요.</p></div>'}
  if(!ENV.ok)return h+'<p class="big">이 브라우저는 알림을 지원하지 않아요. 안드로이드는 <b>크롬</b>, 아이폰은 <b>사파리</b>에서 열어 주세요.</p></div>';
  if(Notification.permission==="denied")return h+'<p class="big">이 사이트의 알림이 <b>꺼져</b> 있어요. 휴대폰 <b>설정 → 알림</b>'+(ENV.ios?' → 조기경보':' (크롬: 주소창 왼쪽 자물쇠 → 권한 → 알림)')+'에서 켠 뒤 이 화면을 새로고침해 주세요.</p></div>';
  return h+'<p class="big">버튼을 누르고 휴대폰이 묻는 창에서 <b>허용</b>을 눌러 주세요.</p><button class="btn" id="enable" onclick="enable()">알림 켜기</button></div>'}

async function enable(){var b=$("#enable");try{b.disabled=true;b.textContent="켜는 중…";
  var perm=await Notification.requestPermission();if(perm!=="granted"){b.disabled=false;b.textContent="알림 켜기";render();return}
  var reg=await navigator.serviceWorker.register("/sw.js");await navigator.serviceWorker.ready;
  var key=(await (await fetch("/api/push/key")).json()).publicKey;
  var sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToU8(key)});
  var r=await fetch("/api/billing/activate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:CODE,subscription:sub.toJSON()})});
  var j=await r.json().catch(function(){return {}});if(!r.ok){try{await sub.unsubscribe()}catch(e){}throw new Error(j.error||("오류 "+r.status))}
  render()}catch(e){alert("알림을 켜지 못했어요: "+(e&&e.message||e));b.disabled=false;b.textContent="알림 켜기"}}
function shareFamily(){var url=location.origin+"/me?code="+encodeURIComponent(CODE);var t="한반도 조기경보 알림 — 이 링크를 열고 '알림 켜기'를 눌러 주세요";
  if(navigator.share)navigator.share({title:"한반도 조기경보",text:t,url:url}).catch(function(){});else{navigator.clipboard&&navigator.clipboard.writeText(url);alert("링크를 복사했어요. 가족에게 보내 주세요.")}}

function reportHtml(r){var h='<div class="rep"><div class="ph" style="color:'+COLORS[r.phase]+'">'+r.phase+'단계 '+esc(r.phaseLabel)+'</div><div class="odds">'+esc(r.odds)+'</div>';
  if(r.why&&r.why.length)h+='<h3>'+(r.kind==="change"?"왜 바뀌었나":"왜 이 단계인가")+'</h3><ul>'+r.why.map(function(x){return "<li>"+esc(x)+"</li>"}).join("")+'</ul>';
  if(r.domains&&r.domains.length)h+='<h3>영역별로 보면</h3><ul>'+r.domains.map(function(d){return "<li><b>"+esc(d.label)+"</b> "+esc(d.levelLabel)+" — "+esc(d.drivers.join(" · "))+"</li>"}).join("")+'</ul>';
  if(r.watch&&r.watch.length)h+='<h3>다음에 볼 것</h3><ul>'+r.watch.map(function(x){return "<li>"+esc(x)+"</li>"}).join("")+'</ul>';
  if(r.restraints&&r.restraints.length)h+='<h3>위험을 낮추는 요인</h3><ul>'+r.restraints.map(function(x){return "<li>"+esc(x)+"</li>"}).join("")+'</ul>';
  return h+'<h3>지금 할 일</h3><p style="margin:4px 0">'+esc(r.todo)+'</p></div>'}
async function openReport(id){var el=document.getElementById("r_"+id);if(!el)return;var box=el.querySelector(".body");
  if(box.innerHTML){box.innerHTML="";return}
  box.innerHTML='<div class="mute" style="margin-top:8px">불러오는 중…</div>';
  try{var r=await fetch("/api/report?code="+encodeURIComponent(CODE)+"&id="+encodeURIComponent(id),{cache:"no-store"});var j=await r.json();if(!r.ok)throw new Error(j.error);box.innerHTML=reportHtml(j)}catch(e){box.innerHTML='<div class="mute">리포트를 불러오지 못했어요.</div>'}}

// 코드가 없으면 앱 안에서 결제한다 (11/5 사용자: 사파리에서 결제하면 홈 화면 앱이 코드를 몰라 다시 넣으라 한다 — 아이폰은 둘의 저장 공간이 따로).
// 앱 안에서 주문을 만들고 결제가 끝나는 걸 앱이 스스로 알아채므로 코드를 넣을 일이 없다. 코드 입력은 다른 기기에서 결제한 사람만.
${ORDERS_JS}
${INSTALL_JS}
var PENDING=null,WATCH=null;
function noCode(msg){
  var KE=kewEnv();var g=(KE.desktop||KE.inapp)?kewGuide(KE,"/"):"";if(g){$("#app").innerHTML=(msg?'<div class="state"><p class="err">'+esc(msg)+'</p></div>':'')+g+'<div class="state"><a class="btn ghost" href="/?p=1">상품 소개 보기</a></div>';kewDrawQr("/");return}
  var h=ENV.standalone?'<div class="state" style="border:2px solid var(--ok)"><b style="font-size:17px">이미 결제하셨나요?</b><p class="mute" style="margin:6px 0 10px">결제 뒤 버튼을 누를 때 코드가 복사돼 있어요. 아래 버튼을 누르고 휴대폰이 물으면 <b>붙여넣기</b>를 누르세요.</p><button class="btn" onclick="pasteCode()">📋 결제 코드 붙여넣기</button></div>':'';
  h+='<div class="state main"><h2>알림 받기 · 4,900원 <span class="mute" style="font-weight:400">한 번 결제 · 평생</span></h2>'+(msg?'<p class="err">'+esc(msg)+'</p>':'')+
  '<ul class="big" style="margin:6px 0 10px;padding-left:20px"><li>결제 즉시 지금 상황 리포트 (그때의 대시보드 전체)</li><li>전쟁 위험 단계가 바뀔 때만 이 폰이 울려요 — 올라갈 때도, 내려갈 때도</li><li>알림마다 리포트가 이 앱에 쌓여요 · 기기 3대까지</li></ul>'+
  '<label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;font-size:14px;line-height:1.5"><input type="checkbox" id="agree" style="width:20px;height:20px;margin-top:2px;flex:none" onchange="prep()"><span>${REFUND_CONSENT}</span></label>'+
  '<button class="btn" id="pay" disabled onclick="payNow()">4,900원 결제하기</button>'+
  '<p class="mute" id="paynote" style="margin-top:8px">결제 화면에서 휴대폰 번호를 넣으면 페이앱이 <b>카카오톡으로 결제 링크</b>를 보내요. 링크로 결제를 마치고 <b>이 앱으로 돌아오면 자동으로 이어져요.</b></p></div>'+
  '<details class="state"><summary>다른 기기에서 이미 결제했어요 (코드 입력)</summary><p class="mute">결제 완료 화면에 나온 12자리 코드예요.</p><input class="code-in" id="codein" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" autocomplete="one-time-code"><button class="btn ghost" onclick="saveCode()">확인</button></details>';
  $("#app").innerHTML=h;
  if(PENDING&&PENDING.waiting)showWaiting();
}
// 동의하면 주문을 미리 만들어 둔다 — 결제 버튼을 누르는 순간 결제창을 바로 띄워야 휴대폰이 창을 막지 않는다
async function prep(){var ag=$("#agree"),b=$("#pay");if(!ag.checked){b.disabled=true;return}
  if(PENDING&&!PENDING.used){b.disabled=false;return}
  b.disabled=true;b.textContent="준비 중…";
  try{var r=await fetch("/api/billing/order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({app:true})});var o=await r.json();if(!r.ok)throw new Error(o.error||("오류 "+r.status));
    PENDING={o:o.orderId,t:o.claim,p:o.payapp};remember(o.orderId,o.claim);b.disabled=false;b.textContent="4,900원 결제하기"}
  catch(e){b.textContent="4,900원 결제하기";alert("결제를 준비하지 못했어요: "+(e&&e.message||e));ag.checked=false}}
function payNow(){if(!PENDING)return;var p=PENDING.p;PENDING.used=true;PENDING.waiting=true;
  try{PayApp.setDefault({userid:p.userid,shopname:p.shopname});
    // 결제창은 앱 위에 잠깐 뜨는 창으로 (앱은 그대로 기다린다). 링크 전송 뒤 창은 페이앱이 스스로 닫는다
    PayApp.setParam({goodname:p.goodname,price:p.price,var1:p.var1,feedbackurl:p.feedbackurl,returnurl:p.returnurl,smsuse:p.smsuse,checkretry:p.checkretry,openpaytype:p.openpaytype}).payrequest();}
  catch(e){alert("결제창을 열지 못했어요: "+(e&&e.message||e));PENDING.waiting=false;return}
  showWaiting();}
function showWaiting(){var b=$("#pay");if(b){b.disabled=true;b.textContent="결제를 기다리는 중…"}
  var n=$("#paynote");if(n)n.innerHTML='<b>카카오톡으로 온 페이앱 링크</b>로 결제를 마쳐 주세요. 결제가 끝나면 이 화면이 저절로 넘어가요. <a href="#" onclick="checkPaid(true);return false">결제했는데 그대로예요</a>';
  if(!WATCH)WATCH=setInterval(function(){checkPaid(false)},2500)}
// 이 앱이 시작한 주문 중 결제된 것이 있으면 코드를 저장하고 바로 다음 단계(알림 켜기)로
async function checkPaid(manual){var f=await findPaid(orders());
  if(f){clearInterval(WATCH);WATCH=null;PENDING=null;try{localStorage.setItem("kew_code",f.j.code)}catch(e){}CODE=f.j.code;manifestWithCode(CODE);render();return true}
  if(manual)alert("아직 결제가 확인되지 않았어요. 카카오톡 링크로 결제를 마쳤다면 몇 초 뒤 다시 확인해 주세요.");return false}
document.addEventListener("visibilitychange",function(){if(!document.hidden&&!CODE)checkPaid(false)});
async function pasteCode(){var t="";try{t=await navigator.clipboard.readText()}catch(e){}
  var v=normCode((String(t).match(/[A-Za-z2-9]{4}-?[A-Za-z2-9]{4}-?[A-Za-z2-9]{4}/)||[""])[0]);
  if(!v){alert("복사된 결제 코드가 없어요. 결제 완료 화면의 코드를 길게 눌러 복사한 뒤 다시 눌러 주세요.");return}
  try{localStorage.setItem("kew_code",v)}catch(e){}CODE=v;manifestWithCode(v);render()}
function saveCode(){var v=normCode($("#codein").value);if(!v){alert("코드 12자리를 확인해 주세요.");return}try{localStorage.setItem("kew_code",v)}catch(e){}CODE=v;manifestWithCode(v);render()}

var Q=new URLSearchParams(location.search),CODE=code(),OPEN=Q.get("r"),SIGN=Q.get("s"),SUMMARY=Q.get("summary")==="1",PAGE=0;
// 앱처럼 (11/5): 목록을 누르면 그 순간의 '대시보드 전체'(/r/번호). 안 본 알림은 '새 알림'. 앱 아이콘 배지는 열면 지운다
function seen(){try{return JSON.parse(localStorage.getItem("kew_seen")||"[]")}catch(e){return []}}
function markSeen(id){var a=seen();if(a.indexOf(id)<0){a.push(id);try{localStorage.setItem("kew_seen",JSON.stringify(a.slice(-500)))}catch(e){}}}
function goReport(id){markSeen(id);location.href="/r/"+encodeURIComponent(id)+"?code="+encodeURIComponent(CODE)}
function clearBadge(){try{if(navigator.clearAppBadge)navigator.clearAppBadge()}catch(e){}try{caches.open("kew-badge").then(function(c){c.put("/badge",new Response("0"))})}catch(e){}}
var INSTALL=null;function showInstall(){var b=document.getElementById("install"),h=document.getElementById("installhow");if(INSTALL&&b){b.style.display="";if(h)h.style.display="none"}}
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();INSTALL=e;showInstall()});
window.addEventListener("appinstalled",function(){var b=document.getElementById("install");if(b)b.closest(".state").innerHTML='<div class="okline">✓ 홈 화면에 추가했어요</div><div class="mute">이제 홈 화면의 조기경보 아이콘으로 여세요.</div>'});
function install(){if(!INSTALL)return;INSTALL.prompt();INSTALL.userChoice.finally(function(){INSTALL=null;var b=document.getElementById("install");if(b)b.style.display="none"})}
async function render(){
  try{if(localStorage.getItem("kew_token"))$("#ops").innerHTML=' · <a href="/ops">운영자 화면</a>'}catch(e){}
  // 운영자 (11/6): 운영자 알림 링크(?r=번호&s=서명)는 바로 그 알림의 그때 화면으로. 결제 코드 없이 운영자 열쇠만 있으면 운영자 알림 목록
  if(OPEN&&SIGN){markSeen(OPEN);location.replace("/ops/r/"+encodeURIComponent(OPEN)+"?s="+encodeURIComponent(SIGN));return}
  var OT=null;try{OT=localStorage.getItem("kew_token")}catch(e){}
  if(!CODE&&OT)return renderOps(OT);
  if(!CODE){if(orders().length&&await checkPaid(false))return;return noCode()}
  manifestWithCode(CODE);clearBadge();
  // 알림을 눌러 들어왔으면 바로 그 리포트(대시보드 전체)로
  if(OPEN&&!SUMMARY){var id=OPEN;OPEN=null;return goReport(id)}
  var r=await fetch("/api/me?code="+encodeURIComponent(CODE),{cache:"no-store"}).catch(function(){return null});
  if(!r){$("#app").innerHTML='<div class="state">인터넷 연결을 확인해 주세요.</div>';return}
  var me=await r.json().catch(function(){return {}});
  if(!r.ok){try{localStorage.removeItem("kew_code")}catch(e){}CODE=null;return noCode(me.error)}
  var on=await pushOn();
  var h=stepCard(CODE,me,on);
  if(on&&ENV.android&&!ENV.standalone){var sam=/SamsungBrowser/.test(navigator.userAgent);
    h+='<div class="state" style="border:2px solid var(--brand)"><b style="font-size:17px">📲 홈 화면에 앱으로 추가하세요</b><p class="mute" style="margin:6px 0 10px">앱처럼 아이콘을 눌러 알림 목록과 리포트를 바로 볼 수 있어요. 알림은 지금도 와요.</p>'+
      '<button class="btn" id="install" style="display:none;margin:0 0 8px" onclick="install()">앱으로 추가</button>'+
      '<p class="big" id="installhow" style="margin:0">'+(sam?'아래 <b>메뉴 ≡</b> → <b>현재 페이지 추가</b> → <b>홈 화면</b>':'오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> (또는 <b>앱 설치</b>)')+'</p></div>'}
  var sn=seen(),fresh=me.reports.filter(function(x){return sn.indexOf(x.id)<0}).length;
  h+='<h2 style="margin-top:22px">알림 '+me.reports.length+'개'+(fresh?' · <span style="color:var(--brand)">새 알림 '+fresh+'개</span>':'')+'</h2>';
  if(!me.reports.length)h+='<div class="state mute">첫 리포트를 준비하고 있어요. 잠시 뒤 새로고침해 주세요.</div>';
  // 4개씩, 최신이 위. ◀ 최근 알림 / 지난 알림 ▶ 로 넘긴다 (11/5 사용자)
  var PER=4,pages=Math.max(1,Math.ceil(me.reports.length/PER));if(PAGE>=pages)PAGE=pages-1;var from=PAGE*PER,shown=me.reports.slice(from,from+PER);
  shown.forEach(function(x){var isNew=sn.indexOf(x.id)<0;
    h+='<div id="r_'+esc(x.id)+'" class="item" role="button" tabindex="0" style="'+(isNew?'border:2px solid var(--brand)':'')+'" onclick="if(event.target.closest(\'.rep\'))return;'+(SUMMARY?'openReport':'goReport')+'(\''+esc(x.id)+'\')"><div class="when">'+(isNew?'<b style="color:var(--brand)">● 새 알림</b> · ':'')+kst(x.at)+' · '+ago(x.at)+(x.kind==="snapshot"?' · 가입 시점':x.kind==="demo"?' · 예시':'')+'</div><div class="hl"><span class="chip" style="background:'+COLORS[x.phase]+'">'+x.phase+'단계</span>'+esc(x.headline)+'</div><div class="mute" style="font-size:13px;margin-top:4px">눌러서 그때의 대시보드 전체 보기 ›</div><div class="body"></div></div>'});
  if(pages>1)h+='<div style="display:flex;gap:8px;align-items:center;margin:10px 0"><button class="btn ghost" style="flex:1;padding:12px" '+(PAGE===0?'disabled':'')+' onclick="PAGE--;render();window.scrollTo(0,0)">◀ 최근 알림</button><span class="mute" style="white-space:nowrap">'+(from+1)+'–'+(from+shown.length)+' / '+me.reports.length+'</span><button class="btn ghost" style="flex:1;padding:12px" '+(PAGE>=pages-1?'disabled':'')+' onclick="PAGE++;render();window.scrollTo(0,0)">지난 알림 ▶</button></div>';
  h+='<p class="mute" style="margin-top:14px">단계가 바뀔 때마다 새 알림이 맨 위에 쌓여요. 코드 <b>'+esc(CODE)+'</b>는 다른 기기에서 열 때 필요하니 캡처해 두세요.</p>';
  $("#app").innerHTML=h;
  showInstall();
  // 예전(요약만 있던) 리포트를 열 때
  if(SUMMARY&&OPEN){var id2=OPEN;OPEN=null;markSeen(id2);openReport(id2);var el=document.getElementById("r_"+id2);if(el)el.scrollIntoView({block:"start"})}
}
// 운영자 알림 목록 (11/6): 손님 알림함과 같은 모양 + 운영자 전용 '실시간 대시보드' 버튼
async function renderOps(t){clearBadge();
  if(OPEN){try{var rr=await fetch("/api/ops/report-link?id="+encodeURIComponent(OPEN),{headers:{authorization:"Bearer "+t}});if(rr.ok){var jj=await rr.json();if(jj.url){markSeen(OPEN);location.replace(jj.url);return}}}catch(e){}OPEN=null}
  var r=await fetch("/api/ops/inbox",{headers:{authorization:"Bearer "+t},cache:"no-store"}).catch(function(){return null});
  if(!r||!r.ok){$("#app").innerHTML='<div class="state">운영자 열쇠가 맞지 않거나 연결이 안 돼요. <a href="/ops">운영자 화면</a>에서 다시 로그인해 주세요.</div>';return}
  var items=(await r.json()).items||[],sn=seen(),fresh=items.filter(function(x){return sn.indexOf(x.id)<0}).length;
  var h='<a class="btn" href="/ops" style="margin:14px 0 6px;background:#1d2020;color:#fff;border:2px solid var(--brand)">📊 실시간 대시보드 보기 <span style="font-weight:400;font-size:13px;opacity:.75">운영자 전용</span></a>';
  h+='<h2 style="margin-top:18px">운영자 알림 '+items.length+'개'+(fresh?' · <span style="color:var(--brand)">새 알림 '+fresh+'개</span>':'')+'</h2>';
  if(!items.length)h+='<div class="state mute">아직 그때 화면이 저장된 알림이 없어요. 다음 알림부터 여기에 쌓여요.</div>';
  var PER=4,pages=Math.max(1,Math.ceil(items.length/PER));if(PAGE>=pages)PAGE=pages-1;var shown=items.slice(PAGE*PER,PAGE*PER+PER);
  shown.forEach(function(x){var isNew=sn.indexOf(x.id)<0;
    h+='<a class="item" href="'+esc(x.url)+'" onclick="markSeen(\''+esc(x.id)+'\')" style="display:block;color:inherit;text-decoration:none;'+(isNew?'border:2px solid var(--brand)':'')+'"><div class="when">'+(isNew?'<b style="color:var(--brand)">● 새 알림</b> · ':'')+esc(kst(x.at))+' · '+(x.kind==="ops"?'운영자 알림':'단계 변화 (손님도 받음)')+'</div><div style="font-weight:700;margin-top:4px">'+esc(x.headline||"")+'</div><div class="mute" style="font-size:13px;margin-top:4px">눌러서 그때의 대시보드 전체 보기 ›</div></a>'});
  if(pages>1)h+='<div style="display:flex;gap:8px;align-items:center;margin:10px 0"><button class="btn ghost" style="flex:1;padding:12px" '+(PAGE===0?'disabled':'')+' onclick="PAGE--;renderOps(localStorage.getItem(\'kew_token\'));window.scrollTo(0,0)">◀ 최근 알림</button><span class="mute">'+(PAGE*PER+1)+'–'+Math.min(items.length,PAGE*PER+PER)+' / '+items.length+'</span><button class="btn ghost" style="flex:1;padding:12px" '+(PAGE>=pages-1?'disabled':'')+' onclick="PAGE++;renderOps(localStorage.getItem(\'kew_token\'));window.scrollTo(0,0)">지난 알림 ▶</button></div>';
  $("#app").innerHTML=h}
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){});
render();
</script></body></html>`;
}
