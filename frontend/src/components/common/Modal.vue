<script setup lang="ts">
// 通用模态框：默认 footer 插槽 + 标题；Esc / 点遮罩关闭
defineProps<{ title?: string; width?: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @pointerdown.self="emit('close')" @keydown="onKeydown" tabindex="-1">
      <div class="modal" :style="{ width: width ? width + 'px' : '380px' }" @pointerdown.stop>
        <div class="modal-title">
          <span v-if="title">{{ title }}</span>
          <slot name="title"></slot>
        </div>
        <div class="modal-body">
          <slot></slot>
        </div>
        <div class="modal-footer">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}
.modal-title {
  font-weight: 600;
  font-size: 14px;
  padding: 14px 16px 0;
}
.modal-body {
  padding: 12px 16px;
  overflow: auto;
  font-size: 13px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
}
</style>
