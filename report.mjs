// Report content is selected and classified by the model; this module only assembles and renders it.

const DISCLAIMER = '这份回顾不是心理测评，也不构成任何诊断或建议。引用的原话来自本轮对话；画面观察、基调归纳和可能的理解由 AI 整理，意义由你来决定。如果探索过程中触碰到让你不舒服的部分，这是正常的，你可以随时停下来。如果你正经历持续的痛苦，请考虑寻求专业心理咨询师的帮助。';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rCardID = n => `OH-${String(n).padStart(3,'0')}`;

function spoken(round) {
  return (round.turns || []).filter(t => t.role === 'user' && !t.example && t.text.trim());
}

export function buildReport(round) {
  const cards=[...new Set(round.cards||spoken(round).map(t=>t.card))];
  return {
    title:'探索回顾', subtitle:'把你说过的话留下，也把未解的问题留给你。',
    datetime:round.createdAt ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(round.createdAt)) : '',
    overview:{question:null,neutral:'本轮已展示的图卡与已发送对话。',meta:`图卡 × ${cards.length}（${cards.map(rCardID).join(' / ')}）`,cards},
    cards:[],emotion:{groups:[]},strengths:[],
    explorePreamble:'以下问题由 AI 根据本轮原话与图卡整理。画面观察、可能的理解与你说过的话分开呈现，是否贴合由你决定。',
    explores:[],moments:[],collage:'',collageQuestion:false,disclaimer:DISCLAIMER
  };
}
export function applyReportResult(data,result){
  const s=result.sections;
  data.explores=result.explores||[];data.ruleVersion=result.rule_version;
  if(!s)return;
  data.overview.question=s.overview_question?.quote||null;
  data.cards=s.cards.map(c=>({card:c.card,name:c.name,tag:rCardID(c.card),quotes:c.quotes.map(q=>q.quote)}));
  data.emotion={toneText:result.tone?.sentence||'',groups:s.emotion_groups.map(g=>({label:g.label,quotes:g.evidence.map(e=>e.quote)}))};
  data.strengths=s.resources.map(e=>e.quote);
  data.moments=s.moments.map(m=>({type:m.type,text:m.evidence.quote,before:m.before?.quote||''}));
  data.collage=s.collage.lines.map(e=>e.quote).join('\n');data.collageQuestion=s.collage.ask;
}

// Keep only sent, non-example records. No drafts, hidden decks or cross-round memory.
export function buildReportPayload(round, requestId) {
  const context = value => value ? {status:value.status,...(value.word_id?{word_id:value.word_id,...(value.text?{text:value.text}:{})}:{})} : undefined;
  return {
    session_id:round.id, request_id:requestId,
    ...(round.play_mode ? {play_mode:round.play_mode} : {}),
    cards:[...round.cards],
    word_pairs:round.cards.filter(card=>round.pairings?.[card]).map(card=>({card,...context(round.pairings[card])})),
    turns:(round.turns || []).filter(t=>!t.example).map((t,i)=>({
      id:t.id || `turn_${i+1}`, role:t.role, card:t.card, text:t.text,
      ...(t.word_context ? {word_context:context(t.word_context)} : {}),
      ...(t.reply_to ? {reply_to:t.reply_to} : {}),
      ...(t.hypothesis ? {claim_id:t.claimId,claim_text:t.hypothesis,claim_status:t.claimState || 'proposed',feedback_quote:t.feedbackQuote,feedback_reason:t.feedbackReason} : {})
    }))
  };
}

const EXPLORE_LABELS = {valence_contrast:'材料与解释的反差',tension:'尚未展开的两种感受',recurring_theme:'反复出现的主题',unmentioned_element:'回看共同的画面元素'};
function renderExplore(x) {
  const quotes = x.evidence?.length ? x.evidence : [{quote:x.anchor}];
  const source = e => e.card ? `${rCardID(e.card)} · 本人原话` : '本人原话';
  const evidence = quotes.map(e=>`<p class="r-label">${esc(source(e))}</p><p class="r-anchor">“${esc(e.quote)}”</p>`).join('');
  const visuals = (x.visual_evidence || []).map(v=>`<p class="r-label">${esc(rCardID(v.card))} · 画面观察（AI）</p><p>${esc(v.description)}</p>`).join('');
  return `<div class="r-explore">${EXPLORE_LABELS[x.kind]?`<p class="r-label">${esc(EXPLORE_LABELS[x.kind])}</p>`:''}<div class="r-chain"><span class="r-label">锚点</span><div>${evidence}${visuals}</div></div><div class="r-chain"><span class="r-label">联想</span><p>${esc(x.assoc)}</p></div><div class="r-chain"><span class="r-label">核对</span><p class="r-check">${esc(x.check)}</p></div><p class="r-notice">这是一个猜测，不是结论。它的意义由你来确认。</p></div>`;
}

function section(num, title, inner) {
  return `<section class="r-sec"><h2><span class="r-num">${num}</span>${esc(title)}</h2>${inner}</section>`;
}

export function renderReport(data) {
  const parts = [];
  parts.push(`<article class="r-doc"><header class="r-head"><h1>${esc(data.title)}</h1><p class="r-sub">${esc(data.subtitle)}</p>${data.datetime ? `<p class="r-date">${esc(data.datetime)}</p>` : ''}</header>`);
  let n = 0;

  if (data.overview) {
    const o = data.overview;
    const body = o.question ? `<blockquote class="r-quote">“${esc(o.question)}”</blockquote>` : `<p class="r-neutral">${esc(o.neutral || '')}</p>`;
    const thumbs = (o.cards || []).map(c => `<img class="r-thumb" src="${esc((o.images || {})[c] || `cards/oh-${String(c).padStart(3, '0')}.jpg`)}" alt="${esc(rCardID(c))}">`).join('');
    parts.push(section(++n, '探索概览', `<div class="r-card">${thumbs ? `<div class="r-thumbs">${thumbs}</div>` : ''}${body}<p class="r-meta">${esc(o.meta || '')}</p></div>`));
  }

  if (data.cards?.length) {
    const body = data.cards.map(c => `<div class="r-cardrow"><img class="r-cardimg" src="${esc((data.cardImages || {})[c.card] || `cards/oh-${String(c.card).padStart(3, '0')}.jpg`)}" alt="${esc(c.tag)}"><div class="r-cardtext"><h3>${esc(c.name)}<span class="r-tag">${esc(c.tag)}</span></h3>${c.quotes.map(q => `<blockquote class="r-quote">${esc(q)}</blockquote>`).join('')}</div></div>`).join('');
    parts.push(section(++n, '逐卡回顾', body));
  }


  if (data.emotion?.toneText || data.emotion?.groups?.length) {
    const body = (data.emotion.toneText ? `<p class="r-tone">${esc(data.emotion.toneText)}</p>` : '') +
      (data.emotion.groups||[]).map(g=>`<div class="r-emotion"><p class="r-label">${esc(g.label)} · ${g.quotes.length} 条原话</p>${g.quotes.map(q=>`<blockquote class="r-quote">${esc(q)}</blockquote>`).join('')}</div>`).join('');
    parts.push(section(++n,'情绪基调',body));
  }

  if (data.strengths?.length) {
    parts.push(section(++n, '资源与力量', `<ul class="r-list">${data.strengths.map(q => `<li>“${esc(q)}”</li>`).join('')}</ul>`));
  }

  const explores = data.explores || [];
  const exploreBody = `${data.explorePreamble ? `<p class="r-preamble">${esc(data.explorePreamble)}</p>` : ''}` +
    (explores.length
      ? explores.map(renderExplore).join('')
      : `<p class="r-note">${esc(data.exploreError || '这次回顾暂时没有需要另列的待探索问题。')}</p>`);
  parts.push(section(++n, '待探索的问题', exploreBody));

  if (data.moments?.length) {
    const body = data.moments.map(m => `<div class="r-moment"><span class="r-mark">${esc(m.type)}</span><span>${m.before ? `此前你说：“${esc(m.before)}”<br>后来你说：“${esc(m.text)}”` : `“${esc(m.text)}”`}</span></div>`).join('');
    parts.push(section(++n, '你自己发现的时刻', body));
  }

  if (data.collage) {
    const ask = data.collageQuestion ? '<p class="r-poem-q">这些话放在一起，你想到了什么？</p>' : '';
    parts.push(section(++n, '拼贴句', `<pre class="r-poem">${esc(data.collage)}</pre>${ask}<p class="r-sign">—— 每一行，都是你在这次探索里说过的话</p>`));
  }

  if (data.disclaimer) parts.push(`<footer class="r-disclaimer">${esc(data.disclaimer)}</footer>`);
  parts.push('</article>');
  return parts.join('');
}
