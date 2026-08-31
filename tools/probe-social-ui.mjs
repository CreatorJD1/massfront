import { resolve } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root=resolve(import.meta.dirname,'..');
const checks=[];
function check(name,ok,detail=''){
  checks.push(!!ok);
  console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));
}

const browser=await launchPwBrowser();
try{
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  await page.setContent(`<!doctype html><html><head><style>
    :root{--sal:0px;--sar:0px;--sat:0px;--fT:system-ui}.overlay{position:fixed;inset:0;display:none;flex-direction:column}.menuStrip{display:grid}.screenTabs{display:flex}.screenTabBtn{min-height:48px;flex:1}.warFoot{margin-top:auto}.mbtn,.sbtn{min-height:48px}
  </style></head><body><div id="startScreen" class="overlay" style="display:flex"><div class="menuStrip"></div></div><div id="inboxMessages"></div><script>
    window.__socialCalls=[];
    window.__socialCaps={handshake:true,friends:true,blocking:true,reporting:true,chat:true,presence:true,lobbies:false,invites:false,realtimeMatch:false,multiplayer:false};
    window.__testLobby=null;
    window.MFSocial={
      signedIn:()=>true,
      capabilities:()=>({...__socialCaps}),
      handshake:async()=>({ok:true,capabilities:{...__socialCaps}}),
      friends:async()=>({ok:true,friends:[{username:'Alpha_1'}],incoming:[{id:'7',username:'Bravo_2'}]}),
      presence:async()=>({ok:true,friends:[{username:'Alpha_1',state:'online'}]}),
      request:async username=>{__socialCalls.push(['request',username]);return {ok:true};},
      respond:async(id,accept)=>{__socialCalls.push(['respond',id,accept]);return {ok:true};},
      block:async username=>{__socialCalls.push(['block',username]);return {ok:true};},
      setPresence:async state=>{__socialCalls.push(['presence',state]);return {ok:true,state};},
      messages:async username=>({ok:true,messages:[{id:1,from:username,to:'Tester_1',body:'Ready for deployment?',at:1,mine:false}]}),
      sendMessage:async(username,body)=>{__socialCalls.push(['send',username,body]);return {ok:true,message:{id:2,from:'Tester_1',to:username,body,at:2,mine:true}};},
      lobbyInvites:async()=>({ok:true,invites:[{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',lobbyId:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',code:'A1B2C3D4',from:'Bravo_2',expiresAt:Date.now()+60000}]}),
      createLobby:async()=>{__socialCalls.push(['createLobby']);__testLobby={id:'cccccccccccccccccccccccccccccccc',code:'DEADBEEF',revision:1,rules:{mode:'coop',slots:4,map:'auto'},members:[{username:'Tester_1',host:true,self:true,ready:false}]};return {ok:true,lobby:__testLobby};},
      joinLobby:async code=>{__socialCalls.push(['joinLobby',code]);return {ok:true,lobby:__testLobby};},
      getLobby:async()=>({ok:true,lobby:__testLobby}),
      readyLobby:async(id,revision,ready)=>{__socialCalls.push(['readyLobby',id,revision,ready]);__testLobby.members[0].ready=ready;return {ok:true,lobby:__testLobby};},
      leaveLobby:async id=>{__socialCalls.push(['leaveLobby',id]);__testLobby=null;return {ok:true,left:true};},
      inviteLobby:async(id,username)=>{__socialCalls.push(['inviteLobby',id,username]);return {ok:true};},
      respondLobbyInvite:async(id,accept)=>{__socialCalls.push(['respondLobbyInvite',id,accept]);return {ok:true,lobby:__testLobby};}
    };
    window.mfBindTap=(el,fn)=>el.addEventListener('click',fn);
    window.showFrontScreen=id=>{document.querySelectorAll('.overlay').forEach(x=>x.style.display='none');const e=document.getElementById(id);if(e)e.style.display='flex';};
    window.toast=()=>{};window.sfx=()=>{};window.initAudio=()=>{};window.accConfirm=(txt,yes)=>yes();
  </script></body></html>`);
  await page.addScriptTag({path:resolve(root,'src/socialui.js')});
  await page.evaluate(()=>{initSocialUI();MFSocialUI.open();});
  await page.waitForTimeout(40);

  check('main menu exposes Social',(await page.locator('#socialBtn').count())===1);
  check('friend request is visible',await page.getByText('Bravo_2',{exact:true}).isVisible());
  check('friend presence is visible',(await page.getByText('ONLINE',{exact:true}).count())>0);
  check('accepted friend has Chat',await page.getByRole('button',{name:'CHAT'}).isEnabled());
  const invite=page.getByRole('button',{name:/INVITE/});
  check('Invite remains disabled without multiplayer transport',!(await invite.isEnabled()));

  await page.getByRole('button',{name:'CHAT'}).click();
  await page.waitForTimeout(20);
  check('real message thread loads',await page.getByText('Ready for deployment?').isVisible());
  await page.getByLabel('Direct message').fill('Moving now.');
  await page.getByRole('button',{name:'SEND'}).click();
  await page.waitForTimeout(20);
  check('chat send uses selected friend',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='send'&&x[1]==='Alpha_1'&&x[2]==='Moving now.'))));

  await page.getByRole('tab',{name:/LOBBY/}).click();
  check('disabled server capability is honest',await page.getByText('PLAYER LOBBIES UNAVAILABLE',{exact:true}).isVisible());

  await page.evaluate(async()=>{__socialCaps.lobbies=true;__socialCaps.invites=true;await MFSocialUI.refresh(true);MFSocialUI.setTab('lobby');});
  check('enabled server exposes Create Lobby',await page.getByRole('button',{name:/CREATE LOBBY/}).isEnabled());
  check('incoming lobby invitation is visible',(await page.locator('#socialPaneLobby').getByText(/A1B2C3D4/).count())>0);
  await page.getByRole('button',{name:/CREATE LOBBY/}).click();
  await page.waitForTimeout(20);
  check('created lobby code is rendered',(await page.locator('#socialPaneLobby').getByText(/DEADBEEF/).count())>0);
  check('lobby keeps match relay locked',await page.getByText('MATCH RELAY NOT CONNECTED',{exact:true}).isVisible());
  await page.getByRole('button',{name:'READY',exact:true}).click();
  await page.waitForTimeout(20);
  check('ready state reaches server client',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='readyLobby'&&x[3]===true))));
  await page.getByRole('tab',{name:/FRIENDS/}).click();
  await page.getByRole('button',{name:'INVITE'}).click();
  check('friend invite reaches server client',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='inviteLobby'&&x[2]==='Alpha_1'))));
  check('all visible social buttons meet 44px touch floor',await page.evaluate(()=>[...document.querySelectorAll('#socialScr button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)));

  await page.evaluate(async()=>{__socialCaps.chat=false;__socialCaps.presence=false;await MFSocialUI.refresh(true);MFSocialUI.setTab('friends');});
  check('false presence capability shows a reason',await page.getByText('PRESENCE OFF',{exact:true}).isVisible());
  check('false chat capability disables friend Chat',!(await page.getByRole('button',{name:/CHAT/}).isEnabled()));
  await page.getByRole('tab',{name:/CHAT/}).click();
  check('false chat capability renders gated panel',await page.getByText('DIRECT CHAT UNAVAILABLE',{exact:true}).isVisible());
} finally {
  await closePwBrowser();
}

const passed=checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} social UI checks passed`);
if(passed!==checks.length)process.exitCode=1;
process.exit(passed===checks.length?0:1);
