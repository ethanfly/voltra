<script setup lang="ts">
// 轻量 CSS 悬浮提示（纯展示，变量值预览等动态内容同样适用）
defineProps<{
  tip: string
  /** 弹出方位 */
  side?: 'top' | 'bottom' | 'left' | 'right'
}>()
</script>

<template>
  <span class="tip-wrap">
    <slot></slot>
    <span v-if="tip" class="tip" :data-side="side || 'top'">{{ tip }}</span>
  </span>
</template>

<style scoped>
.tip-wrap {
  position: relative;
  display: inline-flex;
}
.tip {
  position: absolute;
  z-index: 300;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 80ms ease 200ms;
  background: var(--text);
  color: var(--bg-elev);
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  max-width: 360px;
  word-break: break-all;
  box-shadow: var(--shadow);
}
.tip[data-side='top'] {
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}
.tip[data-side='bottom'] {
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}
.tip[data-side='left'] {
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
}
.tip[data-side='right'] {
  left: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
}
.tip-wrap:hover .tip {
  opacity: 1;
  visibility: visible;
}
</style>
