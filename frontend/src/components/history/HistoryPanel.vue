<script setup lang="ts">
// 历史面板：日期分组 + 搜索（名称/URL/方法）+ 点击还原到新标签
// + 悬停"另存为接口"（HIS-4）+ 清空（HIS-5，带确认）
import { computed, ref } from 'vue'
import { Search, Globe, Wifi, Trash2, BookmarkPlus } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import SaveToDialog from '../tree/SaveToDialog.vue'
import { historyStore, grouped, clearHistory } from '../../stores/history'
import { openRequest } from '../../stores/tabs'
import { currentProject, findNode, addRequest } from '../../stores/workspace'
import { settings } from '../../stores/settings'
import { uid, cloneDeep } from '../../types/models'
import type { HistoryEntry, ID } from '../../types/models'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const query = ref('')

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return grouped.value
  return grouped.value
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => {
        const r = e.requestSnapshot
        return (
          r.name.toLowerCase().includes(q) ||
          r.url.toLowerCase().includes(q) ||
          (r.protocol === 'http' && r.method.toLowerCase().includes(q))
        )
      }),
    }))
    .filter((g) => g.entries.length > 0)
})

function onEntry(e: HistoryEntry) {
  openRequest(e.requestSnapshot, { fromHistory: true })
}

// ---------- 另存为接口（HIS-4） ----------
const saveAsEntry = ref<HistoryEntry | null>(null)
function doSaveAs(name: string, targetId: ID) {
  const e = saveAsEntry.value
  const p = currentProject.value
  if (!e || !p) return
  // 目标可能是集合（SaveToDialog 列表含集合根）或文件夹
  let target = p.collections.find((c) => c.id === targetId) ?? null
  if (!target) {
    const n = findNode(p, targetId)
    if (n && n.kind !== 'request') target = n
  }
  if (!target) return
  const clone = cloneDeep(e.requestSnapshot)
  clone.id = uid()
  clone.name = name
  addRequest(target, clone)
  saveAsEntry.value = null
}

// ---------- 清空（HIS-5） ----------
const confirmClear = ref(false)
function doClear() {
  confirmClear.value = false
  clearHistory()
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
        <input v-model="query" class="hp-search-input" :placeholder="L.history.searchPlaceholder" />
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
            <span
              :class="[
                'hp-method',
                e.requestSnapshot.protocol === 'ws' ? 'm-WS' : 'm-' + e.requestSnapshot.method.toUpperCase(),
              ]"
            >
              {{ e.requestSnapshot.protocol === 'ws' ? 'WS' : e.requestSnapshot.method }}
            </span>
            <span class="hp-name">{{ e.requestSnapshot.name }}</span>
            <span class="hp-time">
              {{ fmtTime(e.sentAt) }}
              <span v-if="e.responseSummary.statusCode > 0" class="hp-code">{{ e.responseSummary.statusCode }}</span>
            </span>
            <button class="hp-act" :title="L.history.saveAs" @click.stop="saveAsEntry = e">
              <BookmarkPlus :size="12" />
            </button>
          </div>
        </section>
      </template>
      <div class="hp-foot">
        <span>{{ L.history.limitHint }} {{ settings.historyLimit }}</span>
        <button class="hp-clear" :title="L.history.clear" @click="confirmClear = true">
          <Trash2 :size="13" /> {{ L.history.clear }}
        </button>
      </div>
    </template>

    <SaveToDialog
      v-if="saveAsEntry"
      :name="saveAsEntry.requestSnapshot.name"
      @save="doSaveAs"
      @close="saveAsEntry = null"
    />
    <ConfirmDialog
      v-if="confirmClear"
      :title="L.common.confirmDelete"
      :message="L.history.clearConfirm"
      :danger="true"
      @confirm="doClear"
      @cancel="confirmClear = false"
    />
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
  padding: 0 4px 0 12px;
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
  background: var(--bg-well);
}
.hp-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
}
.hp-item:hover .hp-act {
  opacity: 1;
}
.hp-act:hover {
  background: var(--bg-well);
  color: var(--text);
}
.hp-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  font-size: 10px;
  color: var(--text-faint);
}
.hp-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 10px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.hp-clear:hover {
  color: var(--error);
  background: var(--error-weak);
}
</style>
