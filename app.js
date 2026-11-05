import { roundArchive, createRoundAutosaver } from './round-autosave.mjs?v=20261105-autosave';
import { PLAY_MODES, DEFAULT_PLAY_MODE, playMode, imageOnlyMode } from './play-modes.mjs';
import { WORD_DECK } from './word-deck.mjs';
import { EXPLORATION_NOTICE, FIRST_IMPRESSION_QUESTION } from './dialogue-copy.mjs?v=20261105-first-impression';
'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const cardID = n => `OH-${String(n).padStart(3,'0')}`;
const cardURL = n => `cards/oh-${String(n).padStart(3,'0')}.jpg`;
const memoryKey = 'liubai.oh.preview.memories.v1';
const reviewKey = 'liubai.oh.preview.reviews.v1';
const homeCardsKey = 'kanjianweijian.oh.last-round-cards.v1';
const liveAI = Boolean(window.OH_RUNTIME?.liveAI);
let visitorSessionPromise = null;
let selectedPlayMode = DEFAULT_PLAY_MODE;
const dateLabel = date => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
let state = null, currentView = 'home', memoryTab = 'round', toastTimeout, preparedDeck = null;
let memories = [], savedReviews = [];
let previousRoundCards = [];
let libraryAccount = null, libraryLoading = false, libraryError = '', librarySaving = false;
let archiveStatus = null;
try {
  const stored = JSON.parse(localStorage.getItem(homeCardsKey) || '[]');
  if (validHomeCards(stored)) previousRoundCards = stored;
} catch { /* Without browser storage, card history remains available for this page only. */ }
try { memories = JSON.parse(localStorage.getItem(memoryKey) || '[]'); savedReviews = JSON.parse(localStorage.getItem(reviewKey) || '[]'); }
catch { setTimeout(() => toast('无法读取浏览器中的保存记录，本轮仍可体验。'), 0); }
const persist = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('浏览器未能保存，请导出回顾留存。'); return false; }
};
const archiveCacheKey=owner=>`kanjianweijian.oh.pending-archives.v1.${owner}`;
function writeArchiveLocal(owner,record){
 const key=owner?archiveCacheKey(owner):reviewKey, records=localCollection(key);
 const next=[...records.filter(r=>r.id!==record.id),record];
 localStorage.setItem(key,JSON.stringify(next));
 if(!owner&&!libraryAccount)savedReviews=next;
}
const roundSaver=createRoundAutosaver({
 local:writeArchiveLocal,
 clearLocal(owner,id){if(!owner)return;const key=archiveCacheKey(owner);try{localStorage.setItem(key,JSON.stringify(localCollection(key).filter(r=>r.id!==id)));}catch{/* Cloud acknowledgement remains valid; a duplicate pending checkpoint is safe to retry. */}},
 canSync:owner=>libraryAccount?.id===owner&&!libraryLoading&&!libraryError&&Boolean(window.OHAccounts),
 existing:(owner,id)=>owner===libraryAccount?.id?savedReviews.find(r=>r.id===id):null,
 saveRemote:(owner,record)=>window.OHAccounts.save('review',[record],owner),
 onStatus(detail){if(state?.id===detail.id&&state.archiveOwner===detail.owner){archiveStatus=detail;renderArchiveStatus();}},
 onSaved(owner,records){if(libraryAccount?.id!==owner)return;savedReviews=records;libraryHome();if($('#memory-dialog').open)renderMemory();}
});
function archiveText(){
 if(state?.demoRound)return '演示记录不会自动保存。';
 if(!archiveStatus||archiveStatus.id!==state?.id)return '卡牌与已发送对话会自动保存。';
 if(state?.archiveOwner&&state.archiveOwner!==libraryAccount?.id)return '本轮属于原账号，登录原账号后继续同步。';
 if(archiveStatus.state==='saved')return '已自动保存到账号。';
 if(archiveStatus.state==='local')return '已自动保存在当前浏览器。';
 if(archiveStatus.state==='error')return archiveStatus.local?'同步未完成，本机副本已保留，可重试保存或导出文字。':'自动保存未完成，请重试或导出文字。';
 if(archiveStatus.owner&&archiveStatus.owner!==libraryAccount?.id)return '本轮属于原账号，登录原账号后继续同步。';
 return archiveStatus.local?'已保留本机副本，正在等待同步到账号…':'正在保存…';
}
function renderArchiveStatus(){
 $('#autosave-status').textContent=archiveText();
 $('#retry-autosave').hidden=archiveStatus?.state!=='error';
 $('#export-autosave').hidden=archiveStatus?.state!=='error';
 const reviewStatus=$('#review-autosave-status');if(reviewStatus)reviewStatus.textContent=archiveText();
 const reviewRetry=$('#review-retry-autosave');if(reviewRetry)reviewRetry.hidden=archiveStatus?.state!=='error';
}
function autosaveRound(round=state){
 if(!round?.cards.length||round.demoRound||round.autosaveStopped)return;
 roundSaver.enqueue(round.archiveOwner??null,roundArchive(round,WORD_DECK.version));
}
async function retryArchives(){
 if(state?.archiveOwner===null)autosaveRound();
 await roundSaver.retry(libraryAccount?.id??null);
 renderArchiveStatus();
}
function toast(message) {
  clearTimeout(toastTimeout); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3600);
}
function randomBelow(limit) {
  const range = Math.floor(4294967296 / limit) * limit;
  const array = new Uint32Array(1); let value;
  do { crypto.getRandomValues(array); value = array[0]; } while (value >= range);
  return value % limit;
}
function shuffledCards(items = Array.from({length:88}, (_, i) => i + 1)) {
  const cards = [...items];
  for (let i = cards.length - 1; i > 0; i--) { const j = randomBelow(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
function newRound(example = false, mode = selectedPlayMode) {
  if(state?.cards.length&&state.status==='active'){state.status='ended';autosaveRound();}
  for (const pending of Object.values(state?.replyRequests || {})) pending.controller.abort();
  const deck = preparedDeck || shuffledCards();
  preparedDeck = null;
  if (example) { deck.splice(deck.indexOf(25), 1); deck.unshift(25); }
  archiveStatus=null;
  state = { archiveOwner:libraryAccount?.id??null,play_mode:mode, id:crypto.randomUUID(), createdAt:new Date().toISOString(), status:'active', deck,
    cards:[], picks:[], wordDeck:mode==='image_only'?[]:shuffledCards(WORD_DECK.cards.map(w=>w.id)), wordPicks:[], pairings:{}, activeCard:0, turns:[], drafts:{}, example, demoRound:example, exampleStep:0, viewedCards:[], pending:false, replyRequests:{}, replyErrors:{}, revisions:{} };
  $('#message-input').value = '';
  if (example) {
    revealPosition(0);
    state.turns.push({...exampleTurns[0], id:crypto.randomUUID(), card:25, example:true}); state.exampleStep = 1; renderSession();
  } else { showView('home'); openDeck(); }
}
function showView(name) {
  currentView = name;
  for (const view of ['home','session','review']) $(`#${view}-view`).hidden = name !== view;
  if (name === 'home') { renderResumeButton(); renderHomeCards(); }
  window.scrollTo({top:0, behavior:'instant'});
}
function validHomeCards(cards) {
  return Array.isArray(cards) && cards.length >= 1 && cards.length <= 3 &&
    cards.every(n => Number.isInteger(n) && n >= 1 && n <= 88) && new Set(cards).size === cards.length;
}
function rememberHomeCards() {
  // A sample replay never replaces the visitor's own last completed draw.
  if (!state || state.demoRound || !validHomeCards(state.cards)) return;
  previousRoundCards = [...state.cards];
  if (libraryAccount) return;
  try { localStorage.setItem(homeCardsKey, JSON.stringify(previousRoundCards)); }
  catch { toast('上一轮图卡暂时只能在本页保留。'); }
}
function renderHomeCards() {
  const remembered = previousRoundCards.length > 0;
  const cards = remembered ? previousRoundCards : [12, 64, 25];
  const composition = $('.card-composition');
  composition.setAttribute('aria-label', remembered ? `上一轮抽到的 ${cards.length} 张图卡` : 'OH 图卡预览');
  composition.innerHTML = `<span class="orbit-label">每次看见，都可以不同。</span>${cards.map((n, i) => {
    const front = i === cards.length - 1;
    const placement = front ? 'fan-front' : i === 0 ? 'fan-back-one' : 'fan-back-two';
    const description = remembered ? `上一轮第 ${i+1} 张图卡 ${cardID(n)}` : `示例图卡 ${cardID(n)}`;
    return `<figure class="fan-card ${placement}" data-home-card="${n}"><img src="${cardURL(n)}" alt="${description}" draggable="false">${front ? `<figcaption>${remembered ? '' : '<span>一张卡，一种此刻的看法。</span>'}<span>${String(n).padStart(3,'0')}</span></figcaption>` : ''}</figure>`;
  }).join('')}<div class="composition-note"><span>LOOK A LITTLE CLOSER</span><i></i></div>`;
}
function addTurn(role, text, options = {}) {
  const turn = { id:crypto.randomUUID(), role, text, card:state.activeCard, at:new Date().toISOString(), word_context:wordContext(state.activeCard), ...options };
  state.turns.push(turn); return turn;
}
function openDeck() {
  if (!state || state.status !== 'active' || state.cards.length >= 3 || state.pending) return;
  state.peekPosition = null;
  $('#deck-confirm').hidden = true;
  $('#deck-title').textContent = state.cards.length ? '再从牌叠里，挑一张。' : '从牌叠里，选一张。';
  $('#deck-hint').textContent = matchMedia('(max-width: 720px), (hover: none)').matches ? '左右滑动牌叠，轻点抬起后再选。' : '88 张牌，慢慢挑。';
  $('#deck-count').textContent = `已抽 ${state.cards.length} / 3 张`;
  // Only positions are rendered: no face, file name, or hidden image URL is put on a card back.
  $('#deck-grid').innerHTML = state.deck.map((_, position) => {
    const pick = state.picks.findIndex(p=>p.position===position), used = pick !== -1;
    return `<button class="deck-card ${used ? 'is-used' : ''}" style="--stack-order:${position % 44}" data-action="pick-position" data-position="${position}" ${used ? 'disabled' : ''} aria-label="${used ? `第 ${position+1} 个牌位已抽，作为第 ${pick+1} 张` : `选择第 ${position+1} 个牌位`}"><img class="cardback-art" src="assets/card-back-approved-v1.png" alt="" draggable="false" aria-hidden="true"><span class="deck-position" aria-hidden="true">${String(position+1).padStart(2,'0')}</span>${used ? `<span class="picked-badge">已抽 ${pick+1}</span>` : ''}</button>`;
  }).join('');
  if (!$('#deck-dialog').open) $('#deck-dialog').showModal();
}
function peekCard(kind, position) {
  const word=kind==='word';
  $$(word?'#word-grid .is-peeked':'#deck-grid .is-peeked').forEach(card=>card.classList.remove('is-peeked'));
  const card=$(word?`#word-grid [data-position="${position}"]`:`#deck-grid [data-position="${position}"]`);
  card?.classList.add('is-peeked');
  if(word) state.peekWordPosition=position; else state.peekPosition=position;
  const confirm=$(word?'#word-confirm':'#deck-confirm');
  confirm.hidden=false;confirm.dataset.position=String(position);confirm.textContent=`选第 ${position+1} 张`;
  confirm.setAttribute('aria-label',`确认选择第 ${position+1} 个${word?'字卡':''}牌位`);
}
function revealPosition(position) {
  if (!state || state.status !== 'active' || state.cards.length >= 3 || state.pending ||
      !Number.isInteger(position) || position < 0 || position >= 88 || state.picks.some(p=>p.position===position)) return;
  // Freeze the mapping for the whole round. Picking, hovering, retrying and looking back never shuffle it.
  state.pending = true;
  const n = state.deck[position];
  state.picks.push({position, card:n, at:new Date().toISOString()});
  state.cards.push(n); state.activeCard = n;
  $('#deck-dialog').close();
  $('#message-input').value = state.drafts[n] || '';
  if (state.cards.length > 1) state.example = false;
  state.pairings[n] = {status:state.example && !imageOnlyMode(state) ? 'skipped' : 'image_only'};
  addOpening(n);
  showView('session'); renderSession();
  $('#card-zoom').classList.remove('card-reveal');
  requestAnimationFrame(() => $('#card-zoom').classList.add('card-reveal'));
  const roundId = state.id;
  setTimeout(() => { if (state?.id === roundId) { state.pending = false; updateDrawButton(); } }, 500);
}

function wordContext(card) {
  const p = state?.pairings?.[card];
  return p ? {status:p.status, ...(p.word_id ? {word_id:p.word_id} : {})} : {status:'skipped'};
}
function wordFor(card, pairs = state?.pairings) {
  return WORD_DECK.cards.find(w=>w.id===pairs?.[card]?.word_id);
}
function pairLabel(card, pairs = state?.pairings, mode = state?.play_mode) {
  if(mode==='image_only')return '纯图卡';
  const p=pairs?.[card], w=wordFor(card,pairs);
  return w ? `字卡「${w.text}」${p.status==='removed' ? '（已停用）' : ''}` : ['image_only','ready','pending'].includes(p?.status) ? '尚未抽字卡' : '只看图卡';
}
function addOpening(card) {
  if (state.turns.some(t=>t.card===card)) return;
  const paired=state.pairings[card]?.status==='paired';
  const question=paired ? '把这张图和这个词放在一起，你会想到什么？' : FIRST_IMPRESSION_QUESTION;
  addTurn('assistant',question,{card,question,basis:paired ? '先听你怎样理解图与字的组合；字卡本身不代表你的感受或特质。' : '先听这张图带给你的第一联想或感受，不预设答案，也不要求一定说出情绪。',ruleLine:paired ? 55 : 29,ruleName:paired ? '个人赋义优先' : '基础提问：先听第一联想或感受',origin:'引导问句'});
}
function openWordDeck() {
  if(imageOnlyMode(state))return;
  if (!state || state.status!=='active' || state.pairings[state.activeCard]?.status!=='ready') return;
  state.peekWordPosition=null;
  $('#word-confirm').hidden=true;
  $('#word-title').textContent=`给第 ${state.cards.indexOf(state.activeCard)+1} 张图，抽一个词。`;
  $('#word-hint').textContent=matchMedia('(max-width: 720px), (hover: none)').matches ? '左右滑动牌叠，轻点抬起后再选。' : '88 张字卡，慢慢挑。';
  $('#word-count').textContent=`已抽 ${state.wordPicks.length} / 3 张字卡`;
  $('#word-grid').innerHTML=state.wordDeck.map((_,position)=>{
    const used=state.wordPicks.some(p=>p.position===position);
    return `<button class="deck-card ${used?'is-used':''}" style="--stack-order:${position%44}" data-action="pick-word" data-position="${position}" ${used?'disabled':''} aria-label="${used?'已抽过':'选择'}第 ${position+1} 个字卡牌位"><img class="cardback-art" src="assets/card-back-approved-v1.png" alt="" draggable="false" aria-hidden="true"><span class="deck-position" aria-hidden="true">${String(position+1).padStart(2,'0')}</span>${used?'<span class="picked-badge">已抽</span>':''}</button>`;
  }).join('');
  $('#word-step').hidden=false;
}
function revealWord(position) {
  if(imageOnlyMode(state))return;
  if (!state || state.status!=='active' || state.pairings[state.activeCard]?.status!=='ready' || !Number.isInteger(position) || position<0 || position>=state.wordDeck.length || state.wordPicks.some(p=>p.position===position)) return;
  const word=WORD_DECK.cards.find(w=>w.id===state.wordDeck[position]);
  state.wordPicks.push({card:state.activeCard,word_id:word.id,position,at:new Date().toISOString()});
  state.pairings[state.activeCard]={...state.pairings[state.activeCard],status:'paired',word_id:word.id};
  $('#word-step').hidden=true;
  const question='加上这个词再看这张图，你有没有什么新的联想？';
  addTurn('assistant',question,{question,basis:'保留你抽字前对图卡的表达，再听这个词带来什么变化；不把字卡当作你的感受或特质。',ruleLine:55,ruleName:'个人赋义优先',origin:'图字联想引导'});
  renderSession();
  // The revealed combination belongs to its place in the conversation; the original image stays above.
}
function skipWord() {
  if (!state || state.pairings[state.activeCard]?.status!=='ready') return;
  state.pairings[state.activeCard]={...state.pairings[state.activeCard],status:'skipped'};
  $('#word-step').hidden=true;
  addTurn('assistant','好，我们继续只看图卡，刚才聊到的内容都还在。',{basis:'尊重你跳过字卡的选择，不重新开始对话。',ruleLine:292,ruleName:'允许跳过与暂停',origin:'玩法提示'});
  renderSession();
}
function removeWord() {
  const card=state?.activeCard,p=state?.pairings?.[card];
  if (state?.status!=='active' || p?.status!=='paired') return;
  // In-flight output was based on the old combination. Keep the text, invalidate that request.
  state.replyRequests[card]?.controller.abort();delete state.replyRequests[card];delete state.replyErrors[card];
  state.revisions[card]=(state.revisions[card]||0)+1;
  p.status='removed';
  addTurn('assistant','好，我们先把字卡放在一边，接着聊这张图。',{basis:'尊重你先不用字卡的选择；已有表达保留，不把停用解释成抗拒。',ruleLine:292,ruleName:'允许跳过与暂停',origin:'玩法提示'});
  renderSession();
}

function updateDrawButton() {
  const full = state.cards.length >= 3;
  const ended = state.status !== 'active';
  $('.draw-rail').hidden = !imageOnlyMode(state);
  $('.session-layout').dataset.playMode = playMode(state);
  $('.session-kicker').textContent = PLAY_MODES[playMode(state)].name;
  $('#draw-next').disabled = full || ended || state.pending;
  $('#draw-next strong').textContent = ended ? '本轮已结束' : full ? '已抽满三张' : `抽第 ${state.cards.length+1} 张图卡`;
  $('#draw-target').textContent = full || ended ? `${state.cards.length} / 3 张` : `第 ${state.cards.length + 1} / 3 张`;
  $('#draw-note').innerHTML = full ? '不用急着结束，<br>还可以接着聊。' : '不用等聊完，<br>想抽就可以抽。';
}
function renderSession() {
  const n = state.activeCard, position = state.cards.indexOf(n) + 1;
  const pairing=state.pairings[n];
  $('#card-pair').classList.remove('is-paired');
  $('#word-frame').hidden=true;
  $('#word-frame').removeAttribute('src');
  $('#word-status').hidden=true;
  $('#word-status').innerHTML='';
  $('#word-step').hidden=imageOnlyMode(state)||pairing?.status!=='ready'||state.status!=='active';
  if(!$('#word-step').hidden)openWordDeck();
  $('#card-zoom').setAttribute('aria-label','放大当前图卡');
  $('#card-position').textContent = `第 ${position} 张图卡`;
  $('#card-id').textContent = cardID(n);
  $('#active-card-image').src = cardURL(n);
  $('#active-card-image').alt = `本轮第 ${position} 张图卡 ${cardID(n)}`;
  // Keep the image readable throughout the conversation, including after word pairing.
  $('.card-stage').classList.remove('compact');
  const pinnedWord = pairing?.status === 'paired' ? wordFor(n) : null;
  $('#pinned-word').hidden = !pinnedWord;
  $('#pinned-word').textContent = pinnedWord ? `字卡 · ${pinnedWord.text}` : '';
  $('#card-strip').innerHTML = state.cards.map((c, i) => `<button class="card-thumb ${c === n ? 'active' : ''}" data-action="select-card" data-card="${c}" aria-pressed="${c === n}"><img src="${cardURL(c)}" alt=""><span>第 ${i+1} 张</span>${state.pairings[c]?.status==='paired'?`<span class="thumb-word"> · ${escapeHTML(wordFor(c).text)}</span>`:''}</button>`).join('');
  const cardTurns=state.turns.filter(t => t.card === n);
  const latest=cardTurns.at(-1);
  const nextImage=state.status==='active' && state.cards.length<3 && state.cards.at(-1)===n && (imageOnlyMode(state)||['paired','skipped','removed'].includes(pairing?.status)) && !state.replyRequests[n] && latest?.image_transition?.ready===true ? `<div class="next-image-step"><button class="primary" data-action="draw">抽第 ${state.cards.length+1} 张图卡 ${icon('arrow')}</button></div>` : '';
  const reviewStep=state.status==='active' && (state.cards.length===3||imageOnlyMode(state)) && state.cards.at(-1)===n && !state.replyRequests[n] && latest?.review_transition?.ready===true ? '<div class="next-image-step"><button class="primary" data-action="review">回顾这一轮 ↗</button></div>' : '';
  $('#messages').innerHTML = renderConversation(cardTurns) + nextImage + reviewStep +
    (state.replyRequests[n] ? '<p class="reply-wait" role="status">正在回应…</p>' : '') +
    (state.replyErrors[n] ? `<div class="reply-error" role="status"><p>${escapeHTML(state.replyErrors[n])}</p><button class="plain-link" data-action="retry-ai">重试回应 ↗</button></div>` : '');
  $('#example-controls').hidden = !state.example || state.status !== 'active' || state.exampleStep >= exampleTurns.length;
  $('#message-input').disabled = state.status !== 'active';
  $('#message-form button[type=submit]').disabled = state.status !== 'active' || Boolean(state.replyRequests[n]);
  updateDrawButton();
  const messages = $('#messages'); messages.scrollTop = messages.scrollHeight;
  autosaveRound();renderArchiveStatus();
}
function renderConversation(turns) {
  const shownWords=new Set();
  return turns.map(turn=>{
    const context=turn.word_context;
    let pair='';
    if(context?.status==='paired' && context.word_id && !shownWords.has(context.word_id)) {
      shownWords.add(context.word_id);
      pair=renderWordPair(turn.card,context.word_id);
    }
    return pair+renderTurn(turn);
  }).join('');
}
function renderWordPair(card,wordId) {
  const word=WORD_DECK.cards.find(w=>w.id===wordId);
  if(!word)return '';
  const active=state.pairings[card]?.status==='paired' && state.pairings[card]?.word_id===wordId;
  return `<figure class="conversation-pair" aria-label="图字组合 ${cardID(card)} · ${escapeHTML(word.text)}">
    <div class="card-pair is-paired"><img class="word-frame" src="${word.asset}" alt="字卡：${escapeHTML(word.text)}">
      <button class="current-card" data-action="zoom-pair" data-card="${card}" data-word="${word.id}" aria-label="放大图字组合：${escapeHTML(word.text)}"><img src="${cardURL(card)}" alt="图卡 ${cardID(card)}"><span class="zoom-hint">${icon('expand')}放大看</span></button>
    </div><figcaption class="word-status"><span>字卡 · <strong>${escapeHTML(word.text)}</strong>${active?'':' <small>已停用 · 历史组合</small>'}</span>${active&&state.status==='active'?'<button class="text-button" data-action="remove-word">先不用字卡</button>':''}</figcaption>
  </figure>`;
}
function openCardZoom(card,wordId=null) {
  const word=WORD_DECK.cards.find(w=>w.id===wordId);
  $('#image-dialog').classList.toggle('has-word',Boolean(word));
  $('#zoom-word').hidden=!word;
  if(word){$('#zoom-word').src=word.asset;$('#zoom-word').alt=`字卡：${word.text}`;}
  else $('#zoom-word').removeAttribute('src');
  $('#zoom-image').src=cardURL(card);
  $('#zoom-caption').textContent=`${cardID(card)}${word?` · ${word.text}`:''} · 等比例展示`;
  $('#image-dialog').showModal();
}
// Preserve the question field; only arrange the visible answer and its optional note.
function formatAssistantReply(message, question = null) {
  const hasNotice = message.includes(EXPLORATION_NOTICE);
  let answer = message.replaceAll(`（${EXPLORATION_NOTICE}）`, '').replaceAll(EXPLORATION_NOTICE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (question && !answer.includes(question)) answer += '\n\n' + question;
  return answer + (hasNotice ? `\n\n（${EXPLORATION_NOTICE}）` : '');
}
function renderTurn(turn) {
  // Keep the transition event for history/audit, but go straight to the deck.
  if(!imageOnlyMode(state)&&turn.role==='assistant'&&turn.reply_action==='summarize'&&turn.word_transition?.ready&&!turn.question)return '';
  const assistant = turn.role === 'assistant';
  const candidates = turn.usedRules?.length ? turn.usedRules : [{line:turn.ruleLine || 29,name:turn.ruleName || '提问与解释规则'}];
  const rules = candidates.filter((r,i,a) => Number.isInteger(r.line) && r.line > 0 && a.findIndex(other=>other.line===r.line)===i);
  const correction = turn.feedbackQuote ? ` 后续反馈：“${turn.feedbackQuote}”。${turn.feedbackReason || '后续理解以这次反馈为准。'}` : '';
  const application = (turn.basis || '本句来自对话示例。') + correction;
  const rationale = assistant ? `<details class="rationale"><summary>回应依据</summary><ul>
    <li>参考规则：${rules.map(r=>`<a href="skill/#L${r.line}" target="_blank" rel="noopener" title="查看 Skill 第 ${r.line} 行原文">${escapeHTML(r.name)} ↗</a>`).join('、')}</li>
    <li>具体应用：${escapeHTML(application)}</li>
  </ul></details>` : '';
  return `<article class="message ${assistant ? 'assistant' : 'user'}">${assistant ? '' : `<div class="message-meta"><span>你</span><span>${cardID(turn.card)}</span></div>`}<p>${escapeHTML(assistant ? formatAssistantReply(turn.text) : turn.text)}</p>${rationale}</article>`;
}

const exampleTurns = [
  {
    "role": "user",
    "text": "我先注意到跑在前面的那个孩子。"
  },
  {
    "role": "assistant",
    "text": "看着这个孩子，你有什么感受？",
    "question": "看着这个孩子，你有什么感受？",
    "quote": "我先注意到跑在前面的那个孩子。",
    "basis": "从看到的对象进入感受，先听参与者怎样理解画面。",
    "ruleLine": 35,
    "ruleName": "进入体验",
    "origin": "虚构对话示例"
  },
  {
    "role": "user",
    "text": "觉得他很专心，像是在跑自己的路。"
  },
  {
    "role": "assistant",
    "text": "你说的“很专心”，在这张图里具体是什么样的？",
    "question": "你说的“很专心”，在这张图里具体是什么样的？",
    "quote": "觉得他很专心，像是在跑自己的路。",
    "basis": "具体化参与者使用的形容词，不替他规定含义。",
    "ruleLine": 84,
    "ruleName": "找到个人化词义",
    "origin": "虚构对话示例"
  },
  {
    "role": "user",
    "text": "就是不管旁边的人快还是慢，都按自己的节奏往前跑。我挺喜欢这一点。"
  },
  {
    "role": "assistant",
    "text": "你欣赏的似乎是有自己的节奏，不总被别人的快慢带着走。你最近也想有这样的状态吗？",
    "question": "你最近也想有这样的状态吗？",
    "quote": "就是不管旁边的人快还是慢，都按自己的节奏往前跑。我挺喜欢这一点。",
    "basis": "从喜欢的体验探索可能向往的状态，留给参与者确认。",
    "hypothesis": "参与者可能向往按自己的节奏做事。",
    "ruleLine": 75,
    "ruleName": "从喜欢探索向往",
    "origin": "虚构对话示例"
  },
  {
    "role": "user",
    "text": "是的。我最近在学画画，想先练熟线条，不急着跟别人比作品。",
    "acknowledgesRule": 75
  },
  {
    "role": "assistant",
    "text": "放到学画画这件事上，你想先把线条练熟，而不是急着比较作品。下一次练习，你准备从什么开始？",
    "question": "下一次练习，你准备从什么开始？",
    "quote": "是的。我最近在学画画，想先练熟线条，不急着跟别人比作品。",
    "basis": "承接参与者自己提供的生活联系，再把想法落到具体行动。",
    "ruleLine": 84,
    "ruleName": "通过行动具体化",
    "origin": "虚构对话示例"
  },
  {
    "role": "user",
    "text": "先画十分钟直线和圆，看看哪一种线条最难控制。"
  },
  {
    "role": "assistant",
    "text": "那就先从十分钟的直线和圆开始，观察自己最想练的部分。你愿意的话，可以把这句计划留在回顾里。",
    "quote": "先画十分钟直线和圆，看看哪一种线条最难控制。",
    "basis": "保留参与者提出的具体练习，不再扩大解释；保存由本人选择。",
    "ruleLine": 53,
    "ruleName": "围绕原话回应",
    "origin": "虚构对话示例"
  }
];
function nextExample() {
  if (!state?.example || state.status !== 'active') return;
  const next = exampleTurns[state.exampleStep];
  if (!next) return;
  state.turns.push({...next, id:crypto.randomUUID(), card:25, example:true, at:new Date().toISOString()});
  if (next.role === 'user' && next.acknowledgesRule === 75) {
    const claim = [...state.turns].reverse().find(t=>t.hypothesis && t.ruleLine === 75);
    if (claim) { claim.claimState='accepted'; claim.feedbackQuote=next.text; }
  }
  state.exampleStep++;
  // Show one exchange per click, never future material in earlier context.
  if (next.role === 'user' && state.exampleStep < exampleTurns.length) {
    state.turns.push({...exampleTurns[state.exampleStep], id:crypto.randomUUID(), card:25, example:true, at:new Date().toISOString()}); state.exampleStep++;
  }
  renderSession();
  if (state.exampleStep >= exampleTurns.length) toast('示例到这里结束。你可以再抽一张，或回顾本轮。');
}
function submitInput() {
  if (!state || state.status !== 'active' || state.replyRequests[state.activeCard] || state.pairings[state.activeCard]?.status==='pending') return;
  const input = $('#message-input'), text = input.value.trim();
  if (!text) { input.focus(); return; }
  // A new expression can correct the theme. Reassess before offering the word deck again.
  if(state.pairings[state.activeCard]?.status==='ready'){state.pairings[state.activeCard]={status:'image_only'};}
  state.example = false; addTurn('user', text); input.value = ''; state.drafts[state.activeCard]='';
  state.revisions[state.activeCard]=(state.revisions[state.activeCard]||0)+1;
  if (liveAI) startLiveReply(state.activeCard);
  else { renderSession(); toast('已加入本轮记录。展示版暂不生成实时 AI 解读。'); }
  input.focus();
}
$('#message-form').addEventListener('submit', event => { event.preventDefault(); submitInput(); });
async function connectVisitor() {
  if (!visitorSessionPromise) visitorSessionPromise=fetch(window.OH_RUNTIME.apiBase+'/session',{credentials:'omit',cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error?.message||'AI 连接暂不可用，请稍后重试。');return true;}).catch(e=>{visitorSessionPromise=null;throw e;});
  return visitorSessionPromise;
}
async function startLiveReply(card) {
  if (!liveAI || !state || state.status!=='active' || state.replyRequests[card]) return;
  const lastUser=[...state.turns].reverse().find(t=>t.card===card&&t.role==='user');if(!lastUser)return;
  const accountOwner=libraryAccount?.id || null;
  const round=state, revision=round.revisions[card], requestId=crypto.randomUUID(), controller=new AbortController();
  round.replyRequests[card]={id:requestId,controller};delete round.replyErrors[card];renderSession();
  const payload={play_mode:playMode(round),session_id:round.id,request_id:requestId,input_revision:revision,active_card:card,current_turn_id:lastUser.id,cards:[...round.cards],
    word_pairs:round.cards.map(n=>({card:n,...wordContext(n)})),
    turns:round.turns.map(t=>({id:t.id,role:t.role,card:t.card,text:t.text,example:Boolean(t.example),...(t.reply_to?{reply_to:t.reply_to,reply_action:t.reply_action}:{}),...(t.basic_answers?{basic_answers:t.basic_answers}:{}),...(t.other_feelings_invitation!==undefined?{other_feelings_invitation:t.other_feelings_invitation}:{}),...(t.word_context?{word_context:t.word_context}:{})})),
    memories:memories.filter(m=>!m.example).map(m=>({id:m.id,text:m.text})),
    existing_claims:round.turns.filter(t=>t.claimId&&t.hypothesis).map(t=>({id:t.claimId,card:t.card,text:t.hypothesis,status:t.claimState||'proposed'}))};
  try {
    await connectVisitor();
    const response=await fetch(window.OH_RUNTIME.apiBase+'/chat',{method:'POST',credentials:'omit',headers:{'content-type':'application/json','x-oh-request':'1'},body:JSON.stringify(payload),signal:controller.signal});
    let data;try { data=await response.json(); } catch { throw new Error('AI 返回的信息不完整，请稍后重试。'); }
    if (!response.ok) { if(response.status===401)visitorSessionPromise=null;throw new Error(data.error?.message||'AI 暂时没有回应，请稍后重试。'); }
    if(controller.signal.aborted||(libraryAccount?.id || null)!==accountOwner||state!==round||round.status!=='active'||round.revisions[card]!==revision||data.session_id!==round.id||data.input_revision!==revision||data.request_id!==requestId)return;
    const answer=formatAssistantReply(data.message,data.question);
    const rule=data.rules?.[0],claim=data.claims?.[0];
    round.turns.push({id:crypto.randomUUID(),role:'assistant',text:answer,card,reply_to:lastUser.id,reply_action:data.next_action,word_transition:data.word_transition,image_transition:data.image_transition,review_transition:data.review_transition,other_feelings_invitation:data.other_feelings_invitation,basic_answers:data.basic_answers,word_context:wordContext(card),at:new Date().toISOString(),origin:data.trace?.provider==='program'?'玩法转场':'DeepSeek 实时回应',question:data.question,
      quotes:data.evidence.map(e=>e.quote),basis:data.basis,ruleLine:rule?.line||53,ruleName:rule?.name||'围绕原话回应',
      usedRules:data.rules,claimId:claim?.id,hypothesis:claim?.text,claimState:claim?'proposed':undefined,claimOrigin:claim?.origin,claimScope:claim?.scope,audit:data.trace});
    if(!imageOnlyMode(round) && round.pairings[card]?.status==='image_only' && data.word_transition?.ready===true && !['pause','end'].includes(data.next_action)) round.pairings[card]={status:'ready',transition:data.word_transition};
    if(!imageOnlyMode(round) && data.word_transition?.skipped===true&&!['pause','end'].includes(data.next_action))round.pairings[card]={...round.pairings[card],status:round.pairings[card]?.word_id?'removed':'skipped'};
    for(const update of data.claim_updates||[]){const t=round.turns.find(t=>t.claimId===update.claim_id);if(t){t.claimState=update.status;t.feedbackQuote=update.quote;t.feedbackReason=update.reason;}}
  } catch(error) {
    if(error.name!=='AbortError'&&state===round&&round.status==='active'&&round.revisions[card]===revision&&round.replyRequests[card]?.id===requestId)round.replyErrors[card]=error.message||'AI 暂时没有回应，你的文字还在，可以重试。';
  } finally {
    if(round.replyRequests[card]?.id===requestId)delete round.replyRequests[card];
    if(state===round){autosaveRound(round);if(currentView==='session')renderSession();}
  }
}
$('#message-input').addEventListener('input', event => { if(state) state.drafts[state.activeCard]=event.target.value; });
$('#message-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('#message-form').requestSubmit(); }
});
$('#active-card-image').addEventListener('error', () => {
  $('#card-id').textContent = `${cardID(state.activeCard)} · 图片加载失败`;
  toast('图片加载失败，点击卡片可重试；不会重新抽卡。');
});
function openInfo(html) { delete $('#info-content').dataset.libraryOwner; $('#info-content').innerHTML = html; if (!$('#info-dialog').open) $('#info-dialog').showModal(); }
function askToRestart(example = false) {
  if (state?.status === 'active' && (state.turns.some(t => t.role === 'user') || Object.values(state.drafts).some(v=>v.trim()))) {
    openInfo(`<p class="eyebrow">开始新的一轮</p><h2>先收好这一轮？</h2><p>本轮已发送的对话会自动留档；输入框未发送的草稿会被清空。你可以继续编辑，或先回顾再重新开始。</p><div class="review-actions"><button class="primary" data-action="review-before-new">先回顾</button><button class="secondary" data-action="confirm-new" data-example="${example}">结束本轮，开始新一轮</button></div>`);
  } else newRound(example);
}
function openReview() {
  if (!state || !state.cards.length) { toast('先选一张卡，再回顾这一轮。'); return; }
  if (state.status === 'active') {
    const hasDraft = Object.values(state.drafts).some(v=>v.trim());
    openInfo(`<p class="eyebrow">随时可以停</p><h2>先聊到这里？</h2><p>回顾只整理已经说过的话，不要求抽满三张。确认后结束本轮，你仍可回看卡片与对话。${hasDraft ? '输入框还有未发送的草稿，它们不会进入回顾；要保留的话，请先选择继续聊并发送。' : ''}</p><div class="review-actions"><button class="primary" data-action="confirm-end">结束并回顾</button><button class="secondary" data-action="close-dialog">继续聊</button></div>`);
  } else renderReview();
}
function turnWordLabel(turn) {
  const w=WORD_DECK.cards.find(w=>w.id===turn.word_context?.word_id);
  return w ? ` · 字卡「${w.text}」${turn.word_context.status==='removed'?'（已停用）':''}` : '';
}
function reviewPairs(cards,pairs={},mode=DEFAULT_PLAY_MODE) {
  return cards.map(n=>`<figure class="review-pair"><img src="${cardURL(n)}" alt="图卡 ${cardID(n)}"><figcaption>${escapeHTML(pairLabel(n,pairs,mode))}</figcaption></figure>`).join('');
}
function renderReview() {
  autosaveRound();
  const userTurns = state.turns.filter(t => t.role === 'user');
  const assistants = state.turns.filter(t => t.role === 'assistant' && t.hypothesis && !['accepted','rejected','superseded'].includes(t.claimState));
  const accepted = state.turns.filter(t=>t.claimState === 'accepted');
  const rows = userTurns.map(t => `<div class="quote-record"><small>${cardID(t.card)}${escapeHTML(turnWordLabel(t))} · 本人原话${t.example ? '（示例）' : ''}</small><p>${escapeHTML(t.text)}</p></div>`).join('');
  const candidates = userTurns.map(t => `<label class="remember-row"><input type="checkbox" name="remember" value="${t.id}"><span>${escapeHTML(t.text)}<small>${cardID(t.card)} · 只保留你选择的原话，不加入 AI 推测</small></span></label>`).join('');
  const remembered = memories.some(m => m.sessionId === state.id);
  $('#review-view').innerHTML = `<div class="review-heading"><p class="eyebrow">A LITTLE TAKEAWAY</p><h1>把这一刻，轻轻收好。</h1><p>卡牌与已发送对话会自动留档；想留给下次参考的内容，仍由你选择。</p></div><div class="review-cards">${reviewPairs(state.cards,state.pairings,playMode(state))}</div>
    <section class="review-section"><h2>这一轮，你说过</h2>${rows || '<p>这一轮还没有留下文字。看一看卡片，也可以结束。</p>'}</section>
    ${accepted.length ? `<section class="review-section"><h2>你明确回应过的理解</h2>${accepted.map(t=>`<div class="quote-record"><p>${escapeHTML(t.hypothesis)}</p><small>本人后续回应：“${escapeHTML(t.feedbackQuote)}”</small></div>`).join('')}<p>只表示本人认可这一项，不自动确认其他推论。</p></section>` : ''}
    ${assistants.length ? `<section class="review-section"><h2>仍需核对的理解</h2>${assistants.map(t => `<div class="quote-record"><small>${t.example ? 'AI 示例推测' : 'AI 的可能理解'} · 尚未由本人逐项确认</small><p>${escapeHTML(t.hypothesis)}</p></div>`).join('')}<p>这些推测不作为用户事实写入长期记忆。</p></section>` : ''}
    <section class="review-section"><h2>有什么想留给下次？</h2><p>勾选后保存为“下次可参考”的内容。${state.example ? '这轮是示例，记忆也会标明“演示记录”，不当作新用户的真实经历。' : '这里只保存你的原话；它们是否也适用于以后，可以随时修改。'}</p>${candidates || '<p class="empty-state">没有可保存的个人表达。</p>'}${userTurns.length ? `<button class="secondary" data-action="save-memory">${remembered ? '继续选择要保留的内容' : '保存勾选内容到记忆'}</button>` : ''}</section>
    <div class="review-actions"><button id="review-retry-autosave" class="secondary" data-action="retry-save" ${archiveStatus?.state==='error'?'':'hidden'}>重试保存 ${icon('memory')}</button><button class="secondary" data-action="export-review">导出文字</button><button class="secondary" data-action="view-ended">回看对话</button></div><p class="small-caption"><span id="review-autosave-status">${escapeHTML(archiveText())}</span></p><button class="plain-link" data-action="start">再开始一轮 ↗</button>`;
  showView('review');renderArchiveStatus();
}
function saveSelectedMemories() {
  if (libraryLoading || librarySaving || libraryError) { toast(libraryError || '正在同步，请稍后保存。'); return; }
  const selected = $$('input[name=remember]:checked').map(input => input.value);
  if (!selected.length) { toast('先勾选想留给下次的内容。'); return; }
  const additions = state.turns.filter(t => selected.includes(t.id) && !memories.some(m => m.turnId === t.id && m.sessionId === state.id)).map(t => ({
    play_mode:playMode(state),id:crypto.randomUUID(),text:t.text,source:t.text,turnId:t.id,card:t.card,sessionId:state.id,
    at:new Date().toISOString(),updatedAt:null,example:Boolean(t.example), revisions:[]
  }));
  if (!additions.length) { toast('这些原话已经在记忆里，不重复添加。'); return; }
  if (libraryAccount) { saveCloud('memory', additions); return; }
  const next = [...memories, ...additions];
  if (persist(memoryKey, next)) { memories = next; updateMemoryCount(); toast(`已保存 ${additions.length} 条，随时可在“我的记忆”查看。`); }
}
function saveReview() {
  if (libraryLoading || librarySaving || libraryError) { toast(libraryError || '正在同步，请稍后保存。'); return; }
  if (savedReviews.some(r => r.id === state.id)) { toast('这轮回顾已经保存，不重复添加。'); return; }
  const record = {...roundArchive(state,WORD_DECK.version),savedAt:new Date().toISOString()};
  if (libraryAccount) { saveCloud('review', [record]); return; }
  const next = [...savedReviews, record];
  if (persist(reviewKey, next)) { savedReviews = next; renderReview(); toast('本轮回顾已保存在这个浏览器。'); }
}
function exportReview() {
  const lines = ['看见未见 · OH卡探索回顾', `玩法：${PLAY_MODES[playMode(state)].name}`, dateLabel(state.createdAt), `图卡：${state.cards.map(cardID).join('、')}`, ...state.cards.map(n=>`${cardID(n)} · ${pairLabel(n)}`), ''];
  for (const t of state.turns) { lines.push(`${t.role === 'user' ? '本人表达' : t.origin || '引导问句'} · ${cardID(t.card)}${turnWordLabel(t)}`,t.text); if (t.hypothesis) lines.push(`待核对：${t.hypothesis}`); lines.push(''); }
  lines.push(liveAI ? '实时回应由 DeepSeek 生成；回放示例会单独标注。' : '展示版记录；示例回复不是实时模型解读。');
  const blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'}), url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=`看见未见-OH卡-${state.id.slice(0,8)}.txt`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function updateMemoryCount() { $('.memory-button').hidden=!libraryAccount?.id; $('#memory-count').textContent=memories.length; $('#memory-count').hidden=!memories.length; }
function openMemory() { renderMemory(); $('#memory-dialog').showModal(); }
function renderMemory() {
  $('#memory-dialog .drawer-footer').textContent = libraryAccount ? `账号：${libraryAccount.email} · 卡牌与已发送对话自动保存。AI 仅参考你选择留下的非示例记忆。` : '本轮卡牌与已发送对话自动保存在当前浏览器；旧记录可在登录后主动复制到账号。';
  $$('[data-action=memory-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === memoryTab)));
  const body = $('#memory-body');
  if (libraryAccount && memoryTab !== 'round' && (libraryLoading || libraryError)) { body.innerHTML=`<p>${escapeHTML(libraryError || '正在读取你的云端记忆…')}</p><button class="secondary" data-action="account">打开账号设置</button>${libraryAccount?localCollection(archiveCacheKey(libraryAccount.id)).map(r=>`<article class="memory-entry"><p>${dateLabel(r.createdAt)} · 本机待同步副本</p><button class="plain-link" data-action="open-pending" data-id="${r.id}">查看卡牌与完整对话 ↗</button></article>`).join(''):''}`; return; }
  if (memoryTab === 'round') {
    if (!state || !state.cards.length) { body.innerHTML='<div class="empty-state"><h3>从这一轮开始。</h3><p>选牌后，这里会记下卡片、你的表达和正在聊的问题。抽到的卡牌与已发送对话会自动保存。</p></div>'; return; }
    const currentTurns = state.turns.filter(t=>t.card===state.activeCard);
    const lastUser = currentTurns.filter(t => t.role === 'user').at(-1);
    const last = currentTurns.at(-1);
    body.innerHTML=`<p class="drawer-intro">本轮上下文：换卡片不清空；卡牌与已发送对话自动留档，未发送草稿不进入存档。</p><div class="context-card-images">${state.cards.map(n => `<img src="${cardURL(n)}" alt="${cardID(n)}">`).join('')}</div><dl><div class="context-row"><dt>本轮状态</dt><dd>${state.status === 'active' ? '探索中' : '已结束'} · 已抽 ${state.cards.length}/3 张</dd></div><div class="context-row"><dt>当前卡片</dt><dd>${cardID(state.activeCard)} · ${escapeHTML(pairLabel(state.activeCard))}</dd></div><div class="context-row"><dt>最近表达</dt><dd>${lastUser ? escapeHTML(lastUser.text) : '还没有个人表达'}</dd></div><div class="context-row"><dt>当前问题</dt><dd>${last.role === 'assistant' && last.question ? escapeHTML(last.question) : '当前没有待回答的新问题'}</dd></div></dl><h3 style="font:500 20px var(--serif);margin:25px 0 15px">按卡片回看原话</h3>${state.turns.filter(t => t.role === 'user').map(t => `<div class="memory-entry"><small>${cardID(t.card)}${escapeHTML(turnWordLabel(t))} · 本人表达</small><p>${escapeHTML(t.text)}</p></div>`).join('') || '<p class="drawer-intro">写下第一句联想，这里就会更新。</p>'}`;
  } else if (memoryTab === 'long') {
    body.innerHTML=`<p class="drawer-intro">只保留你主动选择的内容。修改后以最新说法为准，原话出处仍可查看。删除会停止将它作为跨轮记忆，但不会同时删除已保存回顾。</p>${memories.length ? memories.map(m => `<article class="memory-entry" data-memory-id="${m.id}"><p class="memory-text">${escapeHTML(m.text)}</p><small>${dateLabel(m.at)} · ${cardID(m.card)}${m.example ? ' · 演示记录，不作真人事实' : ' · 本人选择保留'}${m.updatedAt ? ' · 已修改' : ''}</small><details><summary>查看原话出处</summary><blockquote>${escapeHTML(m.source)}</blockquote><p>本轮原话 ${escapeHTML(m.turnId.slice(0,8))}${m.revisions.length ? ` · 已修改 ${m.revisions.length} 次` : ''}</p></details><div class="entry-actions"><button data-action="edit-memory" data-id="${m.id}">修改</button><button data-action="delete-request" data-kind="memory" data-id="${m.id}">删除</button></div></article>`).join('') : '<div class="empty-state"><h3>值得留下的，由你选。</h3><p>一轮结束后，勾选想留给下次参考的话，它们会出现在这里。AI 的猜测不会自动进入。</p></div>'}`;
  } else {
    body.innerHTML=`<p class="drawer-intro">每轮卡牌与已发送的完整对话自动留档；不等于把每句话都作为长期记忆使用。</p>${savedReviews.length ? savedReviews.map(r => `<article class="memory-entry" data-review-id="${r.id}"><p>${dateLabel(r.createdAt)}${r.play_mode?` · ${PLAY_MODES[playMode(r)].name}`:""} 的探索</p><div class="saved-thumbnails">${r.cards.map(n=>`<img src="${cardURL(n)}" alt="${cardID(n)}">`).join('')}</div><small>${r.turns.some(t=>t.role==='user') && r.turns.filter(t=>t.role==='user').every(t=>t.example)?'演示记录 · 非本人经历 · ':''}${r.status==='active'?'探索中 · ':''}${r.cards.length} 张图卡 · ${r.turns.filter(t=>t.role==='user').length} 条个人表达</small><div class="entry-actions"><button data-action="open-saved" data-id="${r.id}">展开回顾</button><button data-action="delete-request" data-kind="review" data-id="${r.id}">删除</button></div></article>`).join('') : '<div class="empty-state"><h3>这里还没有回顾。</h3><p>完成一轮后，选择“保存这轮回顾”，以后就可以再来看。</p></div>'}`;
  }
}
function savedReviewHTML(r) {
  return `<p class="eyebrow">已保存的回顾${r.play_mode?` · ${PLAY_MODES[playMode(r)].name}`:""}</p><h2>${dateLabel(r.createdAt)}</h2><div class="review-cards">${reviewPairs(r.cards,r.pairings,playMode(r))}</div><h3>按当时的对话回看</h3>${r.turns.map(t=>`<div class="quote-record ${t.role==='user'?'archive-user':'archive-ai'}"><small>${cardID(t.card)}${escapeHTML(turnWordLabel(t))} · ${t.role==='user'?(t.example?'示例人物原话（非本人经历）':'你的原话'):t.example?'AI 示例回应':'AI 回应'}</small><p>${escapeHTML(t.text)}</p>${t.hypothesis?`<p class="archive-interpretation">当时的理解：${escapeHTML(t.hypothesis)}</p><small>${({accepted:t.example?'示例人物认可了这一项':'你当时认可了这一项',rejected:'你已否定这一理解',superseded:'这项理解已被后续说法替代'})[t.claimState]||'尚未逐项确认'}</small>`:''}${t.feedbackQuote?`<blockquote>${t.example?'示例人物的后续回应':'你的后续回应'}：${escapeHTML(t.feedbackQuote)}</blockquote>`:''}${t.feedbackReason?`<p>${escapeHTML(t.feedbackReason)}</p>`:''}</div>`).join('') || '<p>这一轮没有文字记录。</p>'}<p class="small-caption">AI 的回应与个人原话分开保留。保存整轮不代表将 AI 解读认定为个人事实。</p>`;
}
function editMemory(id) {
  const memory=memories.find(m=>m.id===id), entry=$(`[data-memory-id="${id}"]`);
  if (!memory || !entry) return;
  entry.innerHTML=`<label class="drawer-intro" for="edit-${id}">修改后，以新说法为准；原话出处保留。</label><textarea id="edit-${id}" class="memory-edit" maxlength="3000">${escapeHTML(memory.text)}</textarea><div class="entry-actions"><button data-action="save-memory-edit" data-id="${id}">保存修改</button><button data-action="cancel-memory-edit">取消</button></div>`;
  $('.memory-edit',entry).focus();
}
function deleteRequest(target) {
  const parent=target.closest('.memory-entry');
  if ($('.delete-confirm',parent)) return;
  const div=document.createElement('div'); div.className='delete-confirm';
  div.innerHTML=`<p>删除这条${target.dataset.kind === 'memory' ? '跨轮记忆' : '已保存回顾'}？其他记录不会改变。</p><button data-action="delete-confirm" data-kind="${target.dataset.kind}" data-id="${target.dataset.id}">确认删除</button><button data-action="cancel-memory-edit">取消</button>`;
  parent.append(div);
}
function closeDialog(button) { button.closest('dialog')?.close(); }
document.addEventListener('click', event => {
  const target=event.target.closest('[data-action]'); if (!target) return;
  const action=target.dataset.action;
  if (action === 'close-dialog') closeDialog(target);
  else if (action === 'home' || action === 'leave') {
    if (state?.status === 'active') { showView('home'); toast('本轮仍保留在页面中，可以继续。'); renderResumeButton(); }
    else showView('home');
  }
  else if (action === 'start') askToRestart(false);
  else if (action === 'resume') { if(!state.cards.length) openDeck(); else { showView('session'); renderSession(); } }
  else if (action === 'example') askToRestart(true);
  else if (action === 'draw') openDeck();
  else if (action === 'skip-word') skipWord();
  else if (action === 'remove-word') removeWord();
  else if (action === 'pick-word') {
    const position=Number(target.dataset.position);
    if (matchMedia('(hover: none)').matches && event.detail!==0 && state.peekWordPosition!==position) {
      peekCard('word',position);
    } else revealWord(position);
  }
  else if (action === 'retry-ai') startLiveReply(state.activeCard);
  else if (action === 'pick-position') {
    const position=Number(target.dataset.position);
    if (matchMedia('(hover: none)').matches && event.detail !== 0 && state.peekPosition !== position) {
      peekCard('image',position);
    } else revealPosition(position);
  }
  else if (action === 'choose-mode') {
    if((state?.status==='active'&&state.cards.length>0)||!PLAY_MODES[target.dataset.mode])return;
    selectedPlayMode=target.dataset.mode;
    if(state?.status==='active'&&!state.cards.length)state=null;
    renderResumeButton();
  }
  else if (action === 'next-example') nextExample();
  else if (action === 'select-card') { state.activeCard=Number(target.dataset.card); $('#message-input').value=state.drafts[state.activeCard] || ''; renderSession(); }
  else if (action === 'zoom') openCardZoom(state.activeCard);
  else if (action === 'zoom-pair') openCardZoom(Number(target.dataset.card),target.dataset.word);
  else if (action === 'memory') openMemory();
  else if (action === 'account') window.OHAccounts?.open();
  else if (action === 'memory-tab') { memoryTab=target.dataset.tab; renderMemory(); }
  else if (action === 'review') openReview();
  else if (action === 'confirm-end') {
    closeDialog(target); state.status='ended'; state.pending=false;
    for (const pending of Object.values(state.replyRequests)) pending.controller.abort();
    rememberHomeCards();
    preparedDeck=shuffledCards(); // Prepare the next round now; keep the ended round's positions intact for its history.
    renderReview();
  }
  else if (action === 'view-ended') { showView('session'); renderSession(); }
  else if (action === 'review-before-new') { closeDialog(target); openReview(); }
  else if (action === 'confirm-new') { closeDialog(target); newRound(target.dataset.example==='true'); }
  else if (action === 'save-memory') saveSelectedMemories();
  else if (action === 'save-review') saveReview();
  else if (action === 'retry-save') { autosaveRound();retryArchives(); }
  else if (action === 'export-review') exportReview();
  else if (action === 'edit-memory') editMemory(target.dataset.id);
  else if (action === 'cancel-memory-edit') renderMemory();
  else if (action === 'save-memory-edit') {
    const id=target.dataset.id, value=$('.memory-edit',target.closest('.memory-entry')).value.trim();
    if (!value) { toast('内容不能为空；如果不想保留，可以删除。'); return; }
    const next=memories.map(m=>m.id===id ? {...m,text:value,updatedAt:new Date().toISOString(),revisions:[...m.revisions,{text:m.text,at:new Date().toISOString()}]} : m);
    if (libraryAccount) { saveCloud('memory',next.filter(m=>m.id===id)); return; }
    if (persist(memoryKey,next)) { memories=next; renderMemory(); toast('已更新，以新说法为准。'); }
  }
  else if (action === 'delete-request') deleteRequest(target);
  else if (action === 'delete-confirm') {
    const kind=target.dataset.kind,id=target.dataset.id;
    if(kind==='review'&&state?.id===id)state.autosaveStopped=true;
    if(!libraryAccount&&kind==='review')roundSaver.stop(null,id);
    if (libraryAccount) { deleteCloud(kind,(kind==='memory'?memories:savedReviews).find(v=>v.id===id)); return; }
    const next=(kind==='memory' ? memories : savedReviews).filter(v=>v.id!==id);
    if (persist(kind==='memory'?memoryKey:reviewKey,next)) { if(kind==='memory') memories=next; else savedReviews=next; updateMemoryCount(); renderMemory(); toast('已删除这条记录。'); }
  }
  else if(action==='open-pending'){const owner=libraryAccount?.id;if(!owner)return;const r=localCollection(archiveCacheKey(owner)).find(r=>r.id===target.dataset.id);if(r){openInfo(savedReviewHTML(r));$('#info-content').dataset.libraryOwner=owner;}}
  else if (action === 'open-saved') {
    const r=savedReviews.find(v=>v.id===target.dataset.id);
    if (!r) return;
    openInfo(savedReviewHTML(r));
    if(libraryAccount) $('#info-content').dataset.libraryOwner=libraryAccount.id;
  }
  else if (action === 'how') openInfo(`<p class="eyebrow">没有标准答案</p><h2>给一张图，留一点想象。</h2><ol><li>88 张牌背叠放在一起，每张露出一部分；悬停抬起后自己点选。</li><li>纯图卡不搭配字卡。图字探索先围绕图卡聊出感受、评价或故事，按自然探索及补充进度再进入字卡抽选，不按固定轮数。也可以点“只看图卡”跳过，或在聊天时“先不用字卡”。用自己的话说联想与感受，不必强行把词用上。</li><li>图字探索按“图→字→组合探索→下一张图”推进，不提供随时换图按钮；纯图卡沿同样的基础了解、探索与补充节奏，去掉字卡环节，右侧（手机底部）可随时抽下一张。两种模式均最多三张图，选过的位置不能再选。</li><li>本轮牌位不变，整轮结束后重新洗牌。想停时随时回顾、保存。</li></ol><p>图像没有固定牌意，不做人格计分。你可以直接在对话里纠正 AI，不需要给回答打分。</p><p><a href="skill/#L27" target="_blank" rel="noopener">查看当前引导规则 ↗</a></p>`);
  else if (action === 'about') openInfo(`<p class="eyebrow">OH 卡交互展示版</p><h2>先体验它如何展开。</h2><p>本站提供“图字探索”和“纯图卡”两种玩法；纯图卡不搭配字卡。图字探索使用 88 张图卡及 88 张中文字卡清晰重排版。图卡与字卡分别独立洗牌，每张图先聊，形成线索并由你补充或修正后，再进入一张字卡的抽选；一轮最多三组，同类牌轮内不重复，可跳过或停用字卡。</p><p>“先看看怎么玩”展示虚构对话示例，不对应真实参与者；发送后由 DeepSeek 根据实际图卡、当前对话和引导规则实时回应。</p><p>新一轮的卡牌与已发送对话自动保存：未登录时留在当前浏览器，登录后开始的轮次同步到私人账号，可跨设备查看。未发送草稿不会上传。旧的本机记录不会自动上传，可在账号里选择复制。AI 对话会把本轮已揭示图卡、字卡及其使用状态、对话及本人选择留作参考的非示例记忆经 Supabase 转发至现有 AI 服务并交给 DeepSeek 处理。两个入口共用每天200次额度。邮箱账号与账号内的记录由 Supabase 托管；各账号只能访问自己的记录。清除浏览器数据只移除本机记录，不会删除账号里的存档。</p><p>界面为原创展示设计；只借鉴参考站的轻量、逐步体验，不复制它的品牌和角色。图卡由站点所有者提供并确认具有对外展示授权。中文字卡沿用此前整理的四边字清晰重排版，不是原扫描图或经认证的官方版；<a href="words/source.json" target="_blank" rel="noopener">查看词表与素材来源</a>。</p>`);
});
function renderModePicker() {
  for(const button of $$('[data-action=choose-mode]')) {
    button.setAttribute('aria-pressed',String(button.dataset.mode===selectedPlayMode));
    button.disabled=state?.status==='active'&&state.cards.length>0;
  }
  $('#mode-note').textContent=state?.status==='active'&&state.cards.length>0?`本轮为${PLAY_MODES[playMode(state)].name}，结束后可切换玩法。`:'';
}
function renderResumeButton() {
  renderModePicker();
  const primary=$('#home-start'), active=state?.status==='active';
  primary.dataset.action=active ? 'resume' : 'start';
  primary.innerHTML=`${active ? (state.cards.length ? '继续这一轮' : '继续选卡') : '抽一张，开始聊'} ${icon('arrow')}`;
}
$('#deck-dialog').addEventListener('close', () => { if(currentView==='home') renderResumeButton(); });
for (const dialog of $$('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close(); } });
updateMemoryCount();
renderModePicker();
renderHomeCards();

// Account libraries never replace the anonymous local copy or an ongoing round.
function refreshLibraryViews() {
  updateMemoryCount();
  if ($('#memory-dialog').open) renderMemory();
  if (currentView==='review' && state) renderReview();
}
function localCollection(key) { try { const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]; } catch {return [];} }
function libraryHome() {
  const latest=[...savedReviews].filter(r=>r.status!=='active').sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt)).find(r=>validHomeCards(r.cards));
  previousRoundCards=latest?[...latest.cards]:[];
  if (currentView==='home') renderHomeCards();
}
async function saveCloud(kind,items) {
  if(librarySaving||libraryLoading||libraryError)return;
  const owner=libraryAccount?.id;if(!owner)return;
  librarySaving=true;
  try {
    const values=await window.OHAccounts.save(kind,items);
    if(libraryAccount?.id!==owner)return;
    if(kind==='memory') memories=values; else {savedReviews=values;libraryHome();}
    refreshLibraryViews();toast('已保存到你的账号。');
  } catch(error) { if(libraryAccount?.id===owner) toast(window.OHAccounts.error(error)); }
  finally {librarySaving=false;}
}
async function deleteCloud(kind,item) {
  if(librarySaving||libraryLoading||libraryError||!item)return;
  const owner=libraryAccount?.id;librarySaving=true;
  try {
    if(kind==='review'){await roundSaver.settle(owner,item.id);item=savedReviews.find(r=>r.id===item.id)||item;}
    const values=await window.OHAccounts.remove(kind,item);
    if(kind==='review')roundSaver.stop(owner,item.id);
    if(libraryAccount?.id!==owner)return;
    if(kind==='memory')memories=values;else {savedReviews=values;libraryHome();}
    refreshLibraryViews();toast('已从你的账号删除。');
  }catch(error){if(kind==='review'&&state?.id===item.id)state.autosaveStopped=false;if(libraryAccount?.id===owner)toast(window.OHAccounts.error(error));}
  finally{librarySaving=false;}
}
window.addEventListener?.('oh-library-state',event=>{
  const detail=event.detail,changed=libraryAccount?.id!==detail.user?.id;
  libraryAccount=detail.user;libraryLoading=detail.loading;libraryError=detail.error||'';
  if(changed || (libraryAccount && detail.loading)){memories=[];savedReviews=[];previousRoundCards=[];}
  if(!libraryAccount){memories=localCollection(memoryKey);savedReviews=localCollection(reviewKey);previousRoundCards=localCollection(homeCardsKey);if(!validHomeCards(previousRoundCards))previousRoundCards=[];}
  else if(!detail.loading&&!detail.error){memories=detail.memories||[];savedReviews=detail.reviews||[];libraryHome();}
  if(changed && $('#info-content').dataset.libraryOwner){$('#info-content').innerHTML='';$('#info-dialog').close();}
  if(changed && state){
    for(const pending of Object.values(state.replyRequests||{}))pending.controller.abort();
    state.pending=false;
  }
  if(libraryAccount&&!detail.loading&&!detail.error){
    for(const record of localCollection(archiveCacheKey(libraryAccount.id)))roundSaver.enqueue(libraryAccount.id,record);
    roundSaver.retry(libraryAccount.id);
  }
  refreshLibraryViews();renderArchiveStatus();if(currentView==='home')renderHomeCards();
});
window.addEventListener?.('oh-library-import',()=>{
  if(!libraryAccount||libraryLoading||librarySaving)return;
  const m=localCollection(memoryKey),r=localCollection(reviewKey);
  if(!m.length&&!r.length){toast('这个浏览器还没有已保存的记录。');return;}
  $('#account-dialog').close();
  openInfo(`<p class="eyebrow">带上旧记录</p><h2>复制到你的账号？</h2><p>将这个浏览器的 ${r.length} 轮回顾、${m.length} 条记忆复制到 ${escapeHTML(libraryAccount.email)}。本机原件保留，账号里已有的同一记录不会被覆盖。</p><button class="primary" data-action="confirm-import" data-owner="${escapeHTML(libraryAccount.id)}">确认复制</button>`);
});
document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-action="confirm-import"]');if(!target||target.disabled||librarySaving||target.dataset.owner!==libraryAccount?.id)return;
 const owner=libraryAccount.id;target.disabled=true;librarySaving=true;
 try {
   const m=localCollection(memoryKey),r=localCollection(reviewKey);
   if(m.length)await window.OHAccounts.save('memory',m.map(({_revision,...v})=>v));
   if(r.length)await window.OHAccounts.save('review',r.map(({_revision,...v})=>v));
   if(libraryAccount?.id!==owner)return;
   await window.OHAccounts.sync();$('#info-dialog').close();toast('本机记录已复制到账号，原件仍保留。');
 }catch(error){toast(window.OHAccounts.error(error));target.disabled=false;}
 finally{librarySaving=false;}
});

window.addEventListener?.('online',()=>{retryArchives();});
window.addEventListener?.('pagehide',()=>{autosaveRound();});
