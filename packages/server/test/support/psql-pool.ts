/**
 * TEST ONLY. A tiny stand-in for the `pg` Pool that runs queries through the
 * `psql` command line, so PgStore's real SQL can be tested against a real
 * PostgreSQL where the `pg` package can't be installed. CI uses the real `pg`
 * driver instead (see test-store.ts).
 *
 * Each client is one long-running psql session, so transactions behave
 * exactly as they do with the driver.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const MARK = "__TETHERLESS_DONE__";

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

class PsqlClient {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private waiting: ((out: string) => void) | null = null;
  private queue = Promise.resolve();

  constructor(host: string, db: string) {
    this.proc = spawn("sh", ["-c", `psql -X -A -t -h '${host}' -U postgres -d '${db}' -v VERBOSITY=verbose 2>&1`], { stdio: "pipe" });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      const i = this.buffer.indexOf(MARK);
      if (i >= 0 && this.waiting) {
        const out = this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i + MARK.length).replace(/^\n/, "");
        const w = this.waiting;
        this.waiting = null;
        w(out);
      }
    });
  }

  query<R>(text: string, params: unknown[] = []): Promise<{ rows: R[]; rowCount: number | null }> {
    const run = this.queue.then(() => this.run<R>(text, params));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private run<R>(text: string, params: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> {
    const sql = text.replace(/\$(\d+)/g, (_m, n) => literal(params[Number(n) - 1])).trim().replace(/;\s*$/, "");
    const isSelect = /^select\b/i.test(sql);
    const statement = isSelect ? `SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (${sql}) t` : sql;
    return new Promise((resolve, reject) => {
      this.waiting = (out) => {
        const err = /ERROR:\s+([0-9A-Z]{5}): (.*)/.exec(out);
        if (err) return reject(Object.assign(new Error(err[2]), { code: err[1] }));
        if (isSelect) {
          // jsonb output is always one line (json_agg would add line breaks).
          const line = out.split("\n").find((l) => l.startsWith("["));
          try {
            const rows = line ? (JSON.parse(line) as R[]) : [];
            return resolve({ rows, rowCount: rows.length });
          } catch (e) {
            return reject(e);
          }
        }
        const tag = /^(INSERT \d+|UPDATE|DELETE) (\d+)$/m.exec(out);
        resolve({ rows: [], rowCount: tag ? Number(tag[2]) : null });
      };
      if (process.env.PSQL_DEBUG) console.error("SQL>", statement.slice(0, 120).replace(/\s+/g, " "));
      this.proc.stdin.write(`${statement};\n\\echo ${MARK}\n`);
    });
  }

  release() {}
  end() {
    this.proc.stdin.end();
  }
}

export class PsqlPool {
  private readonly host: string;
  private readonly db: string;
  private readonly shared: PsqlClient;
  private readonly all: PsqlClient[] = [];
  constructor(host: string, db: string) {
    this.host = host;
    this.db = db;
    this.shared = this.make();
  }
  private make() {
    const c = new PsqlClient(this.host, this.db);
    this.all.push(c);
    return c;
  }
  query<R>(text: string, params?: unknown[]) {
    return this.shared.query<R>(text, params);
  }
  /** A dedicated session, as pg's pool.connect() gives for transactions. */
  async connect() {
    return this.make();
  }
  async end() {
    for (const c of this.all) c.end();
  }
}
