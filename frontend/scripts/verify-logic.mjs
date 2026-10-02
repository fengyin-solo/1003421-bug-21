// 数据层逻辑验证：mock localStorage 与 pinia，直接驱动 local-service（纯 JS 运行器）。
import { build } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'verify-'))

// 预置「旧版 key」数据，模拟浏览器里已经有历史改动的场景。
const legacy = {
  patrol: [
    {
      id: 1, status: '待执行', pending: true, abnormal: false,
      任务编号: 'PATR-0001', 巡护区域: '一号林班', 巡护路线: '东线', 巡护员: '张三',
    },
    {
      id: 2, status: '已完成', pending: true, abnormal: true,
      任务编号: 'PATR-0002', 巡护区域: '二号林班', 巡护路线: '西线', 巡护员: '李四',
    },
    {
      id: 3, status: '执行中', pending: true, abnormal: false,
      任务编号: 'PATR-0003', 巡护区域: '三号林班', 巡护路线: '中线', 巡护员: '王五',
    },
    {
      id: 4, status: '待执行', pending: true, abnormal: false,
      任务编号: 'PATR-0004', 巡护区域: '四号林班', 巡护路线: '北线', 巡护员: '',
    },
  ],
}
const store = { 'forest-fire-patrol:entries': JSON.stringify(legacy) }
let failNextWrite = false
globalThis.window = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (failNextWrite) throw new Error('模拟磁盘写满')
      store[k] = v
    },
  },
}
globalThis.__setFailNextWrite = (v) => { failNextWrite = v }

writeFileSync(join(dir, 'pinia-stub.js'), `
export function defineStore(_name, def) {
  return () => {
    const state = typeof def.state === 'function' ? def.state() : {}
    const getters = def.getters ?? {}
    return new Proxy(state, {
      get(target, prop) {
        if (prop in getters) return getters[prop](target)
        if (prop in target) return target[prop]
        return def.actions?.[prop]?.bind(target)
      },
    })
  }
}
`)

writeFileSync(join(dir, 'entry.ts'), `
import {
  runAction, loadOverview, listPending, listLedgerEntries, getEntry,
  isPending, isAbnormal, moduleMeta,
} from '@/api/local-service'

const meta = moduleMeta('patrol')
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1 } else console.log('PASS: ' + msg) }

// 1) 历史脏数据被派生口径自动校正，不改巡护员归属
assert(isPending(meta, getEntry('patrol', 2)!) === false, '历史「已完成」不再算待办')
assert(isAbnormal(meta, getEntry('patrol', 2)!) === false, '历史「已完成」不再算异常')
assert(getEntry('patrol', 1)!['巡护员'] === '张三', '历史巡护员归属保留')
assert(isAbnormal(meta, getEntry('patrol', 1)!) === false, '历史待执行不算异常')

// 2) 取消任务 -> 异常量+1、待办-1，列表/详情/工作台一致
const cancel = runAction('patrol', 1, '取消任务')
assert(cancel.ok === true, '取消任务成功: ' + cancel.message)
const row1 = getEntry('patrol', 1)!
assert(row1.status === '已取消', '详情状态为已取消')
assert(isPending(meta, row1) === false, '取消后不再是待办')
assert(isAbnormal(meta, row1) === true, '取消计入运营异常')
const patrolStat1 = loadOverview().modules.find(m => m.name === '巡护任务')!
assert(patrolStat1.abnormal === 1, '工作台巡护异常量=1，实际=' + patrolStat1.abnormal)
assert(patrolStat1.pending === 2, '工作台巡护待处理=2（id=3/id=4），实际=' + patrolStat1.pending)
assert(listPending('patrol').map(i => i.row.id).join() === '3,4', '待办列表为 id=3,4')

// 3) 取消与完成并发互斥
assert(runAction('patrol', 1, '确认完成').ok === false, '已取消拒绝再完成')
assert(runAction('patrol', 2, '取消任务').ok === false, '已完成拒绝再取消')
assert(getEntry('patrol', 1)!.status === '已取消', '被拒后状态不被破坏')

// 4) 处置台账多一份，归属原巡护员
const ledger1 = listLedgerEntries({ moduleKey: 'patrol' })
assert(ledger1.length === 1, '台账新增 1 条')
assert(ledger1[0].owner === '张三', '台账归属历史巡护员张三，实际=' + ledger1[0].owner)
assert(ledger1[0].operator === '值班管理员', '台账记录操作人')
assert(ledger1[0].abnormal === true, '台账取消标记异常')

// 5) 正常完成不算异常
assert(runAction('patrol', 3, '确认完成').ok === true, '执行中确认完成成功')
const row3 = getEntry('patrol', 3)!
assert(isPending(meta, row3) === false && isAbnormal(meta, row3) === false, '完成后闭环且非异常')
const stat2 = loadOverview().modules.find(m => m.name === '巡护任务')!
assert(stat2.abnormal === 1 && stat2.pending === 1, '工作台：异常量=1，待处理=1（id=4）')

// 6) 保存失败：列表、详情、待办、台账一起回退（id=4 待执行 -> 执行中，落盘失败）
const before4 = getEntry('patrol', 4)!.status
;(globalThis as any).__setFailNextWrite(true)
const failed = runAction('patrol', 4, '开始巡护')
;(globalThis as any).__setFailNextWrite(false)
assert(failed.ok === false, '保存失败返回失败: ' + failed.message)
assert(getEntry('patrol', 4)!.status === before4, '保存失败后详情回退原状态')
assert(isPending(meta, getEntry('patrol', 4)!) === true, '保存失败后待办口径不变')
assert(listLedgerEntries({ moduleKey: 'patrol' }).length === 2, '保存失败后台账不新增')

// 7) 历史巡护员缺失时台账归属记「—」，动作本身正常
assert(runAction('patrol', 4, '开始巡护').ok === true, '恢复后可正常开始巡护')
const led = listLedgerEntries({ moduleKey: 'patrol', rowId: 4 })[0]
assert(led.owner === '—', '无巡护员的历史任务台账归属记「—」')
`)

await build({
  entryPoints: [join(dir, 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(dir, 'out.mjs'),
  alias: {
    '@': '/workspace/frontend/src',
    pinia: join(dir, 'pinia-stub.js'),
  },
})

await import(pathToFileURL(join(dir, 'out.mjs')).href)
