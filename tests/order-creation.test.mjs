import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';

const requestId='15977609-edee-4a69-b182-6229c3b90a92';
const body='# Goal\nShow the empty state.\n\n## Tasks\n- [ ] 1. Display No results.\n- [ ] 7. Offer Clear filters.\n\n```designeritl-order\n{"schemaVersion":1,"requestId":"15977609-edee-4a69-b182-6229c3b90a92","followsOrderNumber":3,"cancelsOrderNumber":null}\n```\n';
const config={schemaVersion:2,role:'developer',repository:{repositoryId:101,owner:'alice',name:'transport'},deliveryDestination:'received'};
const state=()=>({schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null});
function project(){const root=mkdtempSync(join(tmpdir(),'ditl-order-'));mkdirSync(join(root,'.designeritl'));writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify(config));writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(state()));return root;}

test('an exact numbered feedback request survives verified local replacement before submission',async()=>{
  const f=await integrity(),root=project();
  const pending=f.createOrderRequest({repositoryId:101,title:'Empty search',goal:'Show the empty state.',tasks:[{ordinal:1,text:'Display No results.'},{ordinal:7,text:'Offer Clear filters.'}],followsOrderNumber:3});
  assert.match(pending.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(pending.intendedBody.replace(pending.requestId,requestId),body);
  const context=f.readProject(root,'developer');
  f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify({...context.state,pendingOrderCreations:[pending]})),{owner:'orders',kind:'state'});
  f.reconcileRecordReplacement(f.readProject(root,'developer'));
  const saved=JSON.parse(readFileSync(join(root,'.designeritl/state.json'))).pendingOrderCreations[0];
  assert.equal(saved.intendedBody,pending.intendedBody);
  assert.equal(saved.requestId,pending.requestId);
  assert.equal(saved.result,null);
  assert.equal(f.validatePendingOrderCreation(saved,101),saved);
});

test('lost creation response resumes one closed issue from a later page by structured identity',async()=>{
  const f=await integrity(),saved={schemaVersion:1,repositoryId:101,requestId,title:'Empty search',intendedBody:body,intendedBodySha256:f.sha256(Buffer.from(body)),submissionAttempted:true,result:null};
  const proseOnly={number:6,state:'open',title:'Empty search',body:`Same title and prose mention ${requestId}`};
  const match={number:12,state:'closed',title:'Renamed later',body};
  assert.equal(f.reconcileOrderRequest(saved,[[proseOnly],[match]],true),12);
  assert.equal(f.reconcileOrderRequest({...saved,submissionAttempted:false},[[proseOnly]],true),null);
  assert.throws(()=>f.reconcileOrderRequest(saved,[[match]],false),/incomplete/i);
  assert.throws(()=>f.reconcileOrderRequest(saved,[[match],[{...match,number:13}]],true),/duplicate/i);
  assert.throws(()=>f.reconcileOrderRequest(saved,[[{...match,body:body.replace('No results.','No items.')}]],true),/exact|body/i);
  assert.throws(()=>f.reconcileOrderRequest({...saved,result:11},[[match]],true),/conflict/i);
  assert.throws(()=>f.reconcileOrderRequest({...saved,result:12},[[]],true),/missing/i);
});

test('ambiguous machine identity preserves saved evidence and cannot authorize creation',async()=>{
  const f=await integrity(),root=project(),saved={schemaVersion:1,repositoryId:101,requestId,title:'Empty search',intendedBody:body,intendedBodySha256:f.sha256(Buffer.from(body)),submissionAttempted:true,result:null};
  const duplicateKey=body.replace(`"requestId":"${requestId}"`,`"requestId":"${requestId}","requestId":"635a9584-4904-477f-a7f4-840a4ad41b74"`);
  assert.throws(()=>f.reconcileOrderRequest(saved,[[{number:12,state:'open',body:duplicateKey}]],true));
  for(const corrupt of [{...saved,repositoryId:202},{...saved,schemaVersion:2},{...saved,intendedBody:body+'Changed'},{...saved,requestId:'635a9584-4904-477f-a7f4-840a4ad41b74'},{...saved,extra:'ignore validation'}]){
    const bytes=Buffer.from(JSON.stringify({...state(),pendingOrderCreations:[corrupt]}));writeFileSync(join(root,'.designeritl/state.json'),bytes);
    assert.throws(()=>f.readProject(root,'developer'));
    assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(bytes),'Invalid evidence is retained byte-for-byte');
  }
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({...state(),pendingOrderCreations:[saved,saved]}));
  assert.throws(()=>f.readProject(root,'developer'),/duplicate/i);
});

test('a durably attempted create waits through a stale complete empty listing instead of authorizing another POST',async()=>{
  const f=await integrity(),root=project(),fresh=f.createOrderRequest({repositoryId:101,title:'Empty search',goal:'Show the empty search state.',tasks:[{ordinal:1,text:'Display No results.'}]});
  assert.equal(f.reconcileOrderRequest(fresh,[[]],true),null,'A never-submitted request can create after complete discovery');
  const context=f.readProject(root,'developer'),attempted={...fresh,submissionAttempted:true};
  f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify({...context.state,pendingOrderCreations:[attempted]})),{owner:'orders',kind:'state'});
  f.reconcileRecordReplacement(f.readProject(root,'developer'));
  const saved=f.readProject(root,'developer').state.pendingOrderCreations[0];
  for(let retry=0;retry<3;retry++)assert.throws(()=>f.reconcileOrderRequest(saved,[[]],true),/attempt|uncertain|wait/i);
  assert.equal(f.reconcileOrderRequest(saved,[[{number:12,state:'closed',body:saved.intendedBody}]],true),12,'The eventual closed issue resumes the original saved request');
  assert.equal(saved.requestId,fresh.requestId);
  const installed=f.readProject(root,'developer'),bytes=readFileSync(join(root,'.designeritl/state.json'));
  assert.throws(()=>f.prepareRecordReplacement(installed,'.designeritl/state.json',Buffer.from(JSON.stringify({...installed.state,pendingOrderCreations:[{...saved,submissionAttempted:false}]})),{owner:'orders',kind:'state'}),/attempt|immutable/i);
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(bytes),'An attempted request cannot be reset to unsubmitted');
});
