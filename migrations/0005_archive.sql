-- 영구 기록 (2026-11-06): 원자료(metrics·events)는 30일 뒤 지우지만, 지우기 전에
--  · 지표마다 하루 요약(한국 날짜 기준 표본 수·평균·최저·최고·가장 큰 z)을 metrics_daily 에,
--  · 사건(도발·발사 등) 문서를 events_archive 에 옮겨 둔다. "이번 발사 뒤 반응이 지난 발사들보다 큰가" 같은 비교의 재료.
-- 크기: 지표 약 40개 × 하루 1줄 + 사건 하루 몇 건 — 무료 저장소(5GB)에 수십 년 넉넉하다.
CREATE TABLE IF NOT EXISTS metrics_daily (
  day TEXT NOT NULL,
  indicator TEXT NOT NULL,
  n INTEGER NOT NULL,
  avg REAL NOT NULL,
  min REAL NOT NULL,
  max REAL NOT NULL,
  zmax REAL,
  PRIMARY KEY (day, indicator)
);
CREATE TABLE IF NOT EXISTS events_archive (id TEXT PRIMARY KEY, first_detected_at INTEGER NOT NULL, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_archive_at ON events_archive(first_detected_at);
