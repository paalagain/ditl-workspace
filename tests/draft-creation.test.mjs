import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';
import {spawnSync} from 'node:child_process';

const id='1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a';
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

test('the controlled before-forward observation supports the documented release-create command',async()=>{
  const {f,root,pending,descriptor}=await fixture(),attempt=f.beginDraftCreation(root,id,[[]],true,[]),notes=join(pending,'release-notes.md'),config=join(root,'transport.json');
  writeFileSync(notes,'```designeritl-delivery\n'+JSON.stringify(descriptor)+'\n```\n');writeFileSync(config,JSON.stringify({repository:'alice/transport',project:root,deliveryId:id,formatReference:new URL('../protocols/format.md',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),realGh:process.execPath,log:join(root,'transport.jsonl'),beforeOnce:true}));
  const result=spawnSync(process.execPath,['tools/draft-transport-shim.mjs','--fixture-config',config,'release','create',descriptor.tag,'--repo','alice/transport','--draft','--title','Final fixture','--notes-file',notes],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,72,result.stderr);const proof=JSON.parse(readFileSync(join(pending,'evidence',`draft-nondispatch-${attempt.attemptId}.json`)));assert.equal(proof.requestDispatched,false);assert.equal(proof.attemptId,attempt.attemptId);assert.equal(proof.descriptorSha256,attempt.descriptorSha256);
});
