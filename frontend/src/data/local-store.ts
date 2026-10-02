import { SEED_ROWS } from './seed'
import type { EntryRow, LedgerEntry } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// v2 把业务数据和处置台账放进同一个 key，保证一次流转要么整体落盘、要么整体不动。
const STORAGE_KEY = 'forest-fire-patrol:data:v2'
// 旧版 key：首次升级到 v2 时把浏览器里已有的改动迁过来，历史数据（含巡护员归属）原样保留。
const LEGACY_ENTRIES_KEY = 'forest-fire-patrol:entries'

type PersistShape = {
  entries: Record<string, EntryRow[]>
  ledger: LedgerEntry[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedData(): PersistShape {
  return { entries: clone(SEED_ROWS), ledger: [] }
}

function readStorage(): PersistShape {
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedData()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistShape
      return {
        entries: { ...clone(SEED_ROWS), ...(parsed.entries ?? {}) },
        ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
      }
    } catch {
      // 落盘内容损坏时回到示例数据，避免把坏数据带进后续流转。
      return seedData()
    }
  }
  // 首次升级：沿用旧 key 里已经改动过的业务数据，台账从零开始累计。
  const legacy = window.localStorage.getItem(LEGACY_ENTRIES_KEY)
  if (legacy) {
    try {
      const entries = { ...clone(SEED_ROWS), ...(JSON.parse(legacy) as Record<string, EntryRow[]>) }
      return { entries, ledger: [] }
    } catch {
      return seedData()
    }
  }
  return seedData()
}

let cache: PersistShape | null = null

function data(): PersistShape {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function allRows(): Record<string, EntryRow[]> {
  return data().entries
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function listLedger(): LedgerEntry[] {
  return data().ledger
}

// 事务落盘：先整体写入 localStorage，写成功后才提交内存缓存。
// 任一步失败都抛出，调用方据此让列表、详情、待办与台账一起回退。
export function commit(next: PersistShape): void {
  const snapshot = cache
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  cache = next
  // 理论上不会走到；走到也说明内存没有被半截更新污染，恢复快照即可。
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.getItem(STORAGE_KEY)
    } catch {
      cache = snapshot
      throw new Error('数据落盘后校验失败，已回退')
    }
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  const next = { ...data(), entries: { ...data().entries, [key]: rows } }
  commit(next)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
