<script setup lang="ts">
// 另存为：命名 + 选择目标集合/文件夹（阶段 5 的 Cmd+S / 未保存标签会用）
import { computed, ref } from 'vue'
import { Folder } from 'lucide-vue-next'
import Modal from '../common/Modal.vue'
import { currentProject } from '../../stores/workspace'
import type { ID, TreeNode } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = withDefaults(defineProps<{ name?: string }>(), { name: '' })
const emit = defineEmits<{
  (e: 'save', name: string, targetId: ID): void
  (e: 'close'): void
}>()

const L = computed(() => t())

const name = ref(props.name.trim() || '新建请求')
const targetId = ref<ID | null>(null)

interface Target {
  id: ID
  name: string
  depth: number
}
const targets = computed<Target[]>(() => {
  const p = currentProject.value
  if (!p) return []
  const out: Target[] = []
  const walk = (items: TreeNode[], depth: number) => {
    for (const n of items) {
      out.push({ id: n.id, name: n.name, depth })
      if (n.kind === 'folder') walk(n.items, depth + 1)
    }
  }
  for (const c of p.collections) {
    out.push({ id: c.id, name: c.name, depth: 0 })
    walk(c.items, 1)
  }
  return out
})

// 默认选中第一个
if (targets.value.length > 0) targetId.value = targets.value[0].id

function confirm() {
  const n = name.value.trim()
  if (!n || !targetId.value) return
  emit('save', n, targetId.value)
  emit('close')
}
</script>

<template>
  <Modal :title="L.dialog.saveTo" @close="emit('close')">
    <div class="sv">
      <label class="sv-label">{{ L.dialog.namePlaceholder }}</label>
      <input
        class="input"
        v-model="name"
        style="width: 100%"
        autofocus
        @keyup.enter="confirm"
      />

      <label class="sv-label">{{ L.dialog.saveToPlaceholder }}</label>
      <div v-if="targets.length === 0" class="sv-empty">
        {{ L.tree.noProjectHint }}
      </div>
      <div v-else class="sv-list">
        <label
          v-for="t in targets"
          :key="t.id"
          :class="['sv-item', { active: targetId === t.id }]"
          :style="{ paddingInlineStart: 8 + t.depth * 14 + 'px' }"
        >
          <input v-model="targetId" type="radio" name="sv-target" :value="t.id" />
          <Folder :size="12" />
          <span class="sv-item-name">{{ t.name }}</span>
        </label>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">{{ L.common.cancel }}</button>
      <button class="btn btn-primary" :disabled="!name.trim() || !targetId || targets.length === 0" @click="confirm">
        {{ L.common.confirm }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.sv {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sv-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  margin-top: 8px;
}
.sv-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 8px 0;
}
.sv-list {
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px;
}
.sv-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
}
.sv-item:hover {
  background: var(--bg-hover);
}
.sv-item.active {
  background: var(--brand-weak);
  color: var(--text);
}
.sv-item input {
  accent-color: var(--brand);
}
.sv-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
