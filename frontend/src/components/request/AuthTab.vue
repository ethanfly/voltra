<script setup lang="ts">
// Auth：none / inherit / bearer / basic / apikey（header 或 query）
import type { Request, AuthConfig } from '../../types/models'
import { t } from '../../locales/zh-CN'
import Segmented from '../common/Segmented.vue'

const props = defineProps<{ request: Request }>()
const L = t()

const options = [
  { value: 'none', label: L.request.auth.none },
  { value: 'inherit', label: L.request.auth.inherit },
  { value: 'bearer', label: L.request.auth.bearer },
  { value: 'basic', label: L.request.auth.basic },
  { value: 'apikey', label: L.request.auth.apikey },
]

/** 切类型时补齐子字段，保证模板里的 `request.auth.bearer!.token` 渲染安全 */
function setType(v: string) {
  const a = props.request.auth
  a.type = v as AuthConfig['type']
  if (v === 'bearer') a.bearer ??= { token: '' }
  if (v === 'basic') a.basic ??= { username: '', password: '' }
  if (v === 'apikey') a.apikey ??= { key: '', value: '', in: 'header' }
}
</script>

<template>
  <div class="at">
    <Segmented :options="options" :model-value="request.auth.type" @update:model-value="setType" />

    <div v-if="request.auth.type === 'bearer' && request.auth.bearer" class="at-rows">
      <label class="at-label">{{ L.request.auth.token }}</label>
      <input class="input" v-model="request.auth.bearer.token" placeholder="eyJhbGciOi…" />
    </div>

    <div v-else-if="request.auth.type === 'basic' && request.auth.basic" class="at-rows">
      <label class="at-label">{{ L.request.auth.username }}</label>
      <input class="input" v-model="request.auth.basic.username" />
      <label class="at-label">{{ L.request.auth.password }}</label>
      <input class="input" type="password" v-model="request.auth.basic.password" />
    </div>

    <div v-else-if="request.auth.type === 'apikey' && request.auth.apikey" class="at-rows">
      <label class="at-label">{{ L.request.auth.key }}</label>
      <input class="input" v-model="request.auth.apikey.key" />
      <label class="at-label">{{ L.request.auth.value }}</label>
      <input class="input" v-model="request.auth.apikey.value" />
      <label class="at-label">{{ L.request.auth.in }}</label>
      <Segmented
        :options="[
          { value: 'header', label: L.request.auth.inHeader },
          { value: 'query', label: L.request.auth.inQuery },
        ]"
        :model-value="request.auth.apikey.in"
        @update:model-value="request.auth.apikey.in = $event as 'header' | 'query'"
      />
    </div>

    <div v-else-if="request.auth.type === 'inherit'" class="at-hint">使用父级（文件夹 / 集合）配置的认证</div>
    <div v-else class="at-hint">不附加任何认证信息</div>
  </div>
</template>

<style scoped>
.at {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}
.at-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.at-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  margin-top: 4px;
}
.at-rows .input {
  width: 100%;
  box-sizing: border-box;
}
.at-hint {
  font-size: 12px;
  color: var(--text-faint);
  padding: 4px 2px;
}
</style>
