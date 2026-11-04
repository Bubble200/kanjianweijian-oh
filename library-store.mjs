// The server enforces ownership with auth.uid(); client filters also guard accidental scope mixing.
export function createLibraryStore(client, getOwner) {
  const scope = () => { const owner=getOwner(); if(!owner) throw Error('请先登录。'); return owner; };
  const ensure = owner => { if(owner!==getOwner()) throw Error('账号已切换，请重新操作。'); };
  const unpack = row => ({...row.payload,_revision:row.revision});
  const payload = value => { const {_revision,...clean}=value; return clean; };
  return {
    async list(kind) {
      const owner=scope(), result=[];
      for(let from=0;;from+=100) {
        const {data,error}=await client.from('oh_library').select('payload,revision').eq('owner_id',owner).eq('kind',kind).order('id').range(from,from+99);
        if(error) throw error; ensure(owner); result.push(...data.map(unpack));
        if(data.length<100) break;
      }
      return result.sort((a,b)=>kind==='review' ? new Date(b.createdAt)-new Date(a.createdAt) : new Date(a.at)-new Date(b.at));
    },
    async save(kind,items) {
      const owner=scope();
      // A batch of new entries is atomic. Existing archives are never overwritten by an import.
      const additions=items.filter(item=>!item._revision);
      if(additions.length) {
        const {error}=await client.from('oh_library').upsert(additions.map(item=>({owner_id:owner,kind,id:item.id,payload:payload(item)})),{onConflict:'owner_id,kind,id',ignoreDuplicates:true});
        if(error) throw error; ensure(owner);
      }
      for(const item of items.filter(item=>item._revision)) {
        const {data,error}=await client.from('oh_library').update({payload:payload(item)}).eq('owner_id',owner).eq('kind',kind).eq('id',item.id).eq('revision',item._revision).select('id');
        if(error) throw error; ensure(owner);
        if(!data.length) throw Error('这条记录已在另一台设备修改，请重新加载后再编辑。你的修改尚未保存。');
      }
      return this.list(kind);
    },
    async remove(kind,item) {
      const owner=scope();
      const {data,error}=await client.from('oh_library').delete().eq('owner_id',owner).eq('kind',kind).eq('id',item.id).eq('revision',item._revision).select('id');
      if(error) throw error; ensure(owner);
      if(!data.length) throw Error('记录已变化，请重新加载后再删除。');
      return this.list(kind);
    }
  };
}
