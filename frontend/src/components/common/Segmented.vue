<script setup lang="ts">
// 分段选择器（主题 light/dark/system、Body 类型等）
defineProps<{
  options: { value: string; label: string; title?: string }[]
  modelValue: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
</script>

<template>
  <div class="segmented">
    <button
      v-for="opt in options"
      :key="opt.value"
      :title="opt.title"
      :class="['seg', { active: modelValue === opt.value }]"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2px;
  gap: 2px;
}
.seg {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--ease);
  white-space: nowrap;
}
.seg:hover {
  color: var(--text);
}
.seg.active {
  background: var(--bg-elev);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
</style>
