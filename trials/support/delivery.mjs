import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../tools/bundle.mjs';
import { integrity } from '../../tools/protocol.mjs';
import {verifyRoleInstallation} from './product.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
function command(binary,args,options={}) {
  const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,...options});
  if(result.status!==0) throw Error(`${binary} failed (${result.status}): ${result.stderr||result.error}`);
  return result.stdout.trim();
}
const gh=(...args)=>command('gh',args);
const json=(...args)=>JSON.parse(gh(...args));
const writeJSON=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function runCodex(project,home,prompt,log) {
  const launcher=command('powershell.exe',['-NoProfile','-Command','(Get-Command codex).Source']);
  const script=process.env.DITL_CODEX_ENTRY || join(dirname(launcher),'node_modules','@openai','codex','bin','codex.js');
  const args=[script,'exec','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--ephemeral','--json','-s','danger-full-access','-c','approval_policy="never"','-C',project,'-'];
  await new Promise((resolve,reject)=> {
    const child=spawn(process.execPath,args,{cwd:project,env:{...process.env,CODEX_HOME:home,HOME:dirname(home),USERPROFILE:dirname(home)},windowsHide:true});
    writeFileSync(log,'');
    child.stdout.on('data',data=>appendFileSync(log,data)); child.stderr.on('data',data=>appendFileSync(log,data));
    const timer=setTimeout(()=>{command('taskkill',['/pid',String(child.pid),'/T','/F']);reject(Error(`Codex timeout; see retained ${log}`));},840000);
    child.on('error',error=>{clearTimeout(timer);reject(error);}); child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`Codex exited ${code}; see retained ${log}`));});
    child.stdin.end(prompt);
  });
}

export async function runFinalDeliveryTrial({unchecked=false}={}) {
  assert.ok(process.env.DITL_PLAYWRIGHT_MODULE,'Set DITL_PLAYWRIGHT_MODULE before the real trial');
  const run=mkdtempSync(join(tmpdir(),'designeritl-live-'));
  process.stdout.write(`Retained trial root: ${run}\n`);
  const designer=join(run,'designer'), developer=join(run,'developer'), home=join(run,'codex-home'), out=join(run,'bundles');
  for(const path of [designer,developer,home]) mkdirSync(path);
  // Retain refreshed credentials in isolated home; never print or commit them.
  const originalHome=process.env.CODEX_HOME || join(process.env.USERPROFILE,'.codex');
  assert.ok(existsSync(join(originalHome,'auth.json')),'Codex file auth is required for isolated trial');
  cpSync(join(originalHome,'auth.json'),join(home,'auth.json'));
  build(out);
  for(const [role,path] of [['designer',designer],['developer',developer]]) {
    for(const host of ['.agents','.claude']) {mkdirSync(join(path,host,'skills'),{recursive:true});cpSync(join(out,role),join(path,host,'skills'),{recursive:true});}
    mkdirSync(join(path,'.designeritl'));
  }
  const owner=json('api','user').login, name=`designeritl-fixture-${Date.now()}-${randomUUID().slice(0,6)}`, repository=`${owner}/${name}`;
  gh('repo','create',repository,'--private','--add-readme','--description','Dedicated retained DesignerITL ticket 01 fixture; no product code');
  const remote=json('api',`repos/${repository}`);
  writeJSON(join(run,'environment.json'),{run,repository,repositoryId:remote.id,os:process.platform,osVersion:command('powershell.exe',['-NoProfile','-Command','[Environment]::OSVersion.VersionString']),node:process.version,git:command('git',['--version']),gh:command('gh',['--version']),codex:command('powershell.exe',['-NoProfile','-Command','codex --version']),trial:'captured final delivery and verified reception',limits:{entries:5000,totalBytes:536870912,entryBytes:268435456,ratio:100}});
  const repositoryConfig={repositoryId:remote.id,owner,name};
  writeJSON(join(designer,'.designeritl','config.json'),{schemaVersion:2,role:'designer',repository:repositoryConfig});
  writeJSON(join(developer,'.designeritl','config.json'),{schemaVersion:2,role:'developer',repository:repositoryConfig,deliveryDestination:'received'});
  const body=`# Goal\nShow an interactive portable design reference.\n\n- [ ] 1. Show Ready for design, a local image, and a Show details button opening Details opened.\n\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId:randomUUID(),followsOrderNumber:null,cancelsOrderNumber:null})}\n\`\`\`\n`;
  writeFileSync(join(run,'order-body.md'),body);
  const issueUrl=gh('issue','create','--repo',repository,'--title','Portable heading and details','--body-file',join(run,'order-body.md'));
  const number=Number(issueUrl.split('/').at(-1)), activationId=randomUUID();
  mkdirSync(join(designer,'orders'));
  const scope={orderId:{repositoryId:remote.id,issueNumber:number},originalBody:body,originalBodySha256:sha(Buffer.from(body)),goal:'Show an interactive portable design reference.',tasks:[{ordinal:1,text:'Show Ready for design, a local image, and a Show details button opening Details opened.'}],startedAt:new Date().toISOString()};
  writeFileSync(join(designer,'orders',`${number}.md`),`# Agreed scope\n\n\`\`\`designeritl-scope\n${JSON.stringify(scope)}\n\`\`\`\n\n# Local progress\n\n- [${unchecked?' ':'x'}] 1. Show Ready for design, a local image, and a Show details button opening Details opened.\n\n# Task context\nThe selected version implements the complete fixture task.\n`);
  writeJSON(join(designer,'.designeritl','state.json'),{schemaVersion:1,assignment:{orderId:scope.orderId,activationId},startedOrders:{[number]:{path:`orders/${number}.md`}},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null});
  writeJSON(join(developer,'.designeritl','state.json'),{schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null});
  const version=join(designer,'versions','design.v1'); mkdirSync(join(version,'assets'),{recursive:true});
  writeFileSync(join(version,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><title>Portable fixture</title></head><body><h1>Ready for design</h1><img src="assets/mark.svg" alt="Local mark"><button>Show details</button><output>Closed</output><script>document.querySelector("button").addEventListener("click",()=>document.querySelector("output").textContent="Details opened");</script></body></html>');
  writeFileSync(join(version,'assets','mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>');
  const f=await integrity(), initialInventory=f.inventory(version), before=readFileSync(join(designer,'orders',`${number}.md`)), browserProbe=join(source,'tools','browser-probe.mjs');
  const working=join(designer,'versions/design.current.v2');mkdirSync(join(working,'assets'),{recursive:true});writeFileSync(join(working,'index.html'),'<!doctype html><h1>Different working design</h1>');
  const installations=[...verifyRoleInstallation(designer,join(out,'designer'),'designer',f),...verifyRoleInstallation(developer,join(out,'developer'),'developer',f)];
  const sendPrompt=`$send-final\nExplicitly invoke installed send-final for order ${number} and older v1. Working v2 remains selected. This is an authorized dedicated private transport fixture. Use only the invoked skill's installed references and exact named-block loader. Read actual captured files. For direct-file portability run node ${JSON.stringify(browserProbe)} CAPTURE_ROOT RAW_OUTPUT_JSON, then bind its actual observations through the installed portability helpers after full source inspection. No unrelated changes or work in progress. Reassess the complete saved agreement against v1. ${unchecked?'I explicitly acknowledge task 1 remaining locally unchecked although fulfilled, and authorize final delivery with delivered unchecked ordinal [1] without changing any local ticks.':'All agreed tasks are locally checked; I authorize final delivery if the actual captured version fulfills them.'} Publish and verify exact saved bytes, close the order as completed and preserve v2 and local checklist bytes. Retain all modules and diagnostic files outside prototype/capture roots.`;
  writeFileSync(join(run,'designer-prompt.txt'),sendPrompt);
  await runCodex(designer,home,sendPrompt,join(run,'designer-host.jsonl'));
  const releases=json('api',`repos/${repository}/releases?per_page=100`);
  assert.equal(releases.length,1); const release=releases[0]; assert.equal(release.draft,false); assert.equal(release.tag_name,`order-${number}/final`);
  const matches=[...release.body.matchAll(/```designeritl-delivery\s*\n([\s\S]*?)\n```/g)]; assert.equal(matches.length,1);
  const descriptor=JSON.parse(matches[0][1]);
  assert.equal(descriptor.repositoryId,remote.id); assert.equal(descriptor.orderNumber,number);
  const download=join(run,'independent-download');mkdirSync(download);
  gh('release','download',release.tag_name,'--repo',repository,'--pattern','delivery.zip','--dir',download);
  const zip=readFileSync(join(download,'delivery.zip')), verified=f.verifyDelivery(zip,descriptor);
  assert.deepEqual(verified.manifest.deliveredUncheckedOrdinals,unchecked?[1]:[]);
  assert.equal(json('api',`repos/${repository}/issues/${number}`).state_reason,'completed');
  assert.equal(JSON.parse(readFileSync(join(designer,'.designeritl','state.json'))).assignment,null);
  assert.deepEqual(f.inventory(version),initialInventory);
  assert.ok(before.equals(readFileSync(join(designer,'orders',`${number}.md`))));
  assert.deepEqual(readdirSync(join(designer,'versions')).sort(),['design.current.v2','design.v1']);
  const inboxPrompt='$inbox\nExplicitly invoke the installed role-aware inbox for this opened developer project and download/verify each published delivery. Preserve history, use only your own installed references and canonical format snippet. This is an authorized dedicated private fixture; autonomously complete reception. Record receipts only after actual installed-tree verification. Do not claim developer acceptance.';
  writeFileSync(join(run,'developer-prompt.txt'),inboxPrompt);
  await runCodex(developer,home,inboxPrompt,join(run,'developer-host.jsonl'));
  const installed=join(developer,'received',`order-${number}`,descriptor.deliveryId), installedVersion=join(installed,verified.manifest.capturedFolder);
  assert.deepEqual(f.inventory(installedVersion).files,verified.manifest.inventory);
  assert.equal(sha(readFileSync(join(installed,'manifest.json'))),descriptor.manifestSha256);
  const developerState=JSON.parse(readFileSync(join(developer,'.designeritl','state.json')));
  const receipts=Object.values(developerState.completedDownloadReceipts);assert.equal(receipts.length,1);
  assert.equal(receipts[0].deliveryId,descriptor.deliveryId);assert.equal(receipts[0].zipSha256,descriptor.zipSha256);
  assert.equal(receipts[0].releaseId,release.id); assert.equal(receipts[0].assetId,release.assets[0].id);
  assert.equal(receipts[0].manifestSha256,descriptor.manifestSha256); assert.equal(receipts[0].inventorySha256,verified.manifest.payloadSha256);
  command(process.execPath,[browserProbe,installedVersion,join(run,'installed-browser-evidence.json')]);
  const result={result:'passed',repository,releaseId:release.id,assetIds:release.assets.map(a=>a.id),descriptor,installed,manifest:verified.manifest,installations};writeJSON(join(run,'result.json'),result);return result;
}
