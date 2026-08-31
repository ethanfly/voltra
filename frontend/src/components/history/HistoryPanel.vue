<script setup lang="ts">
// 历史面板：日期分组 + 搜索 + 点击还原到新标签（另存为/清空在阶段 8 补全）
import { computed, ref } from 'vue'
import { Search, Globe, Wifi, Trash2 } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import { historyStore, grouped } from '../../stores/history'
import { openRequest } from '../../stores/tabs'
import { settings } from '../../stores/settings'
import type { HistoryEntry } from '../../types/models'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const query = ref('')

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return grouped.value
  return grouped.value
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e.requestSnapshot.name.toLowerCase().includes(q)) }))
    .filter((g) => g.entries.length > 0)
})

function onEntry(e: HistoryEntry) {
  openRequest(e.requestSnapshot, { fromHistory: true })
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
</script>

<template>
  <div class="hp">
    <div v-if="historyStore.entries.length === 0" class="hp-empty">
      <EmptyState :title="L.history.empty" />
    </div>
    <template v-else>
      <div class="hp-search">
        <Search :size="12" />
        <input v-model="query" class="hp-search-input" :placeholder="L.common.search" />
      </div>
      <template v-if="filteredGroups.length === 0">
        <EmptyState :title="L.tree.searchEmpty" />
      </template>
      <template v-else>
        <section v-for="g in filteredGroups" :key="g.label">
          <div class="hp-group">{{ g.label }}</div>
          <div
            v-for="e in g.entries"
            :key="e.id"
            class="hp-item"
            :title="L.history.restore"
            @click="onEntry(e)"
          >
            <component :is="e.requestSnapshot.protocol === 'ws' ? Wifi : Globe" :size="12" class="hp-ico" />
            <span :class="['hp-method', e.requestSnapshot.protocol === 'ws' ? 'm-WS' : 'm-' + e.requestSnapshot.method.toUpperCase()]">
              {{ e.requestSnapshot.protocol === 'ws' ? 'WS' : e.requestSnapshot.method }}
            </span>
            <span class="hp-name">{{ e.requestSnapshot.name }}</span>
            <span class="hp-time">
              {{ fmtTime(e.sentAt) }}
              <span v-if="e.responseSummary.statusCode > 0" class="hp-code">{{ e.responseSummary.statusCode }}</span>
            </span>
          </div>
        </section>
      </template>
      <div v-if="historyStore.entries.length > 0" class="hp-foot">
        {{ L.history.limitHint }} {{ settings.historyLimit }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.hp {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.hp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px 8px;
  padding: 0 8px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text-faint);
}
.hp-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.hp-group {
  padding: 6px 12px 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-faint);
}
.hp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--row-h);
  padding: 0 8px 0 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-dim);
  transition: background var(--ease);
}
.hp-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.hp-ico {
  color: var(--text-faint);
  flex-shrink: 0;
}
.hp-method {
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 30px;
}
.hp-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hp-time {
  font-size: 10px;
  color: var(--text-faint);
  flex-shrink: 0;
  display: inline-flex;
  gap: 4px;
}
.hp-code {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--bg-sunken);
}
.hp-foot {
  padding: 10px 12px 4px;
  font-size: 10px;
  color: var(--text-faint);
}
</style>
