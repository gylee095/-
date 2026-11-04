// 유료 알림 상품 페이지 (2026-11-04). 휴대폰 우선. 토스 결제위젯 → 서버 확정 → 활성화 코드 → QR/링크로 폰에서 켜기.
// 주의: 클라이언트 코드는 String.raw 안이라 템플릿 리터럴(백틱·${})을 쓰지 않는다.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const SHELL_HEAD = String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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
export function buyPage(clientKey: string | undefined, origin: string): string {
  const ready = !!clientKey;
  return String.raw`${SHELL_HEAD}<title>한반도 조기경보 알림 — 4,900원</title>
<script src="https://js.tosspayments.com/v2/standard"></script></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b> · <a href="/">지금 상황 보기</a></div>
<h1>전쟁 위험이 한 단계 올라가는 순간,<br>휴대폰이 울립니다.</h1>
<a class="live" id="live" href="/" style="text-decoration:none;color:var(--fg)"><i></i><span>지금 상황 확인 중…</span></a>
<p class="mute">공개 정보 39가지를 5분마다 읽어 한반도 전쟁 위험을 5단계로 판정합니다. 단계가 실제로 바뀔 때만 알립니다. 평소엔 조용합니다.</p>

<div class="card">
<div class="price"><b>4,900원</b><span>한 번 결제 · 평생</span></div>
<ul>
<li><b>단계가 바뀔 때 즉시 알림</b> — 올라가면 5분 안에, 내려가면 6시간 이어진 뒤</li>
<li><b>실제 사건 알림</b> — 북한 발사 속보, 민방위 경보, 외국 정부의 철수·출국 권고</li>
<li><b>기기 3대</b>까지 — 가족 휴대폰에도 같은 코드로</li>
<li>앱 설치 없음 · 문자 요금 없음 · 월 요금 없음</li>
</ul>
<p class="mute">알림 첫 줄에 무엇이 달라졌는지 적힙니다. 예: <i>⬆ 나빠짐: 2단계 긴장 → 3단계 위기</i></p>
${ready
  ? String.raw`<button class="btn" id="pay" onclick="pay()">4,900원 결제하고 알림 켜기</button>`
  : String.raw`<button class="btn" disabled>결제 준비 중</button><p class="mute">결제 연결이 아직 설정되지 않았어요. 곧 열립니다.</p>`}
<p class="mute" style="margin-top:10px">결제 즉시 알림 서비스가 시작되며(활성화 코드 발급), 시작 뒤에는 환불이 제한됩니다. 결제 후 7일 안에 요청하시면 환불해 드립니다. <a href="/terms">이용약관·환불</a></p>
</div>

<h2>어떻게 판단하나요</h2>
<div class="card mute">
정부 경보(미국·일본·영국·캐나다 여행경보, 재난문자), 군사(발사·항행경보·정찰기), 돈(환율·증시·예측시장), 북한 내부(담화·장마당 물가·평양 밤 불빛), 사람들의 불안(검색량) — 여섯 영역을 함께 봅니다. 한 가지 징후만으로는 단계를 올리지 않습니다. 확률은 1999년 이후 실제 충돌 기록을 바탕으로 한 판단값이며, 통계 예측이 아닙니다. 공식 안보 정보가 아니니 대피 등 행동은 정부 재난문자와 국민재난안전포털을 따르세요.
</div>

<h2>결제 뒤에는</h2>
<ol class="steps">
<li>활성화 코드가 화면에 나옵니다 (QR 코드도 함께)</li>
<li>휴대폰으로 QR을 찍거나 링크를 열고 <b>알림 켜기</b>를 한 번 누릅니다</li>
<li>끝. 단계가 바뀌면 잠금화면에 뜹니다</li>
</ol>
<div class="foot">공개 정보만 사용합니다. 위험도는 관측 사실의 요약·추론이며 전쟁 예측이 아닙니다. <a href="/terms">이용약관</a></div>
</div>
<script>
var CK=${JSON.stringify(clientKey ?? "")},ORIGIN=${JSON.stringify(origin)};
fetch("/api/public-state").then(function(r){return r.json()}).then(function(j){var w=j.warRisk;if(!w)return;var c=["","#2e7d32","#b58105","#e65100","#c62828","#7b1fa2"][w.phase]||"#888";var el=document.getElementById("live");el.querySelector("i").style.background=c;el.querySelector("span").textContent="지금 "+w.phase+"단계 "+w.phaseLabel+" · 5분마다 갱신 →"}).catch(function(){});
async function pay(){var b=document.getElementById("pay");b.disabled=true;b.textContent="결제창 여는 중…";
  try{var o=await (await fetch("/api/billing/order",{method:"POST"})).json();
    var toss=TossPayments(CK);var payment=toss.payment({customerKey:TossPayments.ANONYMOUS});
    await payment.requestPayment({method:"CARD",amount:{currency:"KRW",value:o.amount},orderId:o.orderId,orderName:o.orderName,successUrl:ORIGIN+"/buy/success",failUrl:ORIGIN+"/buy/fail",card:{useEscrow:false,flowMode:"DEFAULT",useCardPoint:false,useAppCardOnly:false}});
  }catch(e){alert("결제를 시작하지 못했어요: "+(e&&e.message||e));b.disabled=false;b.textContent="4,900원 결제하고 알림 켜기"}}
</script></body></html>`;
}

/** 결제 성공: 서버 확정 → 코드·QR·링크 */
export function successPage(origin: string): string {
  return String.raw`${SHELL_HEAD}<title>결제 완료 — 알림 켜기</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body><div class="wrap">
<div class="top"><b>🇰🇷 한반도 조기경보</b></div>
<div id="wait" class="card"><b>결제를 확인하는 중…</b><p class="mute">몇 초 걸립니다. 창을 닫지 마세요.</p></div>
<div id="done" class="card" style="display:none">
<h1 style="margin-top:0;font-size:24px">결제 완료 ✓</h1>
<p>이제 <b>휴대폰에서 알림을 켜면</b> 끝입니다. 기기 <span id="dev"></span>대까지 쓸 수 있어요.</p>
<div class="code" id="code"></div>
<p class="mute" style="text-align:center">활성화 코드 — 잃어버리지 않게 캡처해 두세요</p>
<div id="qr" class="qr"></div>
<p class="mute" style="text-align:center">휴대폰 카메라로 찍으면 알림 켜기 화면이 바로 열립니다</p>
<a class="btn" id="go" href="#">이 기기에서 지금 알림 켜기</a>
<button class="btn ghost" style="margin-top:8px" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('go').href).then(function(){alert('링크를 복사했어요. 다른 휴대폰에 보내세요.')})">링크 복사 (다른 휴대폰에 보내기)</button>
<p class="mute" id="rc"></p>
</div>
<div id="fail" class="card" style="display:none"><b class="err">결제 확인에 실패했어요</b><p id="failmsg" class="mute"></p><p class="mute">카드가 승인됐다면 돈은 빠져나가지 않거나 자동 취소됩니다. 다시 시도하거나 문의해 주세요.</p><a class="btn ghost" href="/buy">다시 시도</a></div>
<div class="foot"><a href="/terms">이용약관·환불</a></div>
</div>
<script>
var ORIGIN=${JSON.stringify(origin)};
(async function(){var q=new URLSearchParams(location.search);
  try{var r=await fetch("/api/billing/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentKey:q.get("paymentKey"),orderId:q.get("orderId"),amount:Number(q.get("amount"))})});
    var j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||("오류 "+r.status));
    history.replaceState(null,"",location.pathname);
    var link=ORIGIN+"/?code="+encodeURIComponent(j.code);
    document.getElementById("code").textContent=j.code;document.getElementById("dev").textContent=j.devices;document.getElementById("go").href=link;
    if(j.receiptUrl)document.getElementById("rc").innerHTML='<a href="'+j.receiptUrl+'" target="_blank" rel="noopener">영수증 보기</a>';
    new QRCode(document.getElementById("qr"),{text:link,width:184,height:184,correctLevel:QRCode.CorrectLevel.M});
    document.getElementById("wait").style.display="none";document.getElementById("done").style.display="";
  }catch(e){document.getElementById("wait").style.display="none";document.getElementById("failmsg").textContent=String(e&&e.message||e);document.getElementById("fail").style.display=""}})();
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
<p>한반도 조기경보 알림은 공개 정보를 자동으로 읽어 한반도 전쟁 위험을 5단계로 판정하고, 단계가 바뀌거나 실제 사건(북한 발사 속보, 민방위 경보, 외국 정부의 철수·출국 권고)이 있을 때 결제한 이용자의 휴대폰에 웹 푸시 알림을 보내는 서비스입니다. 4,900원을 한 번 결제하면 서비스가 제공되는 동안 계속 받습니다. 활성화 코드 하나로 기기 3대까지 등록할 수 있습니다.</p>
<h2>정보의 성격</h2>
<p>모든 판정과 알림은 언론 보도·정부 공개 자료·공개 데이터와 자동 분석에 기반한 <b>참고 정보</b>이며, 공식 안보 정보나 정부 경보가 아닙니다. 확률은 과거 기록을 바탕으로 한 판단값이고 통계 예측이 아닙니다. 대피 등 실제 행동은 정부 재난문자와 국민재난안전포털의 안내를 따르셔야 합니다. 알림을 받지 못하거나 늦게 받아 생긴 손해에 대해 서비스는 책임지지 않습니다. 웹 푸시는 휴대폰·브라우저 설정과 통신 상태에 따라 도달하지 않을 수 있습니다.</p>
<h2>환불</h2>
<p>결제 즉시 활성화 코드가 발급되어 서비스 제공이 시작됩니다. 전자상거래법상 제공이 시작된 서비스는 청약철회가 제한될 수 있으나, 결제일로부터 <b>7일 안에</b> 요청하시면 이유를 묻지 않고 전액 환불해 드립니다. 7일이 지난 뒤에는 서비스 장애 등 당사 귀책 사유가 있을 때 환불합니다. 환불 요청은 아래 연락처로 결제 주문번호와 함께 보내 주세요.</p>
<h2>개인정보</h2>
<p>결제 정보는 토스페이먼츠가 처리하며 당사는 카드 정보를 저장하지 않습니다. 당사가 보관하는 것은 주문번호, 결제 시각, 활성화 코드, 알림을 받을 브라우저의 푸시 주소뿐입니다. 이름·전화번호·이메일을 요구하지 않습니다. 알림을 끄면(브라우저에서 구독 해제) 푸시 주소는 삭제됩니다.</p>
<h2>사업자 정보·연락처</h2>
<p>상호·대표자·사업자등록번호·통신판매업신고번호·연락처: <i>(등록 뒤 기재)</i></p>
</div>
</div></body></html>`;
}
