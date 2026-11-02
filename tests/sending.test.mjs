import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {integrity} from '../tools/protocol.mjs';
import {sending} from '../tools/sending.mjs';

const requestId='01684688-751b-44a5-8c15-df0b630f084a';
const body=`# Goal\nShow a design request\n\n- [ ] 1. Show the design\n\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId,followsOrderNumber:null,cancelsOrderNumber:null})}\n\`\`\`\n`;
const issues=[{number:7,state:'open',body,updated_at:'2026-10-31T12:00:00Z'}];
function project() {
  const root=mkdtempSync(join(tmpdir(),'ditl-sending-'));mkdirSync(join(root,'.designeritl'));
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));
  for(const folder of ['older.v1','latest.current.v3']) {mkdirSync(join(root,'versions',folder,'assets'),{recursive:true});writeFileSync(join(root,'versions',folder,'index.html'),folder);}
  utimesSync(join(root,'versions/older.v1/index.html'),new Date('2024-01-01'),new Date('2024-01-01'));utimesSync(join(root,'versions/latest.current.v3/index.html'),new Date('2030-01-01'),new Date('2030-01-01'));
  return root;
}
test('send selects an intentional order before recommending versions and preserves working selection',async()=>{
  const api=await sending(),f=await integrity(),root=project(),original=readFileSync(join(root,'.designeritl/state.json'));
  const choice=api.selectOrder(root,{issues,releases:[]});assert.equal(choice.status,'choose-order');assert.deepEqual(choice.orders.map(row=>row.number),[7]);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(original));
  const order=api.selectOrder(root,{issues,releases:[],orderNumber:7});assert.equal(order.status,'selected');
  assert.equal(f.parseLocalChecklist(readFileSync(join(root,'orders/7.md'))).scope.originalBody,body);
  const chooseVersion=api.selectVersion(root,order,{issues,releases:[]});assert.equal(chooseVersion.status,'choose-version');assert.equal(chooseVersion.recommended,3);
  const selected=api.selectVersion(root,order,{issues,releases:[],versionNumber:1});assert.equal(selected.status,'selected');assert.equal(selected.version.number,1);
  assert.deepEqual(readdirSync(join(root,'versions')).sort(),['latest.current.v3','older.v1']);
  assert.equal(api.selectOrder(root,{issues,releases:[]}).assignment.activationId,order.assignment.activationId,'an active order is reused without a new activation');
});
test('send reserves above published tags, drafts and retained local gaps without changing assignment or markers',async()=>{
  const api=await sending(),f=await integrity(),root=project();
  const initial=f.readProject(root);writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({...initial.state,deliveryTagReservations:[{deliveryId:'057619e4-c1e4-42d8-b250-8c289387c022',tag:'order-7/send-8'}]}));
  const releases=[{id:100,tag_name:'order-7/send-5',draft:true,body:'An earlier unrelated draft',assets:[]}],tags=[{name:'order-7/send-2'},{name:'order-99/send-90'}];
  const order=api.selectOrder(root,{issues,releases,orderNumber:7}),version=api.selectVersion(root,order,{issues,releases,versionNumber:1});
  const record=api.reserve(root,version,{issues,releases,tags,kind:'send',now:'2026-10-31T12:00:00.000Z'});
  assert.equal(record.tag,'order-7/send-9');assert.equal(record.kind,'send');assert.equal(record.versionNumber,1);assert.equal(record.capturedFolder,'older.v1');
  const after=f.readProject(root);assert.deepEqual(after.state.assignment,order.assignment);assert.equal(after.state.deliveryTagReservations.at(-1).deliveryId,record.deliveryId);assert.deepEqual(after.state.pendingDeliveryIndex,[record.deliveryId]);
  assert.deepEqual(readdirSync(join(root,'versions')).sort(),['latest.current.v3','older.v1']);
  const saved=readFileSync(join(root,'.designeritl/state.json'));assert.equal(api.selectOrder(root,{issues,releases}).status,'resume-pending');
  assert.throws(()=>api.reserve(root,version,{issues,releases,tags,kind:'send'}),/pending/i);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(saved));
});
test('developer state rejects the known designer delivery sections',async()=>{
  const f=await integrity(),config={schemaVersion:2,role:'developer',repository:{repositoryId:101,owner:'alice',name:'transport'},deliveryDestination:'received'},state={schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null};
  for(const field of ['completedDeliveries','deliveryTagReservations']) assert.throws(()=>f.validateState({...state,[field]:[]},config),/role fields/i);
});
test('a nonfinal manifest retains local unfinished progress without final claims',async()=>{
  const api=await sending(),f=await integrity(),root=project(),order=api.selectOrder(root,{issues,releases:[],orderNumber:7}),version=api.selectVersion(root,order,{issues,releases:[],versionNumber:1}),record=api.reserve(root,version,{issues,releases:[],tags:[],kind:'send'});
  mkdirSync(join(root,'.designeritl','pending',record.deliveryId,'snapshot'));const captured=f.capturePrototype(record.sourcePath,record.stagingPath);
  const path=`.designeritl/pending/${record.deliveryId}/record.json`,before=f.readProjectRecord(root,path),ready={...record,payloadSha256:captured.payloadSha256,capturedInventory:captured.files,capturedDirectories:captured.directories};
  f.prepareRecordReplacement(f.readProject(root),path,Buffer.from(JSON.stringify(ready)),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(before)},bytes=>f.validatePendingRecord(bytes,101));f.reconcileRecordReplacement(f.readProject(root),bytes=>f.validatePendingRecord(bytes,101));
  const bytes=api.nonfinalManifest(root,record.deliveryId,{summary:'Order 7 v1 progress',outsideOrder:'None',workInProgress:'The task remains locally unchecked.'}),manifest=f.validateManifest(bytes);
  assert.equal(manifest.kind,'send');assert.equal(manifest.evidence,null);assert.equal(manifest.deliveredUncheckedOrdinals,null);assert.deepEqual(manifest.localProgress.checkedOrdinals,[]);assert.equal(manifest.versionNumber,1);
  assert.equal(manifest.scopeSha256,f.parseLocalChecklist(readFileSync(join(root,'orders/7.md'))).scope.originalBodySha256);
  const packaged=f.packageDelivery(bytes,record.stagingPath);assert.equal(f.verifyDelivery(packaged.zip,packaged.descriptor).manifest.deliveryId,record.deliveryId);
  assert.deepEqual(f.readProject(root).state.assignment,order.assignment);
  const pending=join(root,'.designeritl','pending',record.deliveryId);writeFileSync(join(pending,'manifest.json'),bytes);writeFileSync(join(pending,'delivery.zip'),packaged.zip);writeFileSync(join(pending,'descriptor.json'),JSON.stringify(packaged.descriptor));
  const recordBytes=f.readProjectRecord(root,path),completed={...ready,zipSha256:packaged.descriptor.zipSha256,manifestSha256:packaged.descriptor.manifestSha256,assetBytes:packaged.descriptor.assetBytes};
  f.prepareRecordReplacement(f.readProject(root),path,Buffer.from(JSON.stringify(completed)),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(recordBytes)},value=>f.validatePendingRecord(value,101));f.reconcileRecordReplacement(f.readProject(root),value=>f.validatePendingRecord(value,101));
  const state=f.readProject(root).state,receipt={repositoryId:101,orderNumber:7,deliveryId:record.deliveryId,tag:record.tag,releaseId:20,assetId:30,manifestSha256:packaged.descriptor.manifestSha256,zipSha256:packaged.descriptor.zipSha256};
  f.prepareRecordReplacement(f.readProject(root),'.designeritl/state.json',Buffer.from(JSON.stringify({...state,pendingDeliveryIndex:[],completedDeliveries:[receipt]})),{owner:'deliveries',kind:'state'});f.reconcileRecordReplacement(f.readProject(root));
  const remote={id:20,tag_name:record.tag,draft:false,body:'```designeritl-delivery\n'+JSON.stringify(packaged.descriptor)+'\n```',assets:[{id:30,name:'delivery.zip',size:packaged.zip.length}]};
  assert.equal(api.selectOrder(root,{issues,releases:[remote]}).status,'selected','verified retained history must not trap the next send');
  assert.throws(()=>api.selectOrder(root,{issues,releases:[{...remote,assets:[{...remote.assets[0],id:31}]}]}),/receipt changed/);
  assert.ok(readFileSync(join(pending,'delivery.zip')).equals(packaged.zip));
});

async function capturedPreparation() {
  const api=await sending(),f=await integrity(),root=project(),observation={repositoryId:101,complete:true,releases:[],tags:[]};
  const order=api.selectOrder(root,{issues,releases:[],orderNumber:7}),version=api.selectVersion(root,order,{issues,releases:[],versionNumber:1}),record=api.reserve(root,version,{issues,releases:[],tags:[],kind:'final'});
  mkdirSync(join(root,'.designeritl/pending',record.deliveryId,'snapshot'));
  const captured=f.capturePrototype(record.sourcePath,record.stagingPath),path=`.designeritl/pending/${record.deliveryId}/record.json`;
  const original={...record,payloadSha256:captured.payloadSha256,capturedInventory:captured.files,capturedDirectories:captured.directories};
  const before=f.readProjectRecord(root,path);f.prepareRecordReplacement(f.readProject(root),path,Buffer.from(JSON.stringify(original)),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(before)});f.reconcileRecordReplacement(f.readProject(root));
  const evidence=join(root,'.designeritl/pending',record.deliveryId,'evidence');mkdirSync(evidence);writeFileSync(join(evidence,'portability.json'),'Retained blocked result');
  const state=readFileSync(join(root,'.designeritl/state.json'));
  return {api,f,root,observation,record,path,state};
}

test('an explicit replacement captures a user-repaired version under the same reservation and preserves prior bytes',async()=>{
  const {api,f,root,observation,record,path,state}=await capturedPreparation();
  const plan=api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use my repaired version 3'},observation);
  const replacement=api.resumeCaptureReplacement(root,record.deliveryId,observation);
  assert.equal(replacement.deliveryId,record.deliveryId);assert.equal(replacement.tag,record.tag);assert.equal(replacement.versionNumber,3);
  assert.equal(readFileSync(join(replacement.stagingPath,'index.html'),'utf8'),'latest.current.v3');
  const history=join(root,'.designeritl/pending',record.deliveryId,'capture-history',plan.operationId);
  assert.equal(readFileSync(join(history,'snapshot/older.v1/index.html'),'utf8'),'older.v1');
  assert.equal(readFileSync(join(history,'evidence/portability.json'),'utf8'),'Retained blocked result');
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(state));
  assert.deepEqual(readdirSync(join(root,'versions')).sort(),['latest.current.v3','older.v1']);
});
test('ambiguous pending work and invalid tag evidence cannot authorize a new transaction',async()=>{
  const api=await sending(),f=await integrity(),root=project(),order=api.selectOrder(root,{issues,releases:[],orderNumber:7}),version=api.selectVersion(root,order,{issues,releases:[],versionNumber:1});
  const before=readFileSync(join(root,'.designeritl/state.json'));
  assert.throws(()=>api.reserve(root,version,{issues,releases:[],tags:[{name:'order-7/send-01'}],kind:'send'}),/malformed delivery-like tag/i);assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  const first=api.reserve(root,version,{issues,releases:[],tags:[],kind:'send'}),second={...first,deliveryId:'057619e4-c1e4-42d8-b250-8c289387c022',tag:'order-7/send-2'};
  second.stagingPath=join(root,'.designeritl','pending',second.deliveryId,'snapshot',second.capturedFolder);mkdirSync(join(root,'.designeritl','pending',second.deliveryId));writeFileSync(join(root,'.designeritl','pending',second.deliveryId,'record.json'),JSON.stringify(second));
  const selected=api.selectOrder(root,{issues,releases:[]});assert.equal(selected.status,'choose-pending');assert.deepEqual(new Set(selected.pending.map(item=>item.deliveryId)),new Set([first.deliveryId,second.deliveryId]));
  assert.throws(()=>api.selectVersion(root,order,{issues,releases:[],versionNumber:1}),/pending/i);
});


test('capture replacement requires explicit choice and complete unoccupied remote observations',async()=>{
  const {api,root,record,path,observation}=await capturedPreparation(),saved=readFileSync(join(root,path));
  const choice={versionNumber:3,explicitDesignerStatement:'Use repaired v3'};
  for(const remote of [{...observation,complete:false},{...observation,repositoryId:202},{...observation,tags:[{name:record.tag}]},{...observation,releases:[{tag_name:record.tag,body:''}]}]) {
    assert.throws(()=>api.beginCaptureReplacement(root,record.deliveryId,choice,remote),/remote|bound|occupied/i);
    assert.ok(readFileSync(join(root,path)).equals(saved));
  }
  assert.throws(()=>api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3},observation),/explicit/i);
});

test('any partial package or draft attempt prevents replacement of captured bytes',async()=>{
  for(const name of ['manifest.json','delivery.zip','descriptor.json','release-notes.md']) {
    const {api,root,record,observation}=await capturedPreparation(),base=join(root,'.designeritl/pending',record.deliveryId);
    writeFileSync(join(base,name),'partial');
    assert.throws(()=>api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use repaired v3'},observation),/package|attempt/i);
    assert.equal(readFileSync(join(record.stagingPath,'index.html'),'utf8'),'older.v1');
  }
  const {api,f,root,record,path,observation}=await capturedPreparation(),saved=JSON.parse(readFileSync(join(root,path)));
  saved.draftCreation.attempts=[{attemptId:'057619e4-c1e4-42d8-b250-8c289387c022',descriptorSha256:'ab'.repeat(32),startedAt:'2026-11-01T00:00:00.000Z',nonDispatchProof:null}];
  writeFileSync(join(root,path),JSON.stringify(saved));
  assert.throws(()=>api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use repaired v3'},observation),/package|attempt/i);
});

test('replacement resumes an interrupted snapshot promotion without recopying later source edits',async()=>{
  for(const point of ['archive','promote']) {
    const {api,root,record,observation}=await capturedPreparation(),base=join(root,'.designeritl/pending',record.deliveryId);
    const plan=api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use repaired v3'},observation);
    const interrupted=point==='archive'?join(base,'snapshot'):join(base,'capture-staging',plan.operationId,'snapshot');
    const rename=fs.renameSync;fs.renameSync=(from,to)=>{rename(from,to);if(from===interrupted)throw Error('Lost snapshot rename response');};syncBuiltinESMExports();
    try {assert.throws(()=>api.resumeCaptureReplacement(root,record.deliveryId,observation),/lost snapshot/i);} finally {fs.renameSync=rename;syncBuiltinESMExports();}
    writeFileSync(join(root,'versions/latest.current.v3/index.html'),'User edits after captured replacement');
    const result=api.resumeCaptureReplacement(root,record.deliveryId,observation);
    assert.equal(readFileSync(join(result.stagingPath,'index.html'),'utf8'),'latest.current.v3');
    assert.equal(readFileSync(join(base,'capture-history',plan.operationId,'snapshot/older.v1/index.html'),'utf8'),'older.v1');
    assert.equal(api.resumeCaptureReplacement(root,record.deliveryId,observation).payloadSha256,result.payloadSha256);
  }
});

test('changed source or partial replacement capture remains pending with original evidence intact',async()=>{
  const {api,root,record,observation}=await capturedPreparation(),base=join(root,'.designeritl/pending',record.deliveryId);
  const plan=api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use repaired v3'},observation);
  writeFileSync(join(plan.sourcePath,'index.html'),'Changed before capture');
  assert.throws(()=>api.resumeCaptureReplacement(root,record.deliveryId,observation),/source changed/i);
  const staged=join(base,'capture-staging',plan.operationId,'snapshot',plan.capturedFolder);mkdirSync(join(staged,'assets'),{recursive:true});writeFileSync(join(staged,'index.html'),'partial');
  assert.throws(()=>api.resumeCaptureReplacement(root,record.deliveryId,observation),/does not match/i);
  assert.equal(readFileSync(join(staged,'index.html'),'utf8'),'partial');
  assert.equal(readFileSync(join(record.stagingPath,'index.html'),'utf8'),'older.v1');
  assert.equal(readFileSync(join(base,'evidence/portability.json'),'utf8'),'Retained blocked result');
});

test('a misplaced pending record cannot move another delivery capture before refusing its identity',async()=>{
  const {api,root,record,path,observation}=await capturedPreparation();
  api.beginCaptureReplacement(root,record.deliveryId,{versionNumber:3,explicitDesignerStatement:'Use repaired v3'},observation);
  const otherId='057619e4-c1e4-42d8-b250-8c289387c022',other=join(root,'.designeritl/pending',otherId),snapshot=join(other,'snapshot/older.v1');
  mkdirSync(join(snapshot,'assets'),{recursive:true});writeFileSync(join(snapshot,'index.html'),'Other delivery bytes');
  const misplaced=readFileSync(join(root,path));writeFileSync(join(other,'record.json'),misplaced);
  assert.throws(()=>api.resumeCaptureReplacement(root,otherId,observation),/identity|conflict/i);
  assert.equal(readFileSync(join(snapshot,'index.html'),'utf8'),'Other delivery bytes');
  assert.ok(readFileSync(join(other,'record.json')).equals(misplaced));
});
