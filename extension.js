const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WATER_KEY = 'sippy.hydration';
const PET_KEY = 'sippy.pet';
const DAY_START_HOUR = 8;   // pace starts counting at 8:00
const DAY_END_HOUR = 22;    // whole goal "expected" by 22:00
const BEHIND_MARGIN = 0.2;  // thirsty when more than 20% of the goal behind pace
const ERROR_THRESHOLD = 5;  // worried when the workspace has this many errors
// Snacks: how much each one fills Sippy up and cheers her up.
const FOODS = { fish:{ label:'Fish', icon:'🐟', hunger:28, happiness:0 }, shrimp:{ label:'Shrimp', icon:'🦐', hunger:16, happiness:8 }, icecream:{ label:'Ice cream', icon:'🍦', hunger:8, happiness:16 } };
const REACTION_COOLDOWN = { save:30000, taskPass:10000, taskFail:10000, commit:5000, errors:120000, fixed:120000 };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let provider;
let reminderTimer;

// 'done' | 'thirsty' | 'ok' — how today's intake compares with where you "should" be by now.
function paceMood(total, goal, date = new Date()) {
  if (total >= goal) return 'done';
  const hours = date.getHours() + date.getMinutes() / 60;
  const expected = goal * clamp((hours - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR), 0, 1);
  return expected - total > goal * BEHIND_MARGIN ? 'thirsty' : 'ok';
}
// Re-render when mood, night-time or the number of filled health segments changes.
function moodKey(s) { return `${s.mood}|${s.late}|${Math.ceil(s.pet.health/25)}`; }
function isLate(date = new Date()) { const h = date.getHours(); return h >= 23 || h < 5; }

function activate(context) {
  provider = new SippyProvider(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('sippy.petView', provider, { webviewOptions: { retainContextWhenHidden:true } }));
  if (context.globalState.get('sippy.lastReminder') === undefined) {
    void context.globalState.update('sippy.lastReminder', Date.now());
  }
  context.subscriptions.push(vscode.commands.registerCommand('sippy.open', async () => {
    await vscode.commands.executeCommand('workbench.view.explorer');
    await vscode.commands.executeCommand('sippy.petView.focus');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('sippy.logWater', async () => {
    const value = await vscode.window.showInputBox({ prompt:'How many ml did you drink?', value:'250', validateInput: v => (!Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 2000) ? 'Enter a whole number from 1 to 2000' : null });
    if (value !== undefined) await provider.addWater(Number(value));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('sippy.feed', async () => {
    const items = Object.entries(FOODS).map(([id, f]) => ({ id, label:`${f.icon} ${f.label}`, description:`+${f.hunger} hunger${f.happiness ? `, +${f.happiness} happiness` : ''}` }));
    const pick = await vscode.window.showQuickPick(items, { placeHolder:'What should Sippy eat?' });
    if (pick) await provider.care('feed', pick.id);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('sippy.toggleSound', async () => {
    const settings = vscode.workspace.getConfiguration('sippy');
    const on = !settings.get('sound', true);
    await settings.update('sound', on, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(on ? 'Sippy sounds on 🔊' : 'Sippy sounds off 🔇');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('sippy.resetToday', async () => { await provider.resetToday(); }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
    if (e.affectsConfiguration('sippy')) { await provider.normalizeGoal(); provider.send(); startReminders(); }
  }));
  watchCoding(context, provider);
  function startReminders() {
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = setInterval(async () => {
      provider.refreshMood();
      const settings = vscode.workspace.getConfiguration('sippy');
      if (!settings.get('remindersEnabled', true)) return;
      const s = provider.state();
      if (s.total >= s.goal) return;
      const interval = Math.max(5, Number(settings.get('reminderMinutes', 45))) * 60000;
      const now = Date.now();
      if (now - s.lastReminder < interval) return;
      await context.globalState.update('sippy.lastReminder', now);
      const text = s.mood === 'thirsty' ? 'Sippy is a bit thirsty, you\'re behind today\'s pace. Time for a sip!' : 'Sippy says: Time for a sip of water!';
      const choice = await vscode.window.showInformationMessage(text, 'Log 250 ml', 'Open Sippy');
      if (choice === 'Log 250 ml') await provider.addWater(250);
      if (choice === 'Open Sippy') await vscode.commands.executeCommand('sippy.open');
    }, 60000);
  }
  startReminders();
  context.subscriptions.push({dispose() { if (reminderTimer) clearInterval(reminderTimer); }});
}

// Sippy reacts to saves, task results, git commits and error counts.
function watchCoding(context, provider) {
  const subs = context.subscriptions;
  const react = kind => { if (vscode.workspace.getConfiguration('sippy').get('codingReactions', true)) provider.react(kind); };
  subs.push(vscode.workspace.onDidSaveTextDocument(() => react('save')));
  subs.push(vscode.tasks.onDidEndTaskProcess(e => { if (typeof e.exitCode === 'number') react(e.exitCode === 0 ? 'taskPass' : 'taskFail'); }));
  let lastErrors = countErrors(), diagTimer;
  subs.push(vscode.languages.onDidChangeDiagnostics(() => {
    clearTimeout(diagTimer);
    diagTimer = setTimeout(() => {
      const errors = countErrors();
      if (lastErrors < ERROR_THRESHOLD && errors >= ERROR_THRESHOLD) react('errors');
      else if (lastErrors > 0 && errors === 0) react('fixed');
      lastErrors = errors;
    }, 1500);
  }));
  subs.push({ dispose() { clearTimeout(diagTimer); } });
  const git = vscode.extensions.getExtension('vscode.git');
  if (!git) return;
  Promise.resolve(git.isActive ? git.exports : git.activate()).then(exp => {
    const api = exp && typeof exp.getAPI === 'function' ? exp.getAPI(1) : null;
    if (!api) return;
    const hook = repo => { if (typeof repo.onDidCommit === 'function') subs.push(repo.onDidCommit(() => react('commit'))); };
    api.repositories.forEach(hook);
    subs.push(api.onDidOpenRepository(hook));
  }).catch(() => {});
}
function countErrors() {
  let n = 0;
  for (const [, diags] of vscode.languages.getDiagnostics()) n += diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  return n;
}

class SippyProvider {
  constructor(context) { this.context=context; this.lastReaction={}; this.moodKey=''; }
  petState() {
    const now=Date.now();
    const saved=this.context.globalState.get(PET_KEY,{hunger:78,happiness:82,energy:88,lastUpdated:now});
    const elapsedHours=Math.max(0,(now-(saved.lastUpdated||now))/3600000);
    const hunger=clamp(Math.round(saved.hunger-2*elapsedHours),0,100);
    const happiness=clamp(Math.round(saved.happiness-1*elapsedHours),0,100);
    const energy=clamp(Math.round(saved.energy-1*elapsedHours),0,100);
    return {hunger,happiness,energy,health:Math.round((hunger+happiness+energy)/3)};
  }
  state() {
    const saved=this.context.globalState.get(WATER_KEY,{});
    const settings=vscode.workspace.getConfiguration('sippy');
    const goal=Math.max(1,Number(settings.get('dailyGoal',2000)));
    const day=today();
    const total=saved.day===day?clamp(saved.total||0,0,goal):0;
    const now=new Date();
    return {day,goal,total,
      lastDrink:saved.day===day?saved.lastDrink||0:0,
      lastReminder:this.context.globalState.get('sippy.lastReminder',Date.now()),
      mood:paceMood(total,goal,now),late:isLate(now),
      sound:{enabled:settings.get('sound',true)!==false,volume:clamp(Number(settings.get('soundVolume',40))||0,0,100)},
      pet:this.petState()};
  }
  async normalizeGoal() {
    const saved=this.context.globalState.get(WATER_KEY,{});
    const s=this.state();
    if(saved.day===s.day&&saved.total>s.goal)await this.context.globalState.update(WATER_KEY,{...saved,total:s.goal});
  }
  async addWater(amount) {
    if(!Number.isInteger(amount)||amount<1||amount>2000){ vscode.window.showWarningMessage('Choose a water amount from 1 to 2000 ml.');return; }
    const s=this.state();
    if(s.total>=s.goal){vscode.window.showInformationMessage('You already reached today\'s water goal!');this.send();return;}
    const added=Math.min(amount,s.goal-s.total);
    await this.context.globalState.update(WATER_KEY,{day:s.day,total:s.total+added,lastDrink:Date.now()});
    this.send('drink');
    if(s.total+added===s.goal)vscode.window.showInformationMessage('Sippy is celebrating! Daily water goal complete!');
  }
  async care(action,food='fish'){
    if(!['feed','play','rest'].includes(action))return;
    const p=this.petState();
    if(action==='feed'){if(!FOODS[food])food='fish';p.hunger=clamp(p.hunger+FOODS[food].hunger,0,100);p.happiness=clamp(p.happiness+FOODS[food].happiness,0,100);}
    if(action==='play'){p.happiness=clamp(p.happiness+22,0,100);p.energy=clamp(p.energy-7,0,100);p.hunger=clamp(p.hunger-3,0,100);}
    if(action==='rest')p.energy=clamp(p.energy+28,0,100);
    const {health,...stats}=p;
    await this.context.globalState.update(PET_KEY,{...stats,lastUpdated:Date.now()});
    this.send(action==='feed'?`feed:${food}`:action);
  }
  async resetToday(){await this.context.globalState.update(WATER_KEY,{day:today(),total:0,lastDrink:0});this.send();}
  send(animation){
    const state=this.state();
    this.moodKey=moodKey(state);
    if(this.view)this.view.webview.postMessage({type:'state',state,animation});
  }
  // Called every minute: only re-render when the pace mood or night state actually changes.
  refreshMood(){if(moodKey(this.state())!==this.moodKey)this.send();}
  react(kind){
    if(!this.view||!REACTION_COOLDOWN[kind])return false;
    const now=Date.now();
    if(now-(this.lastReaction[kind]||0)<REACTION_COOLDOWN[kind])return false;
    this.lastReaction[kind]=now;
    this.view.webview.postMessage({type:'react',kind,state:this.state()});
    return true;
  }
  resolveWebviewView(view) {
    this.view=view;
    const webview=view.webview;
    webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(this.context.extensionUri,'media')]};
    const mascot=webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media','sippy-faces.png'));
    const egg=webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media','room-egg.png'));
    const media=f=>webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media',f)).toString();
    const nonce=crypto.randomBytes(16).toString('hex');
    const template=fs.readFileSync(path.join(this.context.extensionPath,'media','room.html'),'utf8');
    webview.html=template.replaceAll('{{NONCE}}',nonce).replaceAll('{{MASCOT}}',mascot.toString()).replaceAll('{{EGG}}',egg.toString()).replaceAll('{{BAR_HEART}}',media('bar-heart.png')).replaceAll('{{BAR_WATER}}',media('bar-water.png')).replaceAll('{{CSP_SOURCE}}',webview.cspSource);
    webview.onDidReceiveMessage(async m=>{
      if(!m||typeof m.type!=='string')return;
      if(m.type==='ready')this.send();
      if(m.type==='drink')await this.addWater(Number(m.amount));
      if(m.type==='care')await this.care(m.action,m.food);
    });
  }
}
function deactivate(){}
module.exports={activate,deactivate,paceMood,isLate};
