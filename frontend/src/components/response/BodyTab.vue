<script setup lang="ts">
// 响应 Body：Pretty(CM6 只读) / Raw(搜索高亮+换行) / Preview(HTML iframe)
// 大响应保护：>1MB 只渲染前 1MB；>10MB 禁用 Pretty/JSONPath；二进制 base64 通道
import { computed, ref, watch } from 'vue'
import { Copy, Check, Download, WrapText, Search, FileJson2 } from 'lucide-vue-next'
import Segmented from '../common/Segmented.vue'
import CodeEditor from '../common/CodeEditor.vue'
import { StorageService } from '../../api/backend'
import { JSONPath } from 'jsonpath-plus'
import { prettyJson, detectLang, formatBytes, binaryHexSummary } from '../../lib/format'
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel }>()
const L = computed(() => t())

const RENDER_CAP = 1024 * 1024 // 1MB：Raw/搜索渲染上限
const PRETTY_CAP = 10 * 1024 * 1024 // 10MB：禁用 Pretty/JSONPath

const isBinary = computed(() => props.response.bodyEncoding === 'base64')
const text = computed(() => props.response.body)
const lang = computed(() => (isBinary.value ? 'text' : detectLang(props.response.contentType, text.value)))
const isJson = computed(() => lang.value === 'json' && !isBinary.value)
const pretty = computed(() => (isJson.value ? prettyJson(text.value) : null))
const capPretty = computed(() => text.value.length > PRETTY_CAP)
const capped = computed(() => text.value.length > RENDER_CAP)
const rendered = computed(() => text.value.slice(0, RENDER_CAP))

type Mode = 'pretty' | 'raw' | 'preview'
const mode = ref<Mode>('raw')
const search = ref('')
const jsonPath = ref('')
/** 新响应到达时按内容重置默认视图（immediate：ref 必须先于 watch 声明，否则 TDZ 抛错） */
watch(
  () => props.response,
  () => {
    search.value = ''
    jsonPath.value = ''
    mode.value =
      isJson.value && pretty.value !== null && !capPretty.value && text.value.length <= RENDER_CAP
        ? 'pretty'
        : 'raw'
  },
  { immediate: true },
)

const modes = computed(() => [
  {
    value: 'pretty',
    label: L.value.response.body.pretty,
    title: capPretty.value ? L.value.response.body.tooLargeForPretty : undefined,
  },
  { value: 'raw', label: L.value.response.body.raw },
  { value: 'preview', label: L.value.response.body.preview },
])

function disablePretty(v: string) {
  return v === 'pretty' && (!isJson.value || capPretty.value)
}

// ---------- 搜索（Raw 视图，忽略大小写高亮） ----------
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const highlighted = computed(() => {
  const q = search.value.trim()
  const body = rendered.value
  if (!q || body.length > RENDER_CAP) return null
  const i0 = body.toLowerCase().indexOf(q.toLowerCase())
  if (i0 < 0) return null
  const parts: string[] = []
  const lower = body.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  while (i <= body.length - ql.length) {
    const hit = lower.indexOf(ql, i)
    if (hit < 0) break
    parts.push(escapeHtml(body.slice(i, hit)), '<mark>', escapeHtml(body.slice(hit, hit + ql.length)), '</mark>')
    i = hit + ql.length
  }
  parts.push(escapeHtml(body.slice(i)))
  return { html: parts.join(''), count: countMatches(body, q) }
})
function countMatches(body: string, q: string): number {
  const lower = body.toLowerCase()
  const ql = q.toLowerCase()
  let n = 0
  let i = 0
  while (i <= body.length - ql.length) {
    const hit = lower.indexOf(ql, i)
    if (hit < 0) break
    n++
    i = hit + ql.length
  }
  return n
}

// ---------- 换行 ----------
const wrap = ref(true)

// ---------- JSONPath ----------
const jsonPathResult = computed<string | null>(() => {
  if (!isJson.value || capPretty.value || !jsonPath.value.trim()) return null
  try {
    const data = JSON.parse(text.value)
    const res = JSONPath({ path: jsonPath.value.trim(), json: data, wrap: true }) as {
      value: unknown[]
    }
    if (!res.value.length) return null
    return JSON.stringify(res.value, null, 2)
  } catch {
    return null
  }
})

// ---------- 复制 / 下载 ----------
const copied = ref(false)
async function onCopy() {
  const v = mode.value === 'pretty' && pretty.value ? pretty.value : text.value
  await navigator.clipboard.writeText(v)
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}
async function onDownload() {
  const name = `response-${props.response.statusCode || 'err'}.txt`
  await StorageService.SaveFile(name, text.value)
}

const hexSummary = computed(() => (isBinary.value ? binaryHexSummary(text.value) : ''))
</script>

<template>
  <div class="rb">
    <div class="rb-ctrl">
      <Segmented
        :options="modes"
        :model-value="mode"
        @update:model-value="(v) => {
          if (!disablePretty(v)) mode = v as Mode
        }"
      />
      <button v-if="mode === 'raw'" class="icon-btn" :class="{ active: wrap }" :title="L.response.body.wrap" @click="wrap = !wrap">
        <WrapText :size="13" />
      </button>
      <div class="rb-search">
        <Search :size="12" />
        <input
          v-model="search"
          :placeholder="L.response.body.searchPlaceholder"
          :disabled="mode !== 'raw' || isBinary"
        />
      </div>
      <span v-if="highlighted" class="rb-count">{{ highlighted.count }} {{ L.response.body.matchCount }}</span>
      <span v-else-if="search && mode === 'raw' && !isBinary" class="rb-count dim">
        {{ capped ? L.response.body.searchTooLarge : L.response.body.noMatch }}
      </span>
      <div class="rb-flex"></div>
      <button
        v-if="!isBinary"
        class="icon-btn"
        :title="L.response.body.copy"
        @click="onCopy"
      >
        <Check v-if="copied" :size="13" />
        <Copy v-else :size="13" />
      </button>
      <button v-if="!isBinary" class="icon-btn" :title="L.response.body.download" @click="onDownload">
        <Download :size="13" />
      </button>
    </div>

    <div v-if="isJson && !capPretty && !isBinary" class="rb-jp">
      <FileJson2 :size="12" />
      <input v-model="jsonPath" :placeholder="L.response.body.jsonPathPlaceholder" />
    </div>
    <pre v-if="jsonPathResult" class="rb-jp-result">{{ jsonPathResult }}</pre>
    <div v-else-if="jsonPath && !jsonPathResult && !capPretty" class="rb-jp-empty">{{ L.response.body.jsonPathEmpty }}</div>

    <div class="rb-content">
      <div v-if="isBinary" class="rb-binary">
        <div class="rb-hint">{{ L.response.body.binaryHint }}</div>
        <code v-if="hexSummary" class="rb-hex">{{ hexSummary }}</code>
      </div>

      <CodeEditor
        v-if="mode === 'pretty' && pretty && !isBinary"
        :model-value="pretty"
        language="json"
        :read-only="true"
        :var-highlight="false"
      />

      <template v-else-if="mode === 'raw'">
        <div v-if="highlighted" class="rb-raw" :class="{ wrap }" v-html="highlighted.html"></div>
        <pre v-else class="rb-raw" :class="{ wrap }">{{ rendered }}</pre>
      </template>

      <template v-else-if="mode === 'preview'">
        <iframe
          v-if="lang === 'html' && !isBinary"
          class="rb-pv"
          sandbox=""
          :srcdoc="rendered"
        ></iframe>
        <pre v-else-if="isJson && pretty" class="rb-raw">{{ pretty }}</pre>
        <div v-else class="rb-hint">{{ L.response.body.previewUnavailable }}</div>
      </template>

      <div v-if="capped" class="rb-hint">
        显示前 {{ formatBytes(RENDER_CAP) }}（共 {{ formatBytes(response.sizeBytes) }}）
      </div>
      <div v-if="capPretty && mode === 'raw'" class="rb-hint dim">{{ L.response.body.tooLargeForPretty }}</div>
    </div>
  </div>
</template>

<style scoped>
.rb {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 6px;
}
.rb-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rb-flex {
  flex: 1;
}
.rb-search {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--text-faint);
  width: 200px;
}
.rb-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.rb-search input:disabled {
  color: var(--text-faint);
}
.rb-count {
  font-size: 11px;
  color: var(--brand);
}
.rb-count.dim {
  color: var(--text-faint);
}
.rb-jp {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--text-faint);
}
.rb-jp input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-family: var(--mono);
}
.rb-jp-result {
  margin: 0;
  padding: 8px 10px;
  background: var(--brand-weak);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--mono);
  color: var(--text);
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.rb-jp-empty {
  font-size: 11px;
  color: var(--text-faint);
}
.rb-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.rb-content :deep(.ce) {
  flex: 1;
  min-height: 0;
}
.rb-raw {
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  background: var(--bg-sunken);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: var(--mono);
  line-height: 1.6;
  white-space: pre;
  word-break: normal;
}
.rb-raw.wrap {
  white-space: pre-wrap;
  word-break: break-all;
}
.rb-pv {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: var(--radius-sm);
  /* 有意固定白底：预览的是外部 HTML 页面，跟随主题会破坏无背景色的页面 */
  background: #fff;
}
.rb-binary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 2px 0;
}
.rb-hint {
  font-size: 11px;
  color: var(--text-faint);
  padding: 2px;
}
.rb-hint.dim {
  opacity: 0.8;
}
.rb-hex {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--text-dim);
  word-break: break-all;
}
</style>
