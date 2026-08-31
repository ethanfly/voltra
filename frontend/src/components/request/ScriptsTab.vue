<script setup lang="ts">
// 脚本：Pre-request / Tests 两个 JS 编辑器（v0.2 仅保存，v0.3 执行）
import type { Request } from '../../types/models'
import { t } from '../../locales/zh-CN'
import CodeEditor from '../common/CodeEditor.vue'

const props = defineProps<{ request: Request }>()
const L = t()
</script>

<template>
  <div class="st">
    <div class="st-note">{{ L.request.scripts.placeholder }}</div>
    <label class="st-label">{{ L.request.scripts.pre }}</label>
    <CodeEditor
      class="st-ed"
      :model-value="request.preRequestScript ?? ''"
      language="javascript"
      @update:model-value="request.preRequestScript = $event"
    />
    <label class="st-label">{{ L.request.scripts.test }}</label>
    <CodeEditor
      class="st-ed"
      :model-value="request.testScript ?? ''"
      language="javascript"
      @update:model-value="request.testScript = $event"
    />
  </div>
</template>

<style scoped>
.st {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.st-note {
  font-size: 11px;
  color: var(--text-faint);
  padding: 6px 10px 0;
}
.st-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 8px 10px 2px;
}
.st-ed {
  flex: 1;
  min-height: 0;
}
</style>
