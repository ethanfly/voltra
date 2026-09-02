<script setup lang="ts">
// 侧栏：宽度可拖拽（240–480）、可折叠，按 activePanel 切换面板
import { computed, ref } from 'vue'
import { Plus, Trash2, PanelLeftClose, PanelLeft } from 'lucide-vue-next'
import Splitter from '../common/Splitter.vue'
import CollectionsPanel from '../tree/CollectionsPanel.vue'
import HistoryPanel from '../history/HistoryPanel.vue'
import EnvironmentsPanel from '../env/EnvironmentsPanel.vue'
import SettingsPanel from '../settings/SettingsPanel.vue'
import {
  uiState,
  activePanel,
  sidebarCollapsed,
  setSidebarWidth,
} from '../../stores/ui-state'
import { addCollection } from '../../stores/workspace'
import { addEnvToProject } from '../../stores/env'
import { clearHistory, historyStore } from '../../stores/history'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

const confirmClearHistory = ref(false)

const panelTitle = computed(() => {
  const map: Record<string, string> = {
    collections: L.value.activity.collections,
    history: L.value.activity.history,
    environments: L.value.activity.environments,
    settings: L.value.activity.settings,
  }
  return map[activePanel.value] ?? ''
})

function onNewCollection() {
  addCollection('新集合')
}
function onNewEnv() {
  addEnvToProject('新环境')
}
function doClearHistory() {
  confirmClearHistory.value = false
  clearHistory()
}
</script>

<template>
  <div v-if="!sidebarCollapsed" class="sidebar-wrap">
    <aside class="sidebar" :style="{ width: uiState.sidebarWidth + 'px' }">
      <div class="sb-head">
        <span class="sb-title">{{ panelTitle }}</span>
        <button
          v-if="activePanel === 'collections'"
          class="sb-act"
          :title="L.dialog.collectionNew"
          @click="onNewCollection"
        >
          <Plus :size="15" />
        </button>
        <button
          v-else-if="activePanel === 'environments'"
          class="sb-act"
          :title="L.dialog.envNew"
          @click="onNewEnv"
        >
          <Plus :size="15" />
        </button>
        <button
          v-else-if="activePanel === 'history' && historyStore.entries.length > 0"
          class="sb-act"
          :title="L.history.clear"
          @click="confirmClearHistory = true"
        >
          <Trash2 :size="15" />
        </button>
        <button class="sb-act" :title="L.common.collapse" @click="sidebarCollapsed = true">
          <PanelLeftClose :size="15" />
        </button>
      </div>
      <div class="sb-body">
        <CollectionsPanel v-if="activePanel === 'collections'" />
        <HistoryPanel v-else-if="activePanel === 'history'" />
        <EnvironmentsPanel v-else-if="activePanel === 'environments'" />
        <SettingsPanel v-else />
      </div>
    </aside>
    <Splitter axis="x" @resize="(d) => setSidebarWidth(uiState.sidebarWidth + d)" />

    <!-- 清空历史确认弹窗（之前漏加，导致点击无反应） -->
    <ConfirmDialog
      v-if="confirmClearHistory"
      :title="L.history.clear"
      :message="L.history.clearConfirm"
      :danger="true"
      @confirm="doClearHistory"
      @cancel="confirmClearHistory = false"
    />
  </div>
  <button v-else class="expand-btn" :title="L.common.expand" @click="sidebarCollapsed = false">
    <PanelLeft :size="15" />
  </button>
</template>

<style scoped>
.sidebar-wrap {
  display: flex;
  flex-shrink: 0;
  min-width: 0;
}
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-elev);
  border-right: 0;
}
.sb-head {
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
}
.sb-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* faint 色 + 22px 热区太小、难以察觉（实测反馈）——dim 色 + 26px */
.sb-act {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.sb-act:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.sb-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0;
}
.expand-btn {
  width: 20px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid var(--border);
  background: var(--bg-elev);
  /* 折叠后这是唯一的细条入口，图标要足够醒目 */
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.expand-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}
</style>
