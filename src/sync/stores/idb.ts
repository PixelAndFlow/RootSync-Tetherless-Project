/**
 * IndexedDB access.
 *
 * The factory is injected rather than imported so the same code runs on
 * browser IndexedDB in the app and on a fake in Node tests, with no change
 * to anything that depends on it.
 */

export interface IDBRequestLike<T> {
  readonly result: T;
  readonly error: unknown;
  onsuccess: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface IDBTransactionLike {
  error: unknown;
  oncomplete: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onabort: ((ev: unknown) => void) | null;
  objectStore(name: string): IDBObjectStoreLike;
  abort(): void;
}

export interface IDBObjectStoreLike {
  put(value: unknown, key?: unknown): IDBRequestLike<unknown>;
  add(value: unknown, key?: unknown): IDBRequestLike<unknown>;
  get(key: unknown): IDBRequestLike<any>;
  getAll(): IDBRequestLike<any[]>;
  delete(key: unknown): IDBRequestLike<unknown>;
  openCursor(): IDBRequestLike<unknown>;
  index(name: string): IDBIndexLike;
}

export interface IDBIndexLike {
  getAll(query?: unknown): IDBRequestLike<any[]>;
  openCursor(query?: unknown): IDBRequestLike<unknown>;
}

export interface IDBDatabaseLike {
  readonly name: string;
  readonly version: number;
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options?: { keyPath?: string }): IDBObjectStoreLike;
  transaction(names: string[], mode?: string): IDBTransactionLike;
  close(): void;
  onversionchange: ((ev: unknown) => void) | null;
}

export interface IDBFactoryLike {
  open(name: string, version?: number): {
    result: IDBDatabaseLike;
    error: unknown;
    onsuccess: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onupgradeneeded: ((ev: unknown) => void) | null;
    onblocked: ((ev: unknown) => void) | null;
  };
  deleteDatabase(name: string): unknown;
}

/** Wraps a request in a promise. */
export function req<T>(r: IDBRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Wraps a transaction in a promise that resolves when the transaction
 * COMMITS, not when the last request succeeds. This is the difference
 * between "the write was queued" and "the write is durable", and the
 * durability rule in the PRD depends on it.
 */
export function tx(t: IDBTransactionLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Walk a cursor, awaiting the callback for each record.
 * Used where a plain getAll() would be too large to hold in memory.
 */
export function cursorEach<T>(
  r: IDBRequestLike<unknown>,
  each: (value: T) => void | Promise<void>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    r.onsuccess = () => {
      const c = r.result as { value: T; continue(): void } | null;
      if (!c) return resolve();
      Promise.resolve(each(c.value)).then(
        () => c.continue(),
        reject,
      );
    };
    r.onerror = () => reject(r.error ?? new Error("cursor failed"));
  });
}
