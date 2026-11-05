// 상품 소개 화면 (2026-11-05): 실제 고도로 세운 한반도가 스크롤에 따라 장면을 바꾼다 — 발사·서해 어선·레이더·정부와 돈·5단계 판정·알림.
// 영상 파일 없이 캔버스로 그린다(가볍고, 화면 비율에 맞춰 다시 그린다). 장면의 사건은 연출이고 지금 상황이 아니다 — 지금 단계는 결제한 사람만 본다.
// 주의: String.raw 안이라 백틱·${}·역슬래시를 쓰지 않는다.
import { KOREA_DEM } from "./landing_dem.js";

export const LANDING_FONTS = String.raw`<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

export const LANDING_CSS = String.raw`html,body{background:#0a0b0b;margin:0}
:root{--bg:#0a0b0b;--brand:#ff3b30;--ink:#eceeed;--dim:rgba(236,238,237,.62);--faint:rgba(236,238,237,.32);--line:rgba(236,238,237,.12);--red:#ff3b30;--red-dim:rgba(255,59,48,.16);--mono:"JetBrains Mono",ui-monospace,monospace;--sans:Pretendard,-apple-system,system-ui,sans-serif;--ease:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
body{color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
#terrain{position:fixed;inset:0;width:100%;height:100%;z-index:0;display:block}
.grain{position:fixed;inset:-50%;z-index:1;pointer-events:none;opacity:.1;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");animation:grain .9s steps(4) infinite}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-1%,3%)}}
.frame{position:fixed;inset:calc(10px + env(safe-area-inset-top)) 10px 10px;z-index:1;pointer-events:none;border:1px solid rgba(236,238,237,.07)}
.frame i{position:absolute;width:9px;height:9px;border-color:rgba(236,238,237,.5);border-style:solid}
.frame i:nth-child(1){left:-1px;top:-1px;border-width:1px 0 0 1px}.frame i:nth-child(2){right:-1px;top:-1px;border-width:1px 1px 0 0}
.frame i:nth-child(3){left:-1px;bottom:-1px;border-width:0 0 1px 1px}.frame i:nth-child(4){right:-1px;bottom:-1px;border-width:0 1px 1px 0}
.top{position:fixed;z-index:5;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;padding:calc(24px + env(safe-area-inset-top)) 24px 18px;background:linear-gradient(rgba(10,11,11,.92) 55%,rgba(10,11,11,0));font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--dim);line-height:1.6;pointer-events:none}
.brand{font-family:var(--sans);font-size:14px;font-weight:600;letter-spacing:-.01em;color:var(--ink);display:flex;align-items:center;gap:8px}
.live{width:6px;height:6px;border-radius:50%;background:var(--red);animation:live 2.4s infinite}
@keyframes live{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6)}70%{box-shadow:0 0 0 8px rgba(255,59,48,0)}100%{box-shadow:0 0 0 0 rgba(255,59,48,0)}}
#chapter{color:var(--red)}
/* 진행 막대 */
.rail{position:fixed;z-index:5;right:16px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px}
.rail b{width:3px;height:14px;background:rgba(236,238,237,.18);transition:background .3s,height .3s}
.rail b.on{background:var(--red);height:26px}

main{position:relative;z-index:3}
section{position:relative;min-height:135svh;display:flex;flex-direction:column;justify-content:flex-end;padding:0 24px 9svh}
/* 세로 화면: 글 뒤 검은 띠. 위·아래 모두 흐려져야 장면 사이가 뚝 끊기지 않는다 (11/5) — 띠를 섹션 아래로 14svh 더 내려 그 구간에서 흐려지게 */
.band{position:absolute;left:0;right:0;bottom:-14svh;height:calc(60% + 14svh);background:linear-gradient(to top,rgba(10,11,11,0) 0%,rgba(10,11,11,.75) 7%,var(--bg) 15%,rgba(10,11,11,.97) 64%,rgba(10,11,11,.6) 85%,rgba(10,11,11,0));pointer-events:none;z-index:-1}
#buy .band{bottom:0;height:60%;background:linear-gradient(to top,var(--bg) 0%,rgba(10,11,11,.97) 62%,rgba(10,11,11,.6) 84%,rgba(10,11,11,0))}
.card{max-width:560px}
.k{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--red);margin:0 0 14px;display:flex;gap:10px;align-items:center}
.k:before{content:"";width:18px;height:1px;background:var(--red)}
h1{font-size:clamp(34px,min(9.4vw,8.6vh),84px);line-height:1.06;letter-spacing:-.04em;font-weight:700;margin:0 0 18px}
h1 .w{display:inline-block;opacity:0;filter:blur(12px);transform:translateY(10px);animation:wIn 1.1s var(--ease) forwards}
h1 em{font-style:normal;color:var(--red)}
@keyframes wIn{to{opacity:1;filter:blur(0);transform:none}}
h2{font-size:clamp(28px,7.6vw,56px);line-height:1.12;letter-spacing:-.035em;font-weight:700;margin:0 0 14px}
p.lead{font-size:16px;line-height:1.65;color:var(--dim);margin:0 0 22px}
p.lead b{color:var(--ink);font-weight:600}
.src{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.src li{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--line);font-size:14px;line-height:1.45}
.src li span{font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--faint);text-align:right;flex:none;max-width:44%;padding-top:2px}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .9s var(--ease),transform .9s var(--ease)}
.reveal.in{opacity:1;transform:none}
.cta{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:420px;padding:18px 20px;border-radius:14px;background:var(--ink);color:var(--bg);font-size:16px;font-weight:700;text-decoration:none;border:0;font-family:inherit;cursor:pointer}
.cta small{font-family:var(--mono);font-size:11px;font-weight:500;opacity:.6}
.cta.red{background:var(--red);color:#fff}.cta.red small{opacity:.85}
.cta:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.meta{margin-top:14px;font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--faint);display:flex;gap:10px;flex-wrap:wrap}
#hero{min-height:100svh;padding-bottom:calc(32px + env(safe-area-inset-bottom))}
#hero .band{height:calc(52% + 14svh)}
.hero-fade{opacity:0;animation:fade .9s var(--ease) forwards}
@keyframes fade{to{opacity:1}}
.scrollhint{margin-top:22px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--faint);display:flex;align-items:center;gap:8px}
.scrollhint i{width:1px;height:22px;background:linear-gradient(var(--faint),transparent);animation:hint 1.8s var(--ease) infinite}
@keyframes hint{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
/* 단계 판정 */
.ladder{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:4px 0 18px}
.ladder div{border-top:2px solid rgba(236,238,237,.35);padding-top:8px;font-size:13px;font-weight:600}
.ladder div small{display:block;font-family:var(--mono);font-size:9px;font-weight:400;color:var(--faint);margin-top:3px}
.ladder div.r{border-color:var(--red);color:#fff}
.note{font-size:13px;line-height:1.6;color:var(--faint);margin:14px 0 0}
/* 폰 알림 예시 */
.phone{width:min(280px,72vw);aspect-ratio:9/12.5;margin:0 auto 26px;border-radius:40px 40px 0 0;border-bottom:0;-webkit-mask-image:linear-gradient(#000 75%,transparent);mask-image:linear-gradient(#000 75%,transparent);border:1px solid rgba(236,238,237,.22);background:radial-gradient(120% 70% at 50% 0%,#1d2120,#0c0d0d 70%);position:relative;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.phone .clock{position:absolute;top:15%;left:0;right:0;text-align:center;font-size:58px;font-weight:300;letter-spacing:-.02em}
.phone .date{position:absolute;top:10%;left:0;right:0;text-align:center;font-size:13px;color:var(--dim)}
.noti{position:absolute;left:5%;right:5%;top:46%;padding:12px 13px;border-radius:18px;background:rgba(40,44,43,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:0;transform:translateY(-30px) scale(.96);transition:opacity .7s var(--ease) .3s,transform .7s var(--ease) .3s}
.in .noti{opacity:1;transform:none}
.noti .h{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-bottom:5px}
.noti .h b{color:var(--ink);font-weight:600;display:flex;align-items:center;gap:6px}
.noti .h b i{width:16px;height:16px;border-radius:4px;background:#0a0b0b;border:1px solid rgba(236,238,237,.3);display:inline-block;position:relative}
.noti .h b i:after{content:"";position:absolute;inset:5px;border-radius:50%;background:var(--red)}
.noti .t{font-size:13.5px;font-weight:700;line-height:1.35}
.noti .t em{font-style:normal;color:var(--red)}
.noti .d{font-size:12px;line-height:1.45;color:var(--dim);margin-top:3px}
.phone .ex{position:absolute;top:4%;left:0;right:0;text-align:center;font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:var(--faint)}
/* 가격 */
.price{display:flex;align-items:baseline;gap:12px;margin:0 0 6px}
.price b{font-size:clamp(48px,14vw,96px);letter-spacing:-.05em;font-weight:700;line-height:1}
.price span{font-family:var(--mono);font-size:12px;color:var(--dim)}
.checks{list-style:none;padding:0;margin:18px 0 26px;display:grid;gap:10px}
.checks li{display:flex;gap:10px;font-size:15px;line-height:1.5}
.checks li:before{content:"";flex:none;width:6px;height:6px;margin-top:8px;background:var(--red)}
footer{position:relative;z-index:3;padding:24px 24px calc(40px + env(safe-area-inset-bottom));font-size:12px;color:var(--faint);line-height:1.7;background:var(--bg)}
footer a{color:var(--dim)}
@media (min-aspect-ratio:23/20) and (min-width:640px){
  section{padding:0 6vw;justify-content:center;min-height:150vh}
  .band,#buy .band{top:0;bottom:0;height:auto;right:auto;width:50%;background:linear-gradient(90deg,var(--bg) 0%,rgba(10,11,11,.92) 62%,rgba(10,11,11,0))}
  .card{max-width:min(470px,38vw)}
  #hero{justify-content:flex-end;padding-bottom:12vh;min-height:100vh}
  #hero .card{max-width:min(620px,42vw)}
  #hero .band{height:auto}
  .top{padding:36px 7vw 0}.frame{inset:16px}
  .phone{margin:0 0 26px}
}
@media (min-aspect-ratio:23/20) and (min-width:640px) and (max-height:620px){
  section{min-height:170vh}.card{max-width:min(400px,40vw)}
  h1{font-size:clamp(28px,7.2vh,56px)}h2{font-size:clamp(22px,6vh,40px)}
  p.lead{font-size:14px;margin-bottom:14px}.src li{padding:7px 0;font-size:13px}
  .phone{display:none}.price b{font-size:clamp(40px,11vh,72px)}.checks{margin:10px 0 16px}
}
/* 결제 (동의·버튼·기기별 안내 카드 — 안내 카드는 INSTALL_JS 의 .card/.btn/.mute 를 쓴다) */
.already{display:inline-block;margin-top:14px;font-size:13px;color:var(--dim);text-decoration:underline;text-underline-offset:3px}
.agree{display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;font-size:13px;line-height:1.55;color:var(--dim)}
.agree input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--red)}
.agree a,.fine a{color:var(--ink)}
.cta:disabled{opacity:.45;cursor:not-allowed}
.paywait{font-size:13px;line-height:1.6;color:var(--dim);margin:12px 0 0}
.kew-guide{background:rgba(236,238,237,.05);border-radius:14px;padding:16px;margin:14px 0;color:var(--ink);text-align:left}
.kew-guide .mute,.mute{color:var(--dim);font-size:14px;line-height:1.55}
.kew-guide .btn,.btn{display:block;width:100%;border:0;border-radius:12px;padding:15px;font-size:16px;font-weight:700;background:var(--red);color:#fff;text-align:center;text-decoration:none;font-family:inherit;cursor:pointer}
.kew-guide .btn.ghost{background:rgba(236,238,237,.1);color:var(--ink);font-weight:600}
.kew-guide ol{color:var(--ink)}
/* 아래 정보 */
.info{position:relative;z-index:3;background:var(--bg);padding:56px 24px 8px;border-top:1px solid var(--line)}
.info .in{max-width:720px}
.info h3{font-size:18px;letter-spacing:-.02em;margin:0 0 12px}
.info ol,.info ul{margin:0 0 28px;padding-left:20px;font-size:14px;line-height:1.7;color:var(--dim)}
.info li b{color:var(--ink);font-weight:600}
.fine{font-size:12px;line-height:1.7;color:var(--faint);margin:0}
@media (min-aspect-ratio:23/20) and (min-width:640px){.info{padding:72px 6vw 8px}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}h1 .w,.hero-fade,.reveal,.noti{opacity:1;filter:none;transform:none}}`;

/** 고정 배경(지형 캔버스·결·테두리)과 위 막대 */
export const LANDING_CHROME = String.raw`<canvas id="terrain" aria-hidden="true"></canvas>
<div class="grain" aria-hidden="true"></div>
<div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="top" aria-hidden="true">
  <div class="brand"><span class="live"></span>한반도 조기경보</div>
  <div style="text-align:right"><span id="chapter">00 / 전체</span><br>NEXT SCAN <span id="clock">05:00</span></div>
</div>
<nav class="rail" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b></nav>`;

/** 장면 0~6 (가입 장면은 결제 로직과 함께 buy.ts 에서) */
export const LANDING_STORY = String.raw`<section id="hero" data-ch="00 / 전체">
  <div class="band"></div>
  <div class="card">
    <p class="k hero-fade" style="animation-delay:.2s">KOREA EARLY WARNING</p>
    <h1 id="h1" aria-label="39가지 신호로 보는 한반도 전쟁 위험"></h1>
    <p class="lead hero-fade" style="animation-delay:1.6s">5분마다 자동으로 판정하고 AI 분석관이 하루 두 번 다시 읽어, 위기 단계가 바뀌면 바로 폰으로 알려 드립니다.</p>
    <a class="cta hero-fade" style="animation-delay:1.9s" href="#buy">평생 알림 받기 <small>4,900원 · 1회</small></a>
    <div class="scrollhint hero-fade" style="animation-delay:2.4s"><i></i>어떤 신호를 보는지 — 아래로</div>
    <a class="already hero-fade" style="animation-delay:2.4s" href="/me">이미 결제했어요 · 알림함 →</a>
  </div>
</section>

<section data-ch="01 / 발사·포격">
  <div class="band"></div>
  <div class="card reveal">
    <p class="k">SIGNAL 01 · 군사</p>
    <h2>쏘기 전에 남는 흔적</h2>
    <p class="lead">북한은 발사 전에 바다에 <b>낙하 구역을 통보</b>하고, 엔진을 시험하면 <b>위성에 열이 잡힙니다.</b> 발사장 10곳 주변을 매일 봅니다.</p>
    <ul class="src">
      <li>발사 예고 항행경보<span>일본 해상보안청 · 미국 NGA</span></li>
      <li>발사장·핵시설 주변 열점<span>NASA 위성 FIRMS</span></li>
      <li>핵실험 인공지진<span>USGS · EMSC</span></li>
      <li>국방부 도발 발표 · 접경 사건<span>정책브리핑 · 연합뉴스</span></li>
    </ul>
  </div>
</section>

<section data-ch="02 / 서해">
  <div class="band"></div>
  <div class="card reveal">
    <p class="k">SIGNAL 02 · 바다</p>
    <h2>서해에서 배가 빠지면</h2>
    <p class="lead">서해의 <b>중국 어선 수</b>를 위성으로 셉니다. 위기 직전에 어선이 먼저 빠진다는 관찰이 있어서, 평소보다 크게 줄면 표시합니다. <b>GPS 교란</b>도 함께 봅니다.</p>
    <ul class="src">
      <li>서해 중국 선박 증감<span>Global Fishing Watch 위성 AIS</span></li>
      <li>GPS 교란 비율 · 서해 · 북한 상공<span>GPSJam</span></li>
      <li>한반도 주변 항행경보<span>국립해양조사원</span></li>
    </ul>
  </div>
</section>

<section data-ch="03 / 하늘">
  <div class="band"></div>
  <div class="card reveal">
    <p class="k">SIGNAL 03 · 하늘</p>
    <h2>하늘에 누가 떠 있나</h2>
    <p class="lead">정찰기·조기경보기·급유기가 한반도 주변에 모이는지, 민항기가 갑자기 줄어드는지 <b>항공기 위치 신호</b>로 셉니다.</p>
    <ul class="src">
      <li>정찰·감시·급유기 수<span>ADS-B 공개 수신망</span></li>
      <li>한반도 상공 민항기 수<span>adsb.lol</span></li>
      <li>북한 인터넷 장애<span>IODA · 조지아공대</span></li>
    </ul>
  </div>
</section>

<section data-ch="04 / 정부·돈">
  <div class="band"></div>
  <div class="card reveal">
    <p class="k">SIGNAL 04 · 정부와 돈</p>
    <h2>먼저 아는 쪽의 움직임</h2>
    <p class="lead">정부는 비공개 정보를 갖고 있고, 돈을 건 사람은 빨리 움직입니다. <b>5개국 정부의 여행경보</b>와 <b>시장</b>을 함께 봅니다.</p>
    <ul class="src">
      <li>미·영·캐나다·독일·일본 여행경보<span>각국 외교부 공개 데이터</span></li>
      <li>미 대사관 철수·출국 권고 문구<span>미 국무부</span></li>
      <li>원·달러 · 한국만의 주가 하락 · 방산주<span>시장 데이터</span></li>
      <li>예측시장 '침공' 가격 · 외국인 매도<span>Polymarket · 한국은행</span></li>
      <li>'대피소·생존배낭' 검색량<span>네이버 데이터랩</span></li>
    </ul>
  </div>
</section>

<section data-ch="05 / 판정">
  <div class="band"></div>
  <div class="card reveal">
    <p class="k">39 SIGNALS → 5 PHASES</p>
    <h2>39가지 신호를<br>5단계로 판정합니다</h2>
    <div class="ladder" aria-label="평온, 긴장, 위기, 임박, 교전">
      <div>평온<small>1</small></div><div>긴장<small>2</small></div><div class="r">위기<small>3</small></div><div class="r">임박<small>4</small></div><div class="r">교전<small>5</small></div>
    </div>
    <p class="lead">5분마다 자동으로 계산하고, <b>AI 분석관이 하루 두 번</b> 다시 읽습니다. 특이한 날에는 따로 깊게 조사합니다.</p>
    <p class="note">북한의 말이나 기사만으로는 '위기'가 되지 않습니다. 정부나 시장이 함께 움직이거나 실제 사건이 있어야 단계가 오릅니다.</p>
  </div>
</section>

<section data-ch="06 / 알림">
  <div class="band"></div>
  <div class="card reveal">
    <div class="phone" aria-hidden="true">
      <div class="date">11월 5일 수요일</div><div class="clock">22:14</div>
      <div class="noti"><div class="h"><b><i></i>조기경보</b><span>지금</span></div>
        <div class="t"><em>⬆ 나빠짐</em>: 2단계 긴장 → 3단계 위기</div>
        <div class="d">앞으로 30일 안 국지 충돌 가능성이 평소의 몇 배인지, 무엇이 바뀌었는지 함께 옵니다.</div></div>
      <div class="ex">EXAMPLE · 예시 화면</div>
    </div>
    <p class="k">ALERT</p>
    <h2>단계가 바뀔 때만 울립니다</h2>
    <p class="lead">매일 오는 뉴스 알림이 아닙니다. 단계가 바뀐 그 순간의 <b>판정 화면 전체</b>가 폰에 쌓이고, 알림을 누르면 바로 열립니다.</p>
  </div>
</section>`;

/** 지형·카메라·장면 연출. 제목 단어는 buy.ts 가 넘긴다 */
export function landingSceneJs(h1Words: string[]): string {
  const words = JSON.stringify(h1Words).replace(/</g, "\\u003c");
  return SCENE.replace("__DEM__", () => JSON.stringify(KOREA_DEM)).replace("__H1WORDS__", () => words);
}

const SCENE = String.raw`(function(){
var DEM=__DEM__;
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var A='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
var COS=Math.cos(38*Math.PI/180), LON0=127.5, LAT0=38;
var stepLon=(DEM.e-DEM.w)/(DEM.cols-1), stepLat=(DEM.n-DEM.s)/(DEM.rows-1);
function wx(lon){return (lon-LON0)*COS} function wy(lat){return lat-LAT0}
function val(r,c){return A.indexOf(DEM.d[r*DEM.cols+c])}
function hOf(v){if(v<=0)return 0;var l=(v>32?v-32:v)/31;return l*l}
function isSea(lat,lon){var r=Math.round((DEM.n-lat)/stepLat),c=Math.round((lon-DEM.w)/stepLon);return r>=0&&r<DEM.rows&&c>=0&&c<DEM.cols&&val(r,c)===0}
var ss=function(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
var win=function(c,a,b,fade){return ss((c-a)/fade)*(1-ss((c-b)/fade))}; // a~b 사이에서 켜짐

// ── 점: 남·북한 땅은 모두, 다른 땅·바다는 성기게
var X=[],Y=[],Z=[],K=[],L=[],TX=[],TY=[],TZ=[],TR=[];
for(var r=0;r<DEM.rows;r++)for(var c=0;c<DEM.cols;c++){
  var v=val(r,c), kind=v===0?0:(v>32?2:1);
  if(kind!==1&&(r%2||c%2))continue;
  var lat=DEM.n-r*stepLat, lon=DEM.w+c*stepLon, h=hOf(v);
  var hw=c>0?hOf(val(r,c-1)):h, hn=r>0?hOf(val(r-1,c)):h;
  var shade=Math.max(-.5,Math.min(.5,(h-hw)*6+(h-hn)*3));
  var lum=kind===1?.42+.5*Math.sqrt(h)+shade*.35:kind===2?.14+.18*h:.11;
  X.push(wx(lon));Y.push(wy(lat));Z.push(h);K.push(kind);L.push(Math.max(.06,Math.min(1,lum)));
}
var N=X.length;
// 판정 장면: 한반도 점들이 5개의 막대로 다시 모인다
(function(){var idx=[];for(var i=0;i<N;i++)if(K[i]===1)idx.push(i);
  idx.sort(function(a,b){return X[a]-X[b]});
  var per=Math.ceil(idx.length/5), H5=[.18,.36,.7,1.05,1.45];
  for(i=0;i<N;i++){TX.push(X[i]);TY.push(Y[i]);TZ.push(0);TR.push(0)}
  idx.forEach(function(p,k){var col=Math.min(4,Math.floor(k/per)),j=k-col*per,side=Math.ceil(Math.sqrt(per)),gx=j%side,gy=Math.floor(j/side);
    TX[p]=(col-2)*.95+(gx/side-.5)*.62; TY[p]=(gy/side-.5)*.62; TZ[p]=H5[col]*(.82+.18*Math.random()); TR[p]=col>=2?1:0});
})();

// 실제 좌표
function W(lat,lon){return [wx(lon),wy(lat)]}
var P={wonsan:W(39.17,127.48),dong:W(39.66,124.7),seoul:W(37.566,126.978),dmz:W(38.2,127.1),box:[wx(129.6),wy(39.55),wx(130.7),wy(40.35)],jam:W(37.95,125.95)};
P.impact=[(P.box[0]+P.box[2])/2,(P.box[1]+P.box[3])/2];
// 서해 중국 어선 (그림용 점 — 실제 척수가 아님)
var boats=[];for(var b=0;b<190;b++){var la,lo,tries=0;do{la=36.5+Math.random()*2;lo=123.4+Math.random()*2.2;tries++}while(!isSea(la,lo)&&tries<30);boats.push([wx(lo),wy(la),Math.random()*6.28,.6+Math.random()*.8])}
var planes=[[126.3,37.25,.9],[128.7,37.8,-1.9],[127.5,36.9,.25],[125.8,38.75,2.6],[129.1,38.9,-2.4],[126.6,39.3,-.6]].map(function(p){return [wx(p[0]),wy(p[1]),p[2]]});
// 정부·돈: 서울 위에 뜨는 신호들
var flags=[['미국 여행경보',.0,1.25],['영국 외무부',1.26,1.0],['캐나다',2.5,1.15],['독일 외무부',3.77,.9],['일본 외무성',5.03,1.2],['원·달러',.63,.55],['방산주',2.2,.6],['예측시장',3.4,.5],['외국인 매도',4.4,.62]];

// ── 장면: 중심, 보여 줄 범위(가로 sx, 세로 sy, 높이 hz), 기울기, 회전
var SC=[
  {lon:127.6,lat:38.2,sx:5.8,sy:10.2,hz:1.2,tilt:58,yaw:-.16},
  {lon:127.6,lat:39.7,sx:5.4,sy:2.6,hz:1.4,tilt:54,yaw:-.04,port:{lon:127.4,lat:39.6,sx:3.3,sy:4.4,yaw:.55}},
  {lon:124.9,lat:37.6,sx:2.9,sy:2.6,hz:.6,tilt:50,yaw:.1,port:{lon:124.9,lat:37.7,sx:2.3,sy:2.8}},
  {lon:127.1,lat:38.2,sx:4.9,sy:4.9,hz:.8,tilt:62,yaw:-.28},
  {lon:126.98,lat:37.55,sx:2.6,sy:2.6,hz:2.1,tilt:64,yaw:-.1},
  {lon:127.5,lat:38,sx:5.2,sy:1.4,hz:1.6,tilt:71,yaw:-.3},
  {lon:127.6,lat:38.2,sx:5.8,sy:10.2,hz:1.2,tilt:58,yaw:-.16},
  {lon:127.6,lat:38.3,sx:6.4,sy:11,hz:1.2,tilt:62,yaw:-.1}
];

var cv=document.getElementById('terrain'),cx=cv.getContext('2d'),Wd,Ht,DPR,VA,land,dprCap=2;
// 화면 비율에 따라 그림이 들어갈 칸: 세로 화면은 위쪽, 가로 화면은 오른쪽
function size(){Wd=innerWidth;Ht=innerHeight;DPR=Math.min(devicePixelRatio||1,dprCap);cv.width=Wd*DPR;cv.height=Ht*DPR;cx.setTransform(DPR,0,0,DPR,0,0);
  land=Wd/Ht>=1.15&&Wd>=640;
  VA=land?{x:Wd*.44,y:Ht*.08,w:Wd*.53,h:Ht*.84}:{x:Wd*.04,y:Math.max(64,Ht*.08),w:Wd*.92,h:Ht*.44};
  SC.forEach(function(s){if(!s.base)s.base={lon:s.lon,lat:s.lat,sx:s.sx,sy:s.sy,yaw:s.yaw};var q=land||!s.port?s.base:Object.assign({},s.base,s.port);for(var k in q)s[k]=q[k];
    var t=s.tilt*Math.PI/180;s.S=Math.min(VA.w/s.sx,VA.h/(s.sy*Math.cos(t)+s.hz*Math.sin(t)))})}
size();
var DIST=13, EX=1.15, cam={x:0,y:0,S:1}, cosY,sinY,cosT,sinT, o={x:0,y:0,s:1}, CX,CY;
function proj(x,y,z){var dx=x-cam.x,dy=y-cam.y,xr=dx*cosY-dy*sinY,yr=dx*sinY+dy*cosY,u=yr*cosT+z*sinT,d=yr*sinT-z*cosT,s=cam.S*DIST/(DIST+d);o.x=CX+xr*s;o.y=CY-u*s;o.s=s;return o}

var secs=[].slice.call(document.querySelectorAll('main section')), pos=0, sm=0;
function scrollPos(){var y=scrollY, c=secs.map(function(s){return s.offsetTop+s.offsetHeight/2-Ht/2});
  if(y<=c[0])return 0;for(var i=0;i<c.length-1;i++)if(y<c[i+1])return i+(y-c[i])/(c[i+1]-c[i]);return c.length-1}
function near(k,w){return ss(1-Math.abs(sm-k)*(w||1.5))}

var NB=8,TIERS=3,buckets=[];for(var b2=0;b2<NB*TIERS;b2++)buckets.push([]);
var COL=[[222,232,228],[255,150,128],[255,59,48]];
var T0=performance.now(), lastNow=T0, slow=.016, lod=1;
function lab(x,y,z,txt,red,al){if(al<=.02)return;proj(x,y,z);cx.globalAlpha=al;cx.font='500 '+(land?11:10)+'px "JetBrains Mono",monospace';cx.fillStyle=red?'#ff5a4e':'rgba(236,238,237,.85)';
  cx.fillRect(o.x-2,o.y-2,4,4);var tw=cx.measureText(txt).width;if(o.x+30+tw>Wd-14){cx.fillRect(o.x-22,o.y-.5,18,1);cx.fillText(txt,o.x-26-tw,o.y+3.5)}else{cx.fillRect(o.x+4,o.y-.5,18,1);cx.fillText(txt,o.x+26,o.y+3.5)}cx.globalAlpha=1}
function ringAt(x,y,R,col,al,z){cx.strokeStyle='rgba('+col+','+al.toFixed(3)+')';cx.beginPath();for(var a=0;a<=6.30;a+=.14){proj(x+Math.cos(a)*R,y+Math.sin(a)*R,z||0);a?cx.lineTo(o.x,o.y):cx.moveTo(o.x,o.y)}cx.stroke()}

function frame(now){
  var t=reduce?60000:now-T0, dt=Math.min(.25,Math.max(0,(now-lastNow)/1000));lastNow=now;
  // 느린 폰: 한 장면 그리는 데 오래 걸리면 점을 절반만 그린다 (한 번 내리면 유지)
  if(dt>0&&t>2500){slow=slow*.95+dt*.05;if(lod===1&&slow>.034){lod=2;dprCap=1.25;size()}}
  pos=reduce?0:scrollPos(); sm+=(pos-sm)*(reduce?1:1-Math.exp(-dt/.22));
  var i0=Math.min(SC.length-2,Math.floor(sm)), f=ss(sm-i0), a=SC[i0], b=SC[i0+1];
  cam.x=wx(a.lon+(b.lon-a.lon)*f);cam.y=wy(a.lat+(b.lat-a.lat)*f);cam.S=Math.exp(Math.log(a.S)+(Math.log(b.S)-Math.log(a.S))*f);
  var tilt=(a.tilt+(b.tilt-a.tilt)*f)*Math.PI/180, yaw=a.yaw+(b.yaw-a.yaw)*f+Math.sin(t/9000)*.04+pyaw;
  cosY=Math.cos(yaw);sinY=Math.sin(yaw);cosT=Math.cos(tilt+ptilt);sinT=Math.sin(tilt+ptilt);
  CX=VA.x+VA.w/2; CY=VA.y+VA.h*(land?.5:.47);
  var e1=near(1),e2=near(2),e3=near(3),e4=near(4),m=near(5,1.2),e6=near(6,1.3);
  cx.clearRect(0,0,Wd,Ht);

  // 바닥 격자 (1도)
  cx.lineWidth=1;cx.strokeStyle='rgba(236,238,237,'+(.06*(1-m)).toFixed(3)+')';cx.beginPath();
  for(var g=33;g<=44;g++){for(var q=121;q<=134.01;q+=.5){proj(wx(q),wy(g),0);q===121?cx.moveTo(o.x,o.y):cx.lineTo(o.x,o.y)}}
  for(g=121;g<=134;g++){for(q=33;q<=44.01;q+=.5){proj(wx(g),wy(q),0);q===33?cx.moveTo(o.x,o.y):cx.lineTo(o.x,o.y)}}
  cx.stroke();

  // 장면마다 도는 짧은 이야기 (주기 안의 위치 0~1)
  var c1=(t%6000)/6000;                 // 1: 낙하 구역 통보 → 엔진 열 → 발사 → 낙하
  var box=ss(c1/.12)*(1-ss((c1-.92)/.08)), heat=win(c1,.18,.5,.06), fly=Math.max(0,Math.min(1,(c1-.45)/.3)), boom=c1>.75?(c1-.75)/.25:-1;
  var c2=(t%7000)/7000;                 // 2: 어선 많음 → 빠져나감 → 다시
  var gone=.8*ss((c2-.4)/.3)*(1-ss((c2-.88)/.12));
  var ang=t/1000*1.5;                   // 3: 레이더
  var rise=ss((sm-3.5)/.5);             // 4: 기둥이 솟는다
  var scanY=(((t%6500)/6500)*13-7.5), alertY=(((t%3800)/3800)*12-6.5);
  var Lw=P.wonsan,Dg=P.dong,Se=P.seoul,Dz=P.dmz;
  for(b2=0;b2<buckets.length;b2++)buckets[b2].length=0;
  var sea=[], me=1-Math.pow(1-m,3), quiet=1-Math.max(e1,e2,e3,e4,m)*.8;
  var launchR=fly>0&&fly<1?fly*.8:-1;
  for(var i=0;i<N;i++){
    if(lod>1&&(i&1))continue;
    var x=X[i],y=Y[i],k=K[i],grow=reduce?1:Math.min(1,Math.max(0,(t-300-(y+6)*130)/1500));grow=1-Math.pow(1-grow,3);
    var dw=y-scanY,wave=Math.exp(-dw*dw*6)*quiet, red=0, boost=0;
    if(k===0){if(m>.98)continue;var zs=Math.sin(x*3+t/1400)*Math.cos(y*2.4+t/1900)*.04*grow;proj(x,y,zs+wave*.05);sea.push(o.x,o.y,(.05+wave*.2)*(1-m));continue}
    if(e1>0){
      var d1=Math.hypot(x-Lw[0],y-Lw[1]);
      if(d1<.9&&launchR>=0){var sh=Math.exp(-Math.pow((d1-launchR)*10,2));red=Math.max(red,e1*sh*(1-d1/.9)+e1*.5*(1-d1/.9)*(1-fly));boost+=e1*sh*.15*(1-d1/.9)}
      var d2=Math.hypot(x-Dg[0],y-Dg[1]);if(d2<.5){var hz2=(1-d2/.5)*heat;red=Math.max(red,e1*hz2*(.7+.3*Math.sin(t/120)));boost+=e1*hz2*.25}
    }
    if(e3>0){var dx=x-Dz[0],dy=y-Dz[1],dr=Math.hypot(dx,dy);if(dr<2.3){var df=((ang-Math.atan2(dy,dx))%6.2832+6.2832)%6.2832,tr=Math.exp(-df*1.6)*(1-dr/2.3*.4);red=Math.max(red,e3*tr);boost+=e3*tr*.1}}
    if(e4>0){var d4=Math.hypot(x-Se[0],y-Se[1]);if(d4<.45){var w4=Math.pow(1-d4/.45,1.3);boost+=e4*rise*w4*(1+.2*Math.sin(t/500+x*40));red=Math.max(red,e4*w4)}}
    if(e6>0){var da=y-alertY;red=Math.max(red,e6*Math.exp(-da*da*3)*(k===1?1:.3))}
    var z=(Z[i]*EX+.015+wave*(k===1?.16:.04)+boost)*grow, px=x, py=y;
    if(me>0&&k===1){px=x+(TX[i]-x)*me;py=y+(TY[i]-y)*me;z=z+(TZ[i]-z)*me;red=Math.max(red*(1-me),TR[i]*me)}
    var alpha=(k===1?1:1-me);if(alpha<.02)continue;
    var depth=Math.min(1,Math.max(0,((px-cam.x)*sinY+(py-cam.y)*cosY+4)/10));
    var lum=Math.min(1,L[i]*(1-.45*depth)+wave*(k===1?.42:.1)+red*.35)*(.25+.75*grow)*alpha;
    if(me>0&&k===1)lum=lum*(1-me)+(land?.32:.55)*me;
    var fl=(Math.sin(x*1.6+y*1.1+t/2800)*.5+Math.sin(y*3.1-t/4100)*.25)*(1-me);
    var lx=(.22+fl*.35)*z*(1-me), ly=(-.12+fl*.2)*z*(1-me);
    proj(px,py,0);var bx=o.x,by=o.y;proj(px+lx,py+ly,z);
    if(o.x<-20||o.x>Wd+20||o.y<-40||o.y>Ht+20)continue;
    var tier=red<.22?0:red<.55?1:2;
    buckets[tier*NB+Math.min(NB-1,Math.floor(lum*NB))].push(bx,by,o.x,o.y,o.s);
  }
  cx.globalCompositeOperation='lighter';
  for(var s2=0;s2<sea.length;s2+=3){cx.fillStyle='rgba(205,218,214,'+sea[s2+2].toFixed(2)+')';cx.fillRect(sea[s2],sea[s2+1],1.1,1.1)}
  var px0=cam.S/60;
  for(var tb=0;tb<TIERS;tb++)for(b2=0;b2<NB;b2++){
    var Lb=buckets[tb*NB+b2];if(!Lb.length)continue;var al=(b2+.5)/NB,cc=COL[tb];
    cx.strokeStyle='rgba('+cc+','+(al*(tb?.5:.3)).toFixed(3)+')';cx.lineWidth=.75;cx.beginPath();
    for(var j=0;j<Lb.length;j+=5){cx.moveTo(Lb[j],Lb[j+1]);cx.lineTo(Lb[j+2],Lb[j+3])}cx.stroke();
    cx.fillStyle='rgba('+(tb?cc:[244,248,246])+','+(al*.85).toFixed(3)+')';
    for(j=0;j<Lb.length;j+=5){var sz=Math.max(.9,Math.min(3.2,Lb[j+4]/cam.S*1.3*Math.sqrt(px0)));cx.fillRect(Lb[j+2]-sz/2,Lb[j+3]-sz/2,sz,sz)}
  }
  cx.lineWidth=1;

  // ── 1. 쏘기 전에 남는 흔적: ① 낙하 구역 통보 ② 엔진 열 ③ 발사 ④ 낙하
  if(e1>.03){
    var B=P.box;cx.setLineDash([4,4]);cx.strokeStyle='rgba(255,59,48,'+(e1*box*.9).toFixed(3)+')';cx.lineWidth=1.2;cx.beginPath();
    [[B[0],B[1]],[B[2],B[1]],[B[2],B[3]],[B[0],B[3]],[B[0],B[1]]].forEach(function(p,k2){proj(p[0],p[1],0);k2?cx.lineTo(o.x,o.y):cx.moveTo(o.x,o.y)});cx.stroke();cx.setLineDash([]);
    cx.fillStyle='rgba(255,59,48,'+(e1*box*.07).toFixed(3)+')';cx.fill();
    if(fly>0&&fly<1){for(var st=0;st<30;st++){var u0=fly-st*.011;if(u0<0)break;var ux=Lw[0]+(P.impact[0]-Lw[0])*u0,uy=Lw[1]+(P.impact[1]-Lw[1])*u0,uz=4*1.5*u0*(1-u0)+.1;
      proj(ux,uy,uz);var rr=(st?2:5)*(1-st/36)*Math.max(.8,o.s/cam.S);cx.fillStyle='rgba(255,'+(st?60:200)+','+(st?50:170)+','+(e1*(1-st/30)).toFixed(3)+')';cx.fillRect(o.x-rr,o.y-rr,rr*2,rr*2)}
      if(fly<.25)ringAt(Lw[0],Lw[1],fly*2.4,'255,59,48',e1*(1-fly*4),.05)}
    if(boom>=0){ringAt(P.impact[0],P.impact[1],boom*.6,'255,59,48',e1*(1-boom),0);ringAt(P.impact[0],P.impact[1],boom*.3,'255,120,100',e1*(1-boom),0)}
    lab(B[0],B[3],0,'① 낙하 구역 통보 · 항행경보',1,e1*(.45+.55*box));
    lab(Dg[0],Dg[1],.3,'② 엔진 열 · 위성 열점',1,e1*(.45+.55*heat));
    lab(Lw[0],Lw[1],.45,'③ 발사 · 국방부 발표',1,e1*(.45+.55*(fly>0&&fly<1?1:0)));
  }
  // ── 2. 서해에서 배가 빠지면
  if(e2>.03){
    for(var bi=0;bi<boats.length;bi++){var bo=boats[bi],out=gone*(1.1+bo[3]*.9);
      var bxw=bo[0]-out+Math.sin(t/900+bo[2])*.012,byw=bo[1]+Math.cos(t/1100+bo[2])*.012+out*.15;
      var al2=e2*(1-ss((out-1)/.6))*(.55+.45*Math.sin(t/300+bo[2]*5)*.3+.3);if(al2<.02)continue;
      proj(bxw,byw,.02);var gx2=o.x,gy2=o.y;cx.fillStyle='rgba(255,'+Math.round(210-160*gone)+','+Math.round(200-160*gone)+','+al2.toFixed(3)+')';cx.fillRect(gx2-1.7,gy2-1.7,3.4,3.4);
      if(gone>.05){proj(bxw+.12*gone,byw,.02);cx.strokeStyle='rgba(255,90,80,'+(al2*.5).toFixed(3)+')';cx.beginPath();cx.moveTo(gx2,gy2);cx.lineTo(o.x,o.y);cx.stroke()}}
    var Gj=P.jam,jp=.6+.4*Math.sin(t/180);for(var gi=0;gi<90;gi++){var ra=Math.sqrt(Math.random())*.5,th=Math.random()*6.28;proj(Gj[0]+Math.cos(th)*ra,Gj[1]+Math.sin(th)*ra,Math.random()*.1);cx.fillStyle='rgba(255,59,48,'+(e2*Math.random()*.8*jp).toFixed(3)+')';cx.fillRect(o.x,o.y,1.6,1.6)}
    ringAt(Gj[0],Gj[1],.52,'255,59,48',e2*.35*jp,0);
    // 어선 신호 막대 (줄었다 늘었다 — 그림 설명용)
    var mx=land?VA.x+16:VA.x+8, my=VA.y+VA.h-26, mw=Math.min(150,VA.w*.4);
    cx.globalAlpha=e2;cx.fillStyle='rgba(236,238,237,.15)';cx.fillRect(mx,my,mw,3);cx.fillStyle=gone>.4?'#ff3b30':'rgba(236,238,237,.85)';cx.fillRect(mx,my,mw*(1-gone*.75),3);
    cx.font='500 10px "JetBrains Mono",monospace';cx.fillStyle=gone>.4?'#ff5a4e':'rgba(236,238,237,.75)';cx.fillText(gone>.4?'서해 중국 어선 ▼ 평소보다 크게 줄어듦':'서해 중국 어선 · 평소 수준',mx,my-8);cx.globalAlpha=1;
    lab(Gj[0]+.2,Gj[1]+.45,.1,'GPS 교란',1,e2);
  }
  // ── 3. 하늘에 누가 떠 있나
  if(e3>.03){
    [.75,1.5,2.25].forEach(function(R){ringAt(Dz[0],Dz[1],R,'255,59,48',e3*.3,0)});
    cx.strokeStyle='rgba(255,59,48,'+(e3*.9).toFixed(3)+')';cx.lineWidth=1.5;cx.beginPath();proj(Dz[0],Dz[1],0);cx.moveTo(o.x,o.y);proj(Dz[0]+Math.cos(ang)*2.3,Dz[1]+Math.sin(ang)*2.3,0);cx.lineTo(o.x,o.y);cx.stroke();cx.lineWidth=1;
    planes.forEach(function(p,pi){var ph=((t/1000*.06+pi*.37)%1.6)-.8;
      for(var tr2=0;tr2<10;tr2++){var q2=ph-tr2*.025;proj(p[0]+Math.cos(p[2])*q2,p[1]+Math.sin(p[2])*q2,.4);cx.fillStyle='rgba(236,238,237,'+(e3*.25*(1-tr2/10)).toFixed(3)+')';cx.fillRect(o.x-.8,o.y-.8,1.6,1.6)}
      var px2=p[0]+Math.cos(p[2])*ph,py2=p[1]+Math.sin(p[2])*ph,df2=((ang-Math.atan2(py2-Dz[1],px2-Dz[0]))%6.2832+6.2832)%6.2832,hit=Math.exp(-df2*1.1);
      proj(px2,py2,.4);cx.fillStyle='rgba(255,'+Math.round(225-175*hit)+','+Math.round(215-175*hit)+','+(e3*(.4+.6*hit)).toFixed(3)+')';cx.fillRect(o.x-3,o.y-3,6,6);
      if(pi===0)lab(px2,py2,.4,'정찰기',1,e3);if(pi===3)lab(px2,py2,.4,'군용기',0,e3*.8)});
    lab(Dz[0]+.25,Dz[1]+.08,0,'군사분계선',0,e3*.8);
  }
  // ── 4. 먼저 아는 쪽의 움직임: 서울 위로 신호가 솟는다
  if(e4>.03){
    flags.forEach(function(fg,fi){var aa=fg[1]+t/6000,R=.32,fx=Se[0]+Math.cos(aa)*R,fy=Se[1]+Math.sin(aa)*R*.8,fh=fg[2]*rise*(fi<5?1.15:.9)+.05,on=(Math.floor(t/900)%flags.length)===fi;
      proj(fx,fy,0);var x0=o.x,y0=o.y;proj(fx,fy,fh);cx.strokeStyle='rgba(255,59,48,'+(e4*(on?.9:.4)).toFixed(3)+')';cx.beginPath();cx.moveTo(x0,y0);cx.lineTo(o.x,o.y);cx.stroke();
      lab(fx,fy,fh,fg[0],fi<5,e4*rise*(on?1:.6))});
    lab(Se[0],Se[1],.02,'서울',0,e4*.9);
  }
  // ── 5. 막대 이름
  if(m>.4){cx.globalAlpha=(m-.4)/.6;cx.font='600 '+(land?13:12)+'px Pretendard,sans-serif';cx.textAlign='center';
    ['평온','긴장','위기','임박','교전'].forEach(function(n,ci){proj((ci-2)*.95,-.55,0);cx.fillStyle=ci>=2?'#ff5a4e':'rgba(236,238,237,.85)';cx.fillText(n,o.x,o.y+14)});cx.textAlign='start';cx.globalAlpha=1}
  cx.globalCompositeOperation='source-over';

  var ci2=Math.round(pos);if(ci2!==lastCh){lastCh=ci2;rail.forEach(function(r,ri){r.classList.toggle('on',ri===ci2)});chapter.textContent=secs[ci2].dataset.ch}
  if(!reduce)requestAnimationFrame(frame);
}
var lastCh=-1, rail=[].slice.call(document.querySelectorAll('.rail b')), chapter=document.getElementById('chapter');
var pyaw=0,ptilt=0;
if(!reduce)addEventListener('pointermove',function(e){if(e.pointerType==='mouse'){pyaw=(e.clientX/innerWidth-.5)*.2;ptilt=(e.clientY/innerHeight-.5)*.1}},{passive:true});
addEventListener('resize',function(){size();if(reduce)frame(0)});
requestAnimationFrame(frame);

var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('in')})},{threshold:.2});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});

var clock=document.getElementById('clock');
function tick(){var r=300-Math.floor(Date.now()/1000)%300;clock.textContent=('0'+Math.floor(r/60)).slice(-2)+':'+('0'+r%60).slice(-2)}
tick();setInterval(tick,1000);

var words=__H1WORDS__;
var h=document.getElementById('h1'),d=.3;
words.forEach(function(w){if(w==='/'){h.appendChild(document.createElement('br'));return}
  var em=w.charAt(0)==='*', s=document.createElement(em?'em':'span');s.className='w';s.textContent=em?w.slice(1):w;s.style.animationDelay=(d+=.12)+'s';h.appendChild(s);h.appendChild(document.createTextNode(' '))});
})();`;
