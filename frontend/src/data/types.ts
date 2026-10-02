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
  /** 终态集合：进入其中任意一个即闭环，互斥不可再流转。不填时退化为「最后一个状态」。 */
  terminalStates?: string[]
  /** 命中即计入运营异常量的状态（如巡护任务取消）。不填时沿用动作往回走判定。 */
  abnormalStates?: string[]
  /** 处置台账归属人取自该行的哪个字段（巡护任务记在巡护员名下，兼容历史归属）。 */
  ownerField?: string
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

/** 处置台账：每一次状态流转都留一份，跨模块汇总。 */
export type LedgerEntry = {
  id: number
  moduleKey: string
  moduleName: string
  rowId: number
  bizNo: string
  action: string
  fromStatus: string
  toStatus: string
  owner: string
  operator: string
  abnormal: boolean
  createdAt: string
}
