<script setup lang="ts">
// 状态栏：保存状态 · 数据目录 | 项目 · 环境 · 版本
import { onMounted, ref, computed } from 'vue'
import { Check, Loader2, AlertTriangle, FolderOpen } from 'lucide-vue-next'
import Tooltip from '../common/Tooltip.vue'
import { StorageService } from '../../api/backend'
import { saveStatus } from '../../lib/persist'
import { currentProject } from '../../stores/workspace'
import { currentEnv } from '../../stores/env'
import { APP_VERSION } from '../../stores/settings'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const dataDir = ref('')

onMounted(async () => {
  try {
    dataDir.value = await StorageService.GetDataDir()
  } catch {
    dataDir.value = ''
  }
})

const saveText = computed(() => {
  if (saveStatus.value === 'saving') return L.value.status.saving
  if (saveStatus.value === 'error') return L.value.status.saveError
  return L.value.status.saved
})
</script>

<template>
  <footer class="statusbar">
    <span class="sb-item">
      <Check v-if="saveStatus === 'idle'" :size="11" class="ok" />
      <Loader2 v-else-if="saveStatus === 'saving'" :size="11" class="spin" />
      <AlertTriangle v-else :size="11" class="err" />
      {{ saveText }}
    </span>
    <Tooltip v-if="dataDir" :tip="dataDir">
      <span class="sb-item sb-dir">
        <FolderOpen :size="11" />
        <span class="sb-dir-path">{{ dataDir }}</span>
      </span>
    </Tooltip>
    <div class="spacer"></div>
    <span v-if="currentProject" class="sb-item">
      {{ currentProject.name }}
      <template v-if="currentEnv"> · {{ currentEnv.name }}</template>
    </span>
    <span class="sb-item sb-version">v{{ APP_VERSION }}</span>
  </footer>
</template>

<style scoped>
.statusbar {
  height: var(--statusbar-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: var(--bg-elev);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
  user-select: none;
}
.sb-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.sb-dir-path {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ok {
  color: var(--ok);
}
.err {
  color: var(--error);
}
.spin {
  animation: sb-spin 1s linear infinite;
}
@keyframes sb-spin {
  to {
    transform: rotate(360deg);
  }
}
.spacer {
  flex: 1;
}
.sb-version {
  color: var(--text-faint);
}
</style>
