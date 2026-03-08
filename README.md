# Nuxt Vercel Baseline

Baseline sederhana Nuxt 3 yang siap deploy ke Vercel.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Jika `postinstall` error saat `npm install`, gunakan:

```bash
npm run nuxt:prepare
```

## Build production

```bash
npm run build
npm run preview
```

## API OpenAI

Endpoint: `POST /api/llm`

Body JSON:

```json
{
  "prompt": "Buat ringkasan singkat tentang Nuxt"
}
```

Contoh curl:

```bash
curl -X POST http://localhost:3000/api/llm \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Halo, perkenalkan diri kamu"}'
```

Semua parameter OpenAI diatur lewat env (lihat `.env.example`):
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TEMPERATURE`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_SYSTEM_PROMPT`

## Deploy ke Vercel

1. Push project ini ke GitHub/GitLab/Bitbucket.
2. Import repository di Vercel.
3. Set Environment Variables di Vercel sesuai `.env.example`.
4. Deploy (framework dan build command sudah disiapkan).

## Versi Node

Gunakan Node.js `>=18.18.0` (disarankan Node 20 LTS).
