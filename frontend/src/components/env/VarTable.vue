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
            <div class="vt-cur">
              <input
                v-model="v.currentValue"
                class="input cell"
                :type="v.secret ? 'password' : 'text'"
                @change="commit"
              />
              <button class="vt-eye" :title="L.env.secret" @click="v.secret = !v.secret; commit()">
                <EyeOff v-if="v.secret" :size="13" />
                <Eye v-else :size="13" />
              </button>
            </div>
          </td>
          <td class="vt-td-act">
            <div class="vt-act-group">
              <label class="vt-check">
                <input v-model="v.enabled" type="checkbox" @change="commit" />
              </label>
              <button class="vt-act" :title="L.common.delete" @click="removeRow(v)">
                <Trash2 :size="14" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <button class="btn vt-add" @click="addRow">
      <Plus :size="13" /> {{ L.env.addVar }}
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
  table-layout: fixed;
  font-size: 12px;
}
/* 均衡列宽：原"当前值 auto 吃满 + 启用 64px 悬在右缘"视觉失衡（用户实测反馈），
   改为键 20% / 初始值 26% / 当前值 34% / 启用 20%，启用列内容与表头居中 */
.vt-table th:nth-child(1) {
  width: 20%;
}
.vt-table th:nth-child(2) {
  width: 26%;
}
.vt-table th:nth-child(3) {
  width: 34%;
}
.vt-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
}
/* 启用列（第 4 列）：比 .vt-table th 的 text-align:left 更具体，表头居中 */
.vt-table th.vt-th-act {
  width: 20%;
  text-align: center;
}
.vt-table td {
  padding: 6px;
  vertical-align: middle;
}
.cell {
  width: 100%;
  height: 26px;
  font-size: 12px;
  min-width: 0;
}
/* 当前值输入框 + 眼睛同行（原来 button 被 input 的 100% 宽挤到下一行） */
.vt-cur {
  display: flex;
  align-items: center;
  gap: 4px;
}
.vt-cur .cell {
  flex: 1;
}
.vt-td-act {
  text-align: center;
  vertical-align: middle;
}
.vt-act-group {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.vt-check {
  display: inline-flex;
  align-items: center;
}
.vt-eye {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.vt-eye:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.vt-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.vt-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.vt-add {
  align-self: flex-start;
  margin: 6px 0 2px;
  font-size: 12px;
  height: 26px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
