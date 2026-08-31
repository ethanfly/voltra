<template>
  <div class="kv-editor">
    <div v-for="(row, idx) in modelValue" :key="idx" class="kv-row">
      <input type="checkbox" v-model="row.enabled" />
      <input class="kv-key" type="text" v-model="row.key" placeholder="key" />
      <input class="kv-value" type="text" v-model="row.value" placeholder="value" />
      <button class="kv-remove" @click="removeRow(idx)">删除</button>
    </div>
    <button class="kv-add" @click="addRow">+ 添加一行</button>
  </div>
</template>

<script setup lang="ts">
import type { KVPair } from '../types/models'

const props = defineProps<{ modelValue: KVPair[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: KVPair[]): void }>()

function addRow() {
  emit('update:modelValue', [...props.modelValue, { key: '', value: '', enabled: true }])
}

function removeRow(idx: number) {
  const next = props.modelValue.slice()
  next.splice(idx, 1)
  emit('update:modelValue', next)
}
</script>

<style scoped>
.kv-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kv-key,
.kv-value {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}
.kv-remove {
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 12px;
}
.kv-remove:hover {
  color: #d85a30;
}
.kv-add {
  align-self: flex-start;
  border: 1px dashed #ccc;
  background: transparent;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}
</style>
