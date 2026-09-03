<script setup lang="ts">
// Auth：Postman 式类型下拉 + 10 类型表单（参照 Postman Authorization）
// 前端注入型：bearer / basic / apikey / jwt / oauth2（accessToken 非空）
// Go 侧运行时型：digest（401 挑战-应答）/ oauth1（RFC 5849 签名）/ awsv4（SigV4）
// 字段含 {{var}} 时：未定义红色波浪线（ENV-4）+ 悬浮值（ENV-5，secret 打码）
import { computed, ref } from 'vue'
import { ChevronDown, Check, Loader2 } from 'lucide-vue-next'
import type { Request, AuthConfig, AuthType } from '../../types/models'
import { t } from '../../locales/zh-CN'
import { missingIn, varTitle } from '../../lib/var-ui'
import { decodeJwtPayload } from '../../lib/jwt'
import { effectiveAuth } from '../../lib/send'
import { HTTPService } from '../../api/backend'
import { toast } from '../../stores/toast'
import Dropdown from '../common/Dropdown.vue'
import Segmented from '../common/Segmented.vue'

const props = defineProps<{ request: Request }>()
const L = computed(() => t())

/** 下拉菜单两组：组1 继承/无，组2 具体鉴权方式（中间分隔线，参照 Postman） */
const group1: { value: AuthType; label: () => string }[] = [
  { value: 'inherit', label: () => L.value.request.auth.inherit },
  { value: 'none', label: () => L.value.request.auth.none },
]
const group2: { value: AuthType; label: () => string }[] = [
  { value: 'bearer', label: () => L.value.request.auth.bearer },
  { value: 'basic', label: () => L.value.request.auth.basic },
  { value: 'apikey', label: () => L.value.request.auth.apikey },
  { value: 'jwt', label: () => L.value.request.auth.jwt },
  { value: 'digest', label: () => L.value.request.auth.digest },
  { value: 'oauth1', label: () => L.value.request.auth.oauth1 },
  { value: 'oauth2', label: () => L.value.request.auth.oauth2 },
  { value: 'awsv4', label: () => L.value.request.auth.awsv4 },
]

const typeLabel = computed(() => {
  const all = [...group1, ...group2]
  return all.find((x) => x.value === props.request.auth.type)?.label() ?? ''
})

/** 切类型时懒补子字段（切走不删，切回不丢数据） */
function setType(v: string) {
  const a = props.request.auth
  a.type = v as AuthConfig['type']
  if (v === 'bearer') a.bearer ??= { token: '' }
  if (v === 'basic') a.basic ??= { username: '', password: '' }
  if (v === 'apikey') a.apikey ??= { key: '', value: '', in: 'header' }
  if (v === 'jwt') a.jwt ??= { token: '' }
  if (v === 'digest') a.digest ??= { username: '', password: '', realm: '' }
  if (v === 'oauth1')
    a.oauth1 ??= {
      consumerKey: '',
      consumerSecret: '',
      token: '',
      tokenSecret: '',
      signatureMethod: 'HMAC-SHA1',
      realm: '',
    }
  if (v === 'oauth2')
    a.oauth2 ??= {
      accessToken: '',
      grant: 'manual',
      tokenUrl: '',
      clientId: '',
      clientSecret: '',
      username: '',
      password: '',
      scope: '',
    }
  if (v === 'awsv4') a.awsv4 ??= { accessKeyId: '', secretAccessKey: '', sessionToken: '', region: '', service: '' }
}

// ---------- JWT payload 解码面板（仅解码，不验签） ----------
const jwtPayload = computed(() => {
  const token = props.request.auth.jwt?.token ?? ''
  if (!token.trim()) return null
  return decodeJwtPayload(token)
})
const jwtPayloadText = computed(() =>
  jwtPayload.value === null ? L.value.request.auth.jwtInvalid : JSON.stringify(jwtPayload.value, null, 2),
)

// ---------- OAuth2 一键取 token ----------
const fetching = ref(false)
async function fetchToken() {
  const o = props.request.auth.oauth2
  if (!o || fetching.value) return
  if (!o.tokenUrl.trim()) {
    toast('error', L.value.request.auth.oauth2NeedUrl)
    return
  }
  if (!o.clientId.trim()) {
    toast('error', L.value.request.auth.oauth2NeedClient)
    return
  }
  if (o.grant === 'password' && (!o.username.trim() || !o.password.trim())) {
    toast('error', L.value.request.auth.oauth2NeedUser)
    return
  }
  fetching.value = true
  try {
    const r = await HTTPService.FetchOAuth2Token({
      tokenUrl: o.tokenUrl.trim(),
      clientId: o.clientId,
      clientSecret: o.clientSecret,
      grantType: o.grant,
      username: o.username,
      password: o.password,
      scope: o.scope,
      timeoutMs: 0,
    })
    o.accessToken = r.accessToken
    toast(
      'success',
      r.expiresIn > 0
        ? L.value.request.auth.tokenGot.replace('{n}', String(r.expiresIn))
        : L.value.request.auth.tokenGotNoExp,
    )
  } catch (e) {
    toast('error', `${L.value.request.auth.tokenFailed}：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    fetching.value = false
  }
}

/** inherit 解析后若实际为 none（祖先都没配），追加提示 */
const inheritResolvesNone = computed(
  () => props.request.auth.type === 'inherit' && effectiveAuth(props.request).type === 'none',
)
</script>

<template>
  <div class="at">
    <Dropdown align="start">
      <template #trigger>
        <button class="at-select">
          <span class="at-select-label">{{ typeLabel }}</span>
          <ChevronDown :size="14" class="at-select-chevron" />
        </button>
      </template>
      <template #default="{ close }">
        <div class="at-menu">
          <button
            v-for="o in group1"
            :key="o.value"
            class="at-menu-item"
            :class="{ active: request.auth.type === o.value }"
            @click="setType(o.value); close()"
          >
            {{ o.label() }}
            <Check v-if="request.auth.type === o.value" :size="13" class="at-menu-check" />
          </button>
          <div class="at-menu-divider"></div>
          <button
            v-for="o in group2"
            :key="o.value"
            class="at-menu-item"
            :class="{ active: request.auth.type === o.value }"
            @click="setType(o.value); close()"
          >
            {{ o.label() }}
            <Check v-if="request.auth.type === o.value" :size="13" class="at-menu-check" />
          </button>
        </div>
      </template>
    </Dropdown>

    <div v-if="request.auth.type === 'bearer' && request.auth.bearer" class="at-rows">
      <label class="at-label">{{ L.request.auth.token }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.bearer.token).length > 0 }"
        :title="varTitle(request.auth.bearer.token)"
        v-model="request.auth.bearer.token"
        placeholder="eyJhbGciOi…"
      />
    </div>

    <div v-else-if="request.auth.type === 'basic' && request.auth.basic" class="at-rows">
      <label class="at-label">{{ L.request.auth.username }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.basic.username).length > 0 }"
        :title="varTitle(request.auth.basic.username)"
        v-model="request.auth.basic.username"
      />
      <label class="at-label">{{ L.request.auth.password }}</label>
      <input
        class="input"
        type="password"
        :class="{ 'at-var-bad': missingIn(request.auth.basic.password).length > 0 }"
        :title="varTitle(request.auth.basic.password)"
        v-model="request.auth.basic.password"
      />
    </div>

    <div v-else-if="request.auth.type === 'apikey' && request.auth.apikey" class="at-rows">
      <label class="at-label">{{ L.request.auth.key }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.apikey.key).length > 0 }"
        :title="varTitle(request.auth.apikey.key)"
        v-model="request.auth.apikey.key"
      />
      <label class="at-label">{{ L.request.auth.value }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.apikey.value).length > 0 }"
        :title="varTitle(request.auth.apikey.value)"
        v-model="request.auth.apikey.value"
      />
      <label class="at-label">{{ L.request.auth.in }}</label>
      <Segmented
        :options="[
          { value: 'header', label: L.request.auth.inHeader },
          { value: 'query', label: L.request.auth.inQuery },
        ]"
        :model-value="request.auth.apikey.in"
        @update:model-value="request.auth.apikey.in = $event as 'header' | 'query'"
      />
    </div>

    <div v-else-if="request.auth.type === 'jwt' && request.auth.jwt" class="at-rows">
      <label class="at-label">{{ L.request.auth.token }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.jwt.token).length > 0 }"
        :title="varTitle(request.auth.jwt.token)"
        v-model="request.auth.jwt.token"
        placeholder="eyJhbGciOi…"
      />
      <label class="at-label">{{ L.request.auth.jwtPayload }}</label>
      <pre class="at-jwt-payload">{{ jwtPayloadText }}</pre>
    </div>

    <div v-else-if="request.auth.type === 'digest' && request.auth.digest" class="at-rows">
      <label class="at-label">{{ L.request.auth.username }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.digest.username).length > 0 }"
        :title="varTitle(request.auth.digest.username)"
        v-model="request.auth.digest.username"
      />
      <label class="at-label">{{ L.request.auth.password }}</label>
      <input
        class="input"
        type="password"
        :class="{ 'at-var-bad': missingIn(request.auth.digest.password).length > 0 }"
        :title="varTitle(request.auth.digest.password)"
        v-model="request.auth.digest.password"
      />
      <label class="at-label">{{ L.request.auth.realm }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.digest.realm ?? '').length > 0 }"
        :title="varTitle(request.auth.digest.realm ?? '')"
        v-model="request.auth.digest.realm"
      />
      <div class="at-hint">{{ L.request.auth.digestHint }}</div>
    </div>

    <div v-else-if="request.auth.type === 'oauth1' && request.auth.oauth1" class="at-rows">
      <label class="at-label">{{ L.request.auth.consumerKey }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.oauth1.consumerKey).length > 0 }"
        :title="varTitle(request.auth.oauth1.consumerKey)"
        v-model="request.auth.oauth1.consumerKey"
      />
      <label class="at-label">{{ L.request.auth.consumerSecret }}</label>
      <input
        class="input"
        type="password"
        :class="{ 'at-var-bad': missingIn(request.auth.oauth1.consumerSecret).length > 0 }"
        :title="varTitle(request.auth.oauth1.consumerSecret)"
        v-model="request.auth.oauth1.consumerSecret"
      />
      <label class="at-label">{{ L.request.auth.token }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.oauth1.token).length > 0 }"
        :title="varTitle(request.auth.oauth1.token)"
        v-model="request.auth.oauth1.token"
      />
      <label class="at-label">{{ L.request.auth.tokenSecret }}</label>
      <input
        class="input"
        type="password"
        :class="{ 'at-var-bad': missingIn(request.auth.oauth1.tokenSecret).length > 0 }"
        :title="varTitle(request.auth.oauth1.tokenSecret)"
        v-model="request.auth.oauth1.tokenSecret"
      />
      <label class="at-label">{{ L.request.auth.signatureMethod }}</label>
      <Segmented
        :options="[
          { value: 'HMAC-SHA1', label: 'HMAC-SHA1' },
          { value: 'HMAC-SHA256', label: 'HMAC-SHA256' },
          { value: 'PLAINTEXT', label: 'PLAINTEXT' },
        ]"
        :model-value="request.auth.oauth1.signatureMethod"
        @update:model-value="request.auth.oauth1.signatureMethod = $event as 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT'"
      />
      <label class="at-label">{{ L.request.auth.realm }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.oauth1.realm ?? '').length > 0 }"
        :title="varTitle(request.auth.oauth1.realm ?? '')"
        v-model="request.auth.oauth1.realm"
      />
      <div class="at-hint">{{ L.request.auth.oauth1Hint }}</div>
    </div>

    <div v-else-if="request.auth.type === 'oauth2' && request.auth.oauth2" class="at-rows">
      <label class="at-label">{{ L.request.auth.accessToken }}</label>
      <div class="at-token-row">
        <input
          class="input"
          :class="{ 'at-var-bad': missingIn(request.auth.oauth2.accessToken).length > 0 }"
          :title="varTitle(request.auth.oauth2.accessToken)"
          v-model="request.auth.oauth2.accessToken"
          :placeholder="L.request.auth.fetchToken"
        />
        <button
          v-if="request.auth.oauth2.grant !== 'manual'"
          class="at-fetch-btn"
          :disabled="fetching"
          @click="fetchToken"
        >
          <Loader2 v-if="fetching" :size="13" class="at-spin" />
          {{ fetching ? L.request.auth.fetching : L.request.auth.fetchToken }}
        </button>
      </div>
      <div v-if="request.auth.oauth2.grant !== 'manual'" class="at-hint">{{ L.request.auth.oauth2Plaintext }}</div>

      <label class="at-label">{{ L.request.auth.grant }}</label>
      <Segmented
        :options="[
          { value: 'manual', label: L.request.auth.grantManual },
          { value: 'client_credentials', label: L.request.auth.grantCc },
          { value: 'password', label: L.request.auth.grantPassword },
        ]"
        :model-value="request.auth.oauth2.grant"
        @update:model-value="request.auth.oauth2.grant = $event as 'manual' | 'client_credentials' | 'password'"
      />
      <template v-if="request.auth.oauth2.grant !== 'manual'">
        <label class="at-label">{{ L.request.auth.tokenUrl }}</label>
        <input
          class="input"
          :class="{ 'at-var-bad': missingIn(request.auth.oauth2.tokenUrl).length > 0 }"
          :title="varTitle(request.auth.oauth2.tokenUrl)"
          v-model="request.auth.oauth2.tokenUrl"
          placeholder="https://auth.example.com/oauth/token"
        />
        <label class="at-label">{{ L.request.auth.clientId }}</label>
        <input
          class="input"
          :class="{ 'at-var-bad': missingIn(request.auth.oauth2.clientId).length > 0 }"
          :title="varTitle(request.auth.oauth2.clientId)"
          v-model="request.auth.oauth2.clientId"
        />
        <label class="at-label">{{ L.request.auth.clientSecret }}</label>
        <input
          class="input"
          type="password"
          :class="{ 'at-var-bad': missingIn(request.auth.oauth2.clientSecret).length > 0 }"
          :title="varTitle(request.auth.oauth2.clientSecret)"
          v-model="request.auth.oauth2.clientSecret"
        />
        <template v-if="request.auth.oauth2.grant === 'password'">
          <label class="at-label">{{ L.request.auth.username }}</label>
          <input
            class="input"
            :class="{ 'at-var-bad': missingIn(request.auth.oauth2.username).length > 0 }"
            :title="varTitle(request.auth.oauth2.username)"
            v-model="request.auth.oauth2.username"
          />
          <label class="at-label">{{ L.request.auth.password }}</label>
          <input
            class="input"
            type="password"
            :class="{ 'at-var-bad': missingIn(request.auth.oauth2.password).length > 0 }"
            :title="varTitle(request.auth.oauth2.password)"
            v-model="request.auth.oauth2.password"
          />
        </template>
        <label class="at-label">{{ L.request.auth.scope }}</label>
        <input
          class="input"
          :class="{ 'at-var-bad': missingIn(request.auth.oauth2.scope).length > 0 }"
          :title="varTitle(request.auth.oauth2.scope)"
          v-model="request.auth.oauth2.scope"
        />
      </template>
    </div>

    <div v-else-if="request.auth.type === 'awsv4' && request.auth.awsv4" class="at-rows">
      <label class="at-label">{{ L.request.auth.accessKeyId }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.awsv4.accessKeyId).length > 0 }"
        :title="varTitle(request.auth.awsv4.accessKeyId)"
        v-model="request.auth.awsv4.accessKeyId"
        placeholder="AKIA…"
      />
      <label class="at-label">{{ L.request.auth.secretAccessKey }}</label>
      <input
        class="input"
        type="password"
        :class="{ 'at-var-bad': missingIn(request.auth.awsv4.secretAccessKey).length > 0 }"
        :title="varTitle(request.auth.awsv4.secretAccessKey)"
        v-model="request.auth.awsv4.secretAccessKey"
      />
      <label class="at-label">{{ L.request.auth.sessionToken }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.awsv4.sessionToken ?? '').length > 0 }"
        :title="varTitle(request.auth.awsv4.sessionToken ?? '')"
        v-model="request.auth.awsv4.sessionToken"
      />
      <label class="at-label">{{ L.request.auth.region }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.awsv4.region).length > 0 }"
        :title="varTitle(request.auth.awsv4.region)"
        v-model="request.auth.awsv4.region"
        placeholder="us-east-1"
      />
      <label class="at-label">{{ L.request.auth.service }}</label>
      <input
        class="input"
        :class="{ 'at-var-bad': missingIn(request.auth.awsv4.service).length > 0 }"
        :title="varTitle(request.auth.awsv4.service)"
        v-model="request.auth.awsv4.service"
        placeholder="s3"
      />
      <div class="at-hint">{{ L.request.auth.awsv4Hint }}</div>
    </div>

    <div v-else-if="request.auth.type === 'inherit'" class="at-hint">
      {{ L.request.auth.inheritHint }}
      <template v-if="inheritResolvesNone"> · {{ L.request.auth.inheritMissing }}</template>
    </div>
    <div v-else class="at-hint">{{ L.request.auth.noAuth }}</div>
  </div>
</template>

<style scoped>
.at {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}
.at-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 180px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.at-select-chevron {
  color: var(--text-faint);
  flex-shrink: 0;
}
.at-menu {
  display: flex;
  flex-direction: column;
  min-width: 190px;
}
.at-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-dim);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.at-menu-item:hover {
  background: var(--bg-well);
  color: var(--text);
}
.at-menu-item.active {
  color: var(--accent);
  font-weight: 600;
}
.at-menu-check {
  color: var(--accent);
  flex-shrink: 0;
}
.at-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}
.at-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.at-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  margin-top: 4px;
}
.at-rows .input {
  width: 100%;
  box-sizing: border-box;
}
.at-rows .input.at-var-bad {
  color: var(--error);
  text-decoration: underline wavy var(--error);
}
.at-jwt-payload {
  margin: 0;
  padding: 8px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-well);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: break-all;
}
.at-token-row {
  display: flex;
  gap: 6px;
}
.at-token-row .input {
  flex: 1;
}
.at-fetch-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.at-fetch-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.at-fetch-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.at-spin {
  animation: at-rot 0.9s linear infinite;
}
@keyframes at-rot {
  to {
    transform: rotate(360deg);
  }
}
.at-hint {
  font-size: 12px;
  color: var(--text-faint);
  padding: 4px 2px;
}
</style>
