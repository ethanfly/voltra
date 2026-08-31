<script setup lang="ts">
// 通用下拉：#trigger 插槽 + 默认内容插槽，floating-ui 定位，点击外部 / Esc 关闭
import { ref } from 'vue'
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/vue'

defineProps<{ align?: 'start' | 'end' }>()

const open = ref(false)
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
  if (e.key === 'Escape') close()
}
</script>

<template>
  <div class="dropdown">
    <div ref="refEl" @click="toggle">
      <slot name="trigger" :open="open"></slot>
    </div>
    <div
      v-if="open"
      ref="floatEl"
      class="dropdown-menu"
      :style="floatingStyles"
      :data-placement="placement"
      @keydown="onKeydown"
    >
      <slot :close="close"></slot>
    </div>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-flex;
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
