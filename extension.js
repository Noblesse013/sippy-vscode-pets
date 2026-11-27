const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WATER_KEY = 'sippy.hydration';
const PET_KEY = 'sippy.pet';
const NIGHT_START_HOUR = 19; // window shows a night sky from here...
const NIGHT_END_HOUR = 6;    // ...until here
const DAY_START_HOUR = 8;   // pace starts counting at 8:00
const DAY_END_HOUR = 22;    // whole goal "expected" by 22:00
const BEHIND_MARGIN = 0.2;  // thirsty when more than 20% of the goal behind pace
const HYDRATION_WEIGHT = 0.4; // share of Sippy's health that comes from your water intake
// Each day (and a brand-new Sippy) starts with care stats at 56 and no water: 0.6*56 ≈ 34% health = 2 of 6 bar segments.
const DAY_START_STAT = 56;
// Sleep cycle: asleep she regains energy (per hour) and gets hungry/bored at half speed; awake energy drains slowly.
const SLEEP_ENERGY_PER_HOUR = 60;   // about 1 energy a minute, so a nap from half energy takes ~50 minutes
const STARTUP_GRACE_MS = 20000; // ignore error counts for the first 20s while language servers load
const ERROR_THRESHOLD = 5;  // "so many errors" instead of "oops" at this many errors
// Snacks: how much each one fills Sippy up and cheers her up.
const FOODS = { fish:{ label:'Fish', icon:'🐟', hunger:28, happiness:0 }, shrimp:{ label:'Shrimp', icon:'🦐', hunger:16, happiness:8 }, icecream:{ label:'Ice cream', icon:'🍦', hunger:8, happiness:16 } };
const REACTION_COOLDOWN = { save:30000, taskPass:10000, taskFail:10000, commit:5000, error:15000, errors:30000, fixed:30000 };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let provider;
let reminderTimer;

// 'done' | 'thirsty' | 'ok' — how today's intake compares with where you "should" be by now.
function expectedByNow(goal, date = new Date()) {
  const hours = date.getHours() + date.getMinutes() / 60;
  return goal * clamp((hours - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR), 0, 1);
}
function paceMood(total, goal, date = new Date()) {
  if (total >= goal) return 'done';
  return expectedByNow(goal, date) - total > goal * BEHIND_MARGIN ? 'thirsty' : 'ok';
}
// 0..100: 100 when on pace (or ahead), dropping to 0 when half the day's goal behind pace.
function hydration(total, goal, date = new Date()) {
  const behind = Math.max(0, expectedByNow(goal, date) - total) / goal;
  return Math.round(clamp(100 - behind * 200, 0, 100));
}
// Sippy's health: water counts as much as food, fun and sleep put together... almost (40%).
function health(pet, hydrationLevel) {
  return Math.round(HYDRATION_WEIGHT * hydrationLevel + (1 - HYDRATION_WEIGHT) * (pet.hunger + pet.happiness + pet.energy) / 3);
}
// Re-render when mood, night-time or health changes (the heart bar fills smoothly).
function moodKey(s) { return `${s.day}|${s.mood}|${s.late}|${s.night}|${s.pet.health}`; }
function isLate(date = new Date()) { const h = date.getHours(); return h >= 23 || h < 5; }
// Night sky in the window from 19:00 until 6:00.
function isNight(date = new Date()) { const h = date.getHours(); return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR; }

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
  context.subscriptions.push(vscode.commands.registerCommand('sippy.toggleSleep', async () => {
    const before = provider.petState();
    await provider.care('rest');
    const after = provider.petState();
    vscode.window.showInformationMessage(after.asleep ? 'Sippy is napping 💤' : before.asleep ? 'Sippy woke up ☀️' : 'Sippy isn’t sleepy yet!');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('sippy.resetToday', async () => { await provider.resetToday(); }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
    if (e.affectsConfiguration('sippy')) { await provider.normalizeGoal(); provider.send(); startReminders(); }
  }));
  watchCoding(context, provider);
  function startReminders() {
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = setInterval(async () => { try {
      await provider.refreshMood();
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
    } catch (err) { console.error('Sippy: minute tick failed', err); } }, 60000);
  }
  startReminders();
  context.subscriptions.push({dispose() { if (reminderTimer) clearInterval(reminderTimer); }});
}

// Sippy reacts to saves, task results, git commits and error counts.
function watchCoding(context, provider) {
  const subs = context.subscriptions;
  const react = kind => { if (vscode.workspace.getConfiguration('sippy').get('codingReactions', true)) provider.react(kind); };
  // Only saves you make yourself (Ctrl+S): auto-save would make her wave every 30 seconds while you type.
  subs.push(vscode.workspace.onWillSaveTextDocument(e => { if (e.reason === vscode.TextDocumentSaveReason.Manual) react('save'); }));
  subs.push(vscode.tasks.onDidEndTaskProcess(e => { if (typeof e.exitCode === 'number') react(e.exitCode === 0 ? 'taskPass' : 'taskFail'); }));
  // Errors that already exist when VS Code starts (language servers loading) aren't "new": just count them.
  provider.quietUntil = Date.now() + STARTUP_GRACE_MS;
  let lastErrors = countErrors(), diagTimer;
  subs.push(vscode.languages.onDidChangeDiagnostics(() => {
    clearTimeout(diagTimer);
    diagTimer = setTimeout(() => {
      const errors = countErrors();
      if (Date.now() < provider.quietUntil) { lastErrors = errors; return; }
      if (errors > lastErrors) react(errors >= ERROR_THRESHOLD ? 'errors' : 'error');
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
    const saved={...this.context.globalState.get(PET_KEY,{hunger:DAY_START_STAT,happiness:DAY_START_STAT,energy:DAY_START_STAT,lastUpdated:now,day:today()})};
    // New day: she starts fresh at 2 health segments (stored so decay continues from there).
    if(saved.day&&saved.day!==today()){Object.assign(saved,{hunger:DAY_START_STAT,happiness:DAY_START_STAT,energy:DAY_START_STAT,lastUpdated:now,day:today()});this.context.globalState.update(PET_KEY,saved);}
    const elapsedHours=Math.max(0,(now-(Number(saved.lastUpdated)||now))/3600000);
    const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
    saved.hunger=num(saved.hunger,DAY_START_STAT);saved.happiness=num(saved.happiness,DAY_START_STAT);saved.energy=num(saved.energy,DAY_START_STAT);
    const asleep=saved.asleep===true, slow=asleep?0.5:1;
    const hunger=clamp(Math.round(saved.hunger-2*slow*elapsedHours),0,100);
    const happiness=clamp(Math.round(saved.happiness-1*slow*elapsedHours),0,100);
    const energy=clamp(Math.round(saved.energy+(asleep?SLEEP_ENERGY_PER_HOUR:-1)*elapsedHours),0,100);
    return {hunger,happiness,energy,asleep};
  }
  state() {
    const saved=this.context.globalState.get(WATER_KEY,{});
    const settings=vscode.workspace.getConfiguration('sippy');
    const goal=Math.max(1,Number(settings.get('dailyGoal',2000))||2000);
    const day=today();
    const total=saved.day===day?clamp(saved.total||0,0,goal):0;
    const now=new Date();
    return {day,goal,total,
      lastDrink:saved.day===day?saved.lastDrink||0:0,
      lastReminder:this.context.globalState.get('sippy.lastReminder',Date.now()),
      mood:paceMood(total,goal,now),late:isLate(now),night:isNight(now),
      sound:{enabled:settings.get('sound',true)!==false,volume:clamp(Number(settings.get('soundVolume',40))||0,0,100)},
      // Water part of health: today's intake so far, capped when behind pace.
      pet:(()=>{const pet=this.petState();const hydrationLevel=Math.min(hydration(total,goal,now),Math.round(total/goal*100));return {...pet,hydration:hydrationLevel,health:health(pet,hydrationLevel)};})()};
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
    if(!['feed','pat','rest'].includes(action))return;
    const p=this.petState();
    if(action==='feed'){if(!FOODS[food])food='fish';p.hunger=clamp(p.hunger+FOODS[food].hunger,0,100);p.happiness=clamp(p.happiness+FOODS[food].happiness,0,100);}
    if(action==='pat')p.happiness=clamp(p.happiness+20,0,100); // gentle head pats: pure happiness, no energy cost
    // Zz toggles a nap. Asleep she slowly regains energy and wakes by herself when fully rested;
    // Zz again, feeding or patting wake her early (she keeps the energy she gained).
    let animation=action==='feed'?`feed:${food}`:action;
    if(action==='rest'){
      if(p.asleep){p.asleep=false;animation='wake';}
      else if(p.energy>=100&&!this.isNightNow()){this.send('notSleepy');return;} // fully rested daytime: not sleepy
      else p.asleep=true;
    } else p.asleep=false;
    await this.savePet(p);
    this.send(animation);
  }
  async savePet(p){const {hunger,happiness,energy,asleep}=p;await this.context.globalState.update(PET_KEY,{hunger,happiness,energy,asleep,lastUpdated:Date.now(),day:today()});}
  // Called every minute: wake her up once she's fully rested.
  // At night she sleeps through until morning, however rested she is.
  isNightNow(){return isNight(new Date());}
  async wakeIfRested(){const p=this.petState();if(!p.asleep||p.energy<100||this.isNightNow())return false;p.asleep=false;await this.savePet(p);this.send('rested');return true;
  }
  async resetToday(){await this.context.globalState.update(WATER_KEY,{day:today(),total:0,lastDrink:0});this.send();}
  send(animation){
    const state=this.state();
    this.moodKey=moodKey(state);
    this.post({type:'state',state,animation});
  }
  // Messages to a closed view are dropped instead of throwing.
  post(msg){if(!this.view)return false;try{void Promise.resolve(this.view.webview.postMessage(msg)).catch(()=>{});return true;}catch{this.view=undefined;return false;}
  }
  // Called every minute: only re-render when the pace mood, night state or health actually changes.
  async refreshMood(){if(await this.wakeIfRested())return;if(moodKey(this.state())!==this.moodKey)this.send();}
  react(kind){
    if(!this.view||!REACTION_COOLDOWN[kind])return false;
    // Let her nap through saves and commits; only code errors startle her.
    if(this.petState().asleep&&kind!=='error'&&kind!=='errors')return false;
    const now=Date.now();
    if(now-(this.lastReaction[kind]||0)<REACTION_COOLDOWN[kind])return false;
    this.lastReaction[kind]=now;
    return this.post({type:'react',kind,state:this.state()});
  }
  resolveWebviewView(view) {
    this.view=view;
    if(typeof view.onDidDispose==='function')view.onDidDispose(()=>{if(this.view===view)this.view=undefined;});
    const webview=view.webview;
    webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(this.context.extensionUri,'media')]};
    const mascot=webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media','sippy-faces.png'));
    const egg=webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media','room-egg.png'));
    const media=f=>webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media',f)).toString();
    const nonce=crypto.randomBytes(16).toString('hex');
    const template=fs.readFileSync(path.join(this.context.extensionPath,'media','room.html'),'utf8');
    webview.html=template.replaceAll('{{NONCE}}',nonce).replaceAll('{{MASCOT}}',mascot.toString()).replaceAll('{{EGG}}',egg.toString()).replaceAll('{{BAR_HEALTH}}',media('bar-health.png')).replaceAll('{{NIGHT_WINDOW}}',media('window-night.png')).replaceAll('{{NIGHTCAP}}',media('nightcap.png')).replaceAll('{{BLANKET}}',media('blanket.png')).replaceAll('{{CSP_SOURCE}}',webview.cspSource);
    webview.onDidReceiveMessage(async m=>{
      if(!m||typeof m.type!=='string')return;
      if(m.type==='ready')this.send();
      if(m.type==='drink')await this.addWater(Number(m.amount));
      if(m.type==='care')await this.care(m.action,m.food);
    });
  }
}
function deactivate(){}
module.exports={activate,deactivate,paceMood,isLate,isNight,hydration,health};
