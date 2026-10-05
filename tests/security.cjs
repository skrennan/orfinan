const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {normalizeFinancialData} = require('../financial-validation.js');
const root = path.resolve(__dirname,'..');
const good = {settings:{completed:true,incomes:[{id:'i',name:'Salário',type:'Salário',amount:3000,day:5}],fixedExpenses:[{id:'f',name:'Internet',category:'Internet',amount:100,day:10}]},transactions:[{id:'t',type:'expense',description:'Almoço',amount:20,category:'Alimentação',date:'2026-10-05',createdAt:1}],paidFixed:{'2026-10:f':true},local_modified_at:'2026-10-05T10:00:00Z'};
assert.equal(normalizeFinancialData(good).transactions[0].amount,20);
assert.equal(normalizeFinancialData({...good,local_modified_at:null}).local_modified_at,null);
assert.equal(normalizeFinancialData({}).transactions.length,0);
for (const mutate of [x=>x.transactions[0].amount=NaN,x=>x.transactions[0].type='admin',x=>x.transactions[0].date='2026-02-31',x=>x.transactions[0].id='" onmouseover="alert(1)',x=>x.transactions.push({...x.transactions[0]}),x=>x.settings.incomes[0].day=32,x=>x.settings=[],x=>x.paidFixed=JSON.parse('{"__proto__":{"polluted":true}}')]) {
  const sample = structuredClone(good); mutate(sample); assert.throws(()=>normalizeFinancialData(sample));
}
assert.equal({}.polluted,undefined);
console.log('PASS backup/cloud validation: invalid amounts, dates, types, IDs, duplicate IDs, structures and prototype keys');

function harness() {
  const storage = new Map(), nodes = new Map(), timers = new Map(); let timerId=0, authCallback;
  let context;
  const node = (selector) => {
    if (nodes.has(selector)) return nodes.get(selector);
    const classes = new Set(['hidden']), listeners = {};
    const element={value:selector.includes(':checked')?'expense':'',textContent:'',innerHTML:'',disabled:false,inert:false,children:[],dataset:{},style:{overflow:'',setProperty(){}},listeners,attributes:{},
      classList:{add:(x)=>classes.add(x),remove:(x)=>classes.delete(x),contains:(x)=>classes.has(x),toggle:(x,on)=>{on ??= !classes.has(x);on?classes.add(x):classes.delete(x);}},
      addEventListener:(type,fn)=>listeners[type]=fn,appendChild:(x)=>element.children.push(x),setAttribute:(k,v)=>element.attributes[k]=v,
      reset(){},blur(){},contains:()=>false,focus:()=>{context.document.activeElement=element;},querySelector:()=>node('child'),getClientRects:()=>[{}]};
    nodes.set(selector,element);return element;
  };
  const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:fn=>authCallback=fn,signOut:async()=>({error:null})},from:()=>({upsert:async()=>({error:null}),select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
  context=vm.createContext({console:{error(){},warn(){}},URL,Date,TextEncoder,JSON,Number,Map,Set,Array,Object,Boolean,String,Math,Promise,crypto:require('node:crypto').webcrypto,performance,
    document:{querySelector:node,querySelectorAll:()=>[],createElement:()=>node('new'+Math.random()),addEventListener(){},body:node('body'),documentElement:node('html'),activeElement:node('active')},
    navigator:{onLine:true,userAgent:'test'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame(){},confirm:()=>false,
    window:{supabase:{createClient:()=>client},matchMedia:()=>({matches:false}),addEventListener(){},innerHeight:800,location:{origin:'http://localhost'}},IntersectionObserver:class{observe(){}}});
  vm.runInContext(fs.readFileSync(path.join(root,'financial-validation.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/^initializeV4\(\);$/m,''),context);
  const exec = expression=>vm.runInContext(expression,context);
  exec('renderDashboard=()=>{};renderSettingsLists=()=>{};showDashboard=()=>{};showOnboarding=()=>{};');
  const seed = user => exec(`CLOUD.user={id:${JSON.stringify(user)},email:'test@example.test'};CLOUD.ready=true;localStorage.setItem(KEYS.settings,${JSON.stringify(JSON.stringify(good.settings))});localStorage.setItem(KEYS.transactions,'[]');localStorage.setItem(KEYS.localModified,'2026-10-05T10:00:00Z');`);
  return {exec,seed,storage,nodes,node,client,timers,auth:(event,session)=>authCallback(event,session),fire:async(id)=>{const job=timers.get(id);timers.delete(id);await job.fn();await Promise.resolve();}};
}

(async()=>{
  let h=harness();h.seed('A');let resolve;
  h.client.from=()=>({upsert:()=>new Promise(r=>resolve=r)});
  const upload=h.exec('uploadLocalToCloud()');
  h.exec("CLOUD.user={id:'B'};CLOUD.accountEpoch++;CLOUD.syncing=false;CLOUD.lastSyncedSignature=null;");
  resolve({error:null});await upload;
  assert.equal(h.storage.get('orgfinan:B:lastSync'),undefined);
  assert.equal(h.storage.get('orgfinan:B:lastSignature'),undefined);
  assert.equal(h.exec('CLOUD.lastSyncedSignature'),null);
  console.log('PASS old upload cannot mark another account as synced');

  h=harness();h.seed('A');
  h.client.from=()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(r=>resolve=r)})})});
  const reconcile=h.exec('reconcileCloudAndLocal()');
  h.exec("CLOUD.user={id:'B'};CLOUD.accountEpoch++;");
  resolve({data:{data:good,updated_at:'2026-10-05T10:00:00Z'},error:null});await reconcile;
  assert.equal(h.storage.get('orgfinan:B:settings'),undefined);
  console.log('PASS old download cannot write another account cache');

  h=harness();h.seed('A');h.client.from=()=>({upsert:()=>new Promise(r=>resolve=r)});
  const profile=h.exec('ensureProfile(CLOUD.user)');
  h.exec("CLOUD.user={id:'B'};CLOUD.accountEpoch++;");resolve({error:null});await profile;
  assert.equal(h.storage.get('orgfinan:B:profileCheckedAt'),undefined);
  console.log('PASS old profile request cannot update another account metadata');

  h=harness();h.seed('A');h.exec("CLOUD.syncTimer=setTimeout(()=>{},3000);state.setupIncomes=[{name:'Private'}];");
  h.auth('SIGNED_OUT',null);
  assert.equal(h.exec('CLOUD.user'),null);assert.equal(h.exec('state.setupIncomes.length'),0);assert.equal(h.exec('CLOUD.ready'),false);assert.equal(h.timers.size,0);
  assert.ok(h.storage.get('orgfinan:A:settings'),'Offline cache retained for same-account login');
  h.auth('SIGNED_IN',{user:{id:'B'}});h.auth('SIGNED_OUT',null);
  for(const [id,job]of h.timers) if(job.delay===0)await h.fire(id);
  assert.equal(h.exec('CLOUD.user'),null);
  console.log('PASS cross-tab sign-out hides private UI, cancels sync and invalidates queued sign-in');

  h=harness();h.seed('A');h.client.auth.signOut=async()=>({error:new Error('failure')});
  await h.node('#logoutBtn').listeners.click();
  assert.equal(h.exec('CLOUD.user.id'),'A');assert.equal(h.exec('CLOUD.loggingOut'),false);
  console.log('PASS logout failure never pretends the session has ended');

  h=harness();h.seed('A');let attempts=0;
  h.client.from=()=>({upsert:async()=>{attempts++;return {error:{status:503}};}});
  await h.exec('uploadLocalToCloud({silent:true})');
  for(const delay of [10000,30000,60000]) {
    assert.equal(h.timers.size,1);const [id,job]=[...h.timers][0];assert.equal(job.delay,delay);await h.fire(id);
  }
  assert.equal(attempts,4);assert.equal(h.timers.size,0);assert.equal(h.exec('isSyncDirty()'),true);
  h=harness();h.seed('A');h.client.from=()=>({upsert:async()=>({error:{code:'42501',status:403}})});await h.exec('uploadLocalToCloud({silent:true})');assert.equal(h.timers.size,0);
  console.log('PASS bounded retries and no automatic retry for permission errors');

  h=harness();h.seed('A');h.storage.set('orgfinan:A:syncDirty','1');
  const remote=h.exec(`JSON.parse(${JSON.stringify(JSON.stringify(good))})`);
  h.client.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{data:remote,updated_at:'2026-10-05T12:00:00Z'},error:null})})})});
  const local=h.storage.get('orgfinan:A:settings');await h.exec('reconcileCloudAndLocal()');
  assert.equal(h.exec('CLOUD.conflict'),true);assert.equal(h.storage.get('orgfinan:A:settings'),local);assert.equal(h.timers.size,0);
  console.log('PASS unsent local changes are preserved when cloud data is newer');

  h=harness();h.seed('A');const old=h.storage.get('orgfinan:A:settings');
  assert.throws(()=>h.exec("applyCloudPayload({settings:[],transactions:[]})"));
  assert.equal(h.storage.get('orgfinan:A:settings'),old);
  console.log('PASS invalid data rejected before cache mutation');

  const events={},entries=new Map(),deleted=[];
  const cache={addAll:async()=>{},put:async(k,v)=>entries.set(k,v),match:async k=>entries.get(k)};
  const sw=vm.createContext({URL,Response,Set,self:{location:{origin:'https://app.test'},registration:{scope:'https://app.test/'},clients:{claim(){}},skipWaiting(){},addEventListener:(name,fn)=>events[name]=fn},caches:{open:async()=>cache,keys:async()=>['orgfinan-v6.6.0','other-app-cache'],delete:async key=>deleted.push(key)},fetch:async()=>{throw new Error('offline');}});
  vm.runInContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),sw);
  const request=(url,options={})=>({request:{method:'GET',url,mode:'cors',headers:new Headers(),...options},respondWith(p){this.response=p;},waitUntil(){}});
  for(const event of [request('https://project.supabase.co/rest/v1/financial_data'),request('https://app.test/api/user'),request('https://app.test/app.js',{headers:new Headers({authorization:'Bearer fake'})}),request('https://app.test/app.js?access_token=fake')]) {events.fetch(event);assert.equal(event.response,undefined);}
  entries.set('/index.html',new Response('HTML'));
  let event=request('https://app.test/index.html',{mode:'navigate'});events.fetch(event);assert.equal(await(await event.response).text(),'HTML');
  event=request('https://app.test/app.js');events.fetch(event);assert.equal((await event.response).type,'error','A missing script never receives HTML fallback');
  let activation;events.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(deleted,['orgfinan-v6.6.0']);
  console.log('PASS service worker excludes APIs, authorization and tokens; safe offline fallback and cache cleanup');

  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const match of html.matchAll(/src="(vendor\/[^"]+)" integrity="sha384-([^"]+)"/g)) assert.equal(require('node:crypto').createHash('sha384').update(fs.readFileSync(path.join(root,match[1]))).digest('base64'),match[2]);
  console.log('PASS local dependency SHA-384 integrity');
})().catch(error=>{console.error(error);process.exitCode=1;});
