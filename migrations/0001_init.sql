-- Korea Early Warning: D1 스키마. 문서형(JSON) 저장 + 조회용 인덱스 컬럼
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  event_at INTEGER,
  doc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signals_detected ON signals(detected_at);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  first_detected_at INTEGER NOT NULL,
  alerted_at INTEGER,
  doc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_detected ON events(first_detected_at);

CREATE TABLE IF NOT EXISTS alerts (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  doc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_sent ON alerts(sent_at);

CREATE TABLE IF NOT EXISTS health (source TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notes (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, doc TEXT NOT NULL);
