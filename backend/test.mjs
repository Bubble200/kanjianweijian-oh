import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('./index.ts',import.meta.url),'utf8')).replace('Deno.serve(request => handle(request));','');
const {handle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const origin='https://bubble200.github.io';
const req=(path,options={})=>new Request('https://example.supabase.co/functions/v1/oh-backup/'+path,{...options,headers:{origin,...options.headers}});
test('only allow configured origin and known route',async()=>{
 const no=()=>{throw Error('must not call upstream')};
 assert.equal((await handle(req('chat',{headers:{origin:'https://evil.test'}}),no)).status,403);
 assert.equal((await handle(req('https://evil.test'),no)).status,404);
 assert.equal((await handle(req('chat',{method:'OPTIONS'}),no)).status,204);
});
test('reject malformed or oversized payload before upstream',async()=>{
 const no=()=>{throw Error('must not call upstream')};
 for(const [body,code] of [['not json',400],['x'.repeat(180001),413]])assert.equal((await handle(req('chat',{method:'POST',headers:{'x-oh-request':'1','content-type':'application/json'},body}),no)).status,code);
});
test('relay only fixed AI endpoint, preserve quota errors, never export cookie',async()=>{
 const calls=[];
 const response=await handle(req('chat',{method:'POST',headers:{'x-oh-request':'1','content-type':'application/json'},body:'{}'}),async(url,opts)=>{
  calls.push({url,opts});
  if(url.endsWith('/session'))return new Response('{}',{headers:{'set-cookie':'__Host-oh_visitor=test.signed.token; Secure; HttpOnly'}});
  assert.equal(opts.headers.cookie,'__Host-oh_visitor=test.signed.token');
  return new Response(JSON.stringify({error:{code:'daily_limit',message:'quota'}}),{status:429,headers:{'content-type':'application/json','set-cookie':'do-not-export'}});
 });
 assert.equal(response.status,429);assert.equal(response.headers.get('set-cookie'),null);assert.equal((await response.json()).error.code,'daily_limit');
 assert.deepEqual(calls.map(c=>c.url),['https://kanjianweijian-oh.yaoyutao666.chatgpt.site/api/session','https://kanjianweijian-oh.yaoyutao666.chatgpt.site/api/chat']);
 assert.equal(calls[1].opts.redirect,'error');
});
test('fail closed for upstream HTML or missing visitor cookie',async()=>{
 assert.equal((await handle(req('status'),async()=>new Response('<html>blocked</html>'))).status,503);
 assert.equal((await handle(req('chat',{method:'POST',headers:{'x-oh-request':'1','content-type':'application/json'},body:'{}'}),async()=>new Response('{}'))).status,503);
});
