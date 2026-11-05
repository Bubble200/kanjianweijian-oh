import {createClient} from '@supabase/supabase-js';
import {ACCOUNT_CONFIG} from './account-config.mjs';
import {createLibraryStore} from './library-store.mjs';
const client=createClient(ACCOUNT_CONFIG.url,ACCOUNT_CONFIG.key,{auth:{storageKey:'kanjianweijian.email-account.v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal || AbortSignal.timeout(20000)})}});
const $=s=>document.querySelector(s);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null, mode='login', busy=false, status='正在连接账号…', epoch=0, loading=true;
const store=createLibraryStore(client,()=>user?.id);
const notify=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
function readable(error) {
 const code=error?.code;
 if(code==='invalid_credentials') return '邮箱或密码不正确，请重试。';
 if(code==='email_not_confirmed') return '请先点击邮件中的确认链接，再登录。';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit') return '操作较频繁，请稍后再试。';
 if(code==='email_address_not_authorized') return '验证邮件服务还未就绪，请稍后注册。';
 if(code==='weak_password') return '请使用至少 8 位、包含字母和数字的密码。';
 if(/fetch|network|timeout/i.test(error?.message||'')) return '连接暂时中断，已填写的内容还在，请稍后重试。';
 return error?.message?.startsWith('这条记录')||error?.message?.startsWith('记录已') ? error.message : '操作未完成，请稍后重试。';
}
function render() {
 $('#account-button').textContent=user?'我的账号':'登录 / 注册';
 const box=$('#account-content');
 if(user && mode!=='password') {
  box.innerHTML=`<p class="eyebrow">YOUR OWN SPACE</p><h2 id="account-title">把发现留给自己。</h2><p class="account-email">${escape(user.email)}</p><p>登录后开始的每轮卡牌、已发送对话与解读会自动存入你的账号，换设备登录也能查看。未发送草稿不会上传。</p><div class="review-actions"><button class="primary" type="button" data-account="library">打开我的记忆 ↗</button><button class="secondary" type="button" data-account="reload">重新同步</button></div><div class="account-import"><h3>带上这个浏览器里的记录</h3><p id="import-count">旧记录不会自动上传。点击后会将本机已保存的回顾和记忆复制到当前账号，原件保留。</p><button class="secondary" type="button" data-account="import">复制本机记录到此账号</button></div><button class="plain-link" type="button" data-account="logout">退出账号</button><p class="account-status" role="status">${escape(status)}</p>`;
 } else {
  const titles={login:'回到你的发现。',signup:'给发现，一个归处。',reset:'找回你的账号。',password:'设置新密码。'};
  box.innerHTML=`<p class="eyebrow">YOUR OWN SPACE</p><h2 id="account-title">${titles[mode]}</h2>${mode==='login'||mode==='signup'?`<div class="account-tabs"><button type="button" data-account="login" aria-pressed="${mode==='login'}">登录</button><button type="button" data-account="signup" aria-pressed="${mode==='signup'}">注册</button></div>`:''}<form id="account-form">${mode!=='password'?'<label for="account-email">邮箱</label><input id="account-email" name="email" type="email" autocomplete="email" placeholder="QQ、网易等邮箱均可" maxlength="254" required>':''}${mode!=='reset'?`<label for="account-password">密码</label><input id="account-password" name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="8" maxlength="128" ${mode!=='login'?'placeholder="至少 8 位，包含字母和数字"':''} required>`:''}<p class="account-status" role="status">${escape(status)}</p><button class="primary account-submit" type="submit" ${loading?'disabled':''}>${{login:'登录',signup:'注册并发送验证邮件',reset:'发送重置邮件',password:'保存新密码'}[mode]}</button></form>${mode==='login'?'<button class="plain-link" type="button" data-account="reset">忘记密码？</button>':'<button class="plain-link" type="button" data-account="login">返回登录</button>'}<p class="small-caption">备用入口暂未开放注册与找回密码。已有单词本账号可用原密码登录，两个入口共用密码，记录分开。登录后开始的轮次会自动保存到账号；不登录也可以玩，记录仅存当前浏览器。</p>`;
 }
 setBusy(busy);
}
function setBusy(value) { busy=value; for(const b of $('#account-content').querySelectorAll('button,input')) b.disabled=value || (loading && b.type==='submit'); }
function message(text) { status=text; const el=$('#account-content .account-status'); if(el) el.textContent=text; }
async function sync() {
 const mine=++epoch;
 loading=true; notify('oh-library-state',{user,loading:true});
 if(!user) { loading=false; status=''; notify('oh-library-state',{user:null,loading:false}); return; }
 try {
  const [memories,reviews]=await Promise.all([store.list('memory'),store.list('review')]);
  if(mine!==epoch) return;
  loading=false; status='已同步到你的账号。'; notify('oh-library-state',{user,loading:false,memories,reviews});
 } catch(error) {
  if(mine!==epoch) return;
  loading=false; status='暂时无法读取云端记录，请点“重新同步”。'; notify('oh-library-state',{user,loading:false,error:status});
 }
 message(status);
}
window.OHAccounts={
 get user(){return user;},get loading(){return loading;},
 open(){render(); if(!$('#account-dialog').open) $('#account-dialog').showModal();},
 async save(kind,items,expectedOwner){if(expectedOwner&&user?.id!==expectedOwner)throw Error('账号已切换，请重新操作。');if(loading) throw Error('正在同步，请稍后保存。');return store.save(kind,items);},
 async remove(kind,item){if(loading) throw Error('正在同步，请稍后操作。');return store.remove(kind,item);},
 sync,
 error:readable
};
$('#account-button').addEventListener('click',()=>window.OHAccounts.open());
$('#account-content').addEventListener('submit',async event=>{
 if(event.target.id!=='account-form') return;
 event.preventDefault();if(busy||loading)return;
 const email=$('#account-email')?.value.trim(),password=$('#account-password')?.value;
 if(mode==='signup'||mode==='password') {if(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)) {message('请使用包含字母和数字的密码。');return;}}
 setBusy(true); message('正在处理…');
 try {
  let response;
  const redirectTo=new URL('./',location.href).href;
  if(mode==='login') response=await client.auth.signInWithPassword({email,password});
  else if(mode==='signup') {
   if(!ACCOUNT_CONFIG.registrationReady) {message('备用入口的邮件回跳尚未配置，暂时不能注册。已有账号可正常登录。');return;}
   response=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
  } else if(mode==='reset') {
   if(!ACCOUNT_CONFIG.registrationReady) {message('备用入口的邮件回跳尚未配置，暂时还不能发送重置邮件。');return;}
   response=await client.auth.resetPasswordForEmail(email,{redirectTo});
  } else response=await client.auth.updateUser({password});
  if(response.error) throw response.error;
  if(mode==='signup'||mode==='reset') {$('#account-password') && ($('#account-password').value=''); message(mode==='signup'?'请查收确认邮件，点击链接后即可登录。':'如该邮箱有账号，将收到重置邮件。请检查收件箱和垃圾邮件。');}
  else if(mode==='password') {mode='login';message('密码已更新。');render();}
 } catch(error) {message(readable(error));}
 finally {setBusy(false);}
});
$('#account-content').addEventListener('click',async event=>{
 const button=event.target.closest('[data-account]');if(!button||busy)return;
 const action=button.dataset.account;
 if(['login','signup','reset'].includes(action)){mode=action;status='';render();return;}
 if(action==='library'){$('#account-dialog').close();document.querySelector('[data-action="memory"]').click();return;}
 if(action==='reload'){await sync();return;}
 if(action==='import'){notify('oh-library-import',{user});return;}
 if(action==='logout'){
  setBusy(true);const {error}=await client.auth.signOut({scope:'local'});setBusy(false);
  if(error){message(readable(error));return;}
  mode='login';status='已退出，此浏览器的匿名记录仍保留。';render();
 }
});
client.auth.onAuthStateChange((event,session)=>{
 // No awaited Supabase call inside the auth lock.
 const previous=user?.id;user=session?.user||null;
 if(event==='PASSWORD_RECOVERY'){mode='password';status='';render();$('#account-dialog').showModal();}
 if(previous!==user?.id || event==='INITIAL_SESSION') {
  notify('oh-library-state',{user,loading:true});
  setTimeout(()=>{sync();if($('#account-dialog').open && mode!=='password')render();},0);
 }
});
client.auth.getSession().then(({error})=>{if(error){loading=false;message('账号连接失败，请重新打开登录。');notify('oh-library-state',{user:null,loading:false});} });
render();
