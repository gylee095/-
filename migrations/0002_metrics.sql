-- 징후 관측값 시계열 (indicator 별 기준선 비교값). 기준선 자체는 kv 'baselines' 에 JSON 으로 둔다.
CREATE TABLE IF NOT EXISTS metrics (
  indicator TEXT NOT NULL,
  at INTEGER NOT NULL,
  value REAL NOT NULL,
  z REAL,
  state TEXT,
  doc TEXT NOT NULL,
  PRIMARY KEY (indicator, at)
);
CREATE INDEX IF NOT EXISTS idx_metrics_at ON metrics(at);
