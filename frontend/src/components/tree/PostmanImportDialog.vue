<script setup lang="ts">
// Postman 导入预览：集合名 + 接口/文件夹/变量计数 + 跳过报告，确认后写入当前项目
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import type { PostmanImportResult } from '../../lib/postman'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ result: Extract<PostmanImportResult, { ok: true }> }>()
const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'close'): void
}>()

const L = computed(() => t())
const r = computed(() => props.result)
</script>

<template>
  <Modal :title="L.dialog.importPreview" :width="440" @close="emit('close')">
    <div class="pid">
      <div class="pid-name">{{ r.name }}</div>
      <div class="pid-stats">
        <span>{{ r.requestCount }} {{ L.dialog.importRequests }}</span>
        <span>{{ r.folderCount }} {{ L.dialog.importFolders }}</span>
        <span>{{ r.variables.length }} {{ L.dialog.importVars }}</span>
        <span v-if="r.skipped > 0" class="pid-warn">{{ r.skipped }} {{ L.dialog.importSkipped }}</span>
      </div>
      <ul v-if="r.warnings.length > 0" class="pid-warns">
        <li v-for="(w, i) in r.warnings.slice(0, 8)" :key="i">{{ w }}</li>
        <li v-if="r.warnings.length > 8">…</li>
      </ul>
      <div class="pid-hint">{{ L.dialog.importHint }}</div>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">{{ L.common.cancel }}</button>
      <button class="btn btn-primary" @click="emit('confirm')">{{ L.common.confirm }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.pid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pid-name {
  font-weight: 600;
}
.pid-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-dim);
}
.pid-warn {
  color: var(--warn);
}
.pid-warns {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: var(--warn);
  max-height: 120px;
  overflow: auto;
}
.pid-hint {
  font-size: 11px;
  color: var(--text-faint);
}
</style>
