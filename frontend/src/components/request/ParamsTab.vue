<script setup lang="ts">
// Params：query 表格 ↔ URL 双向同步
// URL 改动（URL 栏输入/粘贴 cURL）→ 拆 query 进表格；表格改动 → 拼回 URL
// 防循环靠幂等比较：split→merge 往返一致的 query 不再重写
import { watch } from 'vue'
import KvEditor from '../common/KvEditor.vue'
import { splitUrlToQuery, mergeQueryToUrl } from '../../lib/url'
import type { Request } from '../../types/models'

const props = defineProps<{ request: Request }>()

function urlBase(url: string): string {
  const i = url.indexOf('?')
  return i >= 0 ? url.slice(0, i) : url
}

watch(
  () => props.request.url,
  (url) => {
    if (url.indexOf('?') < 0) {
      // URL 无 query：表格清空（仅当表格非空时）
      if (props.request.params.length > 0) props.request.params.splice(0)
      return
    }
    // 表格已能生成当前 query（往返一致）→ 不覆盖
    if (mergeQueryToUrl(urlBase(url), props.request.params) === url) return
    const { pairs } = splitUrlToQuery(url)
    props.request.params.splice(0, props.request.params.length, ...pairs)
  },
)

watch(
  () => props.request.params,
  (pairs) => {
    const next = mergeQueryToUrl(urlBase(props.request.url), pairs)
    if (next !== props.request.url) props.request.url = next
  },
  { deep: true },
)
</script>

<template>
  <KvEditor v-model="request.params" />
</template>
