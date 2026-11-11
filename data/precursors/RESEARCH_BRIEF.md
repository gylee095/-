# 전쟁 전조 사례 조사 지침 (조사 담당 공통)

목적: 실제 전쟁·공격 직전에 **그 당시 공개적으로** 보였던 전조를 사례별로 코딩해, 한반도 조기경보의 가중치 근거로 쓴다.
결과는 가중치(전쟁 사례에서 보인 비율 ÷ 전쟁 안 난 위기에서 보인 비율) 계산에 그대로 들어가므로 **정확성이 양보다 중요**하다.

## 읽을 것
- `data/precursors/codebook.json` — 가설 33개의 정의(`def`)와 세지 않는 것(`not`). 이 정의대로만 코딩한다.

## 사례마다 할 일
1. 개시일(전쟁·공격) 또는 위기 창(전쟁 안 난 사례)을 출처로 확인한다. 기억에 의존하지 않는다 — WebSearch/WebFetch 로 확인한다.
2. 가설 33개 **전부**에 대해 status 를 정한다:
   - `yes`: 창(개시 90일 전 ~ 개시 전날, 전쟁 안 난 사례는 위기 창) 안에 정의에 맞는 일이 있었다. `first` = 처음 분명히 나타난 날짜, `lead` = 개시일까지 남은 날 수(전쟁 안 난 사례는 null).
   - `no`: 조사해 보니 없었다고 볼 **적극적 근거**가 있다(예: "대사관들은 공격 당일까지 정상 운영", "시장 반응 없었다는 보도", "협상 자체가 없었다"). 개시 당일이나 그 뒤에 처음 나타난 것도 `no` (what 에 그렇게 적는다).
   - `unknown`: 찾지 못했다. **찾지 못한 것을 no 로 적지 않는다.**
3. `public_then`: 그 일이 개시 **전에** 공개 보도·발표로 알 수 있었으면 true, 전쟁 뒤에야 밝혀졌으면 false. (공개 정보로 잡을 수 있었는지가 핵심이다.)
4. `source`: 그 날짜·사실을 뒷받침하는 URL 1개(당시 보도, 정부 문서, 출처 달린 위키백과 문단 등). 출처 없는 yes/no 는 쓰지 않는다 — 그럴 땐 unknown.
5. `confidence`: high(날짜·사실 모두 1차/복수 출처) · med · low.
6. `what`: 한국어 120자 이내, 누가 무엇을 했는지와 날짜.
7. 출처끼리 날짜가 다르면 **늦은 날짜**를 쓴다(선행일을 부풀리지 않게).
8. `surprise`: 공개 전조가 거의 없이 시작된 기습이면 true.

## 조사하지 않는 사례 (봉인)
`india-pakistan-2025`, `thailand-cambodia-2025`, `taiwan-2022` — 규칙을 고정한 뒤 한 번만 여는 시험용이다. 조사·언급하지 않는다.

## 출력
사례마다 파일 하나: `/home/user/-/data/precursors/raw/<case-id>.json`

```json
{
  "id": "ukraine-2022",
  "name": "러시아 → 우크라이나 침공",
  "outcome": "war",              // war | attack | no_war
  "onset": "2022-02-24",         // 전쟁 안 난 사례는 null
  "window": ["2021-11-26", "2022-02-23"],   // 코딩한 창
  "attacker": "러시아", "target": "우크라이나",
  "kind": "interstate",          // interstate | us_strike | intrastate | korean_clash 등
  "surprise": false,
  "summary": "한국어 2~3문장: 무슨 일이었고 전조가 어땠나",
  "signals": [
    { "h": "g_evac_order", "status": "yes", "first": "2022-01-23", "lead": 32, "public_then": true,
      "what": "미국: 키이우 대사관 가족 철수 명령", "source": "https://...", "confidence": "high" }
    // ... 가설 33개 전부 (unknown 은 first/lead/source 없이 status 와 짧은 what 만)
  ],
  "missed": "코드북에 없지만 이 사례에서 눈에 띈 전조가 있으면 한국어로 (없으면 빈 문자열)",
  "retrieved": "2026-11-11"
}
```

- JSON 은 주석 없이 유효해야 한다. 쓴 뒤 `python3 -c "import json;json.load(open(PATH))"` 로 확인한다.
- 저장소의 다른 파일은 건드리지 않는다. git 명령(add/commit/push)을 쓰지 않는다.
- 사례당 웹 검색 10~20회 안에서 끝낸다. 한 가설에 매달리지 말고 unknown 으로 두고 넘어간다.
- 마지막 답변은 150단어 이내: 사례별 한 줄(개시일, yes 개수, 가장 이른·가장 강한 전조)과 확신이 낮은 항목.

## 조사 방법 (2차, 2026-11-11) — 검색 도구 없이
1차 조사에서 검색 한도가 바닥났고 WebFetch 는 이 환경에서 막혀 있다. 그래서 **Bash 로 도우미를 쓴다** (저장소 루트 `/home/user/-` 에서):

```
node scripts/research-wiki.mjs search "<검색어>" [en|ko]            # 위키백과 문서 찾기
node scripts/research-wiki.mjs get "<제목>" [en|ko]                 # 절 목록 (본문은 캐시에 저장)
node scripts/research-wiki.mjs grep "<제목>" "<정규식>" [en|ko]     # 맞는 문단만 + 그 절의 주소
node scripts/research-wiki.mjs sec "<제목>" "<절 이름 일부>" [en|ko] # 절 전체
node scripts/research-wiki.mjs refs "<제목>" "<정규식>" [en|ko]     # 문서의 외부 출처 링크
node scripts/research-wiki.mjs url "<https://기사 주소>" "<정규식>"  # 기사 본문에서 맞는 문단만
```

- 한 사례에 문서 2~5개(사건 문서, 'Prelude/Timeline/Background' 문서, 관련 위기 문서)를 `get` 으로 훑고, 가설 묶음별 정규식으로 `grep` 한다. 예: `embass|evacuat|depart|travel advis|nationals`, `mobili[sz]|reserv|call-up|leave cancel`, `troop|buildup|massing|deploy`, `field hospital|blood|fuel|ammunition`, `airspace|NOTAM|flights? (suspend|cancel)|airline`, `jamm|GPS|cyber`, `shell|skirmish|clash|incursion`, `alert|readiness|DEFCON|martial`, `stock|market|currency|rouble|won|oil|bond|CDS`, `ultimatum|deadline|recall|sever|authori[sz]`, `talks|negotiat`, `warn|imminent|intelligence`, `speech|vow|threat|retaliat`, `panic|hoard|queue|shelter`.
- `source` 는 도우미가 보여 준 **위키백과 절 주소**(…/wiki/제목#절)나, `refs`·`url` 로 직접 열어 확인한 기사 주소를 쓴다. 열어 보지 않은 주소는 쓰지 않는다.
- `url` 로 열리는 곳(확인됨): bbc.com, aljazeera.com, npr.org, edition.cnn.com, cbsnews.com, pbs.org, voanews.com, rferl.org, en.yna.co.kr, koreaherald.com, koreatimes.co.kr, nknews.org, jpost.com, haaretz.com, kyivindependent.com, themoscowtimes.com, thediplomat.com, scmp.com, thehindu.com, indianexpress.com, cfr.org, csis.org, carnegieendowment.org, usip.org, armscontrol.org, history.state.gov, nsarchive.gwu.edu, wilsoncenter.org. 403/401 이 나오는 곳은 다시 시도하지 않는다(차단 우회 금지).
- WebSearch 는 한 번만 시험해 보고, 한도 오류가 나면 더 부르지 않는다. WebFetch 는 쓰지 않는다.
- 이미 `raw/<사례>.json` 이 있으면 **읽고 이어서 채운다**: 확인된 yes/no 는 그대로 두고(틀린 것이 보이면 고치고 `what` 에 이유), unknown 을 줄인다. `what` 에 '미검증'이라고 적힌 단서는 확인되기 전에는 unknown 이다.
- 위키백과에 '없었다'는 서술이 있으면 `no` 의 근거가 된다(예: "markets were calm", "embassies remained open", "achieved complete surprise"). 서술이 없으면 unknown.
