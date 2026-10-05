const { app } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = mkdtempSync(path.join(os.tmpdir(), 'lantern-smoke-'));
const repo = path.join(root, 'stellar-notes');
mkdirSync(repo); const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
git('init','--initial-branch=main');git('config','user.name','Smoke Test');git('config','user.email','smoke@example.invalid');
writeFileSync(path.join(repo,'README.md'),'# Stellar Notes\n\nA home for your next idea.\n');git('add','.');git('commit','-m','Initial');git('branch','develop');git('switch','-c','feature/welcome-screen');
writeFileSync(path.join(repo,'README.md'),'# Stellar Notes\n\nA home for your next idea.\n\nWelcome to your workspace.\n');
app.setPath('userData',path.join(root,'settings'));
let ended = false;
function finish(code) { if (ended) return; ended=true; rmSync(root,{recursive:true,force:true}); app.exit(code); }
setTimeout(()=>{console.error('Smoke check timed out');finish(1)},30000).unref();
app.on('browser-window-created',(_event,window)=>{
 window.webContents.on('did-fail-load',(_event,code,description)=>{console.error(code,description);finish(1)});
 window.webContents.once('did-finish-load',async()=>{
  try {
   const initial = await window.webContents.executeJavaScript('document.body.innerText');assert.match(initial,/Good ideas deserve/);
   await window.webContents.executeJavaScript(`(async () => {
    const settle = () => new Promise(resolve => setTimeout(resolve, 80));
    const click = text => { const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(text)); if (!button) throw new Error('Missing button: ' + text); button.click(); };
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    click('Themes'); await settle();
    for (const [name, scheme] of [['Midnight', 'dark'], ['Forest', 'light'], ['Sand', 'light'], ['Plum', 'dark'], ['Sky', 'light']]) {
      click(name); await settle();
      check(document.documentElement.style.colorScheme === scheme, name + ' scheme');
      check(document.querySelector('.theme-option[aria-pressed=true]').textContent.includes(name), name + ' selection');
    }
    async function upload(content) {
      const input = document.querySelector('input[type=file]');
      const data = new DataTransfer(); data.items.add(new File([content], 'theme.json', {type: 'application/json'}));
      input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    }
    await upload('invalid JSON');
    check(document.querySelector('.modal [role=alert]').textContent.includes('valid JSON'), 'Invalid upload error');
    check(document.querySelector('.theme-option[aria-pressed=true]').textContent.includes('Sky'), 'Invalid upload preserves selection');
    await upload(JSON.stringify({ version: 1, name: 'Smoke custom', base: 'midnight', colors: { accent: '#abcdef' } }));
    check(document.documentElement.style.getPropertyValue('--accent') === '#abcdef', 'Custom accent applied');
    check(document.querySelector('.theme-option[aria-pressed=true]').textContent.includes('Smoke custom'), 'Custom theme selected');
   })()`);
   await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload(); });
   assert.equal(await window.webContents.executeJavaScript("document.documentElement.style.getPropertyValue('--accent')"), '#abcdef');
   await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('.theme-settings').click(); await new Promise(resolve => setTimeout(resolve, 80));
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Remove selected theme').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    if (document.documentElement.style.colorScheme !== 'light' || document.body.innerText.includes('Smoke custom')) throw new Error('Remove custom theme failed');
    document.querySelector('.modal-close').click();
   })()`);
   const opened = await window.webContents.executeJavaScript(`window.lantern.request({action:'open',path:${JSON.stringify(repo)}})`);assert.equal(opened.repo.branch,'feature/welcome-screen');
   const configured = await window.webContents.executeJavaScript(`window.lantern.request({action:'configure',config:{production:'main',development:'develop'},createDevelop:false})`);assert.equal(configured.error,undefined);
   // Re-open through the actual React UI using its native picker replacement in this test window.
   await window.webContents.executeJavaScript(`document.querySelector('.repo-picker').click()`);
  } catch(error) {console.error(error);finish(1)}
 });
});
// Replace only the native dialog in this isolated smoke process.
require('electron').dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[repo] });
app.on('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',()=>{
  const timer=setInterval(async()=>{try {
   const text=await window.webContents.executeJavaScript('document.body.innerText');
   if(!text.includes('Make something good.')) return;
   clearInterval(timer);assert.match(text,/feature\/welcome-screen/);assert.match(text,/README.md/);
   await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.file button')).find(b=>b.textContent.includes('README.md')).click()`);
   setTimeout(async()=>{try {
    const content=await window.webContents.executeJavaScript('document.body.innerText');assert.match(content,/Welcome to your workspace/);
    mkdirSync(path.join(__dirname,'../out'),{recursive:true});writeFileSync(path.join(__dirname,'../out/smoke.png'),(await window.webContents.capturePage()).toPNG());
    console.log('Electron smoke check passed: themes, uploads, persistence, preload, welcome screen, repository, workflow configuration, file list, and diff preview.');finish(0);
   }catch(e){console.error(e);finish(1)}},700);
  }catch(e){clearInterval(timer);console.error(e);finish(1)}},200);
 });
});
require('../dist/main/main/main.js');
