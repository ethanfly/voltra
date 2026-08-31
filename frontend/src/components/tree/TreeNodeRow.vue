<script setup lang="ts">
// 树节点行（基础版，阶段 4 扩展 DnD / 右键菜单 / 内联重命名 / 方法色标）
// 递归渲染：SFC 通过文件名隐式自引用
import { computed } from 'vue'
import { ChevronRight, ChevronDown, Folder, Globe, Wifi } from 'lucide-vue-next'
import type { TreeNode, Collection, Request } from '../../types/models'
import { isExpanded, toggleExpanded } from '../../stores/ui-state'
import { openRequest } from '../../stores/tabs'

const props = withDefaults(
  defineProps<{ node: TreeNode | Collection; level?: number }>(),
  { level: 0 },
)

const emits = defineEmits<{ (e: 'open', r: Request): void }>()

// Collection 没有 kind 字段，用 'kind' in 收窄到 Folder | Request
const isRequest = computed(() => 'kind' in props.node && props.node.kind === 'request')
const req = computed<Request | null>(() => (isRequest.value ? (props.node as Request) : null))
const items = computed<TreeNode[]>(() => (isRequest.value ? [] : (props.node as Collection | { items: TreeNode[] }).items))
const hasChildren = computed(() => items.value.length > 0)
const expanded = computed(() => isExpanded(props.node.id))

const indent = computed(() => ({ paddingInlineStart: 8 + props.level * 14 + 'px' }))

function onToggle() {
  if (isRequest.value) return
  toggleExpanded(props.node.id)
}

function onClick() {
  if (req.value) {
    openRequest(req.value)
    emits('open', req.value)
  } else {
    onToggle()
  }
}

</script>

<template>
  <div>
    <div
      :class="['tn-row', { 'tn-request': isRequest }]"
      :style="indent"
      @click="onClick"
    >
      <button
        v-if="hasChildren"
        class="tn-chevron"
        :class="{ open: expanded }"
        @click.stop="onToggle"
      >
        <ChevronDown v-if="expanded" :size="12" />
        <ChevronRight v-else :size="12" />
      </button>
      <span v-else class="tn-chevron-placeholder"></span>
      <component :is="req ? (req.protocol === 'ws' ? Wifi : Globe) : Folder" :size="13" class="tn-ico" />
      <span :class="['tn-name', { 'm-ws': req?.protocol === 'ws' }]" :title="node.name">
        <template v-if="req && req.protocol === 'http'">
          <span :class="['tn-method', 'm-' + req.method.toLowerCase()]">{{ req.method }}</span>
        </template>
        {{ node.name }}
      </span>
    </div>
    <template v-if="!isRequest && expanded">
      <TreeNodeRow
        v-for="child in items"
        :key="child.id"
        :node="child"
        :level="props.level + 1"
        @open="(r) => $emit('open', r)"
      />
    </template>
  </div>
</template>

<style scoped>
.tn-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--row-h);
  padding-right: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--text-dim);
  transition: background var(--ease);
}
.tn-row:hover {
  background: var(--bg-hover);
}
.tn-request {
  color: var(--text);
}
.tn-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.tn-chevron:hover {
  background: var(--border);
  color: var(--text);
}
.tn-chevron-placeholder {
  width: 16px;
  flex-shrink: 0;
}
.tn-ico {
  color: var(--text-faint);
  flex-shrink: 0;
}
.tn-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-method {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
</style>
