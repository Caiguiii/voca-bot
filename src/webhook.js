import { verifySignature } from './line.js';
import { handleEvent } from './handlers.js';

export async function handleWebhook(request, env, ctx) {
  const body = await request.text();
  const ok = await verifySignature(body, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET);
  if (!ok) return new Response('Bad signature', { status: 401 });

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // 先回 200 給 LINE，事件在背景處理
  const jobs = (payload.events || []).map((e) =>
    handleEvent(e, env).catch((err) => console.error('event failed', e.type, err.stack || err.message)),
  );
  ctx.waitUntil(Promise.all(jobs));
  return new Response('OK');
}
