// Archive only revealed cards and sent turns. Never upload drafts or hidden decks.
export function roundArchive(round,wordVersion){
 return {play_mode:round.play_mode,id:round.id,createdAt:round.createdAt,status:round.status,
  cards:[...round.cards],picks:round.picks.map(p=>({...p})),wordDeckVersion:wordVersion,
  pairings:structuredClone(round.pairings),wordPicks:round.wordPicks.map(p=>({...p})),turns:structuredClone(round.turns)};
}
export function sameArchive(a,b){
 const clean=v=>{const {_revision,savedAt,...rest}=v;return rest;};
 const encode=v=>JSON.stringify(clean(v),(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 return encode(a)===encode(b);
}
export function createRoundAutosaver({local,clearLocal,canSync,saveRemote,existing,onStatus=()=>{},onSaved=()=>{}}){
 const entries=new Map();
 const key=(owner,id)=>JSON.stringify([owner,id]);
 function entryFor(owner,id){return entries.get(key(owner,id));}
 function persist(e){try{local(e.owner,{...e.record,_revision:e.revision??null});e.local=true;}catch(error){e.local=false;e.localError=error;}}
 function status(e,state,error){e.state=state;onStatus({owner:e.owner,id:e.record.id,state,local:e.local,error:error?.message||''});}
 async function drain(e){
  if(e.running)return e.running;
  if(e.stopped||!e.owner||!e.dirty||!canSync(e.owner))return;
  e.running=(async()=>{
   while(e.dirty&&!e.stopped&&canSync(e.owner)){
    const record=e.record,version=e.version;
    status(e,'syncing');
    try{
     const rows=await saveRemote(e.owner,{...record,...(e.revision?{_revision:e.revision}:{})});
     const stored=rows.find(r=>r.id===record.id);
     if(!stored||!sameArchive(record,stored))throw Error('云端记录已变化，未覆盖其他设备的内容；本机副本仍保留。');
     e.revision=stored._revision;
     if(e.stopped)return;
     onSaved(e.owner,rows);
     if(version===e.version){e.dirty=false;clearLocal(e.owner,record.id);status(e,'saved');}
     else persist(e); // New turns arrived while this snapshot was being saved.
    }catch(error){if(!e.stopped)status(e,'error',error);break;}
   }
  })().finally(()=>{e.running=null;});
  return e.running;
 }
 function enqueue(owner,record){
  const k=key(owner,record.id);let e=entries.get(k);
  if(e?.stopped)return;
  if(e&&sameArchive(e.record,record)){if(e.dirty&&!e.owner&&!e.local){persist(e);e.dirty=!e.local;status(e,e.local?'local':'error',e.localError);}else if(e.dirty&&e.state!=='error')void drain(e);return;}
  if(!e){e={owner,record,revision:Object.hasOwn(record,'_revision')?record._revision:existing(owner,record.id)?._revision,version:0,dirty:false,local:false};entries.set(k,e);}
  e.record={...record,savedAt:new Date().toISOString()};delete e.record._revision;e.version++;e.dirty=true;
  persist(e);
  if(!owner){e.dirty=!e.local;status(e,e.local?'local':'error',e.localError);return;}
  status(e,canSync(owner)?'syncing':'waiting');void drain(e);
 }
 return {
  enqueue,
  async retry(owner){await Promise.all([...entries.values()].filter(e=>e.owner===owner&&!e.stopped).map(drain));},
  async settle(owner,id){const e=entryFor(owner,id);if(e?.running)await e.running;},
  stop(owner,id){const e=entryFor(owner,id);if(e)e.stopped=true;clearLocal(owner,id);},
  pending(owner,id){return Boolean(entryFor(owner,id)?.dirty);},
  state(owner,id){const e=entryFor(owner,id);return e&&{state:e.state,local:e.local};}
 };
}
