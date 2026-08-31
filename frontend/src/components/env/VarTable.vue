<script setup lang="ts">
// 变量表（环境 / 项目级 / 全局共用）：键 / 初始值 / 当前值 / 敏感(打码) / 启用 / 删除
// 原地修改传入的 reactive 数组（行对象本身响应式，同 KvEditor 模式）；落盘由 onCommit 回调
import { Plus, Trash2, Eye, EyeOff } from 'lucide-vue-next'
import { t } from '../../locales/zh-CN'
import type { Variable } from '../../types/models'

const props = defineProps<{
  vars: Variable[]
  onCommit?: () => void
}>()

const L = t()

function commit() {
  props.onCommit?.()
}

function addRow() {
  props.vars.push({ key: '', initialValue: '', currentValue: '', enabled: true })
  commit()
}
function removeRow(v: Variable) {
  const i = props.vars.indexOf(v)
  if (i >= 0) props.vars.splice(i, 1)
  commit()
}
</script>

<template>
  <div class="vt">
    <div v-if="vars.length === 0" class="vt-empty">{{ L.common.empty }}</div>
    <table v-else class="vt-table">
      <thead>
        <tr>
          <th>{{ L.env.key }}</th>
          <th>{{ L.env.initial }}</th>
          <th>{{ L.env.current }}</th>
          <th class="vt-th-act">{{ L.env.enabled }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(v, i) in vars" :key="i" class="vt-row">
          <td><input v-model="v.key" class="input cell" @change="commit" /></td>
          <td><input v-model="v.initialValue" class="input cell" @change="commit" /></td>
          <td>
            <input
              v-model="v.currentValue"
              class="input cell"
              :type="v.secret ? 'password' : 'text'"
              @change="commit"
            />
            <button class="vt-eye" :title="L.env.secret" @click="v.secret = !v.secret; commit()">
              <EyeOff v-if="v.secret" :size="11" />
              <Eye v-else :size="11" />
            </button>
          </td>
          <td class="vt-td-act">
            <label class="vt-check">
              <input v-model="v.enabled" type="checkbox" @change="commit" />
            </label>
            <button class="vt-act" :title="L.common.delete" @click="removeRow(v)">
              <Trash2 :size="12" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button class="btn vt-add" @click="addRow">
      <Plus :size="12" /> {{ L.env.addVar }}
    </button>
  </div>
</template>

<style scoped>
.vt {
  display: flex;
  flex-direction: column;
}
.vt-empty {
  padding: 10px 4px;
  font-size: 12px;
  color: var(--text-faint);
}
.vt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.vt-table th {
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  padding: 3px 4px;
  border-bottom: 1px solid var(--border);
}
.vt-table td {
  padding: 3px 4px;
  vertical-align: middle;
}
.cell {
  width: 100%;
  height: 24px;
  font-size: 12px;
}
.vt-td-act {
  white-space: nowrap;
  width: 56px;
}
.vt-th-act {
  width: 56px;
}
.vt-check {
  display: inline-flex;
  align-items: center;
}
.vt-eye {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  padding: 2px;
}
.vt-eye:hover {
  color: var(--text);
}
.vt-act {
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
}
.vt-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.vt-add {
  align-self: flex-start;
  margin: 6px 0 2px;
  font-size: 11px;
  height: 24px;
  padding: 0 10px;
}
</style>
