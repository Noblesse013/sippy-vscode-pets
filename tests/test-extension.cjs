const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const commands = new Map();
const called = [];
const globalData = new Map();
const hooks = {};
let viewProvider, reminderCheck;
const vscode = {
  window: {
    registerWebviewViewProvider(id,p,opts) { assert.equal(id,'sippy.petView'); assert.equal(opts.webviewOptions.retainContextWhenHidden,true);viewProvider=p;return {dispose(){}}; },
    showInputBox:async()=> '250',
    showWarningMessage:(...args)=>called.push(['warn',...args]),
    showInformationMessage:async(...args)=>{called.push(['info',...args]);}
  },
  workspace: {
    getConfiguration:()=>({get(key,fallback){return key==='dailyGoal'?300:key==='reminderMinutes'?5:fallback;}}),
    onDidChangeConfiguration:()=>({dispose(){}}),
    onDidSaveTextDocument:f=>{hooks.save=f;return {dispose(){}};}
  },
  tasks:{onDidEndTaskProcess:f=>{hooks.task=f;return {dispose(){}};}},
  languages:{onDidChangeDiagnostics:()=>({dispose(){}}),getDiagnostics:()=>[]},
  DiagnosticSeverity:{Error:0},
  extensions:{getExtension:()=>undefined},
  commands: {
    registerCommand(id,fn){commands.set(id,fn);return {dispose(){}};},
    async executeCommand(id){called.push(['cmd',id]);if(commands.has(id))await commands.get(id)();}
  },
  Uri:{joinPath(uri,...pieces){return {fsPath:path.join(uri.fsPath,...pieces),toString(){return 'vscode-resource:/'+pieces.join('/');}}}}
};
const load=Module._load;
Module._load=function(req){if(req==='vscode')return vscode;return load.apply(this,arguments);};
const origInterval=global.setInterval,origClear=global.clearInterval;
global.setInterval=cb=>{reminderCheck=cb;return 123;};global.clearInterval=()=>{};
const ext=require('../extension.js');
const context={subscriptions:[],extensionPath:path.resolve(__dirname,'..'),extensionUri:{fsPath:path.resolve(__dirname,'..')},
  globalState:{get:(k,d)=>globalData.has(k)?globalData.get(k):d,update:async(k,v)=>{globalData.set(k,v);}}};
(async()=>{
  ext.activate(context);
  assert(viewProvider,'Sippy view registered');
  assert(globalData.get('sippy.lastReminder'));
  await commands.get('sippy.open')();
  assert.deepEqual(called.filter(c=>c[0]==='cmd').map(c=>c[1]),['workbench.view.explorer','sippy.petView.focus']);
  const messages=[];let onMessage,html;
  const webview={options:{},cspSource:'vscode-resource:',asWebviewUri:u=>u,postMessage:async m=>{messages.push(m);return true;},onDidReceiveMessage:f=>{onMessage=f;return {dispose(){}};},set html(v){html=v;},get html(){return html;}};
  viewProvider.resolveWebviewView({webview});
  assert(html.includes('room-egg.png'),'Egg shell is used');
  assert(html.includes('sippy-faces.png'),'Sippy mascot is used');
  assert(!html.includes('{{NONCE}}'));
  assert(html.includes('id="feed"')&&html.includes('id="drink"')&&html.includes('id="play"')&&html.includes('id="rest"'));
  assert(html.includes('182px'),'Compact width CSS');
  assert(!html.includes('overflow:scroll'));
  await onMessage({type:'ready'});
  assert.equal(messages.at(-1).state.total,0);
  const initial=messages.at(-1).state.pet.hunger;
  await onMessage({type:'care',action:'feed'});
  assert(viewProvider.state().pet.hunger>=initial);
  const h0=viewProvider.state().pet.health;
  await onMessage({type:'care',action:'feed',food:'icecream'});
  assert(viewProvider.state().pet.health>h0,'Feeding raises health');
  assert(!('health' in globalData.get('sippy.pet')),'Health is derived, not stored');
  assert.equal(messages.at(-1).animation,'feed:icecream','Snack choice reaches the webview');
  await onMessage({type:'care',action:'feed',food:'pizza'});
  assert.equal(messages.at(-1).animation,'feed:fish','Unknown food falls back to fish');
  assert(html.includes('bar-heart.png')&&html.includes('bar-water.png')&&!html.includes('{{BAR_'),'Live stat bars wired');
  assert(html.includes('id="foodMenu"')&&html.includes('data-food="shrimp"'),'Snack menu present');
  assert(commands.has('sippy.feed'),'Feed command registered');
  await onMessage({type:'care',action:'play'});
  await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.energy,100,'Rest should raise energy');
  await onMessage({type:'drink',amount:250});
  assert.equal(viewProvider.state().total,250);
  await onMessage({type:'drink',amount:250});
  assert.equal(viewProvider.state().total,300,'Water clipped to goal');
  await onMessage({type:'drink',amount:250});
  assert.equal(viewProvider.state().total,300,'No logging beyond hard cap');
  await commands.get('sippy.resetToday')();
  assert.equal(viewProvider.state().total,0);
  await viewProvider.addWater(0);
  assert.equal(viewProvider.state().total,0);
  assert.equal(typeof reminderCheck,'function');
  // Mood follows pace
  const at=h=>new Date(2026,0,1,h,0);
  assert.equal(ext.paceMood(0,2000,at(7)),'ok','Nothing expected before the day starts');
  assert.equal(ext.paceMood(200,2000,at(15)),'thirsty','Far behind pace mid-afternoon');
  assert.equal(ext.paceMood(900,2000,at(15)),'ok','Close to pace');
  assert.equal(ext.paceMood(2000,2000,at(15)),'done');
  assert.equal(ext.isLate(at(23)),true);assert.equal(ext.isLate(at(14)),false);
  assert(['ok','thirsty','done'].includes(viewProvider.state().mood));
  // Coding reactions
  const reacts=()=>messages.filter(m=>m.type==='react').map(m=>m.kind);
  hooks.save();hooks.save();
  assert.deepEqual(reacts(),['save'],'Save reaction is throttled');
  hooks.task({exitCode:1});hooks.task({exitCode:undefined});
  assert.deepEqual(reacts(),['save','taskFail']);
  assert(html.includes("taskFail:")&&html.includes("'proud'"),'Webview knows reactions and calm goal idle');
  assert.equal((html.match(/infinite/g)||[]).length,1,'Only the gentle breathing loops forever');
  assert(html.includes('id="moodTag"'),'Mood symbol present');
  assert(html.includes('id="breath"')&&html.includes('data-breath=sob'),'Breathing wrapper with mood rhythms');
  for(const f of ['open','blink','sleep','sad','cry'])assert(html.includes(`data-face=${f}`),'Face '+f);
  assert(fs.existsSync(path.join(context.extensionPath,'media','sippy-faces.png')));
  assert(fs.existsSync(path.join(context.extensionPath,'media','room-egg.png')));
  assert.equal(require('../package.json').contributes.views.explorer[0].id,'sippy.petView');
  global.setInterval=origInterval;global.clearInterval=origClear;Module._load=load;
  console.log('PASS: compact Explorer egg, Sippy animation, feed/play/rest, water hard cap, settings, reminders, pace mood, coding reactions');
})().catch(e=>{global.setInterval=origInterval;global.clearInterval=origClear;Module._load=load;console.error(e);process.exitCode=1;});
