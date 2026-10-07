// Run with: node tests/mobile-modal.cjs (requires Microsoft Edge).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'orgfinan-modal-'));
const realCharts = process.argv.includes('--real-charts');
const realSupabase = process.argv.includes('--real-supabase');
const stub = `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}})};`;
const policy = fs.readFileSync(path.join(root,'netlify.toml'),'utf8').match(/Content-Security-Policy = "([^"]+)"/)[1];
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Security-Policy',policy);
  if (name === '/test-supabase.js') { res.setHeader('Content-Type','application/javascript'); res.end(stub); return; }
  if (name === '/test-helpers.js') { res.setHeader('Content-Type','application/javascript'); res.end('if(navigator.serviceWorker) navigator.serviceWorker.register=async()=>({});'); return; }
  if (!['/', '/style.css', '/refinements.css', '/app.js','/sync.js','/financial-validation.js','/vendor/supabase.min.js','/vendor/chart.umd.min.js'].includes(name)) { res.writeHead(404).end(); return; }
  let content = fs.readFileSync(path.join(root, name === '/' ? 'index.html' : name.slice(1)), 'utf8');
  if (name === '/') {
    if (!realSupabase) content = content.replace(/<script src="vendor\/supabase.min.js"[^>]*><\/script>/,'<script src="test-supabase.js"></script>');
    if (!realCharts) content = content.replace(/<script src="vendor\/chart.umd.min.js"[^>]*><\/script>/,'');
    content=content.replace('<script src="app.js','<script src="test-helpers.js"></script><script src="app.js');
  }
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
  const pageErrors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails);
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
  await call('Runtime.enable');
  await call('Page.navigate', {url: `http://127.0.0.1:${server.address().port}/`});
  console.log('Browser loaded local project');
  for (let i = 0; i < 50 && !await evaluate('typeof openTransactionModal === "function"'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  await evaluate(`const forbiddenScript=document.createElement('script'); forbiddenScript.textContent='window.inlineScriptExecuted=true';document.body.appendChild(forbiddenScript);`);
  assert.equal(await evaluate('window.inlineScriptExecuted === true'),false,'Production CSP blocks injected inline JavaScript');
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
  await evaluate(`$('#authPassword').value='senha-teste'; $('#togglePassword').click();`);
  assert.equal(await evaluate('$("#authPassword").type'),'text');
  await evaluate(`$('#togglePassword').click();`);
  assert.equal(await evaluate('$("#authPassword").type'),'password');
  await screenshot('login-desktop',1280,900);
  await screenshot('login-mobile',390,844);
  await evaluate(`localStorage.setItem(KEYS.settings, JSON.stringify({completed:true,incomes:[{id:'i',name:'Teste',type:'Salário',amount:3000,day:5}],fixedExpenses:[{id:'f',name:'Teste',category:'Casa',amount:100,day:10}]})); showDashboard();`);
  await evaluate(`localStorage.setItem(KEYS.transactions,JSON.stringify([{id:'a',type:'expense',description:'Café da manhã',amount:18.5,category:'Alimentação',date:localToday(),createdAt:1},{id:'b',type:'income',description:'Projeto freelance',amount:450,category:'Freelance',date:localToday(),createdAt:2},{id:'c',type:'expense',description:'Compras da semana',amount:186.7,category:'Alimentação',date:localToday(),createdAt:3}])); renderDashboard();`);
  await screenshot('dashboard-desktop',1280,1000);
  await screenshot('dashboard-mobile',390,844);
  // Regression: selected transaction types must remain readable despite legacy theme rules.
  const typeContrast = await evaluate(`(() => {
    const luminance = color => {
      const rgb = color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
    };
    return ['expense','income'].map(type => {
      const radio = document.querySelector('input[name="transactionType"][value="'+type+'"]');
      radio.checked = true;
      const style = getComputedStyle(radio.nextElementSibling);
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
  })()`);
  assert.ok(typeContrast.every(ratio => ratio >= 4.5), 'Both selected transaction types meet text contrast requirements');
  await evaluate(`document.querySelector('input[name="transactionType"][value="expense"]').checked=true;`);
  console.log('PASS readable selected expense/income controls');
  const beforeFilters = await evaluate('localStorage.getItem(KEYS.transactions)');
  await evaluate(`const xssTransactions=getTransactions();xssTransactions[0].description='<img src=x onerror=alert(1)>';localStorage.setItem(KEYS.transactions,JSON.stringify(xssTransactions));renderDashboard();`);
  assert.equal(await evaluate('$("#transactionList").querySelector("img")'),null,'Transaction text never becomes injected HTML');
  await evaluate(`localStorage.setItem(KEYS.transactions,${JSON.stringify(beforeFilters)});renderDashboard();`);
  await evaluate(`selectFinancialMonth('2026-12'); $('#dashboardView [data-month-step="1"]').click();`);
  assert.equal(await evaluate('selectedMonth()'),'2027-01','Month step crosses year boundary');
  assert.equal(await evaluate('$("#reportMonthFilter").value'),'2027-01','Report month stays synchronized');
  await evaluate(`$('[data-current-month]').click();`);
  assert.equal(await evaluate('selectedMonth() === currentMonth()'),true);
  await evaluate(`$('#transactionSearch').value='cafe'; $('#transactionSearch').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate('$("#transactionList").children.length'),1,'Accent-insensitive search');
  await evaluate(`$('#transactionSearch').value=''; $('#transactionSearch').dispatchEvent(new Event('input')); $('[data-transaction-filter="income"]').click();`);
  assert.equal(await evaluate('$("#transactionList").children.length'),1,'Income filter');
  assert.equal(await evaluate('localStorage.getItem(KEYS.transactions)'),beforeFilters,'Filters never mutate stored transactions');
  await evaluate(`$('#clearTransactionFilters').click();`);
  assert.equal(await evaluate('$("#transactionList").children.length'),3,'Clear filters restores all rows');
  assert.equal(await evaluate('$("#filterContext").classList.contains("hidden")'),true);
  assert.equal(await evaluate('$("#reportsView").closest("#dashboard").id'),'dashboard','Reports belong to authenticated dashboard');
  if (!realCharts) await evaluate('window.Chart=class {destroy(){}};');
  await evaluate(`$('[data-view="reports"]').click();`);
  assert.equal(await evaluate('$("#dashboardView").classList.contains("hidden")'),true,'Report navigation hides dashboard');
  assert.equal(await evaluate('$("#reportsView").classList.contains("hidden")'),false);
  assert.equal(await evaluate(`$('[data-view="reports"]').getAttribute('aria-current')`),'page');
  if (realCharts) {
    assert.equal(await evaluate('Object.values(reportCharts).filter(Boolean).length'),4,'Four real charts render');
    await evaluate(`$('#reportPeriod').value='3months'; $('#reportPeriod').dispatchEvent(new Event('change'));`);
    await screenshot('reports-desktop',1280,1000);
    await screenshot('reports-mobile',390,844);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Reports fit mobile width with real charts');
    await evaluate(`$('#reportPeriod').value='month'; $('#reportPeriod').dispatchEvent(new Event('change'));`);
  }
  await evaluate(`$('[data-view="dashboard"]').click();`);
  await evaluate(`localStorage.removeItem(KEYS.transactions); renderDashboard();`);
  await evaluate(`updateSyncUI('Sem acesso à nuvem','sync-error');`);
  assert.equal(await evaluate('$("#syncBtn").dataset.syncState'),'sync-error');
  assert.equal(await evaluate('Boolean($("#syncBtn svg"))'),true,'Sync status preserves SVG icon');
  await evaluate(`updateSyncUI('Tudo sincronizado','sync-ok');`);
  await evaluate(`$('#settingsBtn').focus(); $('#settingsBtn').click();`);
  assert.equal(await evaluate('document.body.style.overflow'),'hidden');
  assert.equal(await evaluate('$("#dashboard").inert'),true,'Background inert with settings open');
  assert.ok(await evaluate(`Number(getComputedStyle($('#settingsPanel')).zIndex)>Number(getComputedStyle($('.app-header')).zIndex)`),'Settings above header');
  await screenshot('settings-mobile',390,844);
  await evaluate(`$('#closeSettings').focus(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true}));`);
  assert.equal(await evaluate('document.activeElement.id'),'resetAppBtn','Settings Tab loop');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));`);
  assert.equal(await evaluate('document.activeElement.id'),'settingsBtn','Settings focus restored');
  assert.equal(await evaluate('$("#dashboard").inert'),false);
  assert.equal(await evaluate('document.body.style.overflow'),'');
  await call('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate('getComputedStyle($(".editorial-balance")).animationName'),'none','Reduced motion preference respected');
  await call('Emulation.setEmulatedMedia', {features:[]});
  console.log('PASS search, type filters, storage preservation and navigation structure');
  for (const [width, height] of [[320,568],[390,844],[580,700],[768,1024],[844,390],[1280,800],[1536,960]]) {
    await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:width <= 580});
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `${width}: page has no horizontal overflow`);
    assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none', `${width}: modal initially hidden`);
    await evaluate('$("#openTransactionModalInline").focus(); openTransactionModal();');
    await evaluate('new Promise(resolve=>setTimeout(resolve,450));');
    await evaluate(`document.getAnimations().forEach(animation => { if (animation.effect.getComputedTiming().iterations !== Infinity) animation.finish(); });`);
    assert.equal(await evaluate('$("#transactionModal").classList.contains("hidden")'), false);
    assert.equal(await evaluate('$("#dashboard").inert'),true,'Background inert with transaction open');
    assert.ok(await evaluate(`Number(getComputedStyle($('#transactionModal')).zIndex)>Number(getComputedStyle($('.app-header')).zIndex)`),'Transaction modal above header');
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
    assert.equal(await evaluate('$("#dashboard").inert'),false);
    console.log(`PASS ${width}x${height}: open, viewport, scroll, close`);
  }
  await evaluate(`openTransactionModal(); $('#transactionAmount').value='12.50'; $('#transactionDescription').value='   '; $('#transactionForm').requestSubmit();`);
  assert.equal(await evaluate('getTransactions().length'),0,'Blank description does not create a transaction');
  await evaluate(`$('#transactionDescription').value='Teste mobile'; $('#transactionDescription').dispatchEvent(new Event('input')); $('#transactionForm').requestSubmit();`);
  assert.equal(await evaluate('getTransactions().length'), 1);
  assert.equal(await evaluate('getTransactions()[0].amount'), 12.5);
  assert.equal(await evaluate('isSyncDirty()'), true);
  assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none');
  await evaluate('openTransactionModal(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));');
  assert.equal(await evaluate('getComputedStyle($("#transactionModal")).display'), 'none');
  console.log('PASS submit: local transaction saved, sync marked pending, modal closed; Escape closes');
  const previousSettings = await evaluate('localStorage.getItem(KEYS.settings)');
  await call('Emulation.setDeviceMetricsOverride', {width:320,height:568,deviceScaleFactor:1,mobile:true});
  await evaluate(`const stressSettings=getSettings(); stressSettings.incomes[0].amount=123456789.99; stressSettings.fixedExpenses[0].amount=99999999.99; stressSettings.fixedExpenses[0].name='NomeMuitoLongoSemEspacosParaVerificarOLayoutDoCelularComContas'; localStorage.setItem(KEYS.settings,JSON.stringify(stressSettings)); renderDashboard();`);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Large values and long names fit narrow phone');
  await evaluate(`localStorage.setItem(KEYS.settings,${JSON.stringify(previousSettings)}); renderDashboard();`);
  console.log('PASS long names and large monetary values at 320px');
  assert.deepEqual(pageErrors, [], 'No unhandled browser errors');
  console.log('PASS period navigation, password visibility, settings dialog, focus and browser error audit');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  socket?.close(); browser?.kill(); server.close();
});
