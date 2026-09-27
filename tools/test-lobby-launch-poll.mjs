#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../src/socialui.js',import.meta.url),'utf8');
const poll=source.match(/^  async function pollLobbyLaunch\(\)\{[^]*?^  \}/m);
assert.ok(poll,'missing lobby launch poll');
const S={session:'session:1',epoch:1,lobbyBusy:false,busy:false,launchReceipt:null,preparedMatch:null,
  lobbyCompatibility:null,caps:{matchLaunch:true,realtimeMatch:true},
  lobby:{id:'lobby1',revision:7,rules:{mode:'coop',slots:2},members:[
    {self:true,ready:true,compatible:false,compatibilityRevision:7},
    {self:false,ready:true,compatible:true,compatibilityRevision:7}]}};
let now=1000,requests=0,accepted=0,resolveNext=null,response={ok:true,lobby:S.lobby};
const context=createContext({S,lobbyPollBusy:false,lobbyPollLastAt:0,Date:{now:()=>now},
  document:{visibilityState:'visible'},transportReason:()=>'',signedIn:()=>true,
  socialCall:async(method,id)=>{assert.equal(method,'getLobby');assert.equal(id,'lobby1');requests++;
    return resolveNext?new Promise(resolve=>{resolveNext=resolve;}):response;},
  acceptLaunchedMatch:async()=>{accepted++;},adoptLobby:next=>{S.lobby=next;},render:()=>{}});
runInContext(poll[0],context);

await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,1,'cached incompatible member must not block server discovery');
now=1800;await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,1,'ready lobby poll is rate limited');
now=2501;response={ok:true,match:{id:'match1',lobbyId:'lobby1'}};
await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,2);assert.equal(accepted,1,'guest observes host launch from server');

S.lobby.members[0].ready=false;S.lobbyCompatibility=null;context.lobbyPollLastAt=0;
now=3000;response={ok:true,lobby:S.lobby};await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,3);
now=4500;await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,3,'unready lobby uses conservative polling interval');
now=9001;await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,4);

now=16000;resolveNext=true;
const pending=runInContext('pollLobbyLaunch()',context);
now=18000;await runInContext('pollLobbyLaunch()',context);
assert.equal(requests,5,'busy poll does not overlap another request');
S.lobby={...S.lobby,revision:8};resolveNext({ok:true,match:{id:'old-match',lobbyId:'lobby1'}});
await pending;
assert.equal(accepted,1,'stale lobby revision cannot claim a match');
const clear=source.match(/^  function clearFinishedMatch\(\)\{[^]*?^  \}/m);
assert.ok(clear,'missing finished-match cleanup');runInContext(clear[0],context);
S.launchReceipt={matchId:'match1'};S.preparedMatch={id:'match1'};S.friends=[{username:'friend'}];S.messages=[{body:'hello'}];
assert.equal(runInContext('clearFinishedMatch()',context),true);
assert.equal(S.lobby,null);assert.equal(S.launchReceipt,null);assert.equal(S.preparedMatch,null);
assert.equal(S.friends[0].username,'friend');assert.equal(S.messages[0].body,'hello');
assert.equal(context.lobbyPollLastAt,0);
S.lobby={id:'lobby1',revision:9,rules:{mode:'coop',slots:2},members:[{self:true,ready:true}]};
resolveNext=null;response={ok:true,match:{id:'match2',lobbyId:'lobby1'}};now=20000;
await runInContext('pollLobbyLaunch()',context);
assert.equal(accepted,2,'a second lobby can launch after explicit cleanup');
console.log('PASS lobby launch polling: stale cache cannot deadlock discovery; rate/revision guards and repeat-lobby cleanup hold');
