<script setup lang="ts">
// 通用下拉：#trigger 插槽 + 默认内容插槽，floating-ui 定位，点击外部 / Esc 关闭
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/vue'

defineProps<{ align?: 'start' | 'end' }>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const refEl = ref<HTMLElement | null>(null)
const floatEl = ref<HTMLElement | null>(null)

// @floating-ui/vue v2：useFloating(reference, floating, options)，位置只在 open 时更新
const { floatingStyles, placement } = useFloating(refEl, floatEl, {
  placement: 'bottom-start',
  middleware: [offset(4), flip(), shift({ padding: 8 })],
  open,
  whileElementsMounted: autoUpdate,
})

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}

// 点击组件外部关闭（capture 阶段，先于目标自身处理；菜单未聚焦时 Esc 也能关）
function onDocMousedown(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
onMounted(() => {
  window.addEventListener('mousedown', onDocMousedown, true)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDocMousedown, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="dropdown">
    <div ref="refEl" @click="toggle">
      <slot name="trigger" :open="open"></slot>
    </div>
    <div
      v-if="open"
      ref="floatEl"
      class="dropdown-menu"
      :style="floatingStyles"
      :data-placement="placement"
    >
      <slot :close="close"></slot>
    </div>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-flex;
  /* frameless 顶栏是拖拽区且拖拽属性会继承——下拉整体显式排除 */
  --wails-draggable: no-drag;
}
.dropdown-menu {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  min-width: 160px;
  max-height: 320px;
  overflow: auto;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 4px;
}
</style>
