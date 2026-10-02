<template>
  <section class="page" data-module="ledger">
    <header class="page-head">
      <div>
        <h2>处置台账</h2>
        <p class="page-desc">汇总各业务模块每一次状态流转，巡护任务取消等异常处置带标记，归属记在原巡护员名下。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="reload">刷新台账</button>
      </div>
    </header>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>业务模块</span>
        <select v-model="moduleKey">
          <option value="">全部模块</option>
          <option v-for="meta in metas" :key="meta.key" :value="meta.key">{{ meta.name }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>仅看异常</span>
        <input v-model="onlyAbnormal" type="checkbox" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>时间</th><th>业务模块</th><th>业务编号</th><th>动作</th>
          <th>原状态</th><th>目标状态</th><th>归属人</th><th>操作人</th><th>是否异常</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in shown" :key="item.id">
          <td>{{ item.createdAt }}</td>
          <td>{{ item.moduleName }}</td>
          <td>
            <RouterLink v-if="item.moduleKey === 'patrol'" class="link" :to="`/patrol/${item.rowId}`">
              {{ item.bizNo }}
            </RouterLink>
            <template v-else>{{ item.bizNo }}</template>
          </td>
          <td>{{ item.action }}</td>
          <td>{{ item.fromStatus }}</td>
          <td>{{ item.toStatus }}</td>
          <td>{{ item.owner }}</td>
          <td>{{ item.operator }}</td>
          <td :class="{ 'error-text': item.abnormal }">{{ item.abnormal ? '异常' : '正常' }}</td>
        </tr>
        <tr v-if="!shown.length">
          <td colspan="9" class="empty-state">暂无处置记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ shown.length }} 条处置记录，异常 {{ abnormalCount }} 条</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { listLedgerEntries } from '@/api/local-service'
import { MODULES } from '@/data/modules'
import type { LedgerEntry } from '@/data/types'

const metas = MODULES
const moduleKey = ref('')
const onlyAbnormal = ref(false)
const entries = ref<LedgerEntry[]>([])

const shown = computed(() =>
  entries.value.filter(
    (item) =>
      (!moduleKey.value || item.moduleKey === moduleKey.value) &&
      (!onlyAbnormal.value || item.abnormal),
  ),
)
const abnormalCount = computed(() => shown.value.filter((item) => item.abnormal).length)

function reload() {
  entries.value = listLedgerEntries(moduleKey.value ? { moduleKey: moduleKey.value } : undefined)
}

onMounted(reload)
</script>
