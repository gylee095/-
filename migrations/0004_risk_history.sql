-- 판정 기록 (2026-11-01): 자동 판정(단계·30일 확률·영역 수준)을 하루 요약과 시간별 순간으로 영구 보관한다.
-- 보관 기간 제한 없음 (하루 25줄 남짓). 지난 기록 중 오늘이 어디쯤인지 보는 기준점이 된다.
CREATE TABLE IF NOT EXISTS risk_daily (day TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS risk_hourly (at INTEGER PRIMARY KEY, doc TEXT NOT NULL);
