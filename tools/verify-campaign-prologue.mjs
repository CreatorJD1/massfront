#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const [story,meta,main]=await Promise.all([
  readFile(resolve(root,'src/story.js'),'utf8'),
  readFile(resolve(root,'src/game/meta.js'),'utf8'),
  readFile(resolve(root,'src/main.js'),'utf8'),
]);

const checks=[];
function check(label,test){
  assert.ok(test,label);
  checks.push(label);
  console.log('PASS '+label);
}

const campaignCard=meta.match(/\{id:'campaign',[\s\S]*?\},\r?\n\s*\{id:'mmo'/)?.[0]||'';
const ensureBody=story.match(/function storyCampaignEnsureOps\(\)\{([\s\S]*?)\n\}/)?.[1]||'';
const openBody=story.match(/function storyCampaignOpenMission\(missionId\)\{([\s\S]*?)\n\}/)?.[1]||'';

for(const id of ['orientation','mosswatch-breach','first-breach','coalition-intercept','ground-remembers'])
  check('authored mission exists: '+id,story.includes("id:'"+id+"'"));
check('Campaign War Room card is playable',campaignCard.length>0&&!/locked:/.test(campaignCard));
check('Campaign card states the bounded Prologue scope',campaignCard.includes('5-mission playable Prologue'));
check('Operations injects the Campaign tab',ensureBody.includes("tab.id='opsTab-campaign'"));
check('Operations Campaign injection has no early lock return',!/^\s*return\s*;/m.test(ensureBody.split("const root=")[0]||''));
check('mission launcher resolves a real authored mission',openBody.includes('STORY_CAMPAIGN_PROLOGUE.findIndex'));
check('mission launcher no longer denies Campaign',!openBody.includes('CAMPAIGN is not available yet'));
check('War Room routes Campaign to Operations',meta.includes("MF_TAB_STATE.opsScr='campaign'"));
check('Operations primary action launches the selected mission',main.includes("storyCampaignStartNext==='function'"));
check('Battle Setup recognizes a valid authored mission',main.includes("const campaignMission=activeWarMode==='campaign'"));
check('authored missions bypass Standard conquest locks only while active',main.includes('weeklyMode!==\'undefined\'&&weeklyMode)||campaignMission'));

console.log('\nverify-campaign-prologue: '+checks.length+' PASS');
