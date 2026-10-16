// In-memory stand-in for Cloudflare D1 built on node:sqlite, loaded with the real migration file.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATION = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

type Row = Record<string, unknown>;

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.stmt().get(...(this.params as never[])) as Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Row>() {
    return { results: this.stmt().all(...(this.params as never[])) as T[], success: true, meta: {} };
  }

  async run() {
    const r = this.stmt().run(...(this.params as never[]));
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function memoryD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(MIGRATION);
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}
