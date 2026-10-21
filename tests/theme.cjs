const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../theme.js'),'utf8');

function boot({saved=null,dark=false,blocked=false}={}) {
  const storage = new Map(saved ? [['orgfinan-theme',saved]] : []);
  const root = {dataset:{}}, meta = {}, attrs = {}, events = {}, buttonEvents = {};
  const button = {setAttribute:(key,value)=>attrs[key]=value,addEventListener:(name,fn)=>buttonEvents[name]=fn};
  const system = {matches:dark,addEventListener:(name,fn)=>{system.change=fn;}};
  const context = {
    document:{documentElement:root,querySelector:selector=>selector==='#themeToggle'?button:meta,addEventListener:(name,fn)=>events[name]=fn},
    window:{matchMedia:()=>system,dispatchEvent(){},addEventListener:(name,fn)=>events[name]=fn},
    localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}
  };
  vm.runInNewContext(source,context);
  assert.ok(['light','dark'].includes(root.dataset.theme),'Theme resolves before DOMContentLoaded');
  events.DOMContentLoaded();
  return {root,meta,attrs,storage,system,events,click:()=>buttonEvents.click()};
}

let view=boot({dark:true});
assert.equal(view.root.dataset.theme,'dark');
assert.equal(view.meta.content,'#11171e');
assert.equal(view.attrs['aria-label'],'Ativar modo claro');
view.system.matches=false;view.system.change();
assert.equal(view.root.dataset.theme,'light','Unset preference follows system changes');
view.click();
assert.equal(view.storage.get('orgfinan-theme'),'dark');
view.system.matches=false;view.system.change();
assert.equal(view.root.dataset.theme,'dark','Explicit preference overrides system');
assert.equal(boot({saved:view.storage.get('orgfinan-theme'),dark:false}).root.dataset.theme,'dark','Saved preference survives a new page load');
view.events.storage({key:'orgfinan-theme',newValue:'light'});
assert.equal(view.root.dataset.theme,'light','Theme synchronizes across tabs');
view.system.matches=true;view.events.storage({key:null,newValue:null});
assert.equal(view.root.dataset.theme,'dark','Cleared storage returns to the system preference');
assert.equal(boot({saved:'invalid',dark:true}).root.dataset.theme,'dark');
view=boot({blocked:true});view.click();
assert.equal(view.root.dataset.theme,'dark','Theme still switches when storage is unavailable');
console.log('PASS early theme, system preference, manual override, persistence, cross-tab sync and unavailable storage');
