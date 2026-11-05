// 시험 서버용 읽기 전용 데이터베이스 (2026-11-06): 시험 서버는 본 서버 데이터(kew)를 그대로 읽어 새 판정 규칙을 돌려 본다.
// 쓰기(INSERT·UPDATE·DELETE·CREATE …)는 여기서 모두 버린다 — 실험 코드에 실수가 있어도 본 서버 데이터는 바뀔 수 없다.
const READ = /^\s*(SELECT|WITH)\b/i;
const NOOP = Symbol("noop");

export function isReadSql(sql: string): boolean {
  return READ.test(sql);
}

function noopStatement(): D1PreparedStatement {
  const s = {
    [NOOP]: true,
    bind: () => s,
    run: async () => ({ success: true, results: [], meta: { changes: 0, rows_read: 0, rows_written: 0 } }),
    all: async () => ({ success: true, results: [], meta: { rows_read: 0, rows_written: 0 } }),
    first: async () => null,
    raw: async () => [],
  };
  return s as unknown as D1PreparedStatement;
}

export function readOnlyD1(db: D1Database): D1Database {
  return {
    prepare: (sql: string) => (isReadSql(sql) ? db.prepare(sql) : noopStatement()),
    batch: async (stmts: D1PreparedStatement[]) => {
      const real = stmts.filter((s) => !(s as unknown as Record<symbol, boolean>)[NOOP]);
      const done = real.length ? await db.batch(real) : [];
      let i = 0;
      return Promise.all(stmts.map(async (s) => ((s as unknown as Record<symbol, boolean>)[NOOP] ? s.run() : done[i++])));
    },
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => readOnlyD1(db),
  } as unknown as D1Database;
}
