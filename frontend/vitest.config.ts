import { defineConfig } from 'vitest/config'

// 纯逻辑单测（node 环境）：变量替换 / URL / cURL / Postman 导入 / 代码生成 / 格式化
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
