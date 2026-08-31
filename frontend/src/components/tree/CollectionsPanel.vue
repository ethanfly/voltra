<script setup lang="ts">
// 接口集合面板（基础版：列表 + 展开折叠 + 点击打开；阶段 4 加搜索/DnD/右键）
import { computed } from 'vue'
import { Plus, FilePlus2, FolderPlus } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import TreeNodeRow from './TreeNodeRow.vue'
import { currentProject, addCollection, addFolder, addRequest } from '../../stores/workspace'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

const p = computed(() => currentProject.value)
const isEmpty = computed(() => !p.value || p.value.collections.length === 0)

// 空状态三个按钮：目标集合 = 已有集合取第一个，否则先建一个
function targetCollection() {
  const pr = currentProject.value
  if (!pr) return null
  if (pr.collections.length > 0) return pr.collections[0]
  return addCollection('新集合')
}

function onNewRequest() {
  const c = targetCollection()
  if (!c) return
  addRequest(c)
}

function onNewFolder() {
  const c = targetCollection()
  if (!c) return
  addFolder(c, '新建文件夹')
}

function onNewCollection() {
  addCollection('新集合')
}
</script>

<template>
  <div class="cp">
    <template v-if="!p">
      <EmptyState :title="L.tree.empty" :hint="L.tree.noProjectHint" />
    </template>
    <template v-else-if="isEmpty">
      <EmptyState :title="L.tree.empty">
        <template #actions>
          <button class="btn" @click="onNewRequest">
            <FilePlus2 :size="13" /> {{ L.tree.newRequest }}
          </button>
          <button class="btn" @click="onNewFolder">
            <FolderPlus :size="13" /> {{ L.tree.newFolder }}
          </button>
          <button class="btn btn-primary" @click="onNewCollection">
            <Plus :size="13" /> {{ L.tree.newCollection }}
          </button>
        </template>
      </EmptyState>
    </template>
    <template v-else>
      <TreeNodeRow v-for="c in p.collections" :key="c.id" :node="c" :level="0" />
    </template>
  </div>
</template>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
}
</style>
