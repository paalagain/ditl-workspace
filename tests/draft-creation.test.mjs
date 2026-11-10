import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';
import {spawnSync} from 'node:child_process';

const id='1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a';
const draft=(descriptor,id=17)=>({id,tag_name:descriptor.tag,draft:true,body:'```designeritl-delivery\n'+JSON.stringify(descriptor)+'\n```'});
async function fixture(){
  const f=await integrity(),root=mkdtempSync(join(tmpdir(),'ditl-draft-create-')),relative=`.designeritl/pending/${id}`,pending=join(root,relative),snapshot=join(pending,'snapshot/design.v1');
  mkdirSync(join(snapshot,'assets'),{recursive:true});writeFileSync(join(snapshot,'index.html'),'Captured design');
  const captured=f.inventory(snapshot),manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId:id,tag:'order-7/send-1',kind:'send',versionNumber:1,capturedFolder:'design.v1',capturedAt:'2026-10-31T12:00:00.000Z',...{inventory:captured.files,directories:captured.directories,payloadSha256:captured.payloadSha256},scopeSha256:'ab'.repeat(32),localProgress:{checkedOrdinals:[],taskContext:''},deliveryNote:{summary:'Order 7 v1',outsideOrder:'None',workInProgress:'Unfinished'},deliveredUncheckedOrdinals:null,evidence:null};
  const bytes=Buffer.from(JSON.stringify(manifest)),packaged=f.packageDelivery(bytes,snapshot),record={...manifest,schemaVersion:1,assignmentToken:{orderId:{repositoryId:123,issueNumber:7},activationId:'057619e4-c1e4-42d8-b250-8c289387c022'},sourcePath:join(root,'source'),stagingPath:snapshot,zipSha256:packaged.descriptor.zipSha256,manifestSha256:packaged.descriptor.manifestSha256,assetBytes:packaged.zip.length,draftCreation:{schemaVersion:1,attempts:[]}};
  writeFileSync(join(pending,'record.json'),JSON.stringify(record));writeFileSync(join(pending,'descriptor.json'),JSON.stringify(packaged.descriptor));writeFileSync(join(pending,'manifest.json'),bytes);writeFileSync(join(pending,'delivery.zip'),packaged.zip);
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:123,owner:'alice',name:'transport'}}));writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:record.assignmentToken,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[id],localMutationIntent:null}));
  return {f,root,relative,pending,record,descriptor:packaged.descriptor,zip:packaged.zip};
}

test('a durable draft attempt cannot create through stale complete absence, and later resumes only its exact descriptor',async()=>{
  const {f,root,pending,record,descriptor,zip}=await fixture();
  assert.equal(f.reconcileDraftCreation(record,descriptor,[[]],true,[]).action,'create');
  const attempted=f.beginDraftCreation(root,id,[[]],true,[]),saved=f.validatePendingRecord(readFileSync(join(pending,'record.json')),123);
  assert.equal(saved.draftCreation.attempts[0].attemptId,attempted.attemptId);
  for(let retry=0;retry<3;retry++)assert.throws(()=>f.reconcileDraftCreation(saved,descriptor,[[]],true,[]),/uncertain|attempt/i);
  assert.throws(()=>f.beginDraftCreation(root,id,[[]],true,[]),/uncertain|attempt/i);
  const changed={...descriptor,zipSha256:'cd'.repeat(32)};
  assert.throws(()=>f.reconcileDraftCreation({...saved,zipSha256:changed.zipSha256},changed,[[]],true,[]),/descriptor/i);
  const release={id:17,tag_name:descriptor.tag,draft:true,body:'```designeritl-delivery\n'+JSON.stringify(descriptor)+'\n```'};
  assert.deepEqual(f.reconcileDraftCreation(saved,descriptor,[[release]],true,[]),{action:'resume',releaseId:17,draft:true});
  assert.throws(()=>f.reconcileDraftCreation(saved,descriptor,[[release,{...release,id:18}]],true,[]),/duplicate|conflict/i);
  assert.throws(()=>f.reconcileDraftCreation(saved,descriptor,[[{...release,body:release.body.replace(descriptor.zipSha256,'cd'.repeat(32))}]],true,[]),/descriptor|conflict/i);
  const old={...record};delete old.draftCreation;
  assert.throws(()=>f.reconcileDraftCreation(old,descriptor,[[]],true,[]),/legacy|missing|uncertain/i);
  assert.ok(readFileSync(join(pending,'delivery.zip')).equals(zip));
});

test('a complete GraphQL listing resumes a draft missing from REST, with union conflict detection',async()=>{
  const {f,root,pending,descriptor}=await fixture();
  f.beginDraftCreation(root,id,[[]],true,[]);
  const record=JSON.parse(readFileSync(join(pending,'record.json'))),release=draft(descriptor),graphql={pages:[[release]],complete:true};
  assert.deepEqual(f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql}),{action:'resume',releaseId:17,draft:true});
  assert.deepEqual(f.reconcileDraftCreation(record,descriptor,[[release]],true,[],{graphql}),{action:'resume',releaseId:17,draft:true});
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[{...release,id:18}]],true,[],{graphql}),/Duplicate draft delivery identity/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql:{...graphql,complete:false}}),/Incomplete/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],false,[],{graphql}),/Incomplete/);
  assert.throws(()=>f.beginDraftCreation(root,id,[[]],true,[],{graphql}),/resume/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[release]],true,[],{graphql:{pages:[[{...release,draft:false}]],complete:true}}),/Conflicting observations/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql:{pages:[[{...release,body:release.body.replace(descriptor.zipSha256,'cd'.repeat(32))}]],complete:true}}),/descriptor conflict/);
});

async function receiptFixture(){
  const value=await fixture(),{f,root,pending,descriptor}=value,attempt=f.beginDraftCreation(root,id,[[]],true,[]),release=draft(descriptor);
  mkdirSync(join(pending,'evidence'));
  const receiptPath=join(pending,'evidence',`draft-create-${attempt.attemptId}.json`),receiptBytes=Buffer.from(JSON.stringify({...release,url:'https://api.github.com/repos/alice/transport/releases/17'})+'\n');
  writeFileSync(receiptPath,receiptBytes);
  const record=f.recordDraftCreateReceipt(root,id);
  return {...value,record,attempt,release,receiptPath,receiptBytes};
}

test('a saved create receipt permits unlisted asset work while publication waits for a unique listing',async()=>{
  const {f,root,pending,record,descriptor,release,receiptBytes,attempt}=await receiptFixture(),graphql={pages:[[]],complete:true},observations={graphql,directRelease:release};
  assert.deepEqual(record.draftCreation.attempts[0].createReceipt,{path:`.designeritl/pending/${id}/evidence/draft-create-${attempt.attemptId}.json`,sha256:f.sha256(receiptBytes),releaseId:17});
  assert.deepEqual(f.reconcileDraftCreation(record,descriptor,[[]],true,[],observations),{action:'resume-unlisted',releaseId:17,draft:true});
  assert.throws(()=>f.requireDraftPublication(record,descriptor,[[]],true,[],17,observations),/Publication requires a unique listed/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql}),/^Error: Draft 17 exists but is not yet listed by GitHub; rerun later$/);
  assert.throws(()=>f.beginDraftCreation(root,id,[[]],true,[],observations),/resume/);
  assert.deepEqual(f.requireDraftPublication(record,descriptor,[[release]],true,[],17,observations),{action:'resume',releaseId:17,draft:true});
  assert.deepEqual(f.requireDraftPublication(record,descriptor,[[]],true,[],17,{graphql:{pages:[[release]],complete:true}}),{action:'resume',releaseId:17,draft:true});
  assert.throws(()=>f.requireDraftPublication(record,descriptor,[[release]],true,[],18),/Publication requires/);
  assert.throws(()=>f.requireDraftPublication(record,descriptor,[[{...release,draft:false}]],true,[],17),/Publication requires/);
  assert.throws(()=>f.requireDraftPublication(record,descriptor,[[release]],true,[],17,{graphql:{pages:[[{...release,id:18}]],complete:true}}),/Duplicate draft delivery identity/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[{...release,id:18}]],true,[]),/Duplicate draft delivery identity/);
  assert.equal(f.verifyPendingDelivery(pending,123).record.draftCreation.attempts.length,1);
});

test('a direct receipt read must match its id, tag, unpublished state and full descriptor',async()=>{
  const {f,record,descriptor,release}=await receiptFixture();
  for(const directRelease of [{...release,id:18},{...release,tag_name:'order-7/send-2'},{...release,draft:false},{...release,body:release.body.replace(descriptor.zipSha256,'cd'.repeat(32))}]) {
    assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql:{pages:[[]],complete:true},directRelease}),/Direct draft receipt identity or descriptor conflict/);
  }
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[{name:descriptor.tag}],{directRelease:release}),/Occupied delivery tag/);
  const conflicting={...release,tag_name:'unrelated',body:null};
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[conflicting]],true,[],{directRelease:release}),/descriptor conflict/);
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql:{pages:[[conflicting]],complete:true},directRelease:release}),/descriptor conflict/);
});

test('without a receipt empty complete listings retain the uncertain stop even with a direct read',async()=>{
  const {f,root,pending,descriptor}=await fixture();
  f.beginDraftCreation(root,id,[[]],true,[]);
  const record=JSON.parse(readFileSync(join(pending,'record.json')));
  assert.throws(()=>f.reconcileDraftCreation(record,descriptor,[[]],true,[],{graphql:{pages:[[]],complete:true},directRelease:draft(descriptor)}),/^Error: Uncertain draft create attempt; reconcile read-only and wait for identity$/);
});

test('create receipts are write-once, immutable at replacement, and verified from retained raw bytes',async()=>{
  const {f,root,relative,pending,record,descriptor,receiptPath,receiptBytes}=await receiptFixture(),before=readFileSync(join(pending,'record.json'));
  assert.throws(()=>f.recordDraftCreateReceipt(root,id),/without a receipt/);
  assert.throws(()=>f.recordDraftNonDispatch(root,id),/without a receipt/);
  const replacement=next=>f.prepareRecordReplacement(f.readProject(root,'designer'),`${relative}/record.json`,Buffer.from(JSON.stringify(next)),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(before)});
  for(const change of [attempt=>{delete attempt.createReceipt;},attempt=>{attempt.createReceipt.releaseId=18;},attempt=>{attempt.createReceipt.sha256='cd'.repeat(32);},attempt=>{attempt.createReceipt.path=attempt.createReceipt.path.replace('draft-create-','other-');}]) {
    const next=structuredClone(record);change(next.draftCreation.attempts[0]);assert.throws(()=>replacement(next),/immutable|receipt/i);
  }
  const appended=structuredClone(record);appended.draftCreation.attempts.push({...appended.draftCreation.attempts[0],attemptId:'057619e4-c1e4-42d8-b250-8c289387c022',createReceipt:undefined});
  assert.throws(()=>replacement(appended),/Uncertain draft attempt cannot be retried/);
  assert.ok(readFileSync(join(pending,'record.json')).equals(before));
  writeFileSync(receiptPath,Buffer.concat([receiptBytes,Buffer.from(' ')]));
  assert.throws(()=>f.verifyPendingDelivery(pending,123),/receipt descriptor or bytes/);
  writeFileSync(receiptPath,receiptBytes);
  assert.ok(f.verifyPendingDelivery(pending,123));
});

test('recording a receipt validates raw release identity and full descriptor before writing',async()=>{
  const {f,root,pending,descriptor}=await fixture(),attempt=f.beginDraftCreation(root,id,[[]],true,[]),before=readFileSync(join(pending,'record.json')),release=draft(descriptor);
  mkdirSync(join(pending,'evidence'));
  const path=join(pending,'evidence',`draft-create-${attempt.attemptId}.json`);
  for(const response of [{...release,id:0},{...release,tag_name:'other'},{...release,draft:false},{...release,body:release.body.replace(descriptor.zipSha256,'cd'.repeat(32))},{...release,body:release.body+'\n'+release.body}]) {
    writeFileSync(path,JSON.stringify(response));assert.throws(()=>f.recordDraftCreateReceipt(root,id),/receipt|observation|descriptor/i);assert.ok(readFileSync(join(pending,'record.json')).equals(before));
  }
});

test('a receipt can be attached only after the current attempt is durable',async()=>{
  const {f,root,pending,relative,record,descriptor}=await fixture(),before=readFileSync(join(pending,'record.json'));
  const attempt={attemptId:'057619e4-c1e4-42d8-b250-8c289387c022',descriptorSha256:f.sha256(Buffer.from(JSON.stringify(descriptor))),startedAt:'2026-11-01T00:00:00.000Z',nonDispatchProof:null,createReceipt:{path:`.designeritl/pending/${id}/evidence/draft-create-057619e4-c1e4-42d8-b250-8c289387c022.json`,sha256:'ab'.repeat(32),releaseId:17}};
  assert.throws(()=>f.prepareRecordReplacement(f.readProject(root,'designer'),`${relative}/record.json`,Buffer.from(JSON.stringify({...record,draftCreation:{schemaVersion:1,attempts:[attempt]}})),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(before)}),/requires an existing current attempt/);
  assert.ok(readFileSync(join(pending,'record.json')).equals(before));
});

test('only retained independent non-dispatch evidence permits another attempt without resetting history',async()=>{
  const {f,root,pending,relative,descriptor,zip}=await fixture(),first=f.beginDraftCreation(root,id,[[]],true,[]),before=readFileSync(join(pending,'record.json'));
  const saved=JSON.parse(before),context=f.readProject(root,'designer');
  for(const draftCreation of [undefined,{schemaVersion:1,attempts:[]}])assert.throws(()=>f.prepareRecordReplacement(context,`${relative}/record.json`,Buffer.from(JSON.stringify({...saved,draftCreation})),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(before)}),/append|removed|missing/i);
  assert.ok(readFileSync(join(pending,'record.json')).equals(before));
  mkdirSync(join(pending,'evidence'));
  const proofPath=join(pending,'evidence',`draft-nondispatch-${first.attemptId}.json`),proof={schemaVersion:1,repositoryId:123,deliveryId:id,tag:descriptor.tag,attemptId:first.attemptId,descriptorSha256:first.descriptorSha256,kind:'controlled-before-forward',requestDispatched:false,statusCode:null,observedAt:'2026-10-31T12:01:00.000Z'};
  writeFileSync(proofPath,JSON.stringify({...proof,requestDispatched:true}));
  assert.throws(()=>f.recordDraftNonDispatch(root,id),/prove|proof|dispatch/i);
  assert.ok(readFileSync(join(pending,'record.json')).equals(before));
  writeFileSync(proofPath,JSON.stringify(proof));f.recordDraftNonDispatch(root,id);
  const retained=readFileSync(proofPath);writeFileSync(proofPath,Buffer.concat([retained,Buffer.from(' ')]));
  assert.throws(()=>f.beginDraftCreation(root,id,[[]],true,[]),/proof/i);
  writeFileSync(proofPath,retained);
  const second=f.beginDraftCreation(root,id,[[]],true,[]),after=JSON.parse(readFileSync(join(pending,'record.json')));
  assert.notEqual(second.attemptId,first.attemptId);assert.equal(after.draftCreation.attempts.length,2);assert.equal(after.draftCreation.attempts[0].attemptId,first.attemptId);assert.ok(after.draftCreation.attempts[0].nonDispatchProof);assert.equal(after.draftCreation.attempts[1].nonDispatchProof,null);
  assert.throws(()=>f.beginDraftCreation(root,id,[[]],true,[]),/uncertain/i);
  assert.ok(readFileSync(join(pending,'delivery.zip')).equals(zip));
});

test('the controlled before-forward observation supports the legacy release-create command',async()=>{
  const {f,root,pending,descriptor}=await fixture(),attempt=f.beginDraftCreation(root,id,[[]],true,[]),notes=join(pending,'release-notes.md'),config=join(root,'transport.json');
  writeFileSync(notes,'```designeritl-delivery\n'+JSON.stringify(descriptor)+'\n```\n');writeFileSync(config,JSON.stringify({repository:'alice/transport',project:root,deliveryId:id,formatReference:new URL('../protocols/format.md',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),realGh:process.execPath,log:join(root,'transport.jsonl'),beforeOnce:true}));
  const result=spawnSync(process.execPath,['tools/draft-transport-shim.mjs','--fixture-config',config,'release','create',descriptor.tag,'--repo','alice/transport','--draft','--title','Final fixture','--notes-file',notes],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,72,result.stderr);const proof=JSON.parse(readFileSync(join(pending,'evidence',`draft-nondispatch-${attempt.attemptId}.json`)));assert.equal(proof.requestDispatched,false);assert.equal(proof.attemptId,attempt.attemptId);assert.equal(proof.descriptorSha256,attempt.descriptorSha256);
});

test('the controlled before-forward observation supports the REST POST create command',async()=>{
  const {f,root,pending,descriptor}=await fixture(),attempt=f.beginDraftCreation(root,id,[[]],true,[]),request=join(pending,'draft-request.json'),config=join(root,'transport.json');
  writeFileSync(request,JSON.stringify({tag_name:descriptor.tag,draft:true,name:'Final fixture',body:draft(descriptor).body}));
  writeFileSync(config,JSON.stringify({repository:'alice/transport',project:root,deliveryId:id,formatReference:new URL('../protocols/format.md',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),realGh:process.execPath,log:join(root,'transport.jsonl'),beforeOnce:true}));
  const result=spawnSync(process.execPath,['tools/draft-transport-shim.mjs','--fixture-config',config,'api','--method','POST','repos/alice/transport/releases','--input',request],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,72,result.stderr);
  const proof=JSON.parse(readFileSync(join(pending,'evidence',`draft-nondispatch-${attempt.attemptId}.json`)));
  assert.equal(proof.requestDispatched,false);assert.equal(proof.attemptId,attempt.attemptId);assert.equal(proof.descriptorSha256,attempt.descriptorSha256);
});

