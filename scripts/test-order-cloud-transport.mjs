import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase-connection.js',import.meta.url),'utf8');
async function harness(loggedIn=true, fail=false) {
  const calls=[]; const stored=new Map();
  const url=new URL('http://127.0.0.1:8135/'+(loggedIn?'#access_token=test-token&refresh_token=refresh&expires_in=3600':''));
  const location={href:url.href,protocol:url.protocol,pathname:url.pathname,search:url.search,hash:url.hash};
  const window={location,history:{replaceState(){location.hash='';}},dispatchEvent(){}};
  const response=(body,status=200)=>({ok:status<400,status,headers:{get:()=> '0-0/1'},json:async()=>body});
  const fetch=async(url,options={})=>{
    url=String(url); calls.push({url,...options});
    if(url.startsWith('./config.local.json')) return response({enabled:true,mode:'manual-backup',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',appKey:'hidaka-order',legacyStoreId:'hidaka-001',supabaseStoreId:'112e03a4-8d7f-41f4-9984-d39536398f11'});
    if(url.endsWith('/auth/v1/health')) return response({});
    if(url.endsWith('/auth/v1/user')) return response({id:'owner',email:'test@example.test'});
    if(url.includes('/app_store_links?')) return response([{store_id:'112e03a4-8d7f-41f4-9984-d39536398f11'}]);
    if(url.includes('/rpc/list_hidaka_order_history')) return response({user_id:'owner',records:[]});
    if(url.includes('/rpc/save_hidaka_order_history') || url.includes('/rpc/manage_hidaka_order_history')) {
      if(fail) throw new Error('offline');
      return response({id:JSON.parse(options.body).p_order.id,user_id:'owner',saved_at:'2026-10-01T00:00:00Z'});
    }
    if(/\/rest\/v1\/(menu_items|visits|store_settings)\?/.test(url)) return response([]);
    throw new Error('Unexpected request '+url);
  };
  vm.runInNewContext(source,{window,document:{title:'test'},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},fetch,CustomEvent:class{},URL,URLSearchParams,AbortSignal,TextEncoder,crypto:{randomUUID:()=> 'test-id'},console});
  await window.HidakaSupabase.initialize();
  assert.equal(calls.some(c=>c.url.includes('/rpc/save_hidaka_order_history')),false,'no write on startup');
  return {api:window.HidakaSupabase,calls};
}
const record={id:'history-1',local_store_id:'hidaka-001',items:[]};
const h=await harness();
assert.equal((await h.api.saveOrderHistory(record)).id,record.id);
const request=h.calls.find(c=>c.url.includes('/rpc/save_hidaka_order_history'));
assert.equal(request.method,'POST');
assert.equal(JSON.parse(request.body).p_order.id,record.id);
await assert.rejects(()=>h.api.saveOrderHistory(record,'other-owner'),/アカウント/);
await assert.rejects(()=>h.api.saveOrderHistory({...record,local_store_id:'other-store'}),/店舗/);
assert.equal(h.calls.filter(c=>c.url.includes('/rpc/save_hidaka_order_history')).length,1);
const out=await harness(false);
await assert.rejects(()=>out.api.saveOrderHistory(record),/ログイン/);
const failed=await harness(true,true);
await assert.rejects(()=>failed.api.saveOrderHistory(record),/offline/);
await h.api.saveOrderHistory({...record, operation:'edit'});
assert.equal(h.calls.filter(c=>c.url.includes('/rpc/manage_hidaka_order_history')).length,1);
await h.api.readHistoryInventory(Array.from({length:205},(_,i)=>'h'+i));
assert.equal(h.calls.filter(c=>c.url.includes('/rpc/list_hidaka_order_history')).length,3);
await assert.rejects(()=>out.api.readHistoryInventory(['h']),/ログイン/);
console.log('Order cloud transport: explicit save only, owner/store checks, offline and logged-out passed');
