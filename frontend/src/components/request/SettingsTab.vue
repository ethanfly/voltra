<script setup lang="ts">
// 请求级设置：超时 / 重定向 / TLS / Cookie
import type { Request } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ request: Request }>()
const L = t()

const s = () => props.request.settings
</script>

<template>
  <div class="rt">
    <label class="rt-row">
      <span class="rt-label">{{ L.request.settings.timeoutMs }}</span>
      <input class="input rt-num" type="number" min="0" step="1000" v-model.number="s().timeoutMs" />
    </label>
    <label class="rt-row">
      <span class="rt-label">{{ L.request.settings.followRedirects }}</span>
      <input type="checkbox" v-model="s().followRedirects" />
    </label>
    <label v-if="s().followRedirects" class="rt-row">
      <span class="rt-label">{{ L.request.settings.maxRedirects }}</span>
      <input class="input rt-num" type="number" min="0" max="20" v-model.number="s().maxRedirects" />
    </label>
    <label class="rt-row">
      <span class="rt-label">{{ L.request.settings.insecureSkipTlsVerify }}</span>
      <input type="checkbox" v-model="s().insecureSkipTlsVerify" />
    </label>
    <label class="rt-row">
      <span class="rt-label">{{ L.request.settings.sendCookies }}</span>
      <input type="checkbox" v-model="s().sendCookies" />
    </label>
  </div>
</template>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 10px;
}
.rt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.rt-row input[type='checkbox'] {
  accent-color: var(--brand);
  margin: 0;
}
.rt-num {
  width: 120px;
}
</style>
