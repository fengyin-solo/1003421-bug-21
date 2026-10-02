<template>
  <section class="page" data-module="patrol-detail">
    <header class="page-head">
      <div>
        <h2>巡护任务详情</h2>
        <p class="page-desc">任务状态、异常标记与待办口径和列表、工作台保持一致，动作走同一个流转入口。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/patrol">返回任务列表</RouterLink>
      </div>
    </header>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <template v-else-if="row">
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">当前状态</span>
          <strong class="stat-value">{{ row.status }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">是否待办</span>
          <strong class="stat-value">{{ pending ? '待处理' : '已闭环' }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">运营异常</span>
          <strong class="stat-value" :class="{ 'error-text': abnormal }">
            {{ abnormal ? '异常（取消）' : '正常' }}
          </strong>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in meta.fields" :key="field">
            <th>{{ field }}</th>
            <td>{{ row[field] ?? '—' }}</td>
          </tr>
          <tr>
            <th>归属巡护员</th>
            <td>{{ owner }}</td>
          </tr>
        </tbody>
      </table>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '确认完成' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
        <span v-if="!actions.length" class="muted">任务已进入终态，不可再流转</span>
      </div>

      <h3 class="ledger-title">处置台账</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>时间</th><th>动作</th><th>原状态</th><th>目标状态</th>
            <th>归属巡护员</th><th>操作人</th><th>是否异常</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in ledger" :key="item.id">
            <td>{{ item.createdAt }}</td>
            <td>{{ item.action }}</td>
            <td>{{ item.fromStatus }}</td>
            <td>{{ item.toStatus }}</td>
            <td>{{ item.owner }}</td>
            <td>{{ item.operator }}</td>
            <td :class="{ 'error-text': item.abnormal }">{{ item.abnormal ? '异常' : '正常' }}</td>
          </tr>
          <tr v-if="!ledger.length">
            <td colspan="7" class="empty-state">该任务还没有处置记录</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  availableActions,
  getEntry,
  isAbnormal,
  isPending,
  listLedgerEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, LedgerEntry } from '@/data/types'

const meta = moduleMeta('patrol')
const route = useRoute()
const taskId = computed(() => Number(route.params.id))

const row = ref<EntryRow | undefined>()
const ledger = ref<LedgerEntry[]>([])
const errorMessage = ref('')

const pending = computed(() => (row.value ? isPending(meta, row.value) : false))
const abnormal = computed(() => (row.value ? isAbnormal(meta, row.value) : false))
const actions = computed(() => (row.value ? availableActions(meta, row.value) : []))
const owner = computed(() =>
  row.value && meta.ownerField ? String(row.value[meta.ownerField] ?? '—') || '—' : '—',
)

function load() {
  errorMessage.value = ''
  const entry = getEntry(meta.key, taskId.value)
  if (!entry) {
    row.value = undefined
    errorMessage.value = `没有找到编号为 ${taskId.value} 的巡护任务`
    return
  }
  row.value = entry
  ledger.value = listLedgerEntries({ moduleKey: meta.key, rowId: taskId.value })
}

function runAction(action: string) {
  errorMessage.value = ''
  const result = applyAction(meta.key, taskId.value, action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  load()
}

watch(taskId, load, { immediate: true })
</script>
