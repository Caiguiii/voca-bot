// LINE Messaging API 工具

const encoder = new TextEncoder();

function base(env) {
  return env.LINE_API_BASE || 'https://api.line.me';
}

/** 驗證 x-line-signature（HMAC-SHA256 + Base64） */
export async function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function call(env, path, payload) {
  const res = await fetch(`${base(env)}/v2/bot${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
  }
}

async function get(env, path) {
  const res = await fetch(`${base(env)}/v2/bot${path}`, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

/** 本月推播額度：{ limit: 數字或 null(無上限), used: 已用則數 } */
export async function getQuota(env) {
  const [quota, usage] = await Promise.all([get(env, '/message/quota'), get(env, '/message/quota/consumption')]);
  return { limit: quota.type === 'limited' ? quota.value : null, used: usage.totalUsage };
}

/** 回覆訊息（免費、不計入每月額度），一次最多 5 則 */
export function reply(env, replyToken, messages) {
  return call(env, '/message/reply', { replyToken, messages: messages.slice(0, 5) });
}

/** 主動推播（計入每月 200 則額度；同一次呼叫的多則訊息只算 1 則） */
export function push(env, to, messages) {
  return call(env, '/message/push', { to, messages: messages.slice(0, 5) });
}
