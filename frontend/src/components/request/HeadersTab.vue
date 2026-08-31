<script setup lang="ts">
// Headers：KV 表格 + 继承提示（祖先定义、自身未覆盖的 key 灰显列出）
import { computed } from 'vue'
import KvEditor from '../common/KvEditor.vue'
import { inheritedHeaderKeys } from '../../lib/send'
import type { Request } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ request: Request }>()
const L = computed(() => t())

const inherited = computed(() => [...inheritedHeaderKeys(props.request)])
</script>

<template>
  <div class="ht">
    <KvEditor v-model="request.headers" :description="true" />
    <div v-if="inherited.length > 0" class="ht-inherited">
      <span class="ht-inherited-label">{{ L.request.kv.inherited }}:</span>
      <code v-for="k in inherited" :key="k" class="ht-inherited-key">{{ k }}</code>
    </div>
  </div>
</template>

<style scoped>
.ht-inherited {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 2px 10px 10px;
  font-size: 11px;
  color: var(--text-faint);
}
.ht-inherited-key {
  font-family: var(--mono);
  font-size: 10px;
  background: var(--bg-sunken);
  border-radius: 3px;
  padding: 1px 5px;
}
</style>
