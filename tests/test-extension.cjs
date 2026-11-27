const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const commands = new Map();
const called = [];
const globalData = new Map();
const hooks = {};
let viewProvider, reminderCheck, diagnostics=[];
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
    onWillSaveTextDocument:f=>{hooks.willSave=f;return {dispose(){}};}
  },
  tasks:{onDidEndTaskProcess:f=>{hooks.task=f;return {dispose(){}};}},
  languages:{onDidChangeDiagnostics:f=>{hooks.diag=f;return {dispose(){}};},getDiagnostics:()=>diagnostics},
  DiagnosticSeverity:{Error:0},
  TextDocumentSaveReason:{Manual:1,AfterDelay:2,FocusOut:3},
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
  let disposeView;
  viewProvider.resolveWebviewView({webview,onDidDispose:f=>{disposeView=f;return {dispose(){}};}});
  assert(html.includes('room-egg.png'),'Egg shell is used');
  assert(html.includes('sippy-faces.png'),'Sippy mascot is used');
  assert(!html.includes('{{NONCE}}'));
  { const vm=require('node:vm');const code=html.slice(html.indexOf('>',html.indexOf('<script'))+1,html.indexOf('</script>'));
    assert.doesNotThrow(()=>new vm.Script(code),'Webview script has valid syntax'); }
  assert(html.includes('id="feed"')&&html.includes('id="drink"')&&html.includes('id="pat"')&&html.includes('id="rest"'));
  assert(html.includes('182px'),'Compact width CSS');
  assert(!html.includes('overflow:scroll'));
  await onMessage({type:'ready'});
  assert.equal(messages.at(-1).state.total,0);
  const segs=h=>Math.round(h*6/100*10)/10;
  assert.equal(segs(messages.at(-1).state.pet.health),2,'A brand-new Sippy starts at 2 of 6 health segments');
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
  assert(html.includes('window-night.png')&&html.includes('data-time'),'Night window wired');
  assert(html.includes('nightcap.png')&&html.includes('blanket.png')&&html.includes('data-asleep=true'),'Nightcap and blanket while asleep');
  assert(html.includes('bar-health.png')&&!html.includes('bar-water.png')&&!html.includes('{{BAR_'),'Single health bar wired');
  assert(html.includes('id="foodMenu"')&&html.includes('data-food="shrimp"'),'Snack menu present');
  assert(commands.has('sippy.feed'),'Feed command registered');
  const happy0=viewProvider.state().pet.happiness,energy0=viewProvider.state().pet.energy;
  await onMessage({type:'care',action:'pat'});
  assert(viewProvider.state().pet.happiness>=happy0&&viewProvider.state().pet.energy===energy0,'Pats cheer her up without tiring her');
  assert.equal(messages.at(-1).animation,'pat');
  assert(html.includes('id="hand"')&&html.includes("pat:['Hehe, pats!','pat',1300]"),'Pat animation in webview');
  const nap=(energy,minsAgo,asleep=true)=>globalData.set('sippy.pet',{...globalData.get('sippy.pet'),energy,asleep,lastUpdated:Date.now()-minsAgo*60000});
  viewProvider.isNightNow=()=>false;
  nap(100,0,false);
  await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.asleep,false,'Not sleepy when fully rested in the day');
  assert.equal(messages.at(-1).animation,'notSleepy');
  nap(97,0,false);
  await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.asleep,true,'Can nap whenever not fully rested');
  nap(100,0);viewProvider.isNightNow=()=>true;
  assert.equal(await viewProvider.wakeIfRested(),false,'Sleeps through the night even when rested');
  nap(100,0,false);await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.asleep,true,'Can always go to bed at night');
  viewProvider.isNightNow=()=>false;
  nap(40,0,false);
  await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.asleep,true,'Zz puts Sippy to sleep and she stays asleep');
  nap(40,30);
  assert.equal(viewProvider.state().pet.energy,70,'Energy comes back while she sleeps');
  const before=messages.length;viewProvider.lastReaction={};viewProvider.react('save');
  assert.equal(messages.length,before,'She naps through saves');
  nap(40,120);
  await viewProvider.refreshMood();
  assert.equal(viewProvider.state().pet.asleep,false,'She wakes up by herself when fully rested');
  assert.equal(messages.at(-1).animation,'rested');
  nap(40,0);
  await onMessage({type:'care',action:'rest'});
  assert.equal(viewProvider.state().pet.asleep,false,'Zz again wakes her');
  assert(commands.has('sippy.toggleSleep'),'Sleep/wake command registered');
  assert(html.includes("if(s.pet.asleep)restBtn.innerHTML=WAKE_ICON")&&html.includes("const WAKE_ICON='<svg"),'Zz button turns into an alarm-clock icon while she sleeps');
  assert.equal(messages.at(-1).animation,'wake');
  await onMessage({type:'care',action:'rest'});await onMessage({type:'care',action:'pat'});
  assert.equal(viewProvider.state().pet.asleep,false,'Patting wakes her');
  assert(html.includes("asleep:'sleep'"),'Webview shows sleeping idle');
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
  assert.equal(ext.isNight(at(20)),true);assert.equal(ext.isNight(at(3)),true);assert.equal(ext.isNight(at(12)),false);
  assert.equal(typeof viewProvider.state().night,'boolean','Day/night reaches the webview');
  assert.equal(ext.isLate(at(23)),true);assert.equal(ext.isLate(at(14)),false);
  assert.equal(ext.hydration(0,2000,at(7)),100,'Fully hydrated before the day starts');
  assert.equal(ext.hydration(0,2000,at(22)),0,'Nothing drunk all day: no hydration');
  assert.equal(ext.hydration(2000,2000,at(22)),100);
  assert(ext.health({hunger:100,happiness:100,energy:100},0)<ext.health({hunger:100,happiness:100,energy:100},100),'Water intake affects health');
  assert(['ok','thirsty','done'].includes(viewProvider.state().mood));
  assert.deepEqual(viewProvider.state().sound,{enabled:true,volume:40},'Sound settings reach the webview');
  assert(commands.has('sippy.toggleSound'),'Toggle sound command');
  assert(html.includes('createOscillator')&&html.includes('SOUNDS'),'Web Audio sounds in webview');
  // Coding reactions
  const reacts=()=>messages.filter(m=>m.type==='react').map(m=>m.kind);
  hooks.save=()=>hooks.willSave({reason:1});
  hooks.willSave({reason:2});hooks.willSave({reason:3});
  assert.deepEqual(reacts(),[],'Auto-saves do not trigger reactions');
  hooks.save();hooks.save();
  assert.deepEqual(reacts(),['save'],'Save reaction is throttled');
  hooks.task({exitCode:1});hooks.task({exitCode:undefined});
  assert.deepEqual(reacts(),['save','taskFail']);
  assert(viewProvider.quietUntil>Date.now(),'Error reactions stay quiet right after startup');
  viewProvider.quietUntil=0;
  const setErrors=n=>{diagnostics=[['file',Array.from({length:n},()=>({severity:0}))]];hooks.diag();};
  const wait=()=>new Promise(r=>setTimeout(r,1600));
  setErrors(1);await wait();
  assert.deepEqual(reacts().slice(2),['error'],'A single new error gets a reaction');
  setErrors(0);await wait();
  assert.deepEqual(reacts().slice(2),['error','fixed'],'Clearing errors gets a reaction');
  assert(html.includes("error:['Oops, an error!','worried',7000]")&&html.includes("errors:['So many errors...','worried',7000]"),'Error reactions last 7 seconds');
  assert(html.includes("taskFail:")&&html.includes("'proud'"),'Webview knows reactions and calm goal idle');
  assert.equal((html.match(/infinite/g)||[]).length,1,'Only the gentle breathing loops forever');
  assert(html.includes('id="moodTag"'),'Mood symbol present');
  assert(html.includes('id="breath"')&&html.includes('data-breath=sob'),'Breathing wrapper with mood rhythms');
  for(const f of ['open','blink','sleep','sad','cry'])assert(html.includes(`data-face=${f}`),'Face '+f);
  assert(fs.existsSync(path.join(context.extensionPath,'media','sippy-faces.png')));
  assert(fs.existsSync(path.join(context.extensionPath,'media','room-egg.png')));
  assert.equal(require('../package.json').contributes.views.explorer[0].id,'sippy.petView');
  global.setInterval=origInterval;global.clearInterval=origClear;Module._load=load;
  // Robustness
  globalData.set('sippy.pet',{hunger:'oops',happiness:null,energy:undefined,lastUpdated:'x'});
  assert(Number.isFinite(viewProvider.state().pet.health),'Bad saved stats fall back to defaults');
  globalData.set('sippy.pet',{hunger:100,happiness:100,energy:100,lastUpdated:Date.now(),day:'2000-01-01'});
  assert.equal(segs(viewProvider.state().pet.health),2,'Each new day starts at 2 of 6 health segments');
  assert.equal(globalData.get('sippy.pet').day,viewProvider.state().day,'Daily reset is saved');
  assert(/^\d{4}-\d\d-\d\d\|/.test(`${viewProvider.state().day}|`),'Day is part of state');
  disposeView();
  assert.equal(viewProvider.view,undefined,'Closed view is forgotten');
  viewProvider.send();await viewProvider.refreshMood();
  assert.equal(viewProvider.react('error'),false,'No crash or message after the view closes');
  console.log('PASS: compact Explorer egg, Sippy animation, feed/pat/rest, water hard cap, settings, reminders, pace mood, coding reactions');
})().catch(e=>{global.setInterval=origInterval;global.clearInterval=origClear;Module._load=load;console.error(e);process.exitCode=1;});
