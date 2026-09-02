<script setup lang="ts">
// 方法选择器：文本色随方法变（m-GET 等令牌色）
import { computed } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const cls = computed(() => {
  const m = (props.modelValue || 'GET').toUpperCase()
  return methods.includes(m) ? 'm-' + m : 'm-UNKNOWN'
})
</script>

<template>
  <select
    class="mp"
    :class="cls"
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
  </select>
</template>

<style scoped>
.mp {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3px;
  height: var(--urlbar-h);
  padding: 0 24px 0 14px;
  cursor: pointer;
  outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
}
.mp:hover {
  border-color: var(--border-strong);
}
.mp:focus {
  border-color: var(--brand);
}
</style>
