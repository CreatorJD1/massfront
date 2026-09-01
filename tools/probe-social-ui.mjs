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
    window.__socialUsername='Tester_1';
    window.__socialCaps={handshake:true,friends:true,blocking:true,reporting:true,chat:true,worldChat:true,presence:true,onlineCount:true,lobbies:false,invites:false,realtimeMatch:false,multiplayer:false};
    window.__testLobby=null;
    window.MFSocial={
      signedIn:()=>true,
      identity:()=>({username:__socialUsername,hasUsername:/^[a-z0-9_]{3,16}$/i.test(__socialUsername)}),
      claimUsername:async username=>{__socialCalls.push(['claimUsername',username]);__socialUsername=username;return {ok:true,username};},
      capabilities:()=>({...__socialCaps}),
      handshake:async()=>({ok:true,capabilities:{...__socialCaps}}),
      friends:async()=>({ok:true,friends:[{username:'Alpha_1'}],incoming:[{id:'7',username:'Bravo_2'}]}),
      presence:async()=>({ok:true,friends:[{username:'Alpha_1',state:'online'}]}),
      request:async username=>{__socialCalls.push(['request',username]);return {ok:true};},
      respond:async(id,accept)=>{__socialCalls.push(['respond',id,accept]);return {ok:true};},
      block:async username=>{__socialCalls.push(['block',username]);return {ok:true};},
      setPresence:async state=>{__socialCalls.push(['presence',state]);return {ok:true,state};},
      onlineHeartbeat:async()=>{__socialCalls.push(['onlineHeartbeat']);return {ok:true,count:7,ttlMs:120000,expiresAt:Date.now()+120000};},
      messages:async username=>({ok:true,messages:[{id:1,from:username,to:'Tester_1',body:'Ready for deployment?',at:1,mine:false}]}),
      sendMessage:async(username,body)=>{__socialCalls.push(['send',username,body]);return {ok:true,message:{id:2,from:'Tester_1',to:username,body,at:2,mine:true}};},
      worldMessages:async()=>({ok:true,messages:[{id:2,username:'Alpha_1',body:'Co-op lobby ready.',at:2,self:false,friend:true},{id:1,username:'Rival_3',body:'Anyone online?',at:1,self:false,friend:false}]}),
      sendWorldMessage:async body=>{__socialCalls.push(['worldSend',body]);return {ok:true,message:{id:3,username:'Tester_1',body,at:3,self:true,friend:false}};},
      reportWorldMessage:async(id,reason)=>{__socialCalls.push(['worldReport',id,reason]);return {ok:true};},
      lobbyInvites:async()=>({ok:true,invites:[{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',lobbyId:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',code:'A1B2C3D4',from:'Bravo_2',expiresAt:Date.now()+60000}]}),
      createLobby:async rules=>{__socialCalls.push(['createLobby',rules]);__testLobby={id:'cccccccccccccccccccccccccccccccc',code:'DEADBEEF',revision:1,rules:{...rules},members:[{username:'Tester_1',host:true,self:true,ready:false}]};return {ok:true,lobby:__testLobby};},
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
  check('aggregate online count is visible',await page.getByText('PLAYERS ONLINE',{exact:true}).isVisible()&&await page.locator('#socialOnlineCount').textContent()==='7');
  check('aggregate card states its privacy boundary',await page.getByText('Global total · named cards use only friends, your lobby and recent World Chat',{exact:true}).isVisible());
  check('named online commander comes only from friend presence',await page.getByText('FRIEND · ONLINE',{exact:true}).isVisible());
  check('cloud commander identity renders as a visual profile card',await page.getByText('YOUR CLOUD COMMANDER ID',{exact:true}).isVisible()&&await page.locator('.socialVisualHero .socialAvatar').count()>0);
  await page.screenshot({path:resolve(root,'tmp','social-ui-overhaul-probe.png'),fullPage:true});
  const liveCalls=await page.evaluate(()=>__socialCalls.filter(x=>x[0]==='onlineHeartbeat').length);
  await page.evaluate(async()=>{showFrontScreen('startScreen');await MFSocialUI.refreshOnline();});
  check('online polling pauses when Social screen is hidden',await page.evaluate(n=>__socialCalls.filter(x=>x[0]==='onlineHeartbeat').length===n,liveCalls));
  await page.evaluate(async()=>{showFrontScreen('socialScr');await MFSocialUI.refreshOnline();});
  check('online polling resumes while Social screen is visible',await page.evaluate(n=>__socialCalls.filter(x=>x[0]==='onlineHeartbeat').length===n+1,liveCalls));
  check('accepted friend has Chat',await page.getByRole('button',{name:'CHAT'}).isEnabled());
  const invite=page.locator('#socialPaneFriends .socialPerson').filter({hasText:'Alpha_1'}).getByRole('button',{name:/INVITE/});
  check('Invite remains disabled without multiplayer transport',!(await invite.isEnabled()));

  await page.getByRole('tab',{name:/WORLD/}).click();
  check('World Chat renders visible public usernames',await page.locator('#socialPaneWorld').getByText('Alpha_1',{exact:true}).isVisible()&&await page.locator('#socialPaneWorld').getByText('Rival_3',{exact:true}).isVisible());
  const allyCard=page.locator('.socialWorldMessage').filter({hasText:'Alpha_1'}),rivalCard=page.locator('.socialWorldMessage').filter({hasText:'Rival_3'});
  check('accepted World Chat friend can be privately messaged',await allyCard.getByRole('button',{name:'PRIVATE MESSAGE'}).isEnabled());
  check('non-friend private message explains and stays disabled',!(await rivalCard.getByRole('button',{name:/PRIVATE MESSAGE/}).isEnabled()));
  await allyCard.getByRole('button',{name:'VIEW'}).click();
  check('View exposes privacy-safe player summary',await page.getByText('PLAYER PROFILE · Alpha_1',{exact:true}).isVisible()&&await page.getByText(/Private account details and last-seen are never shown/).isVisible());
  await allyCard.getByRole('button',{name:'PRIVATE MESSAGE'}).click();

  await page.waitForTimeout(20);
  check('real message thread loads',await page.getByText('Ready for deployment?').isVisible());
  await page.getByLabel('Direct message').fill('Moving now.');
  await page.getByRole('button',{name:'SEND'}).click();
  await page.waitForTimeout(20);
  check('chat send uses selected friend',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='send'&&x[1]==='Alpha_1'&&x[2]==='Moving now.'))));

  await page.getByRole('tab',{name:/WORLD/}).click();
  await page.locator('.socialWorldMessage').filter({hasText:'Rival_3'}).getByRole('button',{name:'ADD FRIEND'}).click();
  check('World Chat Add Friend uses exact visible username',await page.evaluate(()=>__socialCalls.some(x=>x[0]==='request'&&x[1]==='Rival_3')));
  page.once('dialog',d=>d.accept('Spam in public channel'));
  await page.locator('.socialWorldMessage').filter({hasText:'Rival_3'}).getByRole('button',{name:'REPORT'}).click();
  check('World Chat report is message-specific',await page.evaluate(()=>__socialCalls.some(x=>x[0]==='worldReport'&&x[1]===1&&x[2]==='Spam in public channel')));

  await page.getByRole('tab',{name:/LOBBY/}).click();
  check('disabled server capability is honest',await page.getByText('PLAYER LOBBIES UNAVAILABLE',{exact:true}).isVisible());

  await page.evaluate(async()=>{__socialCaps.lobbies=true;__socialCaps.invites=true;await MFSocialUI.refresh(true);MFSocialUI.setTab('lobby');});
  check('enabled server exposes Create Lobby',await page.getByRole('button',{name:/CREATE LOBBY/}).isEnabled());
  check('incoming lobby invitation is visible',(await page.locator('#socialPaneLobby').getByText(/A1B2C3D4/).count())>0);
  check('Co-op UI offers two through four human slots',await page.getByLabel('Lobby player slots').locator('option').evaluateAll(os=>os.map(o=>o.value).join(',')==='2,3,4'));
  await page.getByLabel('Lobby mode').selectOption('skirmish');
  check('Skirmish UI offers only two players',await page.getByLabel('Lobby player slots').locator('option').evaluateAll(os=>os.map(o=>o.value).join(',')==='2'));
  await page.evaluate(()=>{MFSocialUI.state.lobbyDraft.slots=4;});
  await page.getByRole('button',{name:/CREATE LOBBY/}).click();
  await page.waitForTimeout(20);
  check('Skirmish submission clamps tampered draft to two players',await page.evaluate(()=>__socialCalls.some(x=>x[0]==='createLobby'&&x[1].mode==='skirmish'&&x[1].slots===2)));
  check('created lobby code is rendered',(await page.locator('#socialPaneLobby').getByText(/DEADBEEF/).count())>0);
  check('lobby keeps match relay locked',await page.getByText('MATCH RELAY NOT CONNECTED',{exact:true}).isVisible());
  await page.getByRole('button',{name:'READY',exact:true}).click();
  await page.waitForTimeout(20);
  check('ready state reaches server client',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='readyLobby'&&x[3]===true))));
  await page.getByRole('tab',{name:/FRIENDS/}).click();
  await page.locator('#socialPaneFriends .socialPerson').filter({hasText:'Alpha_1'}).getByRole('button',{name:'INVITE'}).click();
  check('friend invite reaches server client',(await page.evaluate(()=>__socialCalls.some(x=>x[0]==='inviteLobby'&&x[2]==='Alpha_1'))));
  check('all visible social buttons meet 44px touch floor',await page.evaluate(()=>[...document.querySelectorAll('#socialScr button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)));

  await page.evaluate(async()=>{__socialCaps.chat=false;__socialCaps.presence=false;await MFSocialUI.refresh(true);MFSocialUI.setTab('friends');});
  check('false presence capability shows a reason',await page.getByText('PRESENCE OFF',{exact:true}).isVisible());
  check('false chat capability disables friend Chat',!(await page.getByRole('button',{name:/CHAT/}).isEnabled()));
  await page.getByRole('tab',{name:/CHAT/}).click();
  check('false chat capability renders gated panel',await page.getByText('DIRECT CHAT UNAVAILABLE',{exact:true}).isVisible());

  await page.evaluate(async()=>{__socialUsername='';MFSocialUI.setTab('friends');await MFSocialUI.refresh(true);});
  const chooser=page.locator('#socialPaneFriends');
  check('username-less account is routed to one-time visual chooser',await chooser.getByText('ONE-TIME ACCOUNT SETUP',{exact:true}).isVisible()&&await chooser.getByLabel('Choose commander username').isVisible());
  await chooser.getByLabel('Choose commander username').fill('Fixed_9');
  await chooser.getByRole('button',{name:'SAVE COMMANDER ID'}).click();
  await page.waitForTimeout(30);
  check('one-time chooser persists through canonical client contract',await page.evaluate(()=>__socialUsername==='Fixed_9'&&__socialCalls.some(x=>x[0]==='claimUsername'&&x[1]==='Fixed_9'))&&await chooser.getByText('Fixed_9',{exact:true}).isVisible());
} finally {
  await closePwBrowser();
}

const passed=checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} social UI checks passed`);
if(passed!==checks.length)process.exitCode=1;
process.exit(passed===checks.length?0:1);
