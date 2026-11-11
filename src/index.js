import { handleWebhook } from './webhook.js';
import { runDaily } from './daily.js';

export default {
  // HTTP 請求：LINE Webhook 與 GitHub Actions 觸發
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleWebhook(request, env, ctx);
    }

    if (request.method === 'POST' && url.pathname === '/cron/daily') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const force = url.searchParams.get('force') === '1';
      const result = await runDaily(env, { force });
      return Response.json(result);
    }

    if (url.pathname === '/') {
      return new Response('voca-bot is running ✅');
    }
    return new Response('Not found', { status: 404 });
  },

  // Cloudflare 內建排程（備援）
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env).then((r) => console.log('daily', JSON.stringify(r))));
  },
};
