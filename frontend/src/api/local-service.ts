import { useSessionStore } from '@/stores/session'

import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, commit, listLedger, listRows, resetRows } from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  LedgerEntry,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
// 仅用于没有显式配置 abnormalStates 的模块，保持历史口径不变。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

// 终态集合：模块显式配置了就用配置（如巡护的「已完成/已取消」互斥），否则退化为最后一个状态。
function terminalStates(meta: ModuleMeta): string[] {
  return meta.terminalStates ?? [meta.statuses[meta.statuses.length - 1]]
}

// 是否仍待处理：凡未进入任何终态都算待办。由状态直接派生，历史数据也能被自动校正。
export function isPending(meta: ModuleMeta, row: EntryRow): boolean {
  return !terminalStates(meta).includes(String(row.status))
}

// 是否算运营异常：配置了 abnormalStates 的模块按状态判定（巡护取消即异常、完成不算）；
// 其余模块沿用「往回走动作」的旧口径。
export function isAbnormal(meta: ModuleMeta, row: EntryRow): boolean {
  if (meta.abnormalStates) {
    return meta.abnormalStates.includes(String(row.status))
  }
  return Boolean(row.abnormal)
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

// 当前还能对这条记录执行的动作：已处于目标态的去重掉，进入终态后不再放行任何流转。
export function availableActions(meta: ModuleMeta, row: EntryRow): string[] {
  const current = String(row.status)
  if (terminalStates(meta).includes(current)) {
    return []
  }
  return meta.actions.filter((action) => meta.actionTargets[action] !== current)
}

// 工作台「待办」：未闭环的记录，可只看一个模块，也可跨模块汇总。
export function listPending(moduleKey?: string): { meta: ModuleMeta; row: EntryRow }[] {
  const keys = moduleKey ? [moduleKey] : [...MODULE_BY_KEY.keys()]
  return keys.flatMap((key) => {
    const meta = moduleMeta(key)
    return listRows(key)
      .filter((row) => isPending(meta, row))
      .map((row) => ({ meta, row }))
  })
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  // 取消与完成并发时只允许一个终态：已在终态（无论哪个）就拒绝再流转。
  if (terminalStates(meta).includes(current)) {
    return {
      ok: false,
      message: `${meta.entity}已是终态「${current}」，不能再${action}为「${target}」`,
    }
  }

  const abnormal = meta.abnormalStates
    ? meta.abnormalStates.includes(target)
    : NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: !terminalStates(meta).includes(target),
    abnormal,
  }

  const nextRows = [...rows]
  nextRows[index] = updated

  const operator = useSessionStore().operator
  const owner = meta.ownerField ? String(updated[meta.ownerField] ?? '—') || '—' : '—'
  const bizNo = String(updated[meta.fields[0]] ?? id)
  const record: LedgerEntry = {
    id: Math.max(0, ...listLedger().map((item) => item.id)) + 1,
    moduleKey: meta.key,
    moduleName: meta.name,
    rowId: id,
    bizNo,
    action,
    fromStatus: current,
    toStatus: target,
    owner,
    operator,
    abnormal,
    createdAt: nowText(),
  }

  // 事务提交：业务数据与处置台账一起落盘。失败时内存缓存不会被改动，
  // 列表、详情、待办读到的仍是旧状态，天然整体回退。
  try {
    commit({
      entries: { ...allRows(), [key]: nextRows },
      ledger: [...listLedger(), record],
    })
  } catch (error) {
    return {
      ok: false,
      message: `${meta.entity}${action}保存失败，列表、详情与待办已回退：${
        error instanceof Error ? error.message : '未知错误'
      }`,
    }
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 处置台账：可按模块或单条记录过滤；巡护取消等异常动作会带上 abnormal 标记。
export function listLedgerEntries(filter?: {
  moduleKey?: string
  rowId?: number
}): LedgerEntry[] {
  return listLedger()
    .filter(
      (item) =>
        (!filter?.moduleKey || item.moduleKey === filter.moduleKey) &&
        (filter?.rowId === undefined || item.rowId === filter.rowId),
    )
    .sort((a, b) => b.id - a.id)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => isPending(meta, row)).length,
      abnormal: entries.filter((row) => isAbnormal(meta, row)).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

function nowText(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
