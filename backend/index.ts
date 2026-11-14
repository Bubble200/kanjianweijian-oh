// Backup entrance only. The existing AI service remains authoritative for rules and quota.
const UPSTREAM = 'https://kanjianweijian-oh.yaoyutao666.chatgpt.site';
const ORIGIN = 'https://bubble200.github.io';
const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-oh-request',
  'access-control-max-age': '600',
  'vary': 'Origin',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });
}
function error(code, message, status = 503) { return json({error:{code,message}}, status); }
export async function handle(request, transport = fetch) {
  const path = new URL(request.url).pathname.split('/').at(-1);
  if (request.headers.get('origin') !== ORIGIN) return error('wrong_origin','请从备用网站页面发送消息。',403);
  if (!['session','status','chat','report'].includes(path)) return error('not_found','接口不存在。',404);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  const call = (route, options = {}) => transport(UPSTREAM + route, {
    ...options, redirect:'error', signal:AbortSignal.timeout(65000),
  });
  try {
    if (['session','status'].includes(path)) {
      if (request.method !== 'GET') return error('wrong_method','请求方式不正确。',405);
      const response = await call('/api/status');
      if (!response.headers.get('content-type')?.includes('application/json')) throw Error('upstream_unavailable');
      const data = await response.json();
      if (!response.ok || !data.ready) return error('not_ready','AI 服务暂不可用，你仍可保留这一轮。');
      return json({ready:true,provider:data.provider,model:data.model,rule_version:data.rule_version,shared_daily_limit:200});
    }
    if (request.method !== 'POST') return error('wrong_method','请求方式不正确。',405);
    if (request.headers.get('x-oh-request') !== '1' || !request.headers.get('content-type')?.includes('application/json')) return error('wrong_format','请求格式不正确。',415);
    const maxBody = path === 'report' ? 220000 : 180000;
    if (Number(request.headers.get('content-length')) > maxBody) return error('request_too_large','这一轮内容较长，请先保存回顾。',413);
    const body = await request.text();
    if (body.length > maxBody) return error('request_too_large','这一轮内容较长，请先保存回顾。',413);
    try { JSON.parse(body); } catch { return error('invalid_input','请求信息不完整。',400); }
    // Only mint a normal anonymous visitor session. Never export cookies or API secrets.
    const session = await call('/api/session');
    const cookie = (session.headers.get('set-cookie') || '').split(';')[0];
    if (!session.ok || !/^__Host-oh_visitor=[a-zA-Z0-9_.-]+$/.test(cookie)) throw Error('upstream_session');
    const response = await call(path === 'report' ? '/api/report' : '/api/chat',{
      method:'POST',headers:{'content-type':'application/json','x-oh-request':'1',origin:UPSTREAM,cookie},body,
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('upstream_unavailable');
    const data = await response.json();
    // The original service enforces the same 200/day bucket for both entrances.
    // Its IP burst limiter may aggregate backup visitors behind an egress IP.
    return json(data,response.status);
  } catch {
    return error('gateway_unavailable','AI 连接暂时中断，你的文字和图卡都还在，请稍后重试。');
  }
}
Deno.serve(request => handle(request));
