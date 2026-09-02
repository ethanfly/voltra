<script setup lang="ts">
// KV 行编辑器：checkbox 启用 / key / value（/可选 description）/ 悬停删除
// 直接原地修改传入的 reactive 数组（行对象本身即响应式），不 emit 副本
// 值中含 {{var}} 的行加 .kv-var 类（变量色）；含未定义变量加 .kv-var-bad（红色波浪线，ENV-4）
// 悬浮提示（ENV-5）：title 列出 名称=值（secret 打码）/ 未定义标注
import { Plus, Trash2 } from 'lucide-vue-next'
import type { KVPair } from '../../types/models'
import { t } from '../../locales/zh-CN'
import { missingIn, varTitle } from '../../lib/var-ui'

const props = withDefaults(defineProps<{
  modelValue: KVPair[]
  description?: boolean
}>(), { description: false })

const L = t()

function hasVars(v: string): boolean {
  return /\{\{.*?\}\}/.test(v)
}
function isVarBad(v: string): boolean {
  return missingIn(v).length > 0
}
function addRow() {
  props.modelValue.push({ key: '', value: '', enabled: true })
}
function removeRow(idx: number) {
  props.modelValue.splice(idx, 1)
}
</script>

<template>
  <div class="kve">
    <div class="kve-head" :class="{ desc: description }">
      <span class="kve-cb"></span>
      <span>{{ L.request.kv.key }}</span>
      <span>{{ L.request.kv.value }}</span>
      <span v-if="description">{{ L.request.kv.description }}</span>
      <span class="kve-sp"></span>
    </div>
    <div
      v-for="(row, idx) in modelValue"
      :key="idx"
      class="kve-row"
      :class="{ disabled: !row.enabled }"
    >
      <input type="checkbox" v-model="row.enabled" />
      <input
        class="kve-in"
        v-model="row.key"
        :class="{ 'kv-var': hasVars(row.key), 'kv-var-bad': isVarBad(row.key) }"
        :title="varTitle(row.key)"
        :placeholder="L.request.kv.key"
      />
      <input
        class="kve-in"
        v-model="row.value"
        :class="{ 'kv-var': hasVars(row.value), 'kv-var-bad': isVarBad(row.value) }"
        :title="varTitle(row.value)"
        :placeholder="L.request.kv.value"
        :type="row.key.toLowerCase() === 'authorization' ? 'password' : 'text'"
      />
      <input
        v-if="description"
        class="kve-in kve-desc"
        v-model="row.description"
        :class="{ 'kv-var-bad': isVarBad(row.description ?? '') }"
        :title="varTitle(row.description ?? '')"
        :placeholder="L.request.kv.description"
      />
      <button class="icon-btn kve-del" :title="L.common.delete" @click="removeRow(idx)">
        <Trash2 :size="14" />
      </button>
    </div>
    <button class="btn kve-add" @click="addRow">
      <Plus :size="13" /> {{ L.request.kv.addRow }}
    </button>
  </div>
</template>

<style scoped>
/* Postman 式平铺表格：无单元格边框，行分隔用 hairline，行 hover 出底 */
.kve {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 12px;
}
.kve-head,
.kve-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kve-head {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.2px;
  padding: 8px 8px 6px;
}
.kve-head > span:not(:first-child):not(:last-child) {
  flex: 1;
}
.kve-sp {
  width: 30px;
  flex-shrink: 0;
}
.kve-row {
  height: 38px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: background var(--ease);
}
.kve-row:hover {
  background: var(--bg-hover);
}
.kve-cb {
  width: 13px;
  flex-shrink: 0;
}
.kve-row input[type='checkbox'] {
  accent-color: var(--brand);
  flex-shrink: 0;
  margin: 0;
  width: 13px;
  height: 13px;
}
/* 平铺单元格：无边框，聚焦时"字段层底 + 品牌色下划线"（对齐 Postman 单元格焦点态） */
.kve-in {
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
.kve-in:focus {
  background: var(--bg-sunken);
  box-shadow: inset 0 -2px 0 var(--brand);
}
.kve-row.disabled .kve-in,
.kve-row.disabled .kve-del {
  color: var(--text-faint);
  text-decoration: line-through;
}
.kve-in.kv-var {
  background: var(--brand-weak);
}
.kve-in.kv-var:focus {
  box-shadow: inset 0 -2px 0 var(--brand);
}
.kve-in.kv-var-bad {
  color: var(--error);
  text-decoration: underline wavy var(--error);
}
.kve-in.kv-var-bad:focus {
  box-shadow: inset 0 -2px 0 var(--error);
}
.kve-del {
  opacity: 0;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  transition: opacity var(--ease);
}
.kve-row:hover .kve-del {
  opacity: 1;
}
/* 加行用幽灵按钮（Postman 的 "+ Add another ..." 质感），不用实心 .btn */
.kve-add {
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
.kve-add:hover {
  border-color: transparent;
  background: var(--bg-hover);
  color: var(--text);
}
</style>
