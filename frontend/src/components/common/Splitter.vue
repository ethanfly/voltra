<script setup lang="ts">
// 通用拖拽分隔条：axis=x 竖条（调宽度，delta 为横向位移），axis=y 横条（调高度）
const props = withDefaults(
  defineProps<{
    axis?: 'x' | 'y'
    /** 每次拖动回调（增量像素） */
    onResize: (delta: number) => void
  }>(),
  { axis: 'x' },
)

function onDown(e: PointerEvent) {
  e.preventDefault()
  let lastX = e.clientX
  let lastY = e.clientY
  const move = (ev: PointerEvent) => {
    if (props.axis === 'x') props.onResize(ev.clientX - lastX)
    else props.onResize(ev.clientY - lastY)
    lastX = ev.clientX
    lastY = ev.clientY
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  document.body.style.cursor = props.axis === 'x' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <div :class="['splitter', axis]" @pointerdown="onDown"></div>
</template>

<style scoped>
.splitter {
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}
.splitter.x {
  width: 4px;
  cursor: col-resize;
  margin: 0 -1px;
}
.splitter.y {
  height: 4px;
  cursor: row-resize;
  margin: -1px 0;
}
.splitter::after {
  content: '';
  position: absolute;
  inset: 0;
  background: transparent;
  transition: background var(--ease);
}
.splitter:hover::after,
.splitter:active::after {
  background: var(--border-strong);
}
</style>
