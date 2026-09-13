#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'audit','stage15-client-launch');
mkdirSync(out,{recursive:true});
const checks=[];
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}

const browser=await launchPwBrowser();
try{
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  page.on('pageerror',e=>console.log('PAGE_ERROR '+e.message));
  await page.setContent(`<!doctype html><html><head><style>
    :root{--sal:0px;--sar:0px;--sat:0px;--fT:system-ui}*{box-sizing:border-box}body{margin:0;background:#030810;color:#dff6ff;font-family:system-ui}.overlay{position:fixed;inset:0;display:none;flex-direction:column}.menuStrip{display:grid}.subMenuHead{width:100%;padding:14px 16px 10px;background:#07131f;border-bottom:1px solid #28506a}.subMenuHead h2{margin:0;color:#8de8ff;font:900 18px var(--fT);letter-spacing:.08em}.subMenuHead span{display:block;margin-top:4px;color:#7895a7;font-size:11px}.screenTabs{display:flex;width:100%;background:#07101a}.screenTabBtn{min-height:48px;flex:1;border:1px solid #28465a;background:#0b1b29;color:#92aebe;font:800 11px var(--fT)}.screenTabBtn.on{color:#9deaff;border-bottom-color:#64d8f4}.warFoot{margin-top:auto;width:100%;padding:8px;background:#050c14;border-top:1px solid #203949}.mbtn,.sbtn{min-height:48px;border:1px solid #31566d;background:#0d2131;color:#dff6ff}
  </style></head><body><div id="startScreen" class="overlay" style="display:flex"><div class="menuStrip"></div></div><div id="inboxMessages"></div><script>
    window.__calls=[];window.__caps={handshake:true,friends:true,blocking:true,reporting:true,chat:false,presence:false,lobbies:true,invites:true,matchLaunch:true,realtimeMatch:true,multiplayer:true};
    window.__verifyDelay=null;window.__handoff={count:0,valid:false,seat:0};window.__launchOnPoll=false;window.__claimSeat=1;
    window.makeLobby=(host=true,revision=7)=>({id:'${'1'.repeat(32)}',code:'DEADBEEF',revision,rules:{mode:'coop',slots:4,map:'auto'},members:[
      {username:'Tester_1',host,self:true,ready:true,compatible:true,compatibilityRevision:revision},
      {username:'Alpha_2',host:false,self:false,ready:true,compatible:true,compatibilityRevision:revision},
      {username:'Bravo_3',host:false,self:false,ready:true,compatible:true,compatibilityRevision:revision},
      {username:'Delta_4',host:false,self:false,ready:true,compatible:true,compatibilityRevision:revision}]});
    window.__lobby=window.makeLobby(true,7);
    class MockWebSocket{
      static OPEN=1;constructor(url,protocols){this.url=url;this.protocols=protocols.slice();this.protocol='massfront.v1';this.readyState=0;this.listeners={};
        setTimeout(()=>{this.readyState=1;this.fire('open',{});const seat=Number(this.protocols[1].split('.')[1]);this.fire('message',{data:JSON.stringify({protocol:'massfront-match',v:1,type:'welcome',matchId:'${'2'.repeat(32)}',seat,tick:0,tickRate:30,inputDelay:{min:2,max:3},reconnectGraceMs:10000,resumed:false,resumeToken:'${'4'.repeat(64)}',generation:1,compatibility:{buildVersion:'1.33.48',manifestHash:'${'a'.repeat(64)}',balanceHash:'${'b'.repeat(64)}',rulesHash:'${'c'.repeat(64)}'}})});},0);}
      addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);}fire(type,event){for(const fn of this.listeners[type]||[])fn(event);}send(value){__calls.push(['socketSend',JSON.parse(value).type]);}
      close(code){if(this.readyState===3)return;this.readyState=3;this.fire('close',{code:code||1000});}
    }
    window.WebSocket=MockWebSocket;
    window.mfRuntimeCompatibility=async()=>({buildVersion:'1.33.48',manifestHash:'${'a'.repeat(64)}',balanceHash:'${'b'.repeat(64)}'});
    window.MFSocial={
      signedIn:()=>true,probe:()=>({sessionEpoch:1}),capabilities:()=>({...__caps}),handshake:async()=>({ok:true,capabilities:{...__caps}}),
      friends:async()=>({ok:true,friends:[],incoming:[]}),lobbyInvites:async()=>({ok:true,invites:[]}),
      createLobby:async()=>({ok:true,lobby:window.__lobby}),getLobby:async()=>__launchOnPoll?({ok:true,lobby:null,match:{id:'${'2'.repeat(32)}',lobbyId:__lobby.id,launchRevision:__lobby.revision,rosterSize:4,buildVersion:'1.33.48',manifestHash:'${'a'.repeat(64)}',balanceHash:'${'b'.repeat(64)}',rulesHash:'${'c'.repeat(64)}',expiresAt:Date.now()+60000}}):({ok:true,lobby:window.__lobby}),
      readyLobby:async()=>({ok:true,lobby:window.__lobby}),leaveLobby:async()=>({ok:true,left:true}),
      verifyLobbyCompatibility:async(id,revision)=>{__calls.push(['verify',id,revision]);if(__verifyDelay)await __verifyDelay.promise;return {ok:true,compatibility:{lobbyId:id,revision,buildVersion:'1.33.48',manifestHash:'${'a'.repeat(64)}',balanceHash:'${'b'.repeat(64)}',rulesHash:'${'c'.repeat(64)}',submittedAt:1}};},
      launchLobby:async(id,revision)=>{__calls.push(['launch',id,revision]);return {ok:true,match:{id:'${'2'.repeat(32)}',lobbyId:id,launchRevision:revision,rosterSize:4,buildVersion:'1.33.48',manifestHash:'${'a'.repeat(64)}',balanceHash:'${'b'.repeat(64)}',rulesHash:'${'c'.repeat(64)}',expiresAt:Date.now()+60000}};},
      claimMatchCredential:async(match,rules,handoff)=>{__calls.push(['claim',match.id,rules.mode,__claimSeat]);const credential={token:'${'3'.repeat(64)}',matchId:match.id,lobbyId:match.lobbyId,seat:__claimSeat,userId:8+__claimSeat,buildVersion:match.buildVersion,manifestHash:match.manifestHash,balanceHash:match.balanceHash,rulesHash:match.rulesHash,expiresAt:Date.now()+30000};await handoff(credential);__handoff.count++;__handoff.valid=credential.token===''&&credential.seat===__claimSeat;__handoff.seat=credential.seat;return {ok:true,receipt:{matchId:match.id,lobbyId:match.lobbyId,seat:__claimSeat,userId:8+__claimSeat,expiresAt:Date.now()+30000}};},
      matchSocketUrl:id=>'ws://auth.invalid/multiplayer/matches/'+id+'/socket',rulesHash:async()=>'${'c'.repeat(64)}'
    };
    window.mfBindTap=(el,fn)=>el.addEventListener('click',fn);window.showFrontScreen=id=>{document.querySelectorAll('.overlay').forEach(x=>x.style.display='none');const e=document.getElementById(id);if(e)e.style.display='flex';};
    window.toast=()=>{};window.sfx=()=>{};window.initAudio=()=>{};window.accConfirm=(txt,yes)=>yes();
  </script></body></html>`);
  const bootParse=await page.evaluate(()=>{const source=document.scripts[0]&&document.scripts[0].textContent||'';try{new Function(source);return null;}catch(e){return {message:e.message,stack:e.stack,source};}});
  if(bootParse){writeFileSync(resolve(root,'.tmp','stage15-ui-boot.js'),bootParse.source);console.log('BOOT_PARSE '+JSON.stringify({message:bootParse.message,stack:bootParse.stack}));}
  await page.addScriptTag({path:resolve(root,'src','socialui.js')});
  await page.evaluate(async()=>{window.__consumer={applyTick:()=>true};MFMatchRuntime.registerConsumer(window.__consumer);initSocialUI();MFSocialUI.open('lobby');await MFSocialUI.refresh(true);MFSocialUI.state.lobby=window.__lobby;MFSocialUI.setTab('lobby');});

  const initial=await page.evaluate(()=>({caps:MFSocialUI.state.caps,lobby:MFSocialUI.state.lobby,ready:MFMatchRuntime.ready(),text:document.getElementById('socialPaneLobby')&&document.getElementById('socialPaneLobby').textContent}));
  if(!initial.text||!initial.text.includes('BUILD VERIFIED'))console.log('UI_DIAGNOSTIC '+JSON.stringify(initial));

  check('every current roster seat shows server verification',(await page.getByText(/BUILD VERIFIED/).count())===4);
  check('host sees enabled preparation control',(await page.getByRole('button',{name:'PREPARE MATCH'}).count())===1&&await page.getByRole('button',{name:'PREPARE MATCH'}).isEnabled());
  check('registered dispatcher exposes realtime readiness',await page.getByText('REALTIME MATCH RUNTIME READY',{exact:true}).isVisible());

  await page.evaluate(()=>{let resolve;const promise=new Promise(r=>{resolve=r;});__verifyDelay={promise,resolve};});
  await page.getByRole('button',{name:'VERIFY THIS BUILD'}).click();
  await page.evaluate(()=>{MFSocialUI.state.lobby.revision=8;MFSocialUI.setTab('lobby');window.__verifyDelay.resolve();});
  await page.waitForTimeout(20);
  check('stale compatibility response is ignored',await page.evaluate(()=>MFSocialUI.state.lobbyCompatibility===null));
  check('revision drift revokes all visible verification',(await page.getByText(/BUILD VERIFICATION PENDING/).count())===4);

  await page.evaluate(()=>{window.__verifyDelay=null;window.__lobby=window.makeLobby(false,7);MFSocialUI.state.lobby=window.__lobby;MFSocialUI.state.lobbyCompatibility=null;MFSocialUI.setTab('lobby');});
  check('non-host sees host-only preparation state',await page.getByText('HOST PREPARATION',{exact:true}).isVisible());
  check('non-host cannot invoke prepare',await page.getByRole('button',{name:'PREPARE MATCH'}).count()===0);

  await page.evaluate(()=>{window.__lobby=window.makeLobby(true,7);MFSocialUI.state.lobby=window.__lobby;MFMatchRuntime.unregisterConsumer(window.__consumer);MFSocialUI.setTab('lobby');});
  check('missing deterministic consumer disables preparation',!(await page.getByRole('button',{name:'PREPARE MATCH'}).isEnabled()));

  await page.evaluate(()=>{MFMatchRuntime.registerConsumer(window.__consumer);MFSocialUI.setTab('lobby');});
  await page.getByRole('button',{name:'PREPARE MATCH'}).click();await page.waitForTimeout(30);
  check('host preparation launches then claims only its seat',await page.evaluate(()=>__calls.some(x=>x[0]==='launch')&&__calls.some(x=>x[0]==='claim')&&__handoff.count===1&&__handoff.valid&&__handoff.seat===1));
  check('UI stores only sanitized receipt',await page.evaluate(token=>!JSON.stringify(MFSocialUI.state).includes(token)&&!document.getElementById('socialPaneLobby').textContent.includes(token),'3'.repeat(64)));
  check('successful callback handoff is visible without token',await page.getByText('CREDENTIAL HANDED TO MATCH RUNTIME',{exact:true}).isVisible());
  check('all visible launch controls retain 44px touch floor',await page.evaluate(()=>[...document.querySelectorAll('#socialPaneLobby button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)));
  await page.screenshot({path:resolve(out,'host-launch-prepared-412x900.png'),fullPage:true});
  await page.evaluate(()=>{MFMatchRuntime.close();MFSocialUI.state.launchReceipt=null;MFSocialUI.state.preparedMatch=null;
    window.__lobby=window.makeLobby(false,7);MFSocialUI.state.lobby=window.__lobby;window.__claimSeat=2;window.__launchOnPoll=true;MFSocialUI.setTab('lobby');});
  await page.waitForTimeout(1700);
  check('non-host polling discovers launch and claims its own assigned seat',await page.evaluate(()=>
    __calls.some(x=>x[0]==='claim'&&x[3]===2)&&__handoff.seat===2&&MFSocialUI.state.launchReceipt&&MFSocialUI.state.launchReceipt.seat===2&&MFMatchRuntime.status().seat===2));
  check('non-host launch receipt is handed off without exposing its token',await page.evaluate(token=>
    !JSON.stringify(MFSocialUI.state).includes(token)&&!document.getElementById('socialPaneLobby').textContent.includes(token),'3'.repeat(64)));
} finally {await closePwBrowser();}

const passed=checks.filter(x=>x.ok).length;
const sourceFiles=['src/authportal.js','src/socialui.js'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
writeFileSync(resolve(out,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),viewport:{width:412,height:900,touch:true},
  sourceHashes,screenshot:'audit/stage15-client-launch/host-launch-prepared-412x900.png',passed,total:checks.length,checks},null,2)+'\n');
console.log(`\n${passed}/${checks.length} Stage 15 launch UI checks passed`);
process.exit(passed===checks.length?0:1);
