<script setup lang="ts">
// Set-Cookie 解析后的 Cookie 表格
import { computed } from 'vue'
import { parseSetCookies } from '../../lib/cookies'
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel }>()
const L = computed(() => t())
const cookies = computed(() => parseSetCookies(props.response.headers))
</script>

<template>
  <div v-if="cookies.length === 0" class="ck-empty">{{ L.response.body.cookiesEmpty }}</div>
  <table v-else class="ck">
    <thead>
      <tr>
        <th>{{ L.response.cookie.name }}</th>
        <th>{{ L.response.cookie.value }}</th>
        <th>{{ L.response.cookie.domain }}</th>
        <th>{{ L.response.cookie.path }}</th>
        <th>{{ L.response.cookie.expires }}</th>
        <th>{{ L.response.cookie.httpOnly }}</th>
        <th>{{ L.response.cookie.secure }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(c, i) in cookies" :key="i">
        <td class="ck-name">{{ c.name }}</td>
        <td>{{ c.value }}</td>
        <td>{{ c.domain ?? '' }}</td>
        <td>{{ c.path ?? '' }}</td>
        <td>{{ c.expires ?? (c.maxAge !== undefined ? `Max-Age=${c.maxAge}` : '') }}</td>
        <td>{{ c.httpOnly ? '✓' : '' }}</td>
        <td>{{ c.secure ? '✓' : '' }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ck {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ck th {
  text-align: left;
  font-weight: 600;
  color: var(--text-dim);
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-strong);
  position: sticky;
  top: 0;
  background: var(--bg-elev);
}
.ck td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  color: var(--text);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ck-name {
  color: var(--brand);
}
.ck-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 12px 10px;
}
</style>
