import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase-connection.js',import.meta.url),'utf8');
const store='112e03a4-8d7f-41f4-9984-d39536398f11';
const rows=Array.from({length:12},(_,i)=>({id:'v'+i,order_history_id:'h'+i,user_id:'owner',store_id:store,deleted_at:i<9?null:'2026-10-01',order_snapshot:{items:[]}}));
async function harness(mode='ok') {
 const calls=[],saved=new Map();const url=new URL('http://localhost/'+(mode==='out'?'':'#access_token=test&refresh_token=refresh&expires_in=3600'));
 const location={href:url.href,protocol:url.protocol,pathname:url.pathname,search:url.search,hash:url.hash};
 const window={location,history:{replaceState(){location.hash='';}},dispatchEvent(){}};
 const response=body=>({ok:true,status:200,headers:{get:()=> '0-0/1'},json:async()=>body});
 const fetch=async(url,options={})=>{url=String(url);calls.push({url,...options});
  if(url.startsWith('./config.local.json'))return response({enabled:true,mode:'manual-backup',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',appKey:'hidaka-order',legacyStoreId:'hidaka-001',supabaseStoreId:store});
  if(url.endsWith('/auth/v1/health'))return response({});
  if(url.endsWith('/auth/v1/user'))return response({id:'owner'});
  if(url.includes('/app_store_links?'))return response([{store_id:store}]);
  if(url.includes('order_snapshot')){if(mode==='fail')throw Error('offline');return response(mode==='empty'?[]:rows.map(r=>({...r,...(mode==='user'?{user_id:'other'}:mode==='store'?{store_id:'other'}:{})})));}
  return response([]);
 };
 vm.runInNewContext(source,{window,document:{title:'test'},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},fetch,CustomEvent:class{},URL,URLSearchParams,AbortSignal,TextEncoder,crypto:{randomUUID:()=> 'test'},console});
 await window.HidakaSupabase.initialize();calls.length=0;
 return {api:window.HidakaSupabase,calls};
}
const h=await harness();assert.equal((await h.api.readOrderHistory('hidaka-001')).records.length,9);
assert.ok(h.calls.every(c=>c.method==='GET'),'GET only');
const request=h.calls.find(c=>c.url.includes('order_snapshot'));const params=new URL(request.url).searchParams;
assert.equal(params.get('deleted_at'),'is.null');assert.equal(params.get('user_id'),'eq.owner');assert.equal(params.get('store_id'),'eq.'+store);
for(const mode of ['out','fail','user','store']){const t=await harness(mode);await assert.rejects(()=>t.api.readOrderHistory('hidaka-001'));}
await assert.rejects(()=>h.api.readOrderHistory('other'));
assert.equal((await (await harness('empty')).api.readOrderHistory('hidaka-001')).records.length,0);
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const context=vm.createContext({console});
vm.runInContext(app.replace(/\n\s*boot\(\);\s*\n\}\)\(\);\s*$/, '\n globalThis.t={defaultState,cloudOnlyHistory,setState:s=>state=s,setCloud:c=>cloudHistoryView=c};\n})();'),context);
const t=context.t,s=t.defaultState();t.setState(s);t.setCloud({storeId:s.activeStoreId,records:rows});
assert.equal(t.cloudOnlyHistory().length,9);s.history.push({id:'h0'});assert.equal(t.cloudOnlyHistory().length,8);
s.history[0].deletedAt='today';assert.equal(t.cloudOnlyHistory().length,8,'local tombstone not resurrected');
const before=JSON.stringify(s);t.cloudOnlyHistory();assert.equal(JSON.stringify(s),before);
t.setCloud({storeId:'other',records:rows});assert.equal(t.cloudOnlyHistory().length,0);
console.log('PASS cloud history: 9 active/3 deleted, GET-only, owner/store, empty/failure/logout, dedupe, local unchanged');
