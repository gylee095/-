// 유료 알림 상품 페이지 (2026-11-04, 결제사 페이앱 11-05). 휴대폰 우선. 페이앱 결제창 → 페이앱이 우리 서버에 결제완료 통보 → 활성화 코드 → QR/링크로 폰에서 켜기.
// 브라우저는 결제 성공을 '주장'하지 않는다: 결제 완료 화면은 서버에 상태를 물어보기만 한다(결제완료 통보가 와야 코드가 생긴다).
// 주의: 클라이언트 코드는 String.raw 안이라 템플릿 리터럴(백틱·${})을 쓰지 않는다.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 기기·브라우저별 '알림을 받기까지 할 일' 안내 — 상품 페이지·알림함이 같이 쓰는 정본 (11/5) */
export const INSTALL_JS = String.raw`// 어떤 기기·브라우저로 열었나 → 알림을 받기까지 무엇을 해야 하나 (11/5). 상품 페이지·알림함이 같이 쓰는 정본.
//  컴퓨터: 결제하지 않고 QR 로 폰에 넘긴다 (알림은 폰으로 오고 결제 링크도 카톡으로 폰에 온다 — 컴퓨터 결제는 코드를 옮기는 단계만 늘린다)
//  아이폰: 홈 화면 앱을 먼저 설치하고 앱 안에서 결제 (앱과 브라우저의 저장 공간이 따로). 설치 버튼 위치가 브라우저마다 다르다
//  앱 안 화면(카톡·네이버·인스타 등): 홈 화면 추가·알림이 안 된다 → 바깥 브라우저로
//  안드로이드 크롬·삼성 인터넷: 브라우저와 설치한 앱이 저장 공간을 같이 써서 그대로 결제해도 된다 (안내 없음)
function kewEnv(){var ua=navigator.userAgent;
  var ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1),android=/Android/.test(ua);
  var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  var kakao=/KAKAOTALK/i.test(ua);
  var inapp=/KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\/|DaumApps|BAND\/|everytimeApp|DaumDevice|SamsungBrowser.*CrossApp/i.test(ua);
  var iosBrowser=!ios?"":inapp?"inapp":/CriOS/.test(ua)?"chrome":/EdgiOS/.test(ua)?"edge":/FxiOS/.test(ua)?"firefox":/Whale\//.test(ua)?"inapp":/Safari\//.test(ua)?"safari":"inapp";
  return {ios:ios,android:android,desktop:!ios&&!android,standalone:standalone,kakao:kakao,inapp:inapp,iosBrowser:iosBrowser}}
var KEW_SHARE='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
function kewCopy(u){if(navigator.clipboard)navigator.clipboard.writeText(u).then(function(){alert("주소를 복사했어요. 사파리를 열고 주소창에 붙여 넣으세요.")},function(){prompt("이 주소를 복사하세요",u)});else prompt("이 주소를 복사하세요",u)}
// path: 열린 주소 그대로 넘길 경로 (예: "/", "/me?code=...")
function kewGuide(E,path){var url=location.origin+path;
  var card=function(t,inner){return '<div class="card kew-guide" style="border:2px solid var(--brand)"><b style="font-size:18px">'+t+'</b>'+inner+'</div>'};
  var steps=function(first){return '<ol style="margin:10px 0 6px;padding-left:22px;font-size:16px;line-height:1.6"><li>'+first+'</li><li>목록에서 <b>홈 화면에 추가</b> → <b>추가</b></li><li>홈 화면의 <b>조기경보</b> 앱을 열고 그 안에서 <b>결제</b> → <b>알림 켜기</b></li></ol><p class="mute" style="margin:0">아이폰은 홈 화면에 추가한 앱만 알림을 받을 수 있어요. 앱 안에서 결제하면 코드를 넣을 필요 없이 바로 이어져요.</p>'};
  if(E.standalone)return "";
  if(E.desktop)return card("📱 휴대폰으로 여세요",'<p class="mute" style="margin:6px 0 4px">알림은 휴대폰으로 와요. 휴대폰 <b>카메라로 아래 QR을 찍으면</b> 이 페이지가 열려요. 결제와 알림 켜기는 휴대폰에서 해요.</p><div id="kewqr" style="width:200px;height:200px;margin:12px auto;background:#fff;padding:8px;border-radius:12px"></div><p class="mute" style="text-align:center;margin:0;word-break:break-all">'+url.replace(/[<>"]/g,"")+'</p>');
  if(E.inapp&&E.android)return card("크롬에서 열어 주세요",'<p class="mute" style="margin:6px 0 10px">지금은 '+(E.kakao?"카카오톡":"앱")+' 안의 화면이라 알림을 켤 수 없어요.</p><a class="btn" href="intent://'+location.host+path+'#Intent;scheme=https;package=com.android.chrome;end">크롬으로 열기</a>');
  if(!E.ios)return "";
  if(E.iosBrowser==="safari")return card("📲 먼저 앱을 설치하세요 (무료, 30초)",steps('화면 아래 가운데 '+KEW_SHARE+' <b>공유</b> 버튼'));
  if(E.iosBrowser==="chrome")return card("📲 먼저 앱을 설치하세요 (무료, 30초)",steps('주소창 오른쪽 '+KEW_SHARE+' <b>공유</b> 버튼 (안 보이면 아래 <b>⋯</b> → 공유)'));
  if(E.iosBrowser==="edge"||E.iosBrowser==="firefox")return card("📲 먼저 앱을 설치하세요 (무료, 30초)",steps('메뉴(<b>⋯</b> 또는 <b>≡</b>) → '+KEW_SHARE+' <b>공유</b>')+'<p class="mute" style="margin:6px 0 0">홈 화면에 추가가 안 보이면 <a href="x-safari-'+url+'">사파리로 열어</a> 주세요.</p>');
  return card("사파리에서 열어 주세요",'<p class="mute" style="margin:6px 0 10px">지금은 '+(E.kakao?"카카오톡":"앱")+' 안의 화면이라 홈 화면에 앱을 추가할 수 없어요.</p><a class="btn" href="'+(E.kakao?"kakaotalk://web/openExternal?url="+encodeURIComponent(url):"x-safari-"+url)+'">사파리로 열기</a><button class="btn ghost" style="margin-top:8px" onclick="kewCopy(\''+url.replace(/['"<>\\]/g,"")+'\')">주소 복사 (사파리에 붙여 넣기)</button>')}
function kewDrawQr(path){var el=document.getElementById("kewqr");if(!el||!window.QRCode)return;new QRCode(el,{text:location.origin+path,width:184,height:184,correctLevel:QRCode.CorrectLevel.M})}`;

/** 이 브라우저(또는 홈 화면 앱)가 시작한 주문 목록 — 상품 페이지·결제 완료 화면·알림함이 같이 쓰는 정본 (11/5: 두 곳에 복사돼 있었다) */
export const ORDERS_JS = String.raw`// 이 브라우저에서 시작한 주문 전부 (최근 8개·7일). 그중 결제된 것이 있으면 어느 화면에서든 그 코드로 간다
function orders(){try{var a=JSON.parse(localStorage.getItem("kew_orders")||"[]");var one=JSON.parse(localStorage.getItem("kew_order")||"null");if(one&&!a.some(function(x){return x.o===one.o}))a.push(one);return a.filter(function(x){return x&&x.o&&x.t&&Date.now()-x.at<7*86400000})}catch(e){return []}}
function remember(o,t){var a=orders().filter(function(x){return x.o!==o});a.push({o:o,t:t,at:Date.now()});a=a.slice(-8);try{localStorage.setItem("kew_orders",JSON.stringify(a));localStorage.removeItem("kew_order")}catch(e){}}
async function statusOf(x){try{var r=await fetch("/api/billing/status?o="+encodeURIComponent(x.o)+"&t="+encodeURIComponent(x.t),{cache:"no-store"});if(!r.ok)return {status:"missing"};return await r.json()}catch(e){return {status:"error"}}}
async function findPaid(list){for(var i=list.length-1;i>=0;i--){var j=await statusOf(list[i]);if(j.status==="paid"&&j.code)return {x:list[i],j:j}}return null}`;

export const SHELL_HEAD = String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest">
<style>
:root{--bg:#f3f4f6;--card:#fff;--fg:#111418;--mute:#5f6773;--line:#e2e5e9;--chip:#eef0f3;--brand:#1f5fbf;--ok:#2e7d32;--warn:#b58105}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--fg:#eef0f3;--mute:#9aa3ad;--line:#2a2f3a;--chip:#20242d;--brand:#7fb0ff;--ok:#4caf50;--warn:#f2b632}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;padding:0 16px 48px}
.wrap{max-width:560px;margin:0 auto}.top{padding:14px 0 6px;font-size:14px;color:var(--mute)}.top b{color:var(--fg);font-size:16px}
h1{font-size:28px;line-height:1.25;margin:18px 0 8px;letter-spacing:-.4px}h2{font-size:17px;margin:22px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:12px 0}
.price{display:flex;align-items:baseline;gap:8px;margin:6px 0}.price b{font-size:40px;letter-spacing:-1px}.price span{color:var(--mute)}
.btn{display:block;width:100%;border:0;border-radius:12px;padding:16px;font-size:17px;font-weight:800;background:var(--brand);color:#fff;cursor:pointer;text-align:center;text-decoration:none;font-family:inherit}
@media(prefers-color-scheme:dark){.btn{color:#0f1115}}
.live{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:5px 10px;border-radius:999px;background:var(--chip);margin-top:4px}.live i{width:8px;height:8px;border-radius:50%;background:var(--warn);display:inline-block}.btn:disabled{opacity:.5}
.btn.ghost{background:var(--chip);color:var(--fg);font-weight:600}
ul{padding-left:20px;margin:6px 0}li{margin:4px 0}.mute{color:var(--mute);font-size:14px}.ok{color:var(--ok);font-weight:700}
.code{font-size:clamp(20px,6.4vw,30px);font-weight:800;letter-spacing:1px;white-space:nowrap;text-align:center;padding:14px 8px;border-radius:12px;background:var(--chip);margin:10px 0;user-select:all;font-variant-numeric:tabular-nums}
.qr{display:block;margin:12px auto;width:200px;height:200px;border-radius:12px;background:#fff;padding:8px}
.steps li{margin:8px 0}.err{color:#d32f2f;font-weight:700}
.foot{font-size:12px;color:var(--mute);margin-top:28px;line-height:1.5}a{color:var(--brand)}
</style>`;

/** 상품 페이지: 무엇을 주는지 · 가격 · 결제 */
export function buyPage(payappUserid: string | undefined, origin: string): string {
  const ready = !!payappUserid;
  return String.raw`${SHELL_HEAD}<title>한반도 조기경보 알림 — 4,900원</title>
<script src="https://lite.payapp.kr/public/api/v2/payapp-lite.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b> · <a href="/me">이미 결제했어요 (알림함)</a></div>
<h1>전쟁 위험 단계가 바뀌는 순간,<br>휴대폰이 울립니다.</h1>
<p class="mute">공개 정보 39가지를 5분마다 읽어 한반도 전쟁 위험을 5단계로 판정합니다. 평소엔 조용하고, <b>단계가 실제로 바뀔 때만</b> 알려 드려요. 그때마다 "무엇이, 왜 바뀌었는지" 리포트가 함께 옵니다.</p>

<div class="card">
<div class="price"><b>4,900원</b><span>한 번 결제 · 평생</span></div>
<ul>
<li><b>결제 즉시</b> — 지금 상황 리포트 1건 (단계·확률·이유·지금 할 일)</li>
<li><b>단계가 바뀔 때마다 휴대폰 알림</b> — 올라갈 때도, 내려갈 때도</li>
<li><b>알림마다 리포트</b> — 알림함에 날짜별로 쌓이고, 지난 리포트도 언제든 다시 보기</li>
<li><b>기기 3대</b>까지 — 가족 휴대폰에도 같은 코드로</li>
<li>앱스토어 설치 없음(홈 화면에 추가만) · 문자 요금 없음 · 월 요금 없음</li>
</ul>
${ready
  ? String.raw`<label style="display:flex;gap:10px;align-items:flex-start;margin:14px 0 10px;font-size:14px;line-height:1.5"><input type="checkbox" id="agree" style="width:20px;height:20px;margin-top:2px;flex:none" onchange="document.getElementById('pay').disabled=!this.checked"><span>결제 즉시 활성화 코드와 첫 리포트가 제공되어 서비스가 시작됩니다. 따라서 결제 후에는 <b>청약철회(환불)가 제한</b>됩니다(서비스 장애 시 제외). <a href="/terms">이용약관·환불</a>을 확인했습니다.</span></label>
<button class="btn" id="pay" onclick="pay()" disabled>4,900원 결제하기</button><p class="mute" id="paywait" style="display:none;margin-top:10px">페이앱 화면으로 넘어가요. 휴대폰 번호를 넣으면 페이앱이 결제 링크를 문자로 보내 드려요. 카드·카카오페이·네이버페이·토스페이·휴대폰 결제를 쓸 수 있어요.</p>`
  : String.raw`<button class="btn" disabled>결제 준비 중</button><p class="mute">결제 연결이 아직 설정되지 않았어요. 곧 열립니다.</p>`}
</div>

<h2>이런 알림과 리포트가 와요 <span class="mute" style="font-weight:400">(예시)</span></h2>
<div class="card" style="font-size:14px">
<div style="background:var(--chip);border-radius:12px;padding:10px 12px"><b>🔔 3단계 위기 (3.8% → 15%) 나빠짐 · 2단계 긴장에서</b><br>⬆ 나빠짐: 2단계 긴장 → 3단계 위기<br><span class="mute">미국·일본이 동시에 여행경보를 올렸습니다</span></div>
<div style="margin-top:10px"><b>리포트</b> — 지금 단계와 앞으로 30일 확률(평소 대비 몇 배), 왜 바뀌었는지, 영역별 근거, 다음에 볼 것, 위험을 낮추는 요인, 지금 할 일.</div>
</div>

<h2>어떻게 판단하나요</h2>
<div class="card mute">
정부 경보(미국·일본·영국·캐나다 여행경보, 재난문자), 군사(발사·항행경보·정찰기), 돈(환율·증시·예측시장), 북한 내부(담화·장마당 물가·평양 밤 불빛), 사람들의 불안(검색량) — 여섯 영역을 함께 봅니다. 한 가지 징후만으로는 단계를 올리지 않습니다. 확률은 1999년 이후 실제 충돌 기록을 바탕으로 한 판단값이며, 통계 예측이 아닙니다. 공식 안보 정보가 아니니 대피 등 행동은 정부 재난문자와 국민재난안전포털을 따르세요.
</div>

<h2>시작하는 법</h2>
<ol class="steps">
<li><b>아이폰</b>: <b>공유 → 홈 화면에 추가</b> (사파리는 화면 아래, 크롬은 주소창 오른쪽) → 홈 화면의 <b>조기경보</b> 앱에서 결제 → <b>알림 켜기</b>. 코드를 넣을 필요가 없어요</li>
<li><b>안드로이드</b>: 크롬·삼성 인터넷에서 결제 → <b>알림 켜기</b> (원하면 앱으로 설치)</li>
<li><b>컴퓨터</b>: 화면의 <b>QR을 휴대폰 카메라로</b> 찍어 휴대폰에서 시작 (알림은 휴대폰으로 와요)</li>
<li><b>카카오톡·네이버 앱 안</b>에서 열었다면: 화면의 <b>사파리(크롬)로 열기</b>를 눌러 주세요</li>
</ol>
<p class="mute">결제 화면에서 휴대폰 번호를 넣으면 페이앱이 카카오톡으로 결제 링크를 보내요. 알림이 켜지면 바로 "✅ 알림이 켜졌어요"가 오고, 첫 리포트가 앱에 들어 있어요.</p>
<div class="foot">공개 정보만 사용합니다. 위험도는 관측 사실의 요약·추론이며 전쟁 예측이 아닙니다. <a href="/terms">이용약관</a></div>
</div>
<script>
var ORIGIN=${JSON.stringify(origin)};
// 주문은 서버가 만든다(금액도 서버가 정함). 결제창을 띄운 뒤에는 서버에 상태를 물어 결제완료 통보가 왔는지 본다
function waitPaid(o,t){var n=0;var iv=setInterval(async function(){n++;if(n>400){clearInterval(iv);return}
  try{var r=await fetch("/api/billing/status?o="+encodeURIComponent(o)+"&t="+encodeURIComponent(t),{cache:"no-store"});var j=await r.json();
    if(j.status==="paid"){clearInterval(iv);location.href="/buy/success?o="+encodeURIComponent(o)+"&t="+encodeURIComponent(t)}}catch(e){}},2500)}
(function(){try{if((window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true)&&!/[?&]p=1/.test(location.search)){location.replace("/me");return}}catch(e){}})();
(function(){try{var c=localStorage.getItem("kew_code");if(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c||"")&&!/[?&]p=1/.test(location.search))location.replace("/me")}catch(e){}})();
${ORDERS_JS}
async function resume(){
  var b=document.getElementById("pay");if(b){b.disabled=!(document.getElementById("agree")||{}).checked;b.textContent="4,900원 결제하기"}
  var w=document.getElementById("paywait");if(w)w.style.display="none";
  var f=await findPaid(orders());if(f)location.replace("/buy/success?o="+encodeURIComponent(f.x.o)+"&t="+encodeURIComponent(f.x.t));}
window.addEventListener("pageshow",function(){resume()});
${INSTALL_JS}
(function(){var pay=document.getElementById("pay");if(!pay)return;var E=kewEnv();var box=kewGuide(E,"/");if(!box)return;
  var lab=document.getElementById("agree");if(lab&&lab.closest("label"))lab.closest("label").style.display="none";
  pay.style.display="none";var w=document.getElementById("paywait");if(w)w.style.display="none";
  pay.insertAdjacentHTML("afterend",box);kewDrawQr("/")})();
async function pay(){var b=document.getElementById("pay");var ag=document.getElementById("agree");if(ag&&!ag.checked){alert("환불 제한 안내를 확인하고 체크해 주세요.");return}b.disabled=true;b.textContent="결제창 여는 중…";
  try{var r=await fetch("/api/billing/order",{method:"POST"});var o=await r.json();if(!r.ok)throw new Error(o.error||("오류 "+r.status));
    remember(o.orderId,o.claim);
    var p=o.payapp;
    // 같은 탭에서 결제창을 연다 — 휴대폰은 탭 직후가 아닌 팝업(주문을 만든 뒤 여는 창)을 막는다. 결제를 마치면 페이앱이 결제 완료 화면(returnurl)으로 돌려보낸다
    PayApp.setTarget("_self");
    PayApp.setDefault({userid:p.userid,shopname:p.shopname});
    PayApp.setParam({goodname:p.goodname,price:p.price,redirecturl:p.redirecturl,redirect:p.redirect,var1:p.var1,feedbackurl:p.feedbackurl,returnurl:p.returnurl,smsuse:p.smsuse,checkretry:p.checkretry,openpaytype:p.openpaytype}).payrequest();
    b.textContent="결제창에서 결제를 마쳐 주세요";document.getElementById("paywait").style.display="";
    waitPaid(o.orderId,o.claim);
  }catch(e){alert("결제를 시작하지 못했어요: "+(e&&e.message||e));b.disabled=false;b.textContent="4,900원 결제하기"}}
</script></body></html>`;
}

/** 결제 성공: 서버 확정 → 코드·QR·링크 */
export function successPage(origin: string): string {
  return String.raw`${SHELL_HEAD}<title>결제 완료 — 알림 켜기</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b></div>
<div id="wait" class="card"><b>결제를 기다리는 중…</b><p class="mute" id="waitmsg"><b>카카오톡(또는 문자)으로 온 페이앱 링크</b>를 눌러 결제를 마쳐 주세요. 결제가 끝나면 이 화면에 바로 활성화 코드가 나와요. 이 창은 열어 두세요.</p><button class="btn ghost" id="again" style="display:none;margin-top:10px" onclick="location.reload()">다시 확인</button></div>
<div id="done" class="card" style="display:none">
<h1 style="margin-top:0;font-size:24px">결제 완료 ✓</h1>
<p>알림함에 <b>지금 상황 리포트</b>가 들어 있어요. 이제 <b>휴대폰에서 알림만 켜면</b> 끝이에요.</p>
<div id="mobile" style="display:none">
<a class="btn" id="go" href="#">이 폰으로 알림 켜기 →</a>
<p class="mute" style="text-align:center;margin-top:8px">아이폰은 다음 화면에서 '홈 화면에 추가'를 한 번 안내해 드려요.</p>
</div>
<div id="desk" style="display:none">
<p class="mute" style="text-align:center;margin:10px 0 0">알림은 휴대폰으로 와요. <b>휴대폰 카메라로 찍으세요.</b></p>
<div id="qr" class="qr"></div>
</div>
<div class="code" id="code"></div>
<p class="mute" style="text-align:center">활성화 코드 — 다른 기기에서 알림함을 열 때 필요해요. 캡처해 두세요. (기기 <span id="dev"></span>대까지)</p>
<button class="btn ghost" style="margin-top:8px" onclick="var u=document.getElementById('go').href;if(navigator.share){navigator.share({title:'한반도 조기경보',url:u}).catch(function(){})}else{navigator.clipboard&&navigator.clipboard.writeText(u).then(function(){alert('링크를 복사했어요. 다른 휴대폰에 보내세요.')})}">링크 보내기 (가족·다른 휴대폰)</button>
<p class="mute" id="rc"></p>
</div>
<div id="fail" class="card" style="display:none"><b class="err">결제가 완료되지 않았어요</b><p id="failmsg" class="mute"></p><p class="mute">결제가 취소됐거나 승인되지 않았어요. 돈은 빠져나가지 않았습니다.</p><a class="btn ghost" href="/buy">다시 시도</a></div>
<div class="foot"><a href="/terms">이용약관·환불</a></div>
</div>
<script>
var ORIGIN=${JSON.stringify(origin)};var APP1=new URLSearchParams(location.search).get("app")==="1";
function show(j){var link=ORIGIN+"/me?code="+encodeURIComponent(j.code);
    if(new URLSearchParams(location.search).get("app")==="1"||APP1){APP1=true;history.replaceState(null,"",location.pathname);
      document.getElementById("wait").style.display="none";document.getElementById("done").style.display="";
      document.getElementById("done").innerHTML='<h1 style="margin-top:0;font-size:24px">결제 완료 ✓</h1><p class="big" style="font-size:17px">이제 <b>홈 화면의 조기경보 앱</b>으로 돌아가세요.<br>앱이 결제를 알아채고 <b>알림 켜기</b>로 바로 이어져요.</p><p class="mute">코드를 넣을 필요는 없어요. 혹시 몰라 적어 두면: <b style="letter-spacing:1px">'+String(j.code).replace(/[<>&"]/g,"")+'</b></p>';return}
    var mobile=/Android|iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    document.getElementById(mobile?"mobile":"desk").style.display="";
    try{localStorage.setItem("kew_code",j.code)}catch(e){}
    history.replaceState(null,"",location.pathname);
    document.getElementById("code").textContent=j.code;document.getElementById("dev").textContent=j.devices;document.getElementById("go").href=link;
    var ua=navigator.userAgent,inapp=/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|BAND\//i.test(ua),android=/Android/.test(ua);
    if(mobile&&inapp){var g=document.getElementById("go");
      g.href=android?"intent://"+location.host+"/me?code="+encodeURIComponent(j.code)+"#Intent;scheme=https;package=com.android.chrome;end":(/KAKAOTALK/i.test(ua)?"kakaotalk://web/openExternal?url="+encodeURIComponent(link):link);
      g.textContent=android?"크롬으로 열어 알림 켜기 →":"사파리로 열어 알림 켜기 →";
      var n=g.nextElementSibling;if(n)n.textContent=/KAKAOTALK/i.test(ua)||android?"카카오톡 안에서는 알림을 켤 수 없어서 바깥 브라우저로 열어요. 코드는 자동으로 함께 가요.":"이 앱 안에서는 알림을 켤 수 없어요. 오른쪽 위 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요.";}
    if(j.receiptUrl&&/^https:\/\//.test(j.receiptUrl))document.getElementById("rc").innerHTML='<a href="'+j.receiptUrl.replace(/"/g,"")+'" target="_blank" rel="noopener">영수증 보기</a>';
    new QRCode(document.getElementById("qr"),{text:link,width:184,height:184,correctLevel:QRCode.CorrectLevel.M});
    document.getElementById("wait").style.display="none";document.getElementById("done").style.display="";}
${ORDERS_JS}
(async function(){var q=new URLSearchParams(location.search),o=q.get("o"),t=q.get("t");
  if(o&&t)remember(o,t);
  var list=orders();
  if(!list.length){document.getElementById("wait").style.display="none";document.getElementById("failmsg").textContent="이 브라우저에서 시작한 결제를 찾지 못했어요. 결제를 마쳤다면 카카오톡으로 받은 결제 화면에서 이어 가거나, 영수증의 결제번호와 함께 문의해 주세요.";document.getElementById("fail").style.display="";return}
  // 결제완료 통보는 보통 몇 초 안에 온다. 10분까지 기다린다
  for(var i=0;i<300;i++){
    var f=await findPaid(orders());if(f){show(f.j);return}
    await new Promise(function(res){setTimeout(res,2000)})}
  document.getElementById("waitmsg").textContent="아직 결제가 확인되지 않았어요. 결제를 마쳤다면 잠시 뒤 '다시 확인'을 눌러 주세요. 활성화 코드는 결제가 확인되면 이 화면에 나옵니다.";
  document.getElementById("again").style.display="";
})();
</script></body></html>`;
}

export function failPage(message: string): string {
  return String.raw`${SHELL_HEAD}<title>결제 실패</title></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b></div>
<div class="card"><b class="err">결제가 완료되지 않았어요</b><p class="mute">${esc(message || "결제가 취소되었거나 승인되지 않았어요.")}</p><p class="mute">돈은 빠져나가지 않았습니다.</p><a class="btn ghost" href="/buy">다시 시도</a></div>
</div></body></html>`;
}

export function termsPage(): string {
  return String.raw`${SHELL_HEAD}<title>이용약관 · 환불</title></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b> · <a href="/buy">상품으로</a></div>
<h1 style="font-size:22px">이용약관 · 환불 규정</h1>
<div class="card mute">
<h2 style="margin-top:0">서비스</h2>
<p>한반도 조기경보 알림은 공개 정보를 자동으로 읽어 한반도 전쟁 위험을 5단계로 판정하고, <b>단계가 바뀔 때(올라갈 때와 내려갈 때)</b> 결제한 이용자의 휴대폰에 웹 푸시 알림을 보내며, 그 순간의 판정을 담은 리포트를 이용자의 알림함에 제공하는 디지털 정보 서비스입니다. 결제 즉시 현재 상황 리포트 1건을 제공합니다. 4,900원을 한 번 결제하면 서비스가 제공되는 동안 계속 받습니다. 활성화 코드 하나로 기기 3대까지 등록할 수 있습니다. 단계 변화는 실제 정세에 따라 생기므로 일정 기간 알림이 없을 수 있으며, 알림이 없는 것은 단계가 바뀌지 않았다는 뜻입니다.</p>
<h2>정보의 성격</h2>
<p>모든 판정과 알림은 언론 보도·정부 공개 자료·공개 데이터와 자동 분석에 기반한 <b>참고 정보</b>이며, 공식 안보 정보나 정부 경보가 아닙니다. 확률은 과거 기록을 바탕으로 한 판단값이고 통계 예측이 아닙니다. 대피 등 실제 행동은 정부 재난문자와 국민재난안전포털의 안내를 따르셔야 합니다. 알림을 받지 못하거나 늦게 받아 생긴 손해에 대해 서비스는 책임지지 않습니다. 웹 푸시는 휴대폰·브라우저 설정과 통신 상태에 따라 도달하지 않을 수 있습니다.</p>
<h2>환불</h2>
<p>결제가 완료되면 즉시 활성화 코드가 발급되고 현재 상황 리포트가 알림함에 제공되어 디지털콘텐츠의 제공이 시작됩니다. 전자상거래법 제17조 제2항에 따라 제공이 시작된 디지털콘텐츠는 청약철회가 제한되며, 이용자는 결제 전에 이 내용을 확인하고 동의합니다. 다만 서비스 장애 등 당사 귀책 사유로 알림이나 리포트가 정상적으로 제공되지 않는 경우에는 환불해 드립니다. 환불 요청은 아래 연락처로 활성화 코드와 함께 보내 주세요.</p>
<h2>개인정보</h2>
<p>결제 정보는 결제대행사 페이앱(PayApp)이 처리하며 당사는 카드 정보를 저장하지 않습니다. 당사가 보관하는 것은 주문번호, 결제 시각, 활성화 코드, 알림을 받을 브라우저의 푸시 주소뿐입니다. 이름·이메일을 요구하지 않으며, 결제할 때 휴대폰 번호는 결제대행사(페이앱) 화면에서 입력하며 당사는 받지도 저장하지도 않습니다. 알림을 끄면(브라우저에서 구독 해제) 푸시 주소는 삭제됩니다.</p>
<h2>사업자 정보·연락처</h2>
<p>상호·대표자·사업자등록번호·통신판매업신고번호·연락처: <i>(등록 뒤 기재)</i></p>
</div>
</div></body></html>`;
}
