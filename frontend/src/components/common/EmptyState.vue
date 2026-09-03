<script setup lang="ts">
// 空状态：图标 + 标题 + 提示 + 操作插槽
defineProps<{
  title: string
  hint?: string
  icon?: string
}>()
</script>

<template>
  <div class="empty">
    <div v-if="icon" class="empty-icon" v-html="icon"></div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="hint" class="empty-hint">{{ hint }}</div>
    <div v-if="$slots.actions" class="empty-actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 160px;
  padding: 24px;
  text-align: center;
  color: var(--text-dim);
}
.empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-well);
  display: grid;
  place-items: center;
  margin-bottom: 14px;
  color: var(--text-faint);
}
.empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}
.empty-hint {
  font-size: 12px;
  margin-top: 6px;
  max-width: 260px;
}
.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}
</style>
