// 全部界面文案集中在此（后续阶段随组件逐步补全）
// errorKind 与 Go 侧 classifyError 的返回值一一对应

export interface ErrorKindText {
  title: string
  reason: string
  action: string
}

export const zhCN = {
  app: {
    name: 'Voltra',
    description: '轻量级跨平台 API 接口调试工具',
  },

  common: {
    send: '发送',
    cancel: '取消',
    saving: '保存中...',
    save: '保存',
    saved: '已保存',
    delete: '删除',
    rename: '重命名',
    confirm: '确定',
    confirmDelete: '确认删除',
    close: '关闭',
    create: '新建',
    search: '搜索',
    empty: '暂无数据',
    retry: '重试',
    copy: '复制',
    copied: '已复制',
    download: '下载',
    open: '打开',
    yes: '是',
    no: '否',
    unsaved: '未保存',
    quit: '退出',
    collapse: '折叠侧栏',
    expand: '展开侧栏',
  },

  status: {
    saved: '已保存',
    saving: '保存中…',
    saveError: '保存失败',
  },

  titleBar: {
    projectPlaceholder: '选择项目',
    noProject: '无项目',
    envNone: '无环境',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    settings: '设置',
  },

  activity: {
    collections: '接口集合',
    history: '历史记录',
    environments: '环境',
    settings: '设置',
  },

  tree: {
    empty: '还没有接口',
    newRequest: '新建请求',
    newWs: '新建 WebSocket',
    newFolder: '新建文件夹',
    newCollection: '新建集合',
    importPostman: '导入 Postman 集合',
    searchPlaceholder: '搜索接口（名称）',
    searchEmpty: '没有匹配的接口',
    noProjectHint: '先新建一个项目，再添加接口',
  },

  request: {
    urlPlaceholder: '输入 URL，支持 {{变量}}，如 https://{{host}}/users',
    pasteCurl: '粘贴 cURL 解析',
    generateCode: '生成代码',
    save: '保存',
    send: '发送',
    cancel: '取消',
    tabs: {
      params: 'Params',
      headers: 'Headers',
      body: 'Body',
      auth: 'Auth',
      scripts: '脚本',
      settings: '设置',
    },
    kv: {
      key: '键',
      value: '值',
      description: '描述',
      addRow: '添加一行',
      inherited: '继承自父级',
    },
    body: {
      none: '无',
      raw: 'raw',
      'form-data': 'form-data',
      urlencoded: 'x-www-form-urlencoded',
      binary: 'binary',
      graphql: 'GraphQL',
      binaryPickFile: '选择文件',
      binaryPicked: '已选择',
    },
    auth: {
      none: '无',
      inherit: '继承父级',
      bearer: 'Bearer Token',
      basic: 'Basic Auth',
      apikey: 'API Key',
      token: 'Token',
      username: '用户名',
      password: '密码',
      key: 'Key',
      value: 'Value',
      in: '位置',
      inHeader: 'Header',
      inQuery: 'Query',
    },
    scripts: {
      pre: 'Pre-request Script',
      test: 'Tests',
      placeholder: 'v0.3 支持脚本执行；v0.2 仅保存',
    },
    settings: {
      timeoutMs: '超时时间（ms）',
      followRedirects: '跟随重定向',
      maxRedirects: '最大重定向次数',
      insecureSkipTlsVerify: '忽略 TLS 证书错误',
      sendCookies: '发送 Cookie',
    },
  },

  response: {
    empty: '发送请求后，响应会展示在这里',
    status: '状态',
    time: '耗时',
    size: '大小',
    at: '时间',
    tabs: {
      body: 'Body',
      headers: 'Headers',
      cookies: 'Cookies',
    },
    body: {
      pretty: 'Pretty',
      raw: 'Raw',
      preview: 'Preview',
      copy: '复制',
      download: '下载',
      wrap: '换行',
      searchPlaceholder: '搜索响应内容',
      jsonPathPlaceholder: 'JSONPath，如 $.data.list',
      truncated: '响应超过 64MB，已截断',
      tooLargeForPretty: '响应过大，禁用 Pretty',
      binaryHint: '二进制响应（base64 编码显示）',
    },
    cookie: {
      name: '名称',
      value: '值',
      domain: '域',
      path: '路径',
      expires: '过期时间',
      httpOnly: 'HttpOnly',
      secure: 'Secure',
    },
  },

  errorKind: {
    bad_url: {
      title: 'URL 无效',
      reason: '请检查地址拼写，或补全协议（http:// 或 https://）。',
      action: '修改后重试',
    } as ErrorKindText,
    dns: {
      title: '域名解析失败',
      reason: '无法解析主机名。请检查网络连接或确认域名拼写。',
      action: '重试',
    } as ErrorKindText,
    timeout: {
      title: '请求超时',
      reason: '服务器响应过慢或不可达。可尝试增大超时时间后重试。',
      action: '重试',
    } as ErrorKindText,
    tls: {
      title: 'TLS 证书校验失败',
      reason: '证书无效或不受信任。可信内网可开启"忽略 TLS 证书错误"再试。',
      action: '重试',
    } as ErrorKindText,
    refused: {
      title: '连接被拒绝',
      reason: '目标端口未监听或被防火墙拦截。请确认服务已启动。',
      action: '重试',
    } as ErrorKindText,
    canceled: {
      title: '请求已取消',
      reason: '请求已被手动取消，未收到任何响应。',
      action: '重新发送',
    } as ErrorKindText,
    other: {
      title: '请求失败',
      reason: '网络或其他未知错误，请查看下方原始错误信息。',
      action: '重试',
    } as ErrorKindText,
  } as Record<string, ErrorKindText>,

  ws: {
    urlPlaceholder: 'ws:// 或 wss:// 地址',
    connect: '连接',
    disconnect: '断开',
    connecting: '连接中...',
    connected: '已连接',
    reconnecting: '重连中...',
    closed: '已断开',
    sendText: '文本',
    sendJson: 'JSON',
    sendBinary: '二进制',
    sendPlaceholder: '输入消息，回车发送',
    autoReconnect: '自动重连',
    heartbeat: '心跳',
    filterPlaceholder: '过滤消息',
    clear: '清空',
    export: '导出日志',
    saveSnippet: '存为常用片段',
    noMessages: '连接后，收发的消息会显示在这里',
    jsonInvalid: 'JSON 格式错误',
  },

  history: {
    empty: '还没有请求历史',
    today: '今天',
    yesterday: '昨天',
    clear: '清空历史',
    clearConfirm: '确定清空全部历史记录？此操作不可恢复。',
    saveAs: '另存为接口',
    limitHint: '最多保留',
    restore: '还原到新标签页',
  },

  env: {
    empty: '还没有环境',
    newEnv: '新建环境',
    globalVars: '全局变量',
    vars: '变量',
    key: '键',
    initial: '初始值',
    current: '当前值',
    secret: '敏感',
    enabled: '启用',
    noEnv: '无环境',
  },

  settings: {
    title: '设置',
    theme: '主题',
    language: '语言',
    defaultTimeout: '默认请求超时（ms）',
    fontSize: '字体大小',
    autoCompleteScheme: '自动补全 URL 协议',
    defaultScheme: '默认补全为',
    dataDir: '数据目录',
    openDataDir: '在文件管理器中打开',
    exportBackup: '导出全部数据备份',
    version: '版本',
  },

  tabs: {
    unsavedDot: '未保存的标签',
    confirmCloseDirty: '该标签有未保存的修改，确定关闭吗？',
  },

  dialog: {
    saveTo: '保存到集合',
    saveToPlaceholder: '选择目标集合 / 文件夹',
    namePlaceholder: '名称',
    projectNew: '新建项目',
    projectNewPlaceholder: '项目名称',
    projectDeleteConfirm: '删除项目将同时删除其中的所有接口、环境和变量，确定删除吗？',
    importPreview: '导入预览',
    importSkipped: '项已跳过',
    collectionNew: '新建集合',
    envNew: '新建环境',
    newHttp: '新建 HTTP 请求',
    newWs: '新建 WebSocket',
  },
} as const

export type Locales = typeof zhCN

// v0.2 只有中文；en 占位避免语言切换逻辑写死
export const en: Locales = zhCN

export function t(lang: 'zh' | 'en' = 'zh'): Locales {
  return lang === 'zh' ? zhCN : en
}
