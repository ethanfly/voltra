<script setup lang="ts">
// Body：none / raw(CM6+格式化) / urlencoded / form-data(文本·文件) / binary / graphql
import { ref } from 'vue'
import { FileUp, Trash2, Plus } from 'lucide-vue-next'
import Segmented from '../common/Segmented.vue'
import KvEditor from '../common/KvEditor.vue'
import CodeEditor, { type CodeLang } from '../common/CodeEditor.vue'
import { StorageService } from '../../api/backend'
import type { Request, RequestBody, FormField } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ request: Request }>()
const L = t()

const body = () => props.request.body

const typeOptions = [
  { value: 'none', label: L.request.body.none },
  { value: 'raw', label: L.request.body.raw },
  { value: 'urlencoded', label: L.request.body.urlencoded },
  { value: 'form-data', label: L.request.body['form-data'] },
  { value: 'binary', label: L.request.body.binary },
  { value: 'graphql', label: L.request.body.graphql },
]

/** 切 type 时补齐该类型的默认字段（不清空已编辑内容，便于来回切换） */
function setType(v: string) {
  const b = body()
  switch (v) {
    case 'raw':
      if (b.raw === undefined) b.raw = ''
      if (!b.rawLang) b.rawLang = 'text'
      break
    case 'urlencoded':
      b.urlencoded ??= [{ key: '', value: '', enabled: true }]
      break
    case 'form-data':
      b.formData ??= [{ key: '', value: '', enabled: true, type: 'text' }]
      break
    case 'binary':
      b.binaryPath ??= ''
      break
    case 'graphql':
      b.graphql ??= { query: '', variables: '' }
      break
  }
  b.type = v as RequestBody['type']
}

const langOptions: { value: CodeLang; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'Text' },
  { value: 'html', label: 'HTML' },
]

const rawEditor = ref<InstanceType<typeof CodeEditor> | null>(null)
const formatErr = ref(false)
function onFormat() {
  const r = rawEditor.value?.format() ?? 'noop'
  if (r === 'error') {
    formatErr.value = true
    setTimeout(() => (formatErr.value = false), 1500)
  }
}

async function pickBinary() {
  const path = await StorageService.PickFile()
  if (path) body().binaryPath = path
}
async function pickFormFile(f: FormField) {
  const path = await StorageService.PickFile()
  if (path) {
    f.type = 'file'
    f.filePath = path
  }
}
function setFormType(f: FormField, v: string) {
  f.type = v as FormField['type']
  if (f.type === 'text') f.filePath = undefined
}
function removeFormRow(f: FormField) {
  const arr = body().formData
  if (!arr) return
  const i = arr.indexOf(f)
  if (i >= 0) arr.splice(i, 1)
}
</script>

<template>
  <div class="bt">
    <div class="bt-head">
      <Segmented :options="typeOptions" :model-value="request.body.type" @update:model-value="setType" />
      <template v-if="request.body.type === 'raw'">
        <select
          class="bt-select"
          :value="request.body.rawLang ?? 'text'"
          @change="request.body.rawLang = ($event.target as HTMLSelectElement).value as RequestBody['rawLang']"
        >
          <option v-for="o in langOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <button v-if="request.body.rawLang === 'json'" class="btn" @click="onFormat">格式化</button>
        <span v-if="formatErr" class="bt-err">JSON 解析失败</span>
      </template>
    </div>

    <div class="bt-body">
      <!-- none -->
      <div v-if="request.body.type === 'none'" class="bt-empty">无请求体</div>

      <!-- raw -->
      <CodeEditor
        v-else-if="request.body.type === 'raw'"
        ref="rawEditor"
        :model-value="request.body.raw ?? ''"
        :language="(request.body.rawLang ?? 'text') as CodeLang"
        :line-numbers="true"
        @update:model-value="request.body.raw = $event"
      />

      <!-- urlencoded（setType 已保证数组存在；KvEditor 原地修改，无需 emit） -->
      <KvEditor v-else-if="request.body.type === 'urlencoded'" :model-value="request.body.urlencoded!" />

      <!-- form-data（与 Params 同款：表头行 + 有边框输入框，未聚焦也可见轮廓） -->
      <div v-else-if="request.body.type === 'form-data'" class="fd">
        <div class="fd-head">
          <span class="fd-cb"></span>
          <span>{{ L.request.kv.key }}</span>
          <span class="fd-h-type">{{ L.request.kv.type }}</span>
          <span>{{ L.request.kv.value }}</span>
          <span class="fd-h-sp"></span>
        </div>
        <div
          v-for="(f, idx) in request.body.formData ?? []"
          :key="idx"
          class="fd-row"
          :class="{ disabled: !f.enabled }"
        >
          <input type="checkbox" v-model="f.enabled" />
          <input class="fd-in" v-model="f.key" :placeholder="L.request.kv.key" />
          <select class="fd-type" :value="f.type" @change="setFormType(f, ($event.target as HTMLSelectElement).value)">
            <option value="text">text</option>
            <option value="file">file</option>
          </select>
          <input
            v-if="f.type === 'text'"
            class="fd-in"
            v-model="f.value"
            :placeholder="L.request.kv.value"
          />
          <div v-else class="fd-file">
            <span class="fd-path">{{ f.filePath || '未选择文件' }}</span>
            <button class="btn fd-pick" @click="pickFormFile(f)">
              <FileUp :size="12" /> {{ L.request.body.binaryPickFile }}
            </button>
          </div>
          <button class="icon-btn fd-del" :title="L.common.delete" @click="removeFormRow(f)">
            <Trash2 :size="13" />
          </button>
        </div>
        <button
          class="btn fd-add"
          @click="
            (request.body.formData ??= []).push({ key: '', value: '', enabled: true, type: 'text' })
          "
        >
          <Plus :size="13" /> {{ L.request.kv.addRow }}
        </button>
      </div>

      <!-- binary -->
      <div v-else-if="request.body.type === 'binary'" class="bt-pick">
        <button class="btn" @click="pickBinary">
          <FileUp :size="13" /> {{ L.request.body.binaryPickFile }}
        </button>
        <span v-if="request.body.binaryPath" class="fd-path">{{ request.body.binaryPath }}</span>
        <span v-else class="bt-empty">未选择文件</span>
      </div>

      <!-- graphql -->
      <div v-else-if="request.body.type === 'graphql'" class="gq">
        <label class="gq-label">Query</label>
        <CodeEditor
          class="gq-q"
          :model-value="request.body.graphql?.query ?? ''"
          language="text"
          :line-numbers="true"
          @update:model-value="request.body.graphql!.query = $event"
        />
        <label class="gq-label">Variables（JSON）</label>
        <CodeEditor
          class="gq-v"
          :model-value="request.body.graphql?.variables ?? ''"
          language="json"
          :line-numbers="true"
          @update:model-value="request.body.graphql!.variables = $event"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bt {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.bt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 4px;
}
.bt-select {
  height: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 11px;
  padding: 0 6px;
  outline: none;
  cursor: pointer;
}
.bt-err {
  font-size: 11px;
  color: var(--error);
}
.bt-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bt-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 12px 10px;
}
.bt-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
}
/* 与 KvEditor 同款 Postman 平铺表格 */
.fd {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 12px;
  overflow: auto;
}
.fd-head,
.fd-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fd-head {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.2px;
  padding: 8px 8px 6px;
}
.fd-cb {
  width: 13px;
  flex-shrink: 0;
}
/* 键 / 值 列 flex 撑满，类型列固定宽，与下方输入框列对齐 */
.fd-head > span:nth-child(2),
.fd-head > span:nth-child(4) {
  flex: 1;
  min-width: 0;
}
.fd-h-type {
  width: 56px;
  flex-shrink: 0;
}
.fd-h-sp {
  width: 30px;
  flex-shrink: 0;
}
.fd-row {
  height: 38px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: background var(--ease);
}
.fd-row:hover {
  background: var(--bg-hover);
}
.fd-row input[type='checkbox'] {
  accent-color: var(--brand);
  flex-shrink: 0;
  margin: 0;
  width: 13px;
  height: 13px;
}
/* 与 .kve-in 一致：平铺单元格，行 hover 出底、聚焦品牌色下划线 */
.fd-in {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-family: var(--mono);
  outline: none;
  transition: background var(--ease), box-shadow var(--ease);
}
.fd-in:focus {
  background: var(--bg-sunken);
  box-shadow: inset 0 -2px 0 var(--brand);
}
.fd-type {
  width: 56px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--text-dim);
  font-size: 12px;
  padding: 0 4px;
  outline: none;
  cursor: pointer;
  flex-shrink: 0;
}
.fd-file {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.fd-path {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fd-pick {
  flex-shrink: 0;
  font-size: 11px;
  height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fd-del {
  opacity: 0;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  transition: opacity var(--ease);
}
.fd-row:hover .fd-del {
  opacity: 1;
}
/* 加行用幽灵按钮，与 .kve-add 一致 */
.fd-add {
  align-self: flex-start;
  margin-top: 6px;
  font-size: 12px;
  height: 28px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-color: transparent;
  background: transparent;
  color: var(--text-dim);
}
.fd-add:hover {
  border-color: transparent;
  background: var(--bg-hover);
  color: var(--text);
}
.fd-row.disabled .fd-in,
.fd-row.disabled .fd-path {
  color: var(--text-faint);
  text-decoration: line-through;
}
.gq {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.gq-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 6px 10px 2px;
}
.gq-q {
  flex: 3;
  min-height: 0;
}
.gq-v {
  flex: 2;
  min-height: 0;
}
</style>
