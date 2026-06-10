// 오프라인 쓰기 아웃박스 저장소(D2 — web-stack.md §6 / 설계서 §4.3).
// 인터페이스 + 두 구현(브라우저=IndexedDB, 테스트/SSR=메모리). 큐 로직은 store에 의존하지 않아 테스트 가능.

export type OutboxEntry = {
  id: string
  kind: string // 'wish.setPriority' | 'place.delete' | 'place.restore' | 'place.save'
  payload: unknown // 직렬화 가능한 op 인자
  createdAt: number // 정렬용(주입 가능한 시계로 결정론 테스트)
  dedupeKey?: string // 있으면 같은 키의 기존 엔트리를 대체(동일행 재편집 유실 방지 — '유실 0')
}

export interface OutboxStore {
  getAll(): Promise<OutboxEntry[]>
  add(entry: OutboxEntry): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

/** 메모리 store — 테스트/SSR/IndexedDB 미지원 폴백. */
export function createMemoryStore(): OutboxStore {
  let items: OutboxEntry[] = []
  return {
    async getAll() {
      return items.slice()
    },
    async add(e) {
      items.push(e)
    },
    async remove(id) {
      items = items.filter((x) => x.id !== id)
    },
    async clear() {
      items = []
    },
  }
}

/** IndexedDB store — 브라우저에서 새로고침/앱 종료에도 살아남는 durable 아웃박스. */
export function createIdbStore(dbName = 'love_place', storeName = 'outbox'): OutboxStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open 실패'))
    })
  }
  async function run<T>(mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = make(db.transaction(storeName, mode).objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB tx 실패'))
      })
    } finally {
      db.close()
    }
  }
  return {
    async getAll() {
      return (await run('readonly', (s) => s.getAll())) as OutboxEntry[]
    },
    async add(e) {
      await run('readwrite', (s) => s.put(e))
    },
    async remove(id) {
      await run('readwrite', (s) => s.delete(id))
    },
    async clear() {
      await run('readwrite', (s) => s.clear())
    },
  }
}

/** 브라우저면 IndexedDB, 아니면(jsdom·SSR) 메모리. */
export function createDefaultOutboxStore(): OutboxStore {
  if (typeof indexedDB !== 'undefined') {
    try {
      return createIdbStore()
    } catch {
      return createMemoryStore()
    }
  }
  return createMemoryStore()
}
