<script setup lang="ts">
// 确认对话框（危险操作红色按钮）
import Modal from './Modal.vue'
import { t } from '../../locales/zh-CN'

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmText?: string
    danger?: boolean
  }>(),
  { confirmText: '', danger: false },
)

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <Modal :title="title" @close="emit('cancel')">
    <div class="confirm-msg">{{ message }}</div>
    <template #footer>
      <button class="btn" @click="emit('cancel')">{{ t().common.cancel }}</button>
      <button :class="['btn', 'btn-primary', { 'btn-danger': danger }]" @click="emit('confirm')">
        {{ confirmText || t().common.confirm }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.confirm-msg {
  color: var(--text-dim);
  line-height: 1.6;
}
</style>
