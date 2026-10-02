import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
// 取消/中止代表任务没有按计划走完，同样计入异常，处置台账（看板异常量）要多出这一份。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚', '取消', '中止']

// 终态：模块显式配置了 terminalStatuses 就按配置走，否则沿用旧口径取状态列表最后一个。
function terminalStatuses(meta: ModuleMeta): string[] {
  return meta.terminalStatuses ?? meta.statuses.slice(-1)
}

// 异常判定：动作命中负向动词，或状态落在模块声明的异常状态上。
function isAbnormalResult(meta: ModuleMeta, action: string, status: string): boolean {
  const byAction = NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  const byStatus = meta.abnormalStatuses?.includes(status) ?? false
  return byAction || byStatus
}

// 台账口径：历史记录的 abnormal 标志可能缺失，但状态已经是取消/中止，照样要计入异常，
// 这样归属到旧巡护员名下的历史数据也能被统计到，不依赖补数据。
function isAbnormalRow(meta: ModuleMeta, row: EntryRow): boolean {
  return Boolean(row.abnormal) || (meta.abnormalStatuses?.includes(String(row.status)) ?? false)
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
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
  const finals = terminalStatuses(meta)
  if (finals.includes(current)) {
    // 取消与完成并发时只允许一个终态：已落终态的任务不能再被另一个终态覆盖。
    return { ok: false, message: `${meta.entity}已是终态「${current}」，不能再执行「${action}」` }
  }
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: !finals.includes(target),
    abnormal: isAbnormalResult(meta, action, target),
  }
  const next = [...rows]
  next[index] = updated
  try {
    saveRows(key, next)
  } catch {
    // 保存失败不动缓存：列表、详情和待办继续读到旧数据，整单回退。
    return { ok: false, message: `${meta.entity}${action}保存失败，数据已回退，请重试` }
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
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
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => isAbnormalRow(meta, row)).length,
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
