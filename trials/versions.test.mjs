import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,cpSync,readdirSync,existsSync,renameSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from '../tools/bundle.mjs';
import {integrity} from '../tools/protocol.mjs';
const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const config={schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'fixture',name:'versions'}};
const state=()=>({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null});
function prototype(path,text){mkdirSync(join(path,'assets','empty'),{recursive:true});writeFileSync(join(path,'index.html'),`<!doctype html><title>Version fixture</title><h1>${text}</h1><link rel="stylesheet" href="assets/style.css">`);writeFileSync(join(path,'assets','style.css'),'body{color:blue}');}
const versions=root=>readdirSync(join(root,'versions')).sort();
const marked=root=>versions(root).filter(name=>name.includes('.current.v'));
test('installed Codex new-version preserves bytes and recovers numbered lifecycle', {skip:process.env.DITL_VERSIONS_TRIAL!=='1',timeout:7200000},async()=>{
 const {runHost}=await import('./support/host.mjs');
 assert.ok(process.env.CODEX_HOME,'Reuse preserved Codex home; never seed/delete it');const run=mkdtempSync(join(tmpdir(),'ditl-versions-codex-')),out=join(run,'bundle');build(out);const f=await integrity();process.stdout.write(`Retained Versions Codex trial root: ${run}\n`);
 const adapter=join(run,'gh.cjs'),calls=join(run,'transport.jsonl');writeFileSync(calls,'');writeFileSync(adapter,`const fs=require('node:fs'),args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');if(args[0]!=='api'||args[1]!=='repos/fixture/versions'||args.includes('--method'))process.exit(90);process.stdout.write(JSON.stringify({id:101,name:'versions',owner:{login:'fixture'}}));`);
 const all=['lifecycle','partial-copy','promoted-result','missing-marker','missing-choice','saved-multiple-markers','saved-multiple-choice','multiple-markers','multiple-choice','duplicate-number','conflicting-staging','invalid-import'];const selected=process.env.DITL_VERSIONS_CASE?process.env.DITL_VERSIONS_CASE.split(','):all;assert.ok(selected.every(name=>all.includes(name)));
 const evidence=[];
 for(const name of selected){
  const root=join(run,name);mkdirSync(join(root,'.designeritl'),{recursive:true});mkdirSync(join(root,'.agents','skills'),{recursive:true});cpSync(join(out,'designer','new-version'),join(root,'.agents','skills','new-version'),{recursive:true});json(join(root,'.designeritl','config.json'),config);json(join(root,'.designeritl','state.json'),state());
  let intent=null,request='';
  if(name==='lifecycle') {
   prototype(join(root,'import-source'),'imported complete area');writeFileSync(join(root,'import-source','assets','runtime.js'),'fetch("https://example.invalid/design-data")');
   request='Perform these four explicitly authorized new-version actions in order, following the installed lifecycle for each: (1) create the empty first prototype with label first; (2) before copying, add assets/accumulated.txt containing exactly ACCUMULATED DESIGN to v1, then create the default copy with label copied; (3) import ./import-source with label imported; (4) explicitly branch from v1 with label branch. Inspect import dependency problems and disclose that its unused JavaScript contains a network load; do not claim imported work is delivery eligible. Keep the imported source and all original versions. Do not send or start an order.';
  } else if(name==='invalid-import') {mkdirSync(join(root,'broken'));writeFileSync(join(root,'broken','index.html'),'missing assets');request='Import ./broken into a new version with label imported. Report any format problem accurately; do not repair the source or invent assets.';}
  else {
   prototype(join(root,'versions','base.current.v1'),'accumulated project');
   if(['multiple-markers','multiple-choice','duplicate-number'].includes(name)){
    const second=name==='duplicate-number'?'duplicate.v1':'latest.current.v3';prototype(join(root,'versions',second),'other project design');utimesSync(join(root,'versions',second,'index.html'),new Date('2030-01-01'),new Date('2030-01-01'));
    request=name==='multiple-choice'?'Create a default copy with label next. I explicitly choose v1 as the working version when resolving the existing multiple markers; copy that chosen v1.':'Create a default copy with label next. No working-marker choice is supplied. If ambiguous, report choices and the most recently edited recommendation, preserve all evidence and stop before new version creation.';
   } else {
    intent=f.reserveVersion(f.readProject(root),{label:'next'});
    if(name==='partial-copy'||name==='conflicting-staging') {mkdirSync(join(root,intent.stagingPath,'assets'),{recursive:true});writeFileSync(join(root,intent.stagingPath,'index.html'),name==='partial-copy'?readFileSync(join(root,'versions','base.current.v1','index.html')):'FOREIGN PARTIAL CONTENT');}
    else {f.stageVersion(f.readProject(root));renameSync(join(root,intent.stagingPath),join(root,name.startsWith('saved-multiple')?intent.currentPath:intent.resultPath));if(name.startsWith('missing-'))renameSync(join(root,'versions','base.current.v1'),join(root,'versions','base.v1'));if(name.startsWith('saved-multiple'))utimesSync(join(root,intent.currentPath,'index.html'),new Date('2030-01-01'),new Date('2030-01-01'));}
    request=['missing-choice','saved-multiple-choice'].includes(name)?'Recover the existing interrupted creation. I explicitly choose the reserved v2 as working; finish that same operation.':['missing-marker','saved-multiple-markers'].includes(name)?'Recover the existing interrupted creation. No working-marker choice is supplied; the saved intent is not a designer choice. If a choice is required report the options and most recently edited recommendation and retain all evidence.':'Recover the existing interrupted creation using its saved intent and actual folders. Do not allocate a new version. Preserve conflicting evidence if safe recovery is unavailable.';
   }
  }
  const before=readFileSync(join(root,'.designeritl','state.json')),beforeFolders=existsSync(join(root,'versions'))?versions(root):[];
  const prompt=`$new-version\n${request}\nThis is an authorized installed-action fixture in the explicitly opened root. Execute your own installed Project/Versions/Format references; access no source checkout. Create a temporary .mjs driver using apply_patch or the host file-writing tool and the exact integrity-loader-v1 example from your installed Format reference. Preserve its imports and named-fence loader unchanged, run its smoke check through Node with the installed Format path as a separate argument, then use the file tool to replace only the final smoke-check statement with canonical action calls. Avoid shell-generated source, inline source strings, sed extraction, or OS hash diagnostics. Retain the driver. The controlled read-only transport command prefix is exactly node ${JSON.stringify(adapter.replaceAll('\\','/'))}. Wherever your protocol says gh, use that exact absolute Node prefix plus unchanged arguments; native Windows inherited PATH may ignore shims, so never use real gh.exe. Only repository identity GET exists. Retain any temporary integrity modules and all evidence; no cleanup/deletion is requested. Do not modify installed protocols or bypass a refusal. All choices authorized above are explicit; do not invent other user choices.\n`;
  const log=join(run,name+'.jsonl');writeFileSync(join(run,name+'-prompt.txt'),prompt);const output=await runHost({project:root,prompt,log,host:'codex'});assert.equal(output.host,'codex');const response=output.finalText;
  const final=f.readProject(root).state;
  if(name==='lifecycle'){
   assert.deepEqual(marked(root),['branch.current.v4']);assert.deepEqual(versions(root),['branch.current.v4','copied.v2','first.v1','imported.v3']);assert.deepEqual(final.versionReservations,[1,2,3,4]);assert.equal(final.versionCreationIntent,null);
   for(const folder of ['first.v1','copied.v2','branch.current.v4'])assert.equal(readFileSync(join(root,'versions',folder,'assets','accumulated.txt'),'utf8'),'ACCUMULATED DESIGN');
   assert.equal(f.inventory(join(root,'versions','first.v1')).payloadSha256,f.inventory(join(root,'versions','branch.current.v4')).payloadSha256);assert.equal(f.inventory(join(root,'import-source')).payloadSha256,f.inventory(join(root,'versions','imported.v3')).payloadSha256);assert.ok(existsSync(join(root,'versions','imported.v3','assets','empty')));assert.match(response,/network|example\.invalid/i);
  } else if(['partial-copy','promoted-result','missing-choice','saved-multiple-choice','multiple-choice'].includes(name)){
   const n=name==='multiple-choice'?4:2;assert.deepEqual(marked(root),[`next.current.v${n}`]);assert.equal(final.versionCreationIntent,null);assert.ok(final.versionReservations.includes(n));assert.equal(f.inventory(join(root,'versions','base.v1')).payloadSha256,f.inventory(join(root,'versions',`next.current.v${n}`)).payloadSha256);
  } else {
   assert.ok(readFileSync(join(root,'.designeritl','state.json')).equals(before),`${name}: refused operation must preserve state`);assert.deepEqual(existsSync(join(root,'versions'))?versions(root):[],beforeFolders);
   if(name==='conflicting-staging')assert.equal(readFileSync(join(root,intent.stagingPath,'index.html'),'utf8'),'FOREIGN PARTIAL CONTENT');
   if(name==='multiple-markers')assert.match(response,/v3|v\s*3/i);
   if(name==='saved-multiple-markers')assert.match(response,/v2|v\s*2/i);
  }
  assert.equal(final.assignment,null);assert.deepEqual(final.startedOrders,{});assert.deepEqual(final.pendingDeliveryIndex,[]);assert.equal(Object.hasOwn(final,'workingVersion'),false);
  evidence.push({name,root,log,host:output.host,usage:output.result.usage,versions:existsSync(join(root,'versions'))?versions(root):[],reservations:final.versionReservations,outcome:'passed'});json(join(run,'evidence.json'),{host:'codex',cases:evidence});process.stdout.write(`PASS ${name}\n`);
 }
 const requests=readFileSync(calls,'utf8').split('\n').filter(Boolean).map(JSON.parse);assert.ok(requests.length>=selected.length,'all actions bind transport through proven intercepted adapter');assert.ok(requests.every(args=>args[0]==='api'&&args[1]==='repos/fixture/versions'&&!args.includes('--method')));
});
