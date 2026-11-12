import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // config.js requires a Groq key even when tests never call the LLM.
    env: {
      GROQ_API_KEY: 'test-key',
    },
  },
})
