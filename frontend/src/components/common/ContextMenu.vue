<script setup lang="ts">
// 右键菜单：给定屏幕坐标 + 条目列表，点击外部 / Esc / 滚动时关闭
import { onMounted, onBeforeUnmount, ref } from 'vue'

export interface MenuItem {
  label: string
  danger?: boolean
  disabled?: boolean
  sep?: boolean // 只画分隔线
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{
  (e: 'select', item: MenuItem, index: number): void
  (e: 'close'): void
}>()

const el = ref<HTMLElement | null>(null)

// 视口内钳制
const pos = ref({ left: props.x, top: props.y })
onMounted(() => {
  const w = el.value?.offsetWidth ?? 180
  const h = el.value?.offsetHeight ?? 200
  pos.value = {
    left: Math.max(4, Math.min(props.x, window.innerWidth - w - 4)),
    top: Math.max(4, Math.min(props.y, window.innerHeight - h - 4)),
  }
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onKey)
  window.addEventListener('wheel', close, { passive: true })
  window.addEventListener('resize', close)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('wheel', close)
  window.removeEventListener('resize', close)
})

function onOutside(e: MouseEvent) {
  if (el.value && !el.value.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
function close() {
  emit('close')
}
function pick(item: MenuItem, i: number) {
  if (item.disabled) return
  emit('select', item, i)
}
</script>

<template>
  <div ref="el" class="ctx" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.sep" class="ctx-sep"></div>
      <button
        v-else
        :class="['ctx-item', { danger: item.danger, disabled: item.disabled }]"
        @click="pick(item, i)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.ctx {
  position: fixed;
  z-index: 300;
  min-width: 160px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.ctx-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.ctx-item.danger:hover {
  background: var(--error-weak);
  color: var(--error);
}
.ctx-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ctx-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 2px;
}
</style>
