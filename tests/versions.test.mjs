import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,renameSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';
const config={schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}};
const state=()=>({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null});
function project(){const root=mkdtempSync(join(tmpdir(),'ditl-versions-'));mkdirSync(join(root,'.designeritl'));writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify(config));writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(state()));return root;}
function prototype(root,name,html='accumulated design'){const path=join(root,'versions',name);mkdirSync(join(path,'assets','empty'),{recursive:true});writeFileSync(join(path,'index.html'),html);writeFileSync(join(path,'assets','design.css'),'body{color:blue}');return path;}
const current=root=>readdirSync(join(root,'versions')).filter(name=>name.includes('.current.v'));
test('empty creation reserves before staging and only a complete result becomes working',async()=>{
 const f=await integrity(),root=project();
 const intent=f.reserveVersion(f.readProject(root),{mode:'empty',label:'first'});
 assert.equal(intent.number,1);assert.deepEqual(f.readProject(root).state.versionReservations,[1]);assert.equal(existsSync(join(root,intent.stagingPath)),false);
 f.stageVersion(f.readProject(root));assert.equal(existsSync(join(root,intent.stagingPath,'index.html')),true);assert.equal(existsSync(join(root,intent.stagingPath,'assets')),true);
 assert.equal(existsSync(join(root,'versions','first.current.v1')),false);
 f.finishVersion(f.readProject(root));assert.deepEqual(current(root),['first.current.v1']);assert.equal(f.readProject(root).state.versionCreationIntent,null);assert.match(readFileSync(join(root,'versions','first.current.v1','index.html'),'utf8'),/<!doctype html>/i);
});
test('default copy and explicit branch preserve accumulated bytes, empty directories and reserved gaps',async()=>{
 const f=await integrity(),root=project();prototype(root,'entire.current.v3');prototype(root,'older.v1','older complete project');
 const original={...state(),versionReservations:[2,9],seenOrderFingerprints:{7:{bodySha256:'ab'.repeat(32)}}};writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(original));
 let i=f.reserveVersion(f.readProject(root),{label:'next'});assert.equal(i.number,10);f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));
 assert.deepEqual(current(root),['next.current.v10']);assert.equal(readFileSync(join(root,'versions','next.current.v10','index.html'),'utf8'),'accumulated design');assert.ok(existsSync(join(root,'versions','next.current.v10','assets','empty')));
 i=f.reserveVersion(f.readProject(root),{label:'branch',fromNumber:1});f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));assert.equal(i.number,11);assert.equal(readFileSync(join(root,'versions','branch.current.v11','index.html'),'utf8'),'older complete project');
 assert.equal(readFileSync(join(root,'versions','older.v1','index.html'),'utf8'),'older complete project');assert.deepEqual(f.readProject(root).state.seenOrderFingerprints,original.seenOrderFingerprints);assert.ok(!Object.hasOwn(f.readProject(root).state,'workingVersion'));
});
test('import and captured accepted-fix sources preserve exact files and refuse format/hash problems',async()=>{
 const f=await integrity(),root=project();prototype(root,'source.current.v5','imported whole project');let source=join(root,'versions','source.current.v5');
 let i=f.reserveVersion(f.readProject(root),{mode:'import',importPath:source,label:'import'});f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));assert.equal(i.number,6);assert.equal(readFileSync(join(root,'versions','import.current.v6','index.html'),'utf8'),'imported whole project');
 source=join(root,'versions','source.v5');const digest=f.inventory(source).payloadSha256;
 assert.throws(()=>f.reserveVersion(f.readProject(root),{mode:'capture',capturePath:source,payloadSha256:'ab'.repeat(32)}),/hash mismatch/i);
 i=f.reserveVersion(f.readProject(root),{mode:'capture',capturePath:source,payloadSha256:digest,label:'fixes'});f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));assert.equal(i.number,7);assert.equal(f.inventory(join(root,'versions','fixes.current.v7')).payloadSha256,digest);
 const invalid=join(root,'invalid-import');mkdirSync(invalid);writeFileSync(join(invalid,'index.html'),'missing assets');const before=readFileSync(join(root,'.designeritl/state.json'));assert.throws(()=>f.reserveVersion(f.readProject(root),{mode:'import',importPath:invalid}),/assets|ENOENT/);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
});
test('interrupted partial copy resumes only matching bytes and complete result precedes marker transfer',async()=>{
 const f=await integrity(),root=project();prototype(root,'base.current.v1');let i=f.reserveVersion(f.readProject(root),{label:'next'});
 mkdirSync(join(root,i.stagingPath,'assets'),{recursive:true});writeFileSync(join(root,i.stagingPath,'index.html'),'accumulated design');
 assert.throws(()=>f.finishVersion(f.readProject(root)),/inventory mismatch/i);assert.deepEqual(current(root),['base.current.v1']);assert.ok(f.readProject(root).state.versionCreationIntent);
 f.stageVersion(f.readProject(root));renameSync(join(root,i.stagingPath),join(root,i.resultPath));
 assert.deepEqual(current(root),['base.current.v1']);f.finishVersion(f.readProject(root));assert.deepEqual(current(root),['next.current.v2']);
 i=f.reserveVersion(f.readProject(root),{label:'third'});f.stageVersion(f.readProject(root));renameSync(join(root,i.stagingPath),join(root,i.resultPath));renameSync(join(root,'versions','next.current.v2'),join(root,'versions','next.v2'));
 assert.throws(()=>f.finishVersion(f.readProject(root)),/explicit working version choice/i);assert.equal(f.readProject(root).state.versionCreationIntent.number,3);
 f.finishVersion(f.readProject(root),{workingNumber:3});assert.deepEqual(current(root),['third.current.v3']);
 i=f.reserveVersion(f.readProject(root),{label:'fourth'});f.stageVersion(f.readProject(root));renameSync(join(root,i.stagingPath),join(root,i.currentPath));renameSync(join(root,'versions','third.current.v3'),join(root,'versions','third.v3'));
 f.finishVersion(f.readProject(root));assert.deepEqual(current(root),['fourth.current.v4']);assert.equal(f.readProject(root).state.versionCreationIntent,null);
});
test('changed source or conflicting partial/result bytes preserve intent and old working design',async()=>{
 const f=await integrity();for(const scenario of ['source','partial','result']) {const root=project(),source=prototype(root,'base.current.v1');const i=f.reserveVersion(f.readProject(root),{label:'next'});
 if(scenario==='source')writeFileSync(join(source,'index.html'),'changed after reservation');
 if(scenario==='partial'){mkdirSync(join(root,i.stagingPath,'assets'),{recursive:true});writeFileSync(join(root,i.stagingPath,'index.html'),'foreign bytes');}
 if(scenario==='result'){f.stageVersion(f.readProject(root));writeFileSync(join(root,i.stagingPath,'assets','unexpected.txt'),'extra');}
 assert.throws(()=>scenario==='result'?f.finishVersion(f.readProject(root)):f.stageVersion(f.readProject(root)),/inventory mismatch|conflicting partial/i);assert.deepEqual(current(root),['base.current.v1']);assert.equal(f.readProject(root).state.versionCreationIntent.number,2);assert.deepEqual(f.readProject(root).state.versionReservations,[2]);}
});
test('missing/multiple markers recommend actual latest edit and require a choice; duplicate numbers always refuse',async()=>{
 const f=await integrity();for(const marked of [false,true]){const root=project();const first=prototype(root,`older${marked?'.current':''}.v1`),second=prototype(root,`latest${marked?'.current':''}.v3`);utimesSync(join(first,'index.html'),new Date('2024-01-01'),new Date('2024-01-01'));utimesSync(join(second,'index.html'),new Date('2030-01-01'),new Date('2030-01-01'));
 const observed=f.inspectVersions(f.readProject(root));assert.equal(observed.requiresChoice,true);assert.equal(observed.recommended.number,3);const before=readFileSync(join(root,'.designeritl/state.json'));
 assert.throws(()=>f.reserveVersion(f.readProject(root),{label:'next'}),/choice required.*v3/i);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
 const i=f.reserveVersion(f.readProject(root),{label:'next',workingNumber:1});f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));assert.equal(i.number,4);assert.deepEqual(current(root),['next.current.v4']);}
 const root=project();prototype(root,'one.current.v2');prototype(root,'duplicate.v2');const before=readFileSync(join(root,'.designeritl/state.json'));assert.throws(()=>f.reserveVersion(f.readProject(root),{mode:'empty'}),/duplicate version number/i);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
});


test('stale contexts and malformed version records stop before filesystem mutation',async()=>{
 const f=await integrity(),root=project();prototype(root,'base.current.v1');let saved=f.readProject(root);const i=f.reserveVersion(saved,{label:'next'});
 assert.throws(()=>f.stageVersion(saved),/stale|concurrent/i);assert.equal(existsSync(join(root,i.stagingPath)),false);
 saved=f.readProject(root);writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({...saved.state,versionReservations:[2,40]}));assert.throws(()=>f.stageVersion(saved),/stale|concurrent/i);assert.equal(existsSync(join(root,i.stagingPath)),false);
 for(const patch of [{versionReservations:[0]},{versionReservations:[2,2]},{versionCreationIntent:{...i,source:{kind:'other',path:root}}},{versionCreationIntent:{...i,expected:{...i.expected,files:[]}}}]) {writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({...saved.state,...patch}));assert.throws(()=>f.readProject(root),/version|inventory/i);}
 assert.deepEqual(current(root),['base.current.v1']);
});

test('saved creation intent never chooses a working marker when zero or multiple markers remain',async()=>{
 const f=await integrity();
 for(const scenario of ['zero','multiple']) {
  const root=project();prototype(root,'base.current.v1');const intent=f.reserveVersion(f.readProject(root),{label:'next'});f.stageVersion(f.readProject(root));
  renameSync(join(root,intent.stagingPath),join(root,scenario==='zero'?intent.resultPath:intent.currentPath));
  if(scenario==='zero')renameSync(join(root,'versions','base.current.v1'),join(root,'versions','base.v1'));
  const result=join(root,scenario==='zero'?intent.resultPath:intent.currentPath);utimesSync(join(result,'index.html'),new Date('2030-01-01'),new Date('2030-01-01'));
  const beforeState=readFileSync(join(root,'.designeritl/state.json')),beforeFolders=readdirSync(join(root,'versions')).sort();
  assert.throws(()=>f.finishVersion(f.readProject(root)),/explicit working version choice required; recommend v2/i);
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(beforeState));assert.deepEqual(readdirSync(join(root,'versions')).sort(),beforeFolders);
  assert.equal(f.readProject(root).state.versionCreationIntent.number,2);
  f.finishVersion(f.readProject(root),{workingNumber:2});assert.deepEqual(current(root),['next.current.v2']);assert.equal(f.readProject(root).state.versionCreationIntent,null);assert.deepEqual(f.readProject(root).state.versionReservations,[2]);
 }
});
