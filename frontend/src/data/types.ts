/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  // 终态清单：命中后待办清零，且不允许再流转（取消与完成只能落一个终态）。
  // 不配置时沿用旧口径，取状态列表最后一个，避免老模块行为被改动。
  terminalStatuses?: string[]
  // 异常口径：状态命中即计异常，与历史数据里的 abnormal 标志取「或」，兼容归属巡护员的旧记录。
  abnormalStatuses?: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
