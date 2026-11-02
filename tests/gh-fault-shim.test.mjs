import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('transport fault shim distinguishes a request never sent from a lost successful response', () => {
  const root=mkdtempSync(join(tmpdir(),'ditl-gh-shim-')), effect=join(root,'remote-effects.txt'), real=join(root,'fake-gh.mjs'), config=join(root,'fault.json');
  writeFileSync(real,`import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(effect)},'created\\n'); process.stdout.write('REMOTE_ID_17');`);
  const seed=mode=>writeFileSync(config,JSON.stringify({schemaVersion:1,repository:'fixture/transport',realGh:process.execPath,realArgs:[real],log:join(root,'observations.jsonl'),faults:[{id:'create',operation:'draft.create',mode,remaining:1,barrier:true}]}));
  const invoke=()=>spawnSync(process.execPath,['tools/gh-fault-shim.mjs','release','create','order-1/final','--repo','fixture/transport','--draft'],{cwd:new URL('..',import.meta.url),env:{...process.env,DITL_GH_FAULT_CONFIG:config},encoding:'utf8'});
  seed('before'); let result=invoke(); assert.equal(result.status,72); assert.equal(result.stdout,'');
  assert.throws(()=>readFileSync(effect));
  seed('after'); result=invoke(); assert.equal(result.status,73); assert.equal(result.stdout,'');
  assert.equal(readFileSync(effect,'utf8'),'created\n');
  result=invoke(); assert.equal(result.status,74); assert.equal(readFileSync(effect,'utf8'),'created\n');
  const state=JSON.parse(readFileSync(config)); state.blocked=false; writeFileSync(config,JSON.stringify(state));
  result=invoke(); assert.equal(result.status,0); assert.equal(result.stdout,'REMOTE_ID_17');
  assert.equal(readFileSync(effect,'utf8'),'created\ncreated\n');
  const observations=readFileSync(join(root,'observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(observations.some(x=>x.fault==='create'&&x.forwarded===false));
  assert.ok(observations.some(x=>x.fault==='create'&&x.forwarded===true&&x.remoteExit===0));
});
