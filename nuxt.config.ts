export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'vercel'
  },
  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    openaiTemperature: process.env.OPENAI_TEMPERATURE || '0.7',
    openaiMaxOutputTokens: process.env.OPENAI_MAX_OUTPUT_TOKENS || '512',
    openaiSystemPrompt: process.env.OPENAI_SYSTEM_PROMPT || 'You are a helpful assistant.',
    appTimezone: process.env.APP_TIMEZONE || 'Asia/Jakarta'
  },
  app: {
    head: {
      title: 'Nuxt Vercel Baseline',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Simple Nuxt baseline ready for Vercel deployment.' }
      ]
    }
  }
})
