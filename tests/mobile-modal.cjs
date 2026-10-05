// Run with: node tests/mobile-modal.cjs (requires Microsoft Edge).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'orgfinan-modal-'));
const stub = `<script>window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}})};</script>`;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/style.css', '/refinements.css', '/app.js'].includes(name)) { res.writeHead(404).end(); return; }
  let content = fs.readFileSync(path.join(root, name === '/' ? 'index.html' : name.slice(1)), 'utf8');
  if (name === '/') content = content.replace(/<script src="https:[^"]+"><\/script>/g, '').replace('<script src="app.js', stub + '<script src="app.js');
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : 'text/html');
  res.end(content);
});
let browser, socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', error => { console.error(error); });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(fs.existsSync(portFile), 'Edge must start its debugging endpoint');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { const {resolve, reject} = pending.get(message.id); pending.delete(message.id); message.error ? reject(message.error) : resolve(message.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 10000);
    pending.set(++id, {resolve: result => {clearTimeout(timer); resolve(result);}, reject: error => {clearTimeout(timer); reject(error);}});
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.navigate', {url: `http://127.0.0.1:${server.address().port}/`});
  console.log('Browser loaded local project');
  for (let i = 0; i < 50 && !await evaluate('typeof openTransactionModal === "function"'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const screenshot = async (name, width, height) => {
    if (!process.argv.includes('--screenshots')) return;
    await call('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<=580});
    await evaluate('new Promise(resolve=>setTimeout(resolve,500))');
    await evaluate(`document.getAnimations().forEach(animation => { if (animation.effect.getComputedTiming().iterations !== Infinity) animation.finish(); });`);
    const shot = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
    const destination = path.join(os.tmpdir(), `orgfinan-${name}.png`);
    fs.writeFileSync(destination, Buffer.from(shot.data,'base64'));
    console.log(`Screenshot: ${destination}`);
  };
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".bottom-nav")).display'), 'none', 'Navigation hidden before login');
  await screenshot('login-desktop',1280,900);
  await screenshot('login-mobile',390,844);
  await evaluate(`localStorage.setItem(KEYS.settings, JSON.stringify({completed:true,incomes:[{id:'i',name:'Teste',type:'Salário',amount:3000,day:5}],fixedExpenses:[{id:'f',name:'Teste',category:'Casa',amount:100,day:10}]})); showDashboard();`);
  await evaluate(`localStorage.setItem(KEYS.transactions,JSON.stringify([{id:'a',type:'expense',description:'Café da manhã',amount:18.5,category:'Alimentação',date:localToday(),createdAt:1},{id:'b',type:'income',description:'Projeto freelance',amount:450,category:'Freelance',date:localToday(),createdAt:2},{id:'c',type:'expense',description:'Compras da semana',amount:186.7,category:'Alimentação',date:localToday(),createdAt:3}])); renderDashboard();`);
  await screenshot('dashboard-desktop',1280,1000);
  await screenshot('dashboard-mobile',390,844);
  const beforeFilters = await evaluate('localStorage.getItem(KEYS.transactions)');
  await evaluate(`$('#transactionSearch').value='cafe'; $('#transactionSearch').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate('$("#transactionList").children.length'),1,'Accent-insensitive search');
  await evaluate(`$('#transactionSearch').value=''; $('#transactionSearch').dispatchEvent(new Event('input')); $('[data-transaction-filter="income"]').click();`);
  assert.equal(await evaluate('$("#transactionList").children.length'),1,'Income filter');
  assert.equal(await evaluate('localStorage.getItem(KEYS.transactions)'),beforeFilters,'Filters never mutate stored transactions');
  await evaluate(`$('[data-transaction-filter="all"]').click(); localStorage.removeItem(KEYS.transactions); renderDashboard();`);
  assert.equal(await evaluate('$("#reportsView").closest("#dashboard").id'),'dashboard','Reports belong to authenticated dashboard');
  await evaluate(`window.Chart=class {destroy(){}}; $('[data-view="reports"]').click();`);
  assert.equal(await evaluate('$("#dashboardView").classList.contains("hidden")'),true,'Report navigation hides dashboard');
  assert.equal(await evaluate('$("#reportsView").classList.contains("hidden")'),false);
  assert.equal(await evaluate(`$('[data-view="reports"]').getAttribute('aria-current')`),'page');
  await evaluate(`$('[data-view="dashboard"]').click();`);
  await call('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate('getComputedStyle($(".editorial-balance")).animationName'),'none','Reduced motion preference respected');
  await call('Emulation.setEmulatedMedia', {features:[]});
  console.log('PASS search, type filters, storage preservation and navigation structure');
  for (const [width, height] of [[320,568],[390,844],[580,700],[844,390],[1280,800]]) {
    await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:width <= 580});
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `${width}: page has no horizontal overflow`);
    assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none', `${width}: modal initially hidden`);
    await evaluate('$("#openTransactionModalInline").focus(); openTransactionModal();');
    await evaluate('new Promise(resolve=>setTimeout(resolve,450));');
    await evaluate(`document.getAnimations().forEach(animation => { if (animation.effect.getComputedTiming().iterations !== Infinity) animation.finish(); });`);
    assert.equal(await evaluate('$("#transactionModal").classList.contains("hidden")'), false);
    await evaluate(`$('#closeTransactionModal').focus(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));`);
    assert.equal(await evaluate('document.activeElement.type'),'submit','Shift-Tab stays inside dialog');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));`);
    assert.equal(await evaluate('document.activeElement.id'),'closeTransactionModal','Tab wraps to dialog close button');
    if (width <= 580 || (width <= 960 && height <= 500)) {
      assert.equal(await evaluate('document.activeElement.id'), 'closeTransactionModal');
      // Simulate the visual viewport left after a keyboard opens and Safari pans.
      await evaluate(`Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:300,offsetTop:85}}); updateMobileVisualViewport();`);
      const geometry = await evaluate(`(()=>{const modal=$('#transactionModal').getBoundingClientRect(), actions=$('.transaction-sheet-actions').getBoundingClientRect(), body=$('.transaction-sheet-body'); return {top:modal.top,bottom:modal.bottom,actionsBottom:actions.bottom,actionsTop:actions.top,scrollable:body.scrollHeight>body.clientHeight,overflow:body.scrollWidth>body.clientWidth};})()`);
      assert.equal(geometry.top, 85);
      assert.equal(geometry.bottom, 385);
      assert.ok(geometry.actionsBottom <= geometry.bottom && geometry.actionsTop >= geometry.top, JSON.stringify(geometry));
      assert.ok(geometry.scrollable, 'Form fields must scroll above footer');
      assert.equal(geometry.overflow, false, 'No horizontal field overflow');
      await evaluate(`$('.transaction-sheet-body').scrollTop=9999;`);
      assert.ok(await evaluate(`$('#transactionDate').getBoundingClientRect().bottom <= $('.transaction-sheet-actions').getBoundingClientRect().top`), 'Date reachable above footer');
      await evaluate('delete window.visualViewport; updateMobileVisualViewport();');
    }
    await evaluate('closeTransactionModal();');
    assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none', `${width}: modal stays hidden after closing`);
    assert.equal(await evaluate('document.body.style.overflow'), '');
    assert.equal(await evaluate('document.activeElement.id'), 'openTransactionModalInline');
    console.log(`PASS ${width}x${height}: open, viewport, scroll, close`);
  }
  await evaluate(`openTransactionModal(); $('#transactionAmount').value='12.50'; $('#transactionDescription').value='Teste mobile'; $('#transactionForm').requestSubmit();`);
  assert.equal(await evaluate('getTransactions().length'), 1);
  assert.equal(await evaluate('getTransactions()[0].amount'), 12.5);
  assert.equal(await evaluate('isSyncDirty()'), true);
  assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none');
  await evaluate('openTransactionModal(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));');
  assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none');
  console.log('PASS submit: local transaction saved, sync marked pending, modal closed; Escape closes');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  socket?.close(); browser?.kill(); server.close();
});
