<script setup lang="ts">
// 活动栏（48px）：集合 / 历史 / 环境 / 设置
import { computed } from 'vue'
import { FolderTree, History, Layers, Settings } from 'lucide-vue-next'
import { activePanel, type PanelKind } from '../../stores/ui-state'
import { historyStore } from '../../stores/history'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

const items: { kind: PanelKind; icon: typeof FolderTree; label: string }[] = [
  { kind: 'collections', icon: FolderTree, label: L.value.activity.collections },
  { kind: 'history', icon: History, label: L.value.activity.history },
  { kind: 'environments', icon: Layers, label: L.value.activity.environments },
  { kind: 'settings', icon: Settings, label: L.value.activity.settings },
]

const badge = computed(() => historyStore.entries.length)
</script>

<template>
  <nav class="activitybar">
    <button
      v-for="item in items"
      :key="item.kind"
      :class="['ab-btn', { active: activePanel === item.kind }]"
      :title="item.label"
      @click="activePanel = item.kind"
    >
      <component :is="item.icon" :size="19" />
      <span v-if="item.kind === 'history' && badge > 0" class="ab-badge">{{
        badge > 99 ? '99+' : badge
      }}</span>
    </button>
  </nav>
</template>

<style scoped>
.activitybar {
  width: var(--activitybar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
  gap: 4px;
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
}
.ab-btn {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: all var(--ease);
}
.ab-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.ab-btn.active {
  color: var(--brand);
  background: var(--brand-weak);
}
.ab-badge {
  position: absolute;
  right: 2px;
  bottom: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 9px;
  line-height: 12px;
  text-align: center;
}
</style>
