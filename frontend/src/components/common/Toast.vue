<script setup lang="ts">
// 全局 toast 堆栈：右下角浮层，success/error/info 三态，点击或超时自动消失
import { toasts, dismissToast } from '../../stores/toast'
import { Check, X, Info } from 'lucide-vue-next'
</script>

<template>
  <transition-group v-if="toasts.list.length" name="toast" tag="div" class="toast-stack">
    <div
      v-for="t in toasts.list"
      :key="t.id"
      :class="['toast', 'toast-' + t.kind]"
      role="status"
      @click="dismissToast(t.id)"
    >
      <Check v-if="t.kind === 'success'" :size="15" />
      <X v-else-if="t.kind === 'error'" :size="15" />
      <Info v-else :size="15" />
      <span class="toast-text">{{ t.text }}</span>
    </div>
  </transition-group>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 300; /* 高于代码抽屉(200)等浮层 */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  padding: 9px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 12.5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.toast svg {
  flex-shrink: 0;
}
.toast-success svg {
  color: var(--brand);
}
.toast-error svg {
  color: var(--error);
}
.toast-info svg {
  color: var(--text-dim);
}
.toast-error {
  border-color: var(--error-weak);
}
.toast-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 长路径允许换行，避免被截断看不清 */
.toast .toast-text {
  white-space: normal;
  word-break: break-all;
}
.toast-enter-active,
.toast-leave-active {
  transition: all var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
