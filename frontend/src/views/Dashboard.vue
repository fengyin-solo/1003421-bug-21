<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td :class="{ 'error-text': row.abnormal > 0 }">{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>

    <h3 class="ledger-title">巡护待办</h3>
    <table class="data-table">
      <thead>
        <tr><th>任务编号</th><th>巡护区域</th><th>巡护员</th><th>当前状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in patrolTodos" :key="item.row.id">
          <td>
            <RouterLink class="link" :to="`/patrol/${item.row.id}`">{{ item.row['任务编号'] }}</RouterLink>
          </td>
          <td>{{ item.row['巡护区域'] }}</td>
          <td>{{ item.row['巡护员'] }}</td>
          <td>{{ item.row.status }}</td>
        </tr>
        <tr v-if="!patrolTodos.length">
          <td colspan="4" class="empty-state">暂无未闭环的巡护任务</td>
        </tr>
      </tbody>
    </table>

    <h3 class="ledger-title">最近处置台账</h3>
    <table class="data-table">
      <thead>
        <tr><th>时间</th><th>业务模块</th><th>业务编号</th><th>动作</th><th>目标状态</th><th>归属人</th><th>是否异常</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in recentLedger" :key="item.id">
          <td>{{ item.createdAt }}</td>
          <td>{{ item.moduleName }}</td>
          <td>
            <RouterLink v-if="item.moduleKey === 'patrol'" class="link" :to="`/patrol/${item.rowId}`">
              {{ item.bizNo }}
            </RouterLink>
            <template v-else>{{ item.bizNo }}</template>
          </td>
          <td>{{ item.action }}</td>
          <td>{{ item.toStatus }}</td>
          <td>{{ item.owner }}</td>
          <td :class="{ 'error-text': item.abnormal }">{{ item.abnormal ? '异常' : '正常' }}</td>
        </tr>
        <tr v-if="!recentLedger.length">
          <td colspan="7" class="empty-state">暂无处置记录，可到巡护任务里执行动作</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { listLedgerEntries, listPending, loadOverview } from '@/api/local-service'
import type { LedgerEntry, OverviewResult } from '@/data/types'

type TodoItem = ReturnType<typeof listPending>[number]

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const patrolTodos = ref<TodoItem[]>([])
const recentLedger = ref<LedgerEntry[]>([])

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  // 待办由状态是否进入终态派生：已完成/已取消的任务都不会再挂在这里。
  patrolTodos.value = listPending('patrol')
  recentLedger.value = listLedgerEntries().slice(0, 8)
}

onMounted(refresh)
</script>
