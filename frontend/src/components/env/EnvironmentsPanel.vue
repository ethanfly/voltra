<script setup lang="ts">
// 环境面板（基础版）：环境选择/新建/重命名/删除 + 变量表（键/初始值/当前值/启用/敏感）
// 阶段 7 增强：项目级/全局变量区、未定义变量标红
import { computed, ref } from 'vue'
import { Plus, Trash2, Pencil, Eye, EyeOff } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import {
  env,
  currentEnv,
  addEnvToProject,
  renameEnv,
  removeEnvFromProject,
} from '../../stores/env'
import { currentProject } from '../../stores/workspace'
import { scheduleSave } from '../../lib/persist'
import { t } from '../../locales/zh-CN'
import type { Variable } from '../../types/models'

const L = computed(() => t())
const p = computed(() => currentProject.value)

function commit() {
  const pr = p.value
  if (pr) pr.updatedAt = Date.now()
  scheduleSave('projects')
}

function onAddEnv() {
  addEnvToProject('新环境')
}

// 重命名（双击进入）
const renamingId = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const renameText = computed({
  get: () => currentEnv.value?.name ?? '',
  set: (v) => {
    if (currentEnv.value) renameEnv(currentEnv.value.id, v)
  },
})
function startRename() {
  if (currentEnv.value) {
    renamingId.value = currentEnv.value.id
    setTimeout(() => renameInput.value?.select(), 0)
  }
}
function endRename() {
  renamingId.value = null
  commit()
}

function onRemoveEnv() {
  if (currentEnv.value) removeEnvFromProject(currentEnv.value.id)
}

// 变量表
function addVarRow() {
  if (!currentEnv.value) return
  currentEnv.value.variables.push({ key: '', initialValue: '', currentValue: '', enabled: true })
  commit()
}
function removeVarRow(v: Variable) {
  if (!currentEnv.value) return
  const i = currentEnv.value.variables.indexOf(v)
  if (i >= 0) currentEnv.value.variables.splice(i, 1)
  commit()
}
</script>

<template>
  <div class="ep">
    <template v-if="!p">
      <EmptyState :title="L.env.empty" :hint="L.tree.noProjectHint" />
    </template>
    <template v-else-if="p.environments.length === 0">
      <EmptyState :title="L.env.empty">
        <template #actions>
          <button class="btn btn-primary" @click="onAddEnv">
            <Plus :size="13" /> {{ L.dialog.envNew }}
          </button>
        </template>
      </EmptyState>
    </template>
    <template v-else>
      <!-- 环境选择行 -->
      <div class="ep-row">
        <input
          v-if="renamingId"
          ref="renameInput"
          v-model="renameText"
          class="input ep-rename"
          @blur="endRename"
          @keyup.enter="endRename"
          @keyup.esc="renamingId = null"
        />
        <button v-else class="ep-env-name" @dblclick="startRename">
          {{ currentEnv?.name ?? L.env.noEnv }}
        </button>
        <button v-if="currentEnv" class="ep-act" :title="L.common.rename" @dblclick="startRename">
          <Pencil :size="12" />
        </button>
        <button v-if="currentEnv" class="ep-act" :title="L.common.delete" @click="onRemoveEnv">
          <Trash2 :size="12" />
        </button>
        <button class="ep-act" :title="L.dialog.envNew" @click="onAddEnv">
          <Plus :size="12" />
        </button>
      </div>

      <!-- 环境下拉（切换） -->
      <div class="ep-select">
        <select class="input ep-select-el" :value="env.currentEnvId ?? ''" @change="env.currentEnvId = ($event.target as HTMLSelectElement).value || null">
          <option value="">{{ L.env.noEnv }}</option>
          <option v-for="e in p.environments" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>

      <!-- 变量表 -->
      <div v-if="currentEnv" class="ep-vars">
        <div class="ep-vars-head">
          <span>{{ L.env.vars }}</span>
          <button class="ep-act" :title="L.request.kv.addRow" @click="addVarRow">
            <Plus :size="12" />
          </button>
        </div>
        <div v-if="currentEnv.variables.length === 0" class="ep-vars-empty">{{ L.common.empty }}</div>
        <table v-else class="ep-table">
          <thead>
            <tr>
              <th>{{ L.env.key }}</th>
              <th>{{ L.env.initial }}</th>
              <th>{{ L.env.current }}</th>
              <th class="ep-th-act">{{ L.env.enabled }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in currentEnv.variables" :key="i" class="ep-var-row">
              <td><input v-model="v.key" class="input cell" @change="commit" /></td>
              <td><input v-model="v.initialValue" class="input cell" @change="commit" /></td>
              <td>
                <input
                  v-model="v.currentValue"
                  class="input cell"
                  :type="v.secret ? 'password' : 'text'"
                  @change="commit"
                />
                <button class="ep-eye" :title="L.env.secret" @click="v.secret = !v.secret; commit()">
                  <EyeOff v-if="v.secret" :size="11" />
                  <Eye v-else :size="11" />
                </button>
              </td>
              <td class="ep-td-act">
                <label class="ep-check">
                  <input v-model="v.enabled" type="checkbox" @change="commit" />
                </label>
                <button class="ep-act" :title="L.common.delete" @click="removeVarRow(v)">
                  <Trash2 :size="12" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ep {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.ep-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px 6px;
}
.ep-env-name {
  flex: 1;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-rename {
  flex: 1;
  height: 24px;
  font-size: 12px;
}
.ep-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.ep-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.ep-select {
  padding: 0 8px 10px;
}
.ep-select-el {
  width: 100%;
  height: 26px;
  font-size: 12px;
}
.ep-vars {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
.ep-vars-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.ep-vars-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-faint);
}
.ep-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ep-table th {
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  padding: 3px 4px;
  border-bottom: 1px solid var(--border);
}
.ep-table td {
  padding: 3px 4px;
  vertical-align: middle;
}
.cell {
  width: 100%;
  height: 24px;
  font-size: 12px;
}
.ep-td-act {
  white-space: nowrap;
  width: 56px;
}
.ep-th-act {
  width: 56px;
}
.ep-check {
  display: inline-flex;
  align-items: center;
}
.ep-eye {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  padding: 2px;
}
.ep-eye:hover {
  color: var(--text);
}
</style>
