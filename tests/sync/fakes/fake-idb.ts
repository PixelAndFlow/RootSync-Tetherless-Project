/**
 * In-memory IndexedDB, enough for the sync layer's tests.
 *
 * Deliberately small: it implements only what the DDIL layer uses, so a
 * behaviour the fake does not have is a behaviour the real code cannot rely
 * on either. Swapping in a browser IndexedDB later must not change a test.
 *
 * Transaction semantics that the durability rule depends on:
 *   - writes are buffered until commit, so a rolled-back transaction leaves
 *     nothing behind
 *   - `add` throws on a duplicate key, `put` replaces
 */

import type {
  IDBDatabaseLike,
  IDBFactoryLike,
  IDBIndexLike,
  IDBObjectStoreLike,
  IDBRequestLike,
  IDBTransactionLike,
} from "../../src/sync/stores/idb.ts";

interface Row {
  key: unknown;
  value: unknown;
}

class FakeRequest<T> implements IDBRequestLike<T> {
  onsuccess: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  error: unknown = null;

  private readonly producer: () => T;

  constructor(producer: () => T) {
    this.producer = producer;
  }

  get result(): T {
    return this.producer();
  }

  /** Fired asynchronously, like the real thing. */
  resolve(value: T): void {
    (this as { _value?: T })._value = value;
    queueMicrotask(() => this.onsuccess?.({ target: this }));
  }
}

class FakeIndex implements IDBIndexLike {
  private readonly store: FakeStore;
  private readonly keyPath: string;

  constructor(store: FakeStore, keyPath: string) {
    this.store = store;
    this.keyPath = keyPath;
  }

  getAll(query?: unknown): IDBRequestLike<unknown[]> {
    const rows = [...this.store.rows.values()];
    const filtered =
      query === undefined
        ? rows
        : rows.filter((r) => (r.value as Record<string, unknown>)[this.keyPath] === query);
    return resolved(filtered.map((r) => r.value));
  }

  openCursor(): IDBRequestLike<unknown> {
    return resolved(null);
  }
}

class FakeStore implements IDBObjectStoreLike {
  /** key -> Row */
  readonly rows = new Map<unknown, Row>();
  seq = 0;

  readonly name: string;
  readonly keyPath: string | undefined;
  readonly autoIncrement: boolean;

  constructor(name: string, keyPath: string | undefined, autoIncrement: boolean) {
    this.name = name;
    this.keyPath = keyPath;
    this.autoIncrement = autoIncrement;
  }

  private keyOf(value: unknown, explicit?: unknown): unknown {
    if (this.keyPath !== undefined && explicit !== undefined) {
      throw new DOMException("The object store uses in-line keys and the key parameter was provided.", "DataError");
    }
    if (explicit !== undefined) return explicit;
    if (this.keyPath) return (value as Record<string, unknown>)[this.keyPath];
    return undefined;
  }

  put(value: unknown, key?: unknown): IDBRequestLike<unknown> {
    const k = this.keyOf(value, key) ?? ++this.seq;
    this.rows.set(k, { key: k, value: structuredClone(value) });
    return resolved(k);
  }

  add(value: unknown, key?: unknown): IDBRequestLike<unknown> {
    const k = this.keyOf(value, key) ?? ++this.seq;
    if (this.rows.has(k)) {
      const r = new FakeRequest<unknown>(() => undefined);
      queueMicrotask(() => {
        r.error = new Error(`ConstraintError: key ${String(k)} already exists`);
        r.onerror?.({ target: r });
      });
      return r;
    }
    this.rows.set(k, { key: k, value: structuredClone(value) });
    return resolved(k);
  }

  get(key: unknown): IDBRequestLike<unknown> {
    return resolved(this.rows.get(key)?.value);
  }

  getAll(): IDBRequestLike<unknown[]> {
    return resolved([...this.rows.values()].map((r) => structuredClone(r.value)));
  }

  delete(key: unknown): IDBRequestLike<unknown> {
    this.rows.delete(key);
    return resolved(undefined);
  }

  openCursor(): IDBRequestLike<unknown> {
    return resolved(null);
  }

  index(name: string): IDBIndexLike {
    return new FakeIndex(this, name);
  }
}

class FakeTransaction implements IDBTransactionLike {
  oncomplete: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onabort: ((ev: unknown) => void) | null = null;
  error: unknown = null;

  /** Buffered writes, applied on commit. */
  private readonly buffers = new Map<string, Map<unknown, { key: unknown; value: unknown }>>();
  private readonly deletions = new Map<string, Set<unknown>>();
  private aborted = false;

  private readonly db: FakeDatabase;
  private readonly names: string[];
  readonly mode: string;

  constructor(db: FakeDatabase, names: string[], mode = "readonly") {
    this.db = db;
    this.names = names;
    this.mode = mode;
    for (const n of names) {
      this.buffers.set(n, new Map());
      this.deletions.set(n, new Set());
    }
  }

  objectStore(name: string): IDBObjectStoreLike {
    if (!this.names.includes(name)) {
      throw new Error(`NotFoundError: store ${name} is not in this transaction`);
    }
    const base = this.db.store(name);
    const tx = this;
    // A store facade that reads through to the committed data plus this
    // transaction's own buffered writes.
    return {
      name,
      put(value: unknown, key?: unknown) {
        if (tx.mode === "readonly") {
          throw new DOMException("The transaction is read-only.", "ReadOnlyError");
        }
        if (base.keyPath !== undefined && key !== undefined) {
          throw new DOMException("The object store uses in-line keys and the key parameter was provided.", "DataError");
        }
        const k =
          key ??
          (base.keyPath
            ? ((value as Record<string, unknown>)[base.keyPath] as unknown)
            : undefined);
        const finalKey = k ?? ++(base.seq);
        tx.buffers.get(name)!.set(finalKey, { key: finalKey, value: structuredClone(value) });
        tx.deletions.get(name)?.delete(finalKey);
        return resolved(finalKey);
      },
      add(value: unknown, key?: unknown) {
        if (tx.mode === "readonly") {
          throw new DOMException("The transaction is read-only.", "ReadOnlyError");
        }
        if (base.keyPath !== undefined && key !== undefined) {
          throw new DOMException("The object store uses in-line keys and the key parameter was provided.", "DataError");
        }
        const kp = base.keyPath;
        const k = key ?? (kp ? (value as Record<string, unknown>)[kp] : undefined);
        const finalKey = k ?? ++base.seq;
        const committed = base.rows.has(finalKey);
        const buffered = tx.buffers.get(name)!.has(finalKey);
        if (committed || buffered) {
          const r = new FakeRequest<unknown>(() => undefined);
          queueMicrotask(() => {
            r.error = new Error(`ConstraintError: key ${String(finalKey)} already exists`);
            r.onerror?.({ target: r });
          });
          return r;
        }
        tx.buffers.get(name)!.set(finalKey, { key: finalKey, value: structuredClone(value) });
        return resolved(finalKey);
      },
      get(key: unknown) {
        const buffered = tx.buffers.get(name)!.get(key);
        if (buffered) return resolved(structuredClone(buffered.value));
        if (tx.deletions.get(name)?.has(key)) return resolved(undefined);
        return resolved(base.rows.get(key)?.value);
      },
      getAll() {
        const out = new Map<unknown, unknown>();
        for (const [k, r] of base.rows) out.set(k, structuredClone(r.value));
        for (const k of tx.deletions.get(name) ?? []) out.delete(k);
        for (const [k, r] of tx.buffers.get(name)!) out.set(k, structuredClone(r.value));
        return resolved([...out.values()]);
      },
      delete(key: unknown) {
        if (tx.mode === "readonly") {
          throw new DOMException("The transaction is read-only.", "ReadOnlyError");
        }
        tx.buffers.get(name)!.delete(key);
        tx.deletions.get(name)!.add(key);
        return resolved(undefined);
      },
      openCursor() {
        return resolved(null);
      },
      index(n: string) {
        return base.index(n);
      },
    } as IDBObjectStoreLike;
  }

  abort(): void {
    this.aborted = true;
    this.buffers.clear();
    this.deletions.clear();
    queueMicrotask(() => this.onabort?.({ target: this }));
  }

  /** Test hook: commit or abort explicitly. */
  commit(): void {
    if (this.aborted) return;
    for (const [name, buf] of this.buffers) {
      const store = this.db.store(name);
      for (const key of this.deletions.get(name) ?? []) store.rows.delete(key);
      for (const [k, r] of buf) store.rows.set(k, r);
    }
    this.buffers.clear();
    this.deletions.clear();
    queueMicrotask(() => this.oncomplete?.({ target: this }));
  }
}

class FakeDatabase implements IDBDatabaseLike {
  readonly stores = new Map<string, FakeStore>();
  onversionchange: ((ev: unknown) => void) | null = null;

  readonly name: string;
  readonly version: number;

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  get objectStoreNames() {
    return {
      contains: (n: string) => this.stores.has(n),
    };
  }

  createObjectStore(
    name: string,
    options?: { keyPath?: string; autoIncrement?: boolean },
  ): IDBObjectStoreLike {
    const s = new FakeStore(
      name,
      options?.keyPath,
      Boolean((options as { autoIncrement?: boolean } | undefined)?.autoIncrement),
    );
    this.stores.set(name, s);
    return s;
  }

  store(name: string): FakeStore {
    const s = this.stores.get(name);
    if (!s) throw new Error(`no such store: ${name}`);
    return s;
  }

  transaction(names: string[], mode = "readonly"): IDBTransactionLike {
    const t = new FakeTransaction(this, names, mode);
    // The real API auto-commits when the microtask queue drains. Tests that
    // need to assert rollback call abort() first.
    queueMicrotask(() => {
      if (!(t as unknown as { aborted: boolean }).aborted) t.commit();
    });
    return t;
  }

  close(): void {}
}

export class FakeIDBFactory implements IDBFactoryLike {
  private readonly dbs = new Map<string, FakeDatabase>();

  open(name: string, version = 1) {
    let db = this.dbs.get(name);
    const isNew = !db;
    if (!db) {
      db = new FakeDatabase(name, version);
      this.dbs.set(name, db);
    }
    const target = db;
    const req = {
      get result() {
        return target;
      },
      error: null as unknown,
      onsuccess: null as ((ev: unknown) => void) | null,
      onerror: null as ((ev: unknown) => void) | null,
      onupgradeneeded: null as ((ev: unknown) => void) | null,
      onblocked: null as ((ev: unknown) => void) | null,
    };
    queueMicrotask(() => {
      if (isNew) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    });
    return req as unknown as ReturnType<IDBFactoryLike["open"]> & {
      onupgradeneeded: ((ev: unknown) => void) | null;
    };
  }

  deleteDatabase(name: string): unknown {
    this.dbs.delete(name);
    return undefined;
  }
}

function resolved<T>(value: T): IDBRequestLike<T> {
  const r = new FakeRequest<T>(() => value);
  queueMicrotask(() => r.onsuccess?.({ target: r }));
  return r;
}
