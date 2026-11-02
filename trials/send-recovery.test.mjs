import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../tools/bundle.mjs';
import { integrity } from '../tools/protocol.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const writeJSON=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function command(binary,args,options={}) {
  const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,...options});
  if(result.status!==0) throw Error(`${binary} failed (${result.status}): ${result.stderr||result.error}`);
  return result.stdout.trim();
}
function killTree(pid) {
  if(process.platform==='win32') spawnSync('taskkill',['/pid',String(pid),'/T','/F'],{windowsHide:true});
  else try {process.kill(-pid,'SIGKILL');} catch {try {process.kill(pid,'SIGKILL');} catch {}}
}
async function host(project,prompt,log,env,holdConfig=null) {
  const binary=process.env.DITL_CLAUDE_COMMAND||'claude';
  const args=['-p','--model','sonnet','--setting-sources','project','--strict-mcp-config','--no-chrome','--no-session-persistence','--allowedTools','Read,Write,Edit,Bash,Skill,Glob,Grep','--permission-mode','dontAsk','--output-format','stream-json','--verbose',prompt];
  writeJSON(log+'.command.json',{binary,args,cwd:project,configDir:env.CLAUDE_CONFIG_DIR}); writeFileSync(log,''); writeFileSync(log+'.stderr.log','');
  return new Promise((resolve,reject)=> {
    const child=spawn(binary,args,{cwd:project,env:{...process.env,...env},windowsHide:true,detached:process.platform!=='win32'});
    let killedAtBoundary=false;
    child.stdin.end();
    child.stdout.on('data',data=>appendFileSync(log,data)); child.stderr.on('data',data=>appendFileSync(log+'.stderr.log',data));
    const timer=setTimeout(()=>{killTree(child.pid);reject(Error(`Host timeout; retained ${log}`));},600000);
    const monitor=holdConfig?setInterval(()=> {
      try {if(readJSON(holdConfig).holdingFault) {killedAtBoundary=true;killTree(child.pid);}} catch {}
    },100):null;
    child.on('error',error=>{clearTimeout(timer);clearInterval(monitor);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);clearInterval(monitor);
      if(killedAtBoundary) return resolve({code,killedAtBoundary});
      const result=readFileSync(log,'utf8').trim().split('\n').flatMap(line=>{try {return [JSON.parse(line)];} catch {return [];}}).findLast(event=>event.type==='result');
      if(code!==0||!result||result.is_error) return reject(Error(`Host failed (${code}); retained ${log}`));
      resolve({code,killedAtBoundary,result});
    });
  });
}

test('installed Sonnet send resumes one captured delivery across real transport failures and host interruption', {skip:process.env.DITL_LIVE_RECOVERY!=='1',timeout:7200000},async()=> {
  assert.ok(process.env.CLAUDE_CONFIG_DIR&&existsSync(join(process.env.CLAUDE_CONFIG_DIR,'.credentials.json')),'Reuse the preserved authenticated Claude config; never reseed it');
  assert.ok(process.env.DITL_PLAYWRIGHT_MODULE,'Set the installed browser module for captured-file verification');
  const run=mkdtempSync(join(tmpdir(),'designeritl-recovery-')); process.stdout.write(`Retained recovery trial: ${run}\n`);
  const f=await integrity(), ghPath=process.env.DITL_REAL_GH||command('powershell.exe',['-NoProfile','-Command','(Get-Command gh).Source']);
  const gh=(...args)=>command(ghPath,args), ghJSON=(...args)=>JSON.parse(gh(...args));
  const pages=endpoint=>ghJSON('api','--paginate','--slurp',endpoint).flat();
  const owner=ghJSON('api','user').login, name=`designeritl-recovery-${Date.now()}-${randomUUID().slice(0,6)}`, repository=`${owner}/${name}`;
  gh('repo','create',repository,'--private','--add-readme','--description','Dedicated retained DesignerITL recovery trial');
  const remote=ghJSON('api',`repos/${repository}`), project=join(run,'designer'), out=join(run,'bundles'), shim=join(run,'transport');
  for(const path of [project,out,shim,join(project,'.designeritl'),join(project,'orders')]) mkdirSync(path,{recursive:true});
  build(out); mkdirSync(join(project,'.claude','skills'),{recursive:true}); cpSync(join(out,'designer'),join(project,'.claude','skills'),{recursive:true});
  writeJSON(join(project,'.designeritl','config.json'),{schemaVersion:2,role:'designer',repository:{repositoryId:remote.id,owner,name}});
  const body=`# Goal\nShow an interactive portable design reference.\n\n- [ ] 1. Show Ready for design, a local image, and a Show details button opening Details opened.\n\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId:randomUUID(),followsOrderNumber:null,cancelsOrderNumber:null})}\n\`\`\`\n`;
  writeFileSync(join(run,'order-body.md'),body); const issueUrl=gh('issue','create','--repo',repository,'--title','Recovery captured reference','--body-file',join(run,'order-body.md')), number=Number(issueUrl.split('/').at(-1));
  const orderId={repositoryId:remote.id,issueNumber:number}, activationId=randomUUID(), deliveryId=randomUUID(), pending=join(project,'.designeritl','pending',deliveryId), version=join(project,'versions','design.current.v1'), snapshot=join(pending,'snapshot','design.current.v1');
  const scope={orderId,originalBody:body,originalBodySha256:hash(Buffer.from(body)),goal:'Show an interactive portable design reference.',tasks:[{ordinal:1,text:'Show Ready for design, a local image, and a Show details button opening Details opened.'}],startedAt:new Date().toISOString()};
  writeFileSync(join(project,'orders',`${number}.md`),`# Agreed scope\n\n\`\`\`designeritl-scope\n${JSON.stringify(scope)}\n\`\`\`\n\n# Local progress\n\n- [x] 1. ${scope.tasks[0].text}\n\n# Task context\nA coherent capture is already packaged.\n`);
  const state={schemaVersion:1,assignment:{orderId,activationId},startedOrders:{[number]:{path:`orders/${number}.md`}},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[deliveryId],localMutationIntent:null};
  writeJSON(join(project,'.designeritl','state.json'),state);
  mkdirSync(join(version,'assets'),{recursive:true}); mkdirSync(join(pending,'snapshot'),{recursive:true}); mkdirSync(join(pending,'evidence'));
  writeFileSync(join(version,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><title>Portable fixture</title></head><body><h1>Ready for design</h1><img src="assets/mark.svg" alt="Local mark"><button>Show details</button><output>Closed</output><script>document.querySelector("button").addEventListener("click",()=>document.querySelector("output").textContent="Details opened");</script></body></html>');
  writeFileSync(join(version,'assets','mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>');
  const captured=f.capturePrototype(version,snapshot), capturedAt=new Date().toISOString();
  command(process.execPath,[join(source,'tools','browser-probe.mjs'),snapshot,join(run,'captured-browser-evidence.json')]);
  if(existsSync(join(source,'tools','portability.mjs'))) {
    const {portability}=await import('../tools/portability.mjs'), p=await portability(), inspected=p.inspectPortability(snapshot,f), raw=readJSON(join(run,'captured-browser-evidence.json'));
    for(const path of inspected.inspectedFiles) readFileSync(join(snapshot,...path.split('/')),'utf8');
    const runtime={schemaVersion:1,payloadSha256:captured.payloadSha256,finalPayloadSha256:f.inventory(snapshot).payloadSha256,directFile:true,networkObservation:true,browser:{name:'Edge/Chromium',version:raw.browserVersion},observationEvidence:join(run,'captured-browser-evidence.json'),requestedStates:['initial','details'],exercisedStates:['initial','details'],reviewedFiles:inspected.inspectedFiles,dynamicResolutions:[],requests:raw.requests,failures:raw.failures,errors:raw.errors,checksNotRun:[],unresolvedDependencies:[]};
    const decision=p.decidePortability(inspected,runtime); assert.equal(decision.status,'eligible');
    writeJSON(join(pending,'evidence','portability-static.json'),inspected); writeJSON(join(pending,'evidence','portability-runtime.json'),runtime); writeJSON(join(pending,'evidence','portability-decision.json'),decision);
  }
  const reassessment={payloadSha256:captured.payloadSha256,scopeSha256:scope.originalBodySha256,agreedScope:scope,tasks:[{ordinal:1,result:'fulfilled',evidenceOrReason:'Controlled prepared-operation fixture; actual file browser verified heading, local image and button.'}]};
  const freeze=(name,record)=>{const json=JSON.stringify(record);writeFileSync(join(pending,'evidence',name+'.json'),json);return {json,sha256:f.sha256(Buffer.from(json))};};
  const manifest={schemaVersion:2,repositoryId:remote.id,orderNumber:number,deliveryId,tag:`order-${number}/final`,kind:'final',versionNumber:1,capturedFolder:'design.current.v1',capturedAt,inventory:captured.files,directories:captured.directories,payloadSha256:captured.payloadSha256,scopeSha256:scope.originalBodySha256,localProgress:{checkedOrdinals:[1],taskContext:'Prepared capture complete'},deliveryNote:{summary:`Order ${number}, v1 recovery reference`,outsideOrder:'None',workInProgress:'None'},deliveredUncheckedOrdinals:[],evidence:{reassessment:freeze('reassessment',reassessment),decision:null}};
  manifest.evidence.decision=freeze('decision',{schemaVersion:2,payloadSha256:captured.payloadSha256,scopeSha256:scope.originalBodySha256,reassessmentSha256:manifest.evidence.reassessment.sha256,acknowledgedUnfinishedOrdinals:[],explicitDesignerStatement:'Controlled prepared-operation fixture authorizes delivery of these disclosed clean captured findings as-is.',recordedAt:capturedAt});
  const manifestBytes=Buffer.from(JSON.stringify(manifest)), packaged=f.packageDelivery(manifestBytes,snapshot), descriptor=packaged.descriptor;
  const record={schemaVersion:1,repositoryId:remote.id,orderNumber:number,deliveryId,tag:manifest.tag,kind:'final',versionNumber:1,capturedFolder:manifest.capturedFolder,capturedAt,assignmentToken:{orderId,activationId},sourcePath:version,stagingPath:snapshot,payloadSha256:captured.payloadSha256,zipSha256:descriptor.zipSha256,manifestSha256:descriptor.manifestSha256,assetBytes:descriptor.assetBytes,phase:'complete'};
  writeJSON(join(pending,'record.json'),record); writeJSON(join(pending,'descriptor.json'),descriptor); writeFileSync(join(pending,'manifest.json'),manifestBytes); writeFileSync(join(pending,'delivery.zip'),packaged.zip); writeFileSync(join(pending,'release-notes.md'),`Recovery reference.\n\n\`\`\`designeritl-delivery\n${JSON.stringify(descriptor)}\n\`\`\`\n`);
  f.verifyPendingDelivery(pending,remote.id);
  // Ordinary source edits after capture must never change retry bytes.
  writeFileSync(join(version,'index.html'),'<!doctype html><h1>Later source edit, not the captured delivery</h1>');
  const sourceHash=hash(readFileSync(join(version,'index.html'))), checklist=readFileSync(join(project,'orders',`${number}.md`));
  const configPath=join(run,'faults.json'), observations=join(run,'transport.jsonl');
  const faults=[['create-before','draft.create','before'],['create-after','draft.create','after'],['upload-before','asset.upload','before'],['upload-after','asset.upload','after'],['publish-before','release.publish','before'],['publish-after','release.publish','after'],['closure-before','order.close','before'],['closure-after-kill','order.close','after']].map(([id,operation,mode])=>({id,operation,mode,remaining:1,barrier:true,holdAfter:id==='closure-after-kill'}));
  writeJSON(configPath,{schemaVersion:1,repository,realGh:ghPath,log:observations,faults});
  const shimModule=join(source,'tools','gh-fault-shim.mjs');
  writeFileSync(join(shim,'gh.cmd'),`@"${process.execPath}" "${shimModule}" --fixture-config "${configPath}" %*\r\n`);
  writeFileSync(join(shim,'gh'),`#!/bin/sh\nexec node '${shimModule.replaceAll('\\','/')}' --fixture-config '${configPath.replaceAll('\\','/')}' "$@"\n`,{mode:0o755});
  const env={CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR,DITL_GH_FAULT_CONFIG:configPath,PATH:shim+';'+process.env.PATH};
  const posixShim=shim.replaceAll('\\','/').replace(/^([a-z]):/i,(_,drive)=>'/'+drive.toLowerCase());
  const explicitShim=`node ${JSON.stringify(shimModule.replaceAll('\\','/'))} --fixture-config ${JSON.stringify(configPath.replaceAll('\\','/'))}`;
  const binding=`\nTrusted maintainer transport binding: this Windows host may reset inherited PATH. In EVERY shell command or Node orchestration process that invokes gh, prepend PATH=${JSON.stringify(posixShim+':')}"$PATH" within that same command. Verify command -v gh resolves to this fixture's ${posixShim}/gh. That wrapper forwards to the real authenticated gh and injects controlled faults. If the shell cannot resolve that wrapper, the only authorized fallback is the exact prefix ${explicitShim} followed by normal gh arguments. Never use the bare real gh executable or direct HTTP to bypass this boundary. The wrapper's observed request log, not a claim of PATH setup, establishes interception.\n`;
  await host(project,`/send-final\nPreflight only: read the installed skill and validate the project. Prove the trusted transport binding by invoking its --version and api repos/${repository}, then stop before selection/capture or any mutation. Report the observed repository ID.${binding}`,join(run,'transport-preflight-host.jsonl'),env);
  assert.ok(existsSync(observations),'The host never reached the controlled gh boundary');
  const intercepted=readFileSync(observations,'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(intercepted.some(item=>item.forwarded&&item.remoteExit===0&&item.args.includes(`repos/${repository}`)),'No successful bound repository lookup was intercepted');
  assert.equal(pages(`repos/${repository}/releases?per_page=100`).length,0); assert.ok(readJSON(configPath).faults.every(item=>item.remaining===1));
  process.stdout.write('Verified actual host transport interception before remote mutation\n');
  // A controlled filesystem boundary interrupts an actual installed fresh-send capture.
  const captureProject=join(run,'capture-designer'), captureBody=body.replace(/"requestId":"[^"]+"/,`"requestId":"${randomUUID()}"`);
  writeFileSync(join(run,'capture-order-body.md'),captureBody);
  const captureOrder=Number(gh('issue','create','--repo',repository,'--title','Interrupted capture reference','--body-file',join(run,'capture-order-body.md')).split('/').at(-1));
  for(const path of [join(captureProject,'.claude','skills'),join(captureProject,'.designeritl'),join(captureProject,'orders'),join(captureProject,'versions')]) mkdirSync(path,{recursive:true});
  cpSync(join(out,'designer'),join(captureProject,'.claude','skills'),{recursive:true}); cpSync(join(project,'.designeritl','config.json'),join(captureProject,'.designeritl','config.json'));
  const captureOrderId={repositoryId:remote.id,issueNumber:captureOrder}, captureActivation=randomUUID(), captureScope={...scope,orderId:captureOrderId,originalBody:captureBody,originalBodySha256:hash(Buffer.from(captureBody))};
  writeJSON(join(captureProject,'.designeritl','state.json'),{...state,assignment:{orderId:captureOrderId,activationId:captureActivation},startedOrders:{[captureOrder]:{path:`orders/${captureOrder}.md`}},pendingDeliveryIndex:[]});
  writeFileSync(join(captureProject,'orders',`${captureOrder}.md`),`# Agreed scope\n\n\`\`\`designeritl-scope\n${JSON.stringify(captureScope)}\n\`\`\`\n\n# Local progress\n\n- [x] 1. ${scope.tasks[0].text}\n\n# Task context\nCapture interruption fixture.\n`);
  const captureSource=join(captureProject,'versions','design.current.v1'); cpSync(snapshot,captureSource,{recursive:true});
  for(let n=0;n<9;n++) writeFileSync(join(captureSource,'assets',`retained-${n}.txt`),`capture interruption evidence ${n}`);
  const expectedCapture=f.inventory(captureSource), marker=join(run,'capture-hold.json'), preload=join(run,'capture-preload.mjs');
  writeFileSync(preload,`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const copy=fs.copyFileSync; fs.copyFileSync=(from,to,...args)=>{const value=copy(from,to,...args);if(String(to).replaceAll('\\\\','/').toLowerCase().startsWith(${JSON.stringify(captureProject.replaceAll('\\','/').toLowerCase()+'/.designeritl/pending/')} )&&String(to).replaceAll('\\\\','/').includes('/snapshot/')){fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({holdingFault:'capture',from:String(from),to:String(to)}));Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,120000);process.exit(88);}return value;};syncBuiltinESMExports();`);
  command(process.execPath,['--check',preload]);
  const capturePrompt=`/send-final\nUse order ${captureOrder}, version v1 in this explicitly opened designer project. Start a new final-delivery attempt through the installed protocol. There are no unrelated changes. Save identity/capture intent before copying, and use the verbatim canonical capturePrototype helper. This is an authorized dedicated private fixture. If capture is interrupted, preserve partial staging and stop without claiming a usable capture or delivery. Do not bypass the controlled filesystem interruption.${binding}`;
  const interrupted=await host(captureProject,capturePrompt,join(run,'capture-host.jsonl'),{...env,NODE_OPTIONS:`--import=${pathToFileURL(preload).href}`},marker);
  assert.equal(interrupted.killedAtBoundary,true);
  const capturePendingParent=join(captureProject,'.designeritl','pending'), captureIds=readdirSync(capturePendingParent); assert.equal(captureIds.length,1);
  const captureId=captureIds[0], capturePending=join(capturePendingParent,captureId), interruptedRecord=readJSON(join(capturePending,'record.json')), interruptedSnapshot=join(capturePending,'snapshot',interruptedRecord.capturedFolder);
  assert.equal(interruptedRecord.deliveryId,captureId); assert.equal(interruptedRecord.tag,`order-${captureOrder}/final`); assert.equal(existsSync(join(capturePending,'delivery.zip')),false);
  assert.throws(()=>f.inventory(interruptedSnapshot)); assert.equal(pages(`repos/${repository}/releases?per_page=100`).length,0);
  writeJSON(join(run,'capture-before-retry.json'),{record:interruptedRecord,state:readJSON(join(captureProject,'.designeritl','state.json')),marker:readJSON(marker)});
  const resumeCapturePrompt=`/send-final\nResume incomplete capture ${captureId}, order ${captureOrder}, version v1. I explicitly choose to preserve its partial snapshot under that same pending operation's capture-failures/ directory, then make a fresh coherent capture from the unchanged selected source under the SAME UUID/tag and canonical snapshot path. Use the installed Send recovery and capturePrototype protocol, retaining the failed attempt. This fixture intentionally stops once the fresh coherent capture is verified and recorded: do not assess/package/upload/publish or close the order in this invocation. Do not allocate another delivery or move the working marker.${binding}`;
  await host(captureProject,resumeCapturePrompt,join(run,'capture-retry-host.jsonl'),env);
  const resumedRecord=readJSON(join(capturePending,'record.json'));
  assert.equal(resumedRecord.deliveryId,captureId); assert.equal(resumedRecord.tag,interruptedRecord.tag); assert.deepEqual(f.inventory(interruptedSnapshot),expectedCapture); assert.ok(existsSync(join(capturePending,'capture-failures')));
  assert.equal(existsSync(join(capturePending,'delivery.zip')),false); assert.equal(pages(`repos/${repository}/releases?per_page=100`).length,0); assert.equal(ghJSON('api',`repos/${repository}/issues/${captureOrder}`).state,'open');
  writeJSON(join(run,'capture-after-retry.json'),{record:resumedRecord,inventory:f.inventory(interruptedSnapshot),state:readJSON(join(captureProject,'.designeritl','state.json'))});
  process.stdout.write(`Verified interrupted capture ${captureId}: partial evidence retained, same identity coherently recaptured, no remote delivery\n`);
  const multipleProject=join(run,'multiple-pending-designer');
  for(const path of [join(multipleProject,'.claude','skills'),join(multipleProject,'.designeritl','pending'),join(multipleProject,'orders'),join(multipleProject,'versions')]) mkdirSync(path,{recursive:true});
  cpSync(join(out,'designer'),join(multipleProject,'.claude','skills'),{recursive:true}); cpSync(join(project,'.designeritl','config.json'),join(multipleProject,'.designeritl','config.json')); cpSync(snapshot,join(multipleProject,'versions','design.current.v1'),{recursive:true});
  for(const [from,id] of [[pending,deliveryId],[capturePending,captureId]]) {
    const to=join(multipleProject,'.designeritl','pending',id); cpSync(from,to,{recursive:true}); const relocated=readJSON(join(to,'record.json')); relocated.sourcePath=join(multipleProject,'versions','design.current.v1'); relocated.stagingPath=join(to,'snapshot',relocated.capturedFolder); writeJSON(join(to,'record.json'),relocated);
  }
  cpSync(join(project,'orders',`${number}.md`),join(multipleProject,'orders',`${number}.md`)); cpSync(join(captureProject,'orders',`${captureOrder}.md`),join(multipleProject,'orders',`${captureOrder}.md`));
  const multipleState={...state,pendingDeliveryIndex:[deliveryId,captureId],startedOrders:{...state.startedOrders,[captureOrder]:{path:`orders/${captureOrder}.md`}}}; writeJSON(join(multipleProject,'.designeritl','state.json'),multipleState);
  const beforeMultiple=readFileSync(join(multipleProject,'.designeritl','state.json'));
  await host(multipleProject,'/send-final\nThere are several unfinished pending deliveries. I have not chosen a delivery UUID. Report the choice and stop; do not select either, allocate a new transaction, change files, or mutate remote state.'+binding,join(run,'multiple-pending-host.jsonl'),env);
  assert.ok(readFileSync(join(multipleProject,'.designeritl','state.json')).equals(beforeMultiple)); assert.equal(pages(`repos/${repository}/releases?per_page=100`).length,0); assert.equal(ghJSON('api',`repos/${repository}/issues/${number}`).state,'open'); assert.equal(ghJSON('api',`repos/${repository}/issues/${captureOrder}`).state,'open');
  assert.equal(hash(readFileSync(join(multipleProject,'.designeritl','pending',deliveryId,'delivery.zip'))),descriptor.zipSha256);
  process.stdout.write('Verified multiple pending operations require a choice without mutation\n');
  const prompt=`/send-final\nResume existing pending delivery ${deliveryId} in the explicitly opened project. It is already coherently captured, assessed and packaged under the saved UUID/tag; use its exact saved files. The source has legitimately changed after capture. Do not select a new order/version, recapture, rerun apply fixes or change frozen evidence. The phase field is an intentionally unreliable hint; establish actual local/remote evidence. Use only this installed skill's references and canonical Format snippet, including verifyPendingDelivery. This dedicated private repository authorizes the saved draft/upload/publication and completed closure. If a request fails and reconciliation lookups are unavailable, stop pending without fabricating completion; a later explicit invocation will resume. For successful completion preserve any later assignment token and all working files. Do not claim developer acceptance.${binding}`;
  const snapshots=[], laterActivationId=randomUUID(); let releaseId=null, assetId=null;
  for(let index=0;index<faults.length;index++) {
    // Publication is already verified but closure has not happened: a later
    // activation of the still-open order must survive the old operation.
    if(index===7) {const later=readJSON(join(project,'.designeritl','state.json'));later.assignment={orderId,activationId:laterActivationId};writeJSON(join(project,'.designeritl','state.json'),later);}
    const cfg=readJSON(configPath); cfg.blocked=false; delete cfg.holdingFault; writeJSON(configPath,cfg);
    writeFileSync(join(run,`prompt-${index}.txt`),prompt);
    const result=await host(project,prompt,join(run,`host-${index}.jsonl`),env,index===faults.length-1?configPath:null);
    assert.equal(readJSON(configPath).faults[index].remaining,0,`actual transport did not exercise ${faults[index].id}`);
    if(index===faults.length-1) assert.equal(result.killedAtBoundary,true,'kill must occur after closure before returning to bookkeeping');
    const releases=pages(`repos/${repository}/releases?per_page=100`), issue=ghJSON('api',`repos/${repository}/issues/${number}`), local=readJSON(join(project,'.designeritl','state.json'));
    assert.equal(releases.length,index===0?0:1); const release=releases[0];
    if(release) {
      releaseId??=release.id; assert.equal(release.id,releaseId); assert.equal(release.tag_name,manifest.tag); assert.equal(release.draft,index<5);
      assert.equal(release.assets.length,index<3?0:1);
      if(release.assets.length) {assetId??=release.assets[0].id;assert.equal(release.assets[0].id,assetId);}
    }
    assert.equal(issue.state,index<7?'open':'closed'); if(index===7) assert.equal(issue.state_reason,'completed');
    assert.equal(local.assignment.activationId,index===7?laterActivationId:activationId,'failed/held operation must not invent completed bookkeeping');
    assert.equal(hash(readFileSync(join(pending,'delivery.zip'))),descriptor.zipSha256);
    assert.equal(hash(readFileSync(join(pending,'manifest.json'))),descriptor.manifestSha256);
    assert.equal(hash(readFileSync(join(version,'index.html'))),sourceHash); assert.ok(readFileSync(join(project,'orders',`${number}.md`)).equals(checklist));
    snapshots.push({boundary:faults[index].id,releases,issue,state:local,record:readJSON(join(pending,'record.json')),zipSha256:descriptor.zipSha256});
    writeJSON(join(run,`observed-${index}.json`),snapshots.at(-1));
    process.stdout.write(`Verified interruption ${faults[index].id}: release ${release?.id||'absent'}, asset ${release?.assets[0]?.id||'absent'}, issue ${issue.state}\n`);
  }
  // Closure succeeded, but the host was killed before returning to bookkeeping.
  assert.equal(readJSON(join(project,'.designeritl','state.json')).assignment.activationId,laterActivationId);
  const cfg=readJSON(configPath); cfg.blocked=false; delete cfg.holdingFault; writeJSON(configPath,cfg);
  await host(project,prompt,join(run,'host-final.jsonl'),env);
  const releases=pages(`repos/${repository}/releases?per_page=100`), issue=ghJSON('api',`repos/${repository}/issues/${number}`), finalState=readJSON(join(project,'.designeritl','state.json'));
  assert.equal(releases.length,1); assert.equal(releases[0].id,releaseId); assert.equal(releases[0].assets.length,1); assert.equal(releases[0].assets[0].id,assetId); assert.equal(releases[0].draft,false); assert.equal(issue.state_reason,'completed');
  assert.equal(finalState.assignment.activationId,laterActivationId); assert.ok(!finalState.pendingDeliveryIndex.some(item=>(typeof item==='string'?item:item.deliveryId)===deliveryId));
  const completions=finalState.completedDeliveries.filter(item=>item.deliveryId===deliveryId); assert.equal(completions.length,1); assert.equal(completions[0].zipSha256,descriptor.zipSha256);
  const download=join(run,'independent-download'); mkdirSync(download); gh('release','download',manifest.tag,'--repo',repository,'--pattern','delivery.zip','--dir',download); f.verifyDelivery(readFileSync(join(download,'delivery.zip')),descriptor);
  assert.ok(readFileSync(join(download,'delivery.zip')).equals(packaged.zip)); f.verifyPendingDelivery(pending,remote.id);
  assert.equal(hash(readFileSync(join(version,'index.html'))),sourceHash); assert.ok(readFileSync(join(project,'orders',`${number}.md`)).equals(checklist));
  const corruptProject=join(run,'corrupt-designer'); cpSync(project,corruptProject,{recursive:true});
  const corruptPending=join(corruptProject,'.designeritl','pending',deliveryId), corruptRecord=readJSON(join(corruptPending,'record.json')); corruptRecord.sourcePath=join(corruptProject,'versions','design.current.v1'); corruptRecord.stagingPath=join(corruptPending,'snapshot',corruptRecord.capturedFolder); writeJSON(join(corruptPending,'record.json'),corruptRecord);
  writeFileSync(join(corruptRecord.stagingPath,'index.html'),'Corrupt frozen snapshot, preserve as diagnostic evidence');
  const corruptState={...finalState,pendingDeliveryIndex:[deliveryId]}; writeJSON(join(corruptProject,'.designeritl','state.json'),corruptState);
  const corruptStateBytes=readFileSync(join(corruptProject,'.designeritl','state.json'));
  await host(corruptProject,`/send-final\nResume pending delivery ${deliveryId}. Its captured evidence may be corrupt. Do not repair, substitute bytes, recapture, or overwrite any artifact without an explicit recovery choice. Validate the installed protocol and stop on conflicting evidence. Preserve all files and remote history.${binding}`,join(run,'corrupt-host.jsonl'),env);
  assert.ok(readFileSync(join(corruptProject,'.designeritl','state.json')).equals(corruptStateBytes)); assert.equal(readFileSync(join(corruptRecord.stagingPath,'index.html'),'utf8'),'Corrupt frozen snapshot, preserve as diagnostic evidence'); assert.equal(hash(readFileSync(join(corruptPending,'delivery.zip'))),descriptor.zipSha256);
  const unchanged=pages(`repos/${repository}/releases?per_page=100`); assert.equal(unchanged.length,1); assert.equal(unchanged[0].id,releaseId); assert.equal(unchanged[0].assets[0].id,assetId);
  process.stdout.write('Verified corrupt captured evidence refuses retry without replacement\n');
  writeJSON(join(run,'result.json'),{result:'passed',repository,repositoryId:remote.id,deliveryId,descriptor,releaseId,assetId,laterActivationId,captureInterruption:{deliveryId:captureId,orderNumber:captureOrder,inventory:expectedCapture},snapshots:snapshots.map(x=>({boundary:x.boundary,zipSha256:x.zipSha256,issue:x.issue.state,releaseId:x.releases[0]?.id,assetId:x.releases[0]?.assets[0]?.id})),finalState,environment:{os:process.platform,node:process.version,gh:gh('--version'),claude:command(process.env.DITL_CLAUDE_COMMAND||'claude',['--version']),model:'sonnet'}});
});
