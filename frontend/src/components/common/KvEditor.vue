<script setup lang="ts">
// KV 行编辑器：checkbox 启用 / key / value（/可选 description）/ 悬停删除
// 直接原地修改传入的 reactive 数组（行对象本身即响应式），不 emit 副本
// 值中含 {{var}} 的行加 .kv-var 类（变量色）；禁用行划线灰显
import { Trash2 } from 'lucide-vue-next'
import type { KVPair } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = withDefaults(defineProps<{
  modelValue: KVPair[]
  description?: boolean
}>(), { description: false })

const L = t()

function hasVars(v: string): boolean {
  return /\{\{.*?\}\}/.test(v)
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
      <input class="kve-in" v-model="row.key" :class="{ 'kv-var': hasVars(row.key) }" :placeholder="L.request.kv.key" />
      <input
        class="kve-in"
        v-model="row.value"
        :class="{ 'kv-var': hasVars(row.value) }"
        :placeholder="L.request.kv.value"
        :type="row.key.toLowerCase() === 'authorization' ? 'password' : 'text'"
      />
      <input v-if="description" class="kve-in kve-desc" v-model="row.description" :placeholder="L.request.kv.description" />
      <button class="icon-btn kve-del" :title="L.common.delete" @click="removeRow(idx)">
        <Trash2 :size="12" />
      </button>
    </div>
    <button class="btn kve-add" @click="addRow">
      {{ L.request.kv.addRow }}
    </button>
  </div>
</template>

<style scoped>
.kve {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
}
.kve-head,
.kve-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.kve-head {
  font-size: 10px;
  color: var(--text-faint);
  padding: 0 2px;
}
.kve-head > span:not(:first-child):not(:last-child) {
  flex: 1;
}
.kve-sp {
  width: 18px;
  flex-shrink: 0;
}
.kve-row {
  height: var(--row-h);
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
.kve-in {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-family: var(--mono);
  outline: none;
  transition: border-color var(--ease), background var(--ease);
}
.kve-in:focus {
  border-color: var(--brand);
  background: var(--bg-elev);
}
.kve-row.disabled .kve-in,
.kve-row.disabled .kve-del {
  color: var(--text-faint);
  text-decoration: line-through;
}
.kve-in.kv-var {
  background: var(--brand-weak);
  border-color: transparent;
}
.kve-in.kv-var:focus {
  border-color: var(--brand);
}
.kve-del {
  opacity: 0;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.kve-row:hover .kve-del {
  opacity: 1;
}
.kve-add {
  align-self: flex-start;
  margin-top: 2px;
  font-size: 11px;
  height: 24px;
  padding: 0 10px;
}
</style>
