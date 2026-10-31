-- D1 무료 한도(하루 읽기 500만 행) 절약용 인덱스 (2026-11-01)
-- signals: 'event_at >= ?' 범위 조회 (미리 감지된 미래 시각 신호 — 발사 예고 항행경보 등). 없으면 이 조건이 표 전체를 훑는다.
CREATE INDEX IF NOT EXISTS idx_signals_event ON signals(event_at);
-- notes: 'at >= ? ORDER BY at DESC LIMIT 50' 이 표 전체를 훑지 않게
CREATE INDEX IF NOT EXISTS idx_notes_at ON notes(at);
