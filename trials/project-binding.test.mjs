import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { build } from '../tools/bundle.mjs';
import { integrity } from '../tools/protocol.mjs';

const writeJSON=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const designer=(id=101,owner='alice',name='transport')=>({schemaVersion:2,role:'designer',repository:{repositoryId:id,owner,name}});
const initialState=role=>role==='designer'?{schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}:{schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null};

async function invokeClaude(project,prompt,environment,log) {
  const args=['-p','--model','sonnet','--setting-sources','project','--strict-mcp-config','--no-chrome','--no-session-persistence','--permission-mode','bypassPermissions','--allowedTools','Bash,Read,Write,Edit,Skill','--verbose','--output-format','stream-json',prompt];
  writeJSON(`${log}.invocation.json`,{executable:environment.DITL_CLAUDE_COMMAND||'claude',args,project});
  await new Promise((resolve,reject)=>{
    const child=spawn(environment.DITL_CLAUDE_COMMAND||'claude',args,{cwd:project,env:environment,windowsHide:true});
    const chunks=[],errors=[];
    child.stdout.on('data',bytes=>{chunks.push(bytes);writeFileSync(log,Buffer.concat(chunks));});
    child.stderr.on('data',bytes=>{errors.push(bytes);writeFileSync(`${log}.stderr.log`,Buffer.concat(errors));});
    child.stdin.end();
    const timeout=setTimeout(()=>{child.kill();reject(Error(`Claude project trial timed out; retained ${log}`));},180000);
    child.on('error',error=>{clearTimeout(timeout);reject(error);});
    child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error(`Claude exited ${code}; retained ${log}`));});
  });
  const events=readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const output=events.findLast(event=>event.type==='result');assert.ok(output,'Claude result is required');
  assert.equal(output.is_error,false,`host error: ${log}`);
  assert.deepEqual(output.permission_denials||[],[],`permission denials: ${log}`);
  assert.ok(Object.keys(output.modelUsage||{}).some(model=>model.includes('sonnet')),'the user requested Sonnet');
}

test('installed Sonnet actions bind projects and reconcile actual local record evidence', {skip:process.env.DITL_PROJECT_TRIAL!=='1',timeout:2400000},async()=>{
  assert.ok(process.env.CLAUDE_CONFIG_DIR,'Reuse the preserved Claude auth home; never reseed or delete it');
  const run=mkdtempSync(join(tmpdir(),'designeritl-project-trial-')), out=join(run,'bundles'), shim=join(run,'shim');
  process.stdout.write(`Retained project trial root: ${run}\n`);mkdirSync(shim);build(out);
  const f=await integrity();
  // Maintainer-only controlled transport. It never forwards mutations or needs credentials.
  const shimJS=`#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2),scenario=JSON.parse(fs.readFileSync(process.env.DITL_PROJECT_SCENARIO,'utf8'));
fs.appendFileSync(scenario.calls,JSON.stringify(args)+'\\n');
const endpoint=args.find(value=>value.startsWith('repos/'));
const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
if(args[0]!=='api'||method!=='GET'||!endpoint){console.error('Fixture refuses unsupported or mutating transport request');process.exit(91);}
if(/^repos\\/[^/]+\\/[^/?]+$/.test(endpoint)){process.stdout.write(JSON.stringify(scenario.observed));process.exit(0);}
if(endpoint.startsWith('repos/'+scenario.observed.owner.login+'/'+scenario.observed.name+'/')&&/\\/(issues|releases|tags)(\\?|$)/.test(endpoint)){process.stdout.write(JSON.stringify(args.includes('--slurp')?[[]]:[]));process.exit(0);}
console.error('Fixture refuses unbound repository endpoint');process.exit(92);
`;
  writeFileSync(join(shim,'gh.cjs'),shimJS);
  writeFileSync(join(shim,'gh'),`#!/bin/sh\nexec node "${join(shim,'gh.cjs').replaceAll('\\','/')}" "$@"\n`,{mode:0o755});
  writeFileSync(join(shim,'gh.cmd'),`@node "${join(shim,'gh.cjs')}" %*\r\n`);
  const cases=['missing','wrong-role','unsupported-config','unsupported-state','project-a','project-b','rename','replacement','recover-before','recover-after','conflict','unsupported-intent'];
  const requested=process.env.DITL_PROJECT_CASE?.split(',');
  const selected=requested?cases.filter(name=>requested.includes(name)):cases;
  assert.ok(selected.length,'Unknown DITL_PROJECT_CASE');
  if(requested) assert.equal(selected.length,requested.length,'Unknown or repeated DITL_PROJECT_CASE');
  const results=[];
  for(const name of selected) {
    const root=join(run,name);mkdirSync(root);mkdirSync(join(root,'.claude','skills'),{recursive:true});
    const config=name==='wrong-role'||name==='project-b'?{schemaVersion:2,role:'developer',repository:{repositoryId:202,owner:'bob',name:'other'},deliveryDestination:'received'}:designer();
    cpSync(join(out,config.role),join(root,'.claude','skills'),{recursive:true});
    if(name==='wrong-role') cpSync(join(out,'designer','send-final'),join(root,'.claude','skills','send-final'),{recursive:true});
    const originalState=initialState(config.role), recordDir=join(root,'.designeritl');
    if(name!=='missing') {mkdirSync(recordDir);writeJSON(join(recordDir,'config.json'),config);writeJSON(join(recordDir,'state.json'),originalState);}
    if(name==='unsupported-config') writeJSON(join(recordDir,'config.json'),{...config,schemaVersion:2});
    if(name==='unsupported-state') writeJSON(join(recordDir,'state.json'),{...originalState,schemaVersion:2});
    let intent=null;
    if(['recover-before','recover-after','conflict','unsupported-intent'].includes(name)) {
      const next={...originalState,versionReservations:[5]};
      intent=f.prepareRecordReplacement(f.readProject(root),'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'versions',kind:'state'});
      if(name==='recover-after') renameSync(join(root,...intent.tempPath.split('/')),join(recordDir,'state.json'));
      if(name==='conflict') writeJSON(join(recordDir,'state.json'),{...originalState,versionReservations:[8]});
      if(name==='unsupported-intent') writeJSON(join(recordDir,'mutation-intent.json'),{...intent,schemaVersion:2});
    }
    const observed=name==='rename'?{id:101,name:'renamed',owner:{login:'alice-new'}}:name==='replacement'?{id:303,name:'transport',owner:{login:'alice'}}:{id:config.repository.repositoryId,name:config.repository.name,owner:{login:config.repository.owner}};
    const calls=join(run,`${name}-gh.jsonl`),scenario=join(run,`${name}-scenario.json`);writeFileSync(calls,'');writeJSON(scenario,{observed,calls});
    const before={config:name!=='missing'?readFileSync(join(recordDir,'config.json')):null,state:name!=='missing'?readFileSync(join(recordDir,'state.json')):null,journal:intent?readFileSync(join(recordDir,'mutation-intent.json')):null};
    const env={...process.env,DITL_PROJECT_SCENARIO:scenario};for(const key of Object.keys(env)) if(key.toLowerCase()==='path') delete env[key];env.PATH=shim+delimiter+process.env.PATH;
    const invocation=name==='wrong-role'?'/send-final':'/inbox';
    const prefix=`node ${JSON.stringify(join(shim,'gh.cjs').replaceAll('\\','/'))}`;
    const prompt=`${invocation}\nExplicitly invoke only this installed skill in the currently opened root. This is the authorized Project-boundary fixture. Follow your own installed Project and Format references, including readProject, bindRepository and unconditional journal reconciliation before any new effect. The controlled transport command prefix for this fixture is exactly: ${prefix}. Wherever the installed protocol says gh, substitute that prefix and append the exact same arguments/repository targeting. The shim is also first on PATH, but native Windows command resolution may prefer the real gh.exe; do not invoke real gh. This maintainer-controlled read-only adapter has no issues/releases and preserves the external transport boundary. Execute the exact installed integrity block preferably through a Node data-module import; if you materialize temporary modules use a unique owned directory and retain every temporary module as trial evidence. No deletion or cleanup commands are requested. Do not access a source checkout or another project's configuration, do not fabricate state, and do not modify protocol files. If a mandatory gate refuses, report the reason and retain all project evidence. The prompt gives no permission to repair incompatible config, identity or conflicting records. If a verified pending replacement can be reconciled by the installed protocol, finish that same replacement and then run this inbox normally. No new work order, prototype, delivery or developer acceptance is requested. For the wrong-role send action, do not select or start an order.\n`;
    const log=join(run,`${name}-host.jsonl`);writeFileSync(join(run,`${name}-prompt.txt`),prompt);
    await invokeClaude(root,prompt,env,log);
    const requests=readFileSync(calls,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
    assert.ok(requests.every(args=>args[0]==='api'&&(!args.includes('--method')||args[args.indexOf('--method')+1]==='GET')),'no remote mutation is permitted');
    if(requests.length) assert.ok(requests[0].includes(`repos/${config.repository.owner}/${config.repository.name}`),'repository binding starts with configured owner/name');
    if(['missing','wrong-role','unsupported-config','unsupported-state','unsupported-intent'].includes(name)) assert.equal(requests.length,0,`${name} must refuse before remote requests`);
    if(name==='missing') assert.equal(existsSync(recordDir),false,'missing project must not be initialized implicitly');
    else if(name.startsWith('recover-')) {
      assert.equal(existsSync(join(recordDir,'mutation-intent.json')),false,'matching pending intent must finish');
      assert.equal(existsSync(join(recordDir,`mutation-${intent.operationId}.completed.json`)),true);
      assert.deepEqual(JSON.parse(readFileSync(join(recordDir,'state.json'))).versionReservations,[5]);
      assert.ok(readFileSync(join(recordDir,'config.json')).equals(before.config));
    } else if(name==='rename') {
      assert.equal(JSON.parse(readFileSync(join(recordDir,'config.json'))).repository.repositoryId,101);
      assert.ok(requests.length>=2,'rename fixture must proceed beyond metadata');
      for(const args of requests.slice(1)) assert.ok(args.some(value=>value.startsWith('repos/alice-new/renamed/')),'renamed transport retains ID and uses canonical name');
    } else {
      assert.ok(readFileSync(join(recordDir,'config.json')).equals(before.config),`${name} config retained`);
      assert.ok(readFileSync(join(recordDir,'state.json')).equals(before.state),`${name} state retained`);
      if(before.journal) assert.ok(readFileSync(join(recordDir,'mutation-intent.json')).equals(before.journal),`${name} intent retained`);
    }
    if(name==='replacement') assert.equal(requests.length,1,'replacement identity stops after repository observation');
    if(name==='project-a'||name==='project-b'||name.startsWith('recover-')) {
      assert.ok(requests.length>=2,'successful inbox must observe repository and list its transport');
      assert.ok(requests.slice(1).every(args=>args.includes('--paginate')&&args.includes('--slurp')),'inbox lists must be complete paginated observations');
      for(const args of requests) assert.ok(args.some(value=>value.startsWith(`repos/${config.repository.owner}/${config.repository.name}`)),'selected roots never cross repositories');
    }
    const result={name,status:'passed',project:root,requests:requests.length,log};results.push(result);writeJSON(join(run,'results.json'),results);process.stdout.write(`${name}: passed\n`);
  }
  writeJSON(join(run,'environment.json'),{os:process.platform,node:process.version,host:'Claude Code',requestedModel:'sonnet',configuration:process.env.CLAUDE_CONFIG_DIR,transport:'controlled read-only gh shim; no real remote mutations',results});
});
