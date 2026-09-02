<script setup lang="ts">
// 粘贴 cURL 解析对话框：打开时尝试读剪贴板预填；实时解析显示错误/warning，应用后覆盖当前请求
import { computed, onMounted, ref } from 'vue'
import Modal from '../common/Modal.vue'
import CodeEditor from '../common/CodeEditor.vue'
import { parseCurl } from '../../lib/curl'
import type { Request } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ request: Request }>()
const emit = defineEmits<{
  (e: 'apply', req: Request): void
  (e: 'close'): void
}>()

const L = computed(() => t())
const text = ref('')

const parsed = computed(() => (text.value.trim() ? parseCurl(text.value) : null))
const canApply = computed(() => parsed.value?.ok === true)

onMounted(async () => {
  // 剪贴板不可用时静默降级为手动粘贴
  try {
    const c = await navigator.clipboard.readText()
    if (c.trim().toLowerCase().includes('curl')) text.value = c
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <Modal :title="L.request.pasteCurl" :width="560" @close="emit('close')">
    <div class="cd">
      <div class="cd-box">
        <CodeEditor
          v-model="text"
          class="cd-text"
          language="text"
          :height="180"
          :line-numbers="true"
          :placeholder="L.request.curlPlaceholder"
        />
      </div>
      <div v-if="parsed && !parsed.ok" class="cd-err">{{ parsed.error }}</div>
      <template v-else-if="parsed && parsed.ok">
        <ul v-if="(parsed.warnings?.length ?? 0) > 0" class="cd-warns">
          <li v-for="(w, i) in parsed.warnings!.slice(0, 6)" :key="i">{{ w }}</li>
          <li v-if="(parsed.warnings?.length ?? 0) > 6">…</li>
        </ul>
        <div v-else class="cd-ok">
          {{ parsed.request?.method }} {{ parsed.request?.url }}
        </div>
      </template>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">{{ L.common.cancel }}</button>
      <button class="btn btn-primary" :disabled="!canApply" @click="canApply && emit('apply', parsed!.request!)">
        {{ L.common.confirm }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.cd {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 编辑器包在带边框圆角的盒里（.ce 自身只有 border-top，为嵌在 tab 下的布局设计） */
.cd-box {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.cd-box :deep(.ce) {
  border-top: none;
}
.cd-box:focus-within {
  border-color: var(--brand);
}
.cd-err {
  font-size: 12px;
  color: var(--error);
}
.cd-warns {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: var(--warn);
  max-height: 96px;
  overflow: auto;
}
.cd-ok {
  font-size: 12px;
  font-family: var(--mono);
  color: var(--ok);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
