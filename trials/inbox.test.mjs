import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../tools/bundle.mjs';
import {integrity} from '../tools/protocol.mjs';
import {runHost} from './support/host.mjs';
import {createInboxFixtureManifest} from './support/inbox-fixture.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const jsonFile=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
function command(binary,args,options={}) {
  const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,...options});
  if(result.status!==0)throw Error(`${binary} ${args.slice(0,3).join(' ')} failed: ${result.stderr||result.error}`);
  return result.stdout.trim();
}
const gh=(...args)=>command('gh',args), api=(...args)=>JSON.parse(gh('api',...args));

test('installed Codex Inbox retains history across interrupted transfer, lost receipts and divergence',{skip:process.env.DITL_INBOX_TRIAL!=='1',timeout:2400000},async()=>{
  assert.ok(process.env.CODEX_HOME&&existsSync(join(process.env.CODEX_HOME,'auth.json')),'Reuse the retained authenticated CODEX_HOME; never reseed or delete it');
  const notes=resolve(source,'..','designeritl-implementation-notes');mkdirSync(notes,{recursive:true});
  const run=process.env.DITL_INBOX_RUN||mkdtempSync(join(notes,'ticket13-inbox-'));
  process.stdout.write(`Retained Inbox trial: ${run}\n`);
  const project=join(run,'developer'), bundle=join(run,'bundles'), receiptPath=join(project,'.designeritl/state.json');
  let environment;
  if(!existsSync(join(run,'environment.json'))) {
    mkdirSync(project,{recursive:true});build(bundle);
    for(const hostDirectory of ['.agents','.claude']) {
      const skills=join(project,hostDirectory,'skills');mkdirSync(skills,{recursive:true});cpSync(join(bundle,'developer'),skills,{recursive:true});
    }
    for(const reference of ['SKILL.md','references/format.md','references/inbox.md']) {
      const bytes=readFileSync(join(project,'.agents/skills/inbox',reference));
      assert.ok(bytes.equals(readFileSync(join(project,'.claude/skills/inbox',reference))),'Both host installations must use identical canonical bytes');
      assert.ok(Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes),'Installed protocol source must round-trip as UTF-8');
    }
    mkdirSync(join(project,'.designeritl'));
    const owner=api('user').login,name=`designeritl-inbox-${Date.now()}-${randomUUID().slice(0,6)}`,repository=`${owner}/${name}`;
    gh('repo','create',repository,'--private','--add-readme','--description','Dedicated retained DesignerITL Inbox recovery fixture');
    const remote=api(`repos/${repository}`);
    const codexLauncher=process.env.DITL_CODEX_COMMAND||join(process.env.APPDATA,'npm/node_modules/@openai/codex/bin/codex.js');
    environment={run,project,host:'codex',repository,repositoryId:remote.id,node:process.version,os:process.platform,git:command('git',['--version']),gh:gh('--version'),codex:command(process.execPath,[codexLauncher,'--version']),realGh:command('powershell.exe',['-NoProfile','-Command','(Get-Command gh).Source']),limits:{entries:5000,totalBytes:536870912,entryBytes:268435456,ratio:100},deliveries:[]};
    jsonFile(join(project,'.designeritl/config.json'),{schemaVersion:2,role:'developer',repository:{repositoryId:remote.id,owner,name},deliveryDestination:'received'});
    jsonFile(receiptPath,{schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null});
    jsonFile(join(run,'environment.json'),environment);
    const format=await integrity();
    for(let n=1;n<=3;n++) {
      const prototype=join(run,`source-${n}`);mkdirSync(join(prototype,'assets'),{recursive:true});
      writeFileSync(join(prototype,'index.html'),`<!doctype html><h1>Inbox retained iteration ${n}</h1>`);writeFileSync(join(prototype,'assets/fixture.txt'),`retained asset ${n}`);
      const manifest=createInboxFixtureManifest(format,{repositoryId:remote.id,prototypeRoot:prototype,number:n}),tag=manifest.tag;
      const packed=format.packageDelivery(Buffer.from(JSON.stringify(manifest)),prototype),files=join(run,`delivery-${n}`);mkdirSync(files);
      writeFileSync(join(files,'delivery.zip'),packed.zip);writeFileSync(join(files,'notes.md'),'Retained transport fixture\n\n```designeritl-delivery\n'+JSON.stringify(packed.descriptor)+'\n```\n');
      gh('release','create',tag,join(files,'delivery.zip'),'--repo',repository,'--title',`Fixture ${n}`,'--notes-file',join(files,'notes.md'));
      const release=api(`repos/${repository}/releases/tags/${encodeURIComponent(tag)}`),asset=api(`repos/${repository}/releases/${release.id}/assets`)[0];
      environment.deliveries.push({manifest,descriptor:packed.descriptor,releaseId:release.id,assetId:asset.id,zipPath:join(files,'delivery.zip')});jsonFile(join(run,'environment.json'),environment);
    }
    gh('release','create','order-7/send-99','--repo',repository,'--draft','--title','Ignored draft','--notes','Malformed draft intentionally ignored');
    gh('release','create','unrelated-v1','--repo',repository,'--title','Unrelated','--notes','Ordinary unrelated release');
    gh('release','create','order-9/final','--repo',repository,'--title','Malformed delivery','--notes','Delivery-like release deliberately missing machine metadata');
    const final=environment.deliveries[2],target=join(project,'received/order-7',final.manifest.deliveryId);
    mkdirSync(dirname(target),{recursive:true});format.extractZip(format.verifyDelivery(readFileSync(final.zipPath),final.descriptor).entries,target);
    const partial=join(project,'received/.designeritl-staging/interrupted-extraction/tree/design.v2');mkdirSync(partial,{recursive:true});writeFileSync(join(partial,'index.html'),'partial extraction retained');
    jsonFile(join(run,'shim-state.json'),{failed:false,failTag:'order-7/send-1',failAssetId:environment.deliveries[0].assetId});
  } else environment=JSON.parse(readFileSync(join(run,'environment.json')));
  const shim=join(run,'gh-shim.mjs'),calls=join(run,'gh-calls.jsonl');
  writeFileSync(shim,`import {spawnSync} from 'node:child_process';import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';const config=${JSON.stringify({realGh:environment.realGh,calls,state:join(run,'shim-state.json')})};const args=process.argv.slice(2);appendFileSync(config.calls,JSON.stringify({at:new Date().toISOString(),args})+'\\n');const state=JSON.parse(readFileSync(config.state));const download=args[0]==='release'&&args[1]==='download'&&args.includes(state.failTag);const asset=args[0]==='api'&&args.some(a=>a.includes('/releases/assets/'+state.failAssetId))&&args.some(a=>a.includes('octet-stream'));if(!state.failed&&(download||asset)){state.failed=true;writeFileSync(config.state,JSON.stringify(state));const output=args.indexOf('--output');if(output!==-1)writeFileSync(args[output+1],Buffer.from('interrupted partial ZIP'));process.stderr.write('Injected partial transfer; retained bytes are incomplete\\n');process.exit(41);}const result=spawnSync(config.realGh,args,{stdio:'inherit',windowsHide:true});process.exit(result.status??1);`);
  assert.equal(environment.host,'codex','Resume only a retained Codex fixture with accurate host evidence');
  const installed=join(project,'.agents/skills/inbox/SKILL.md');
  const prefix=`$inbox\nInvoke the installed Inbox skill at ${installed} for this explicitly opened developer project. This dedicated private fixture is authorized for reception. Use only installed skill references, not source checkout protocols. For EVERY GitHub CLI command including identity, listings, downloads and refresh, invoke node ${JSON.stringify(shim.replaceAll('\\','/'))} followed by the normal gh arguments; this absolute Node prefix is the controlled transport boundary and forwards actual gh. Do not call bare gh or an absolute real gh executable. Bootstrap with the installed Format integrity-loader-v1 Node driver: save it using the file-writing tool, retain its named-fence loader unchanged and pass installed reference paths and fence tags as separate Node arguments. Use Node only to load/execute verbatim protocol blocks, never shell/Python extraction. Follow canonical inbox-v1 and format modules verbatim, using Project record replacement and the receiveDelivery gate that checks capacity and archive metadata before inflation. Preserve modules and all partial staging; never recursively clean them. Report every malformed/refused delivery and continue all independent deliveries. A transport failure must not authorize substituting the fixture's known expected bytes. Complete autonomously using supplied choices.\n`;
  const state=()=>JSON.parse(readFileSync(receiptPath)),target=d=>join(project,'received/order-7',d.manifest.deliveryId),entry=d=>join(target(d),d.manifest.capturedFolder,'index.html');
  const assertBytes=(delivery,path=entry(delivery))=>assert.ok(readFileSync(path).equals(readFileSync(join(run,`source-${delivery.manifest.versionNumber}`,'index.html'))));
  const checkpoint=join(run,'checkpoint.json');let phase=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint)).phase:0;
  async function host(number,suffix) {const prompt=prefix+suffix;writeFileSync(join(run,`prompt-${number}.txt`),prompt);await runHost({project,prompt,log:join(run,`host-${number}.jsonl`),host:'codex',timeoutMs:420000});assert.ok(readFileSync(calls,'utf8').trim(),'Actual shim interception must be proved');}
  if(phase<1) {
    await host(1,'Receive all supported deliveries. This invocation may encounter one failed transfer; report it and complete every other independent delivery.');
    assert.equal(JSON.parse(readFileSync(join(run,'shim-state.json'))).failed,true,'Injected partial transfer must actually occur');
    const receipts=state().completedDownloadReceipts;assert.equal(Object.keys(receipts).length,2);assert.equal(existsSync(target(environment.deliveries[0])),false);
    for(const d of environment.deliveries.slice(1))assertBytes(d);
    assert.equal(readFileSync(join(project,'received/.designeritl-staging/interrupted-extraction/tree/design.v2/index.html'),'utf8'),'partial extraction retained');
    jsonFile(join(run,'phase-1-state.json'),state());jsonFile(checkpoint,{phase:1});phase=1;
  }
  if(phase<2) {
    await host(2,'Retry unfinished reception and verify completed deliveries before skipping. Preserve every earlier receipt and installed file.');
    const receipts=state().completedDownloadReceipts;assert.equal(Object.keys(receipts).length,3);for(const d of environment.deliveries)assertBytes(d);
    const before=JSON.parse(readFileSync(join(run,'phase-1-state.json'))).completedDownloadReceipts;for(const [key,value] of Object.entries(before))assert.deepEqual(receipts[key],value);
    jsonFile(join(run,'phase-2-state.json'),state());jsonFile(checkpoint,{phase:2});phase=2;
  }
  if(phase<3) {
    const [replaced,edited,lost]=environment.deliveries, original=state();
    writeFileSync(entry(edited),'Developer local edit must survive');
    for(const [key,receipt] of Object.entries(original.completedDownloadReceipts))if(receipt.deliveryId===lost.manifest.deliveryId)delete original.completedDownloadReceipts[key];
    jsonFile(receiptPath,original);
    gh('api','--method','DELETE',`repos/${environment.repository}/releases/assets/${replaced.assetId}`);
    gh('release','upload',replaced.manifest.tag,replaced.zipPath,'--repo',environment.repository);
    const assets=api(`repos/${environment.repository}/releases/${replaced.releaseId}/assets`);assert.notEqual(assets[0].id,replaced.assetId);
    jsonFile(join(run,'remote-replacement.json'),{previousAssetId:replaced.assetId,currentAssetId:assets[0].id});
    await host(3,'Report local/remote divergence without replacing old files or receipts. Repair a missing receipt only from actual installed bytes and current published identity. Continue independent valid deliveries; no alternate destination has been selected yet.');
    const after=state(),before=JSON.parse(readFileSync(join(run,'phase-2-state.json')));
    assert.equal(Object.keys(after.completedDownloadReceipts).length,3);for(const d of [replaced,edited])assert.deepEqual(after.completedDownloadReceipts[d.manifest.deliveryId],before.completedDownloadReceipts[d.manifest.deliveryId]);
    assert.equal(readFileSync(entry(edited),'utf8'),'Developer local edit must survive');assertBytes(replaced);assertBytes(lost);
    jsonFile(join(run,'phase-3-state.json'),after);jsonFile(checkpoint,{phase:3});phase=3;
  }
  if(phase<4) {
    const [replaced,edited,missing]=environment.deliveries, recovery=join(project,'received/explicit-recovery');unlinkSync(entry(missing));
    await host(4,`For delivery ${replaced.manifest.deliveryId} explicitly choose recoveryDestination ${JSON.stringify(recovery)}. This authorizes a separately retained verified recovery and an appended receipt. Report the other local divergence and missing installed file; preserve all earlier receipts and folders.`);
    const after=state(),before=JSON.parse(readFileSync(join(run,'phase-3-state.json')));
    assert.equal(Object.keys(after.completedDownloadReceipts).length,4);for(const [key,value] of Object.entries(before.completedDownloadReceipts))assert.deepEqual(after.completedDownloadReceipts[key],value);
    assertBytes(replaced,join(recovery,replaced.manifest.capturedFolder,'index.html'));assert.equal(readFileSync(entry(edited),'utf8'),'Developer local edit must survive');assert.equal(existsSync(entry(missing)),false);
    const receipts=Object.values(after.completedDownloadReceipts).filter(r=>r.deliveryId===replaced.manifest.deliveryId);assert.equal(receipts.length,2);assert.notEqual(receipts[0].assetId,receipts[1].assetId);
    jsonFile(join(run,'phase-4-state.json'),after);jsonFile(checkpoint,{phase:4});phase=4;
  }
  const intercepted=readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.ok(intercepted.length>5);assert.ok(intercepted.some(c=>c.args.includes('--paginate')),'Observed complete repository listings');
  for(const d of environment.deliveries)assert.equal(api(`repos/${environment.repository}/releases/${d.releaseId}`).draft,false);
  jsonFile(join(run,'result.json'),{host:'codex',phase,passed:true,interceptedCalls:intercepted.length,retainedStaging:readdirSync(join(project,'received/.designeritl-staging'))});
});
