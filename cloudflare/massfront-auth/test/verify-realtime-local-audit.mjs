#!/usr/bin/env node
/* Inspect the REAL SQLite Durable Object files produced by the local workerd
   realtime E2E. Audit rows are deliberately metadata-only: no command, hash,
   chat, credential, session or arbitrary payload column exists. */
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

const argv=process.argv.slice(2),at=argv.indexOf('--persist-to');
const persist=resolve(at>=0&&argv[at+1]?argv[at+1]:'.wrangler/realtime-audit-state');
const dir=join(persist,'v3','do','massfront-auth-MatchRoom');
const files=readdirSync(dir).filter(name=>/^[a-f0-9]{64}\.sqlite$/.test(name));
if(!files.length)throw new Error('no local MatchRoom SQLite databases under '+dir);
const required=['seat_admit','match_start','protocol_reject','rate_reject','state_divergence',
  'seat_disconnect','seat_resume','seat_forfeit','match_end'];
let complete=null,total=0;
for(const name of files){
  const db=new DatabaseSync(join(dir,name),{readOnly:true});
  const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='room_audit'").get();
  if(!table){db.close();continue;}
  const columns=db.prepare("PRAGMA table_info('room_audit')").all().map(row=>row.name);
  const expected=['id','at','event','seat','code','count'];
  if(JSON.stringify(columns)!==JSON.stringify(expected))
    throw new Error(name+' audit columns '+JSON.stringify(columns)+' expected '+JSON.stringify(expected));
  const rows=db.prepare('SELECT event,seat,code,count FROM room_audit ORDER BY id').all();total+=rows.length;
  if(rows.every(row=>typeof row.event==='string'&&typeof row.code==='string'&&
      (row.seat==null||Number.isInteger(row.seat))&&Number.isInteger(row.count))&&
     required.every(event=>rows.some(row=>row.event===event)))complete={name,rows};
  db.close();
}
if(!complete)throw new Error('no MatchRoom audit contained the complete adversarial event set');
const serialized=JSON.stringify(complete.rows);
for(const forbidden of ['payload','command','resumeToken','token_hash','email','message'])
  if(serialized.includes('"'+forbidden+'"'))throw new Error('audit leaked forbidden field '+forbidden);
console.log('PASS realtime MatchRoom SQLite audit: '+complete.rows.length+
  ' metadata-only rows, all '+required.length+' required event classes, '+total+' rows across '+files.length+' rooms');
