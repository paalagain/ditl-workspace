import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrity } from '../tools/protocol.mjs';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requestId='01684688-751b-44a5-8c15-df0b630f084a';
const body=(goal='Show checkout',tasks=['Show empty cart','Show populated cart'])=>`# Goal\r\n${goal}\r\n\r\n${tasks.map((text,index)=>`- [ ] ${index+1}. ${text}`).join('\r\n')}\r\n\r\n\`\`\`designeritl-order\r\n${JSON.stringify({schemaVersion:1,requestId,followsOrderNumber:null,cancelsOrderNumber:null})}\r\n\`\`\`\r\n`;

test('local checklist preserves exact agreed scope while ticks and task context change separately',async()=>{
  const f=await integrity(),original=body(),id={repositoryId:101,issueNumber:7};
  const bytes=f.createLocalChecklist(id,original,'2026-10-31T12:00:00.000Z');
  const initial=f.parseLocalChecklist(bytes,id);
  assert.equal(initial.scope.originalBody,original);
  assert.equal(initial.scope.originalBodySha256,f.sha256(Buffer.from(original)));
  assert.deepEqual(initial.scope.tasks,[{ordinal:1,text:'Show empty cart'},{ordinal:2,text:'Show populated cart'}]);
  assert.deepEqual(initial.checkedOrdinals,[]);
  const changed=f.updateLocalChecklist(bytes,[1],'Empty cart verified. Continue populated cart.');
  const resumed=f.parseLocalChecklist(changed,id);
  assert.equal(resumed.scopeBlock,initial.scopeBlock,'scope bytes do not change when progress changes');
  assert.deepEqual(resumed.checkedOrdinals,[1]);
  assert.equal(resumed.taskContext,'Empty cart verified. Continue populated cart.');
  assert.throws(()=>f.updateLocalChecklist(changed,[3],'invalid task'),/unknown task/i);
  assert.throws(()=>f.parseLocalChecklist(changed,{repositoryId:202,issueNumber:7}),/identity/i);
  assert.throws(()=>f.updateLocalChecklist(Buffer.concat([Buffer.from('Unclassified notes must be retained\n'),changed]),[1],'new context'),/outside|unsupported/i,'unknown local prose is preserved by refusing rather than silently dropping it');
});

test('activation freezes scope and preserves local context and accumulated design through switching and resumption',async()=>{
  const { orders }=await import('../tools/orders.mjs'),api=await orders(),f=await integrity(),root=mkdtempSync(join(tmpdir(),'ditl-orders-'));
  mkdirSync(join(root,'.designeritl'));mkdirSync(join(root,'versions/design.current.v1'),{recursive:true});
  writeFileSync(join(root,'versions/design.current.v1/index.html'),'Accumulated design');
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));
  const issues=[{number:7,state:'open',body:body()},{number:8,state:'open',body:body('Show profile',['Show avatar'])}];
  const first=api.activate(root,7,issues,{now:'2026-10-31T12:00:00.000Z'});
  api.updateProgress(root,7,[1],'Empty state verified; populated state remains.');
  const original=readFileSync(join(root,'orders/7.md'));
  api.activate(root,8,issues,{now:'2026-10-31T12:01:00.000Z'});
  const resumed=api.activate(root,7,[{...issues[0],body:body('Unexpected new goal')},issues[1]],{now:'2026-10-31T12:02:00.000Z'});
  assert.notEqual(first.assignment.activationId,resumed.assignment.activationId);
  assert.equal(resumed.scopeDiverged,true);
  assert.deepEqual(resumed.checklist.checkedOrdinals,[1]);
  assert.equal(resumed.checklist.taskContext,'Empty state verified; populated state remains.');
  assert.ok(readFileSync(join(root,'orders/7.md')).equals(original));
  assert.equal(readFileSync(join(root,'versions/design.current.v1/index.html'),'utf8'),'Accumulated design');
  assert.equal(f.readProject(root).state.assignment.orderId.issueNumber,7);
  assert.throws(()=>api.activate(root,8,[issues[0],{...issues[1],state:'closed'}]),/closed/i);
});

test('designer inbox saves replayable observations before advancing hashes and distinguishes scope divergence from new changes',async()=>{
  const {designerInbox}=await import('../tools/designer-inbox.mjs'),inbox=await designerInbox(),{orders}=await import('../tools/orders.mjs'),orderApi=await orders(),f=await integrity(),root=mkdtempSync(join(tmpdir(),'ditl-designer-inbox-'));
  mkdirSync(join(root,'.designeritl'));mkdirSync(join(root,'versions/design.current.v1'),{recursive:true});writeFileSync(join(root,'versions/design.current.v1/index.html'),'Current accumulated design');
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));
  const issues=[{number:7,state:'open',body:body(),updated_at:'2026-10-31T12:00:00Z'}];
  const first=inbox.prepare(root,issues,{now:'2026-10-31T12:00:00.000Z'});
  assert.deepEqual(first.startableOrderNumbers,[7]);assert.equal(first.observations[0].change,'new');
  assert.deepEqual(f.readProject(root).state.seenOrderFingerprints,{});
  assert.equal(f.readProject(root).state.assignment,null);
  assert.equal(inbox.pending(root).length,1);
  inbox.acknowledge(root,first.reportId,{disclosed:true,now:'2026-10-31T12:00:01.000Z'});
  orderApi.activate(root,7,issues,{now:'2026-10-31T12:01:00.000Z'});orderApi.updateProgress(root,7,[1],'Verified empty cart; retain this context.');
  const checklist=readFileSync(join(root,'orders/7.md'));
  const edited=[{...issues[0],body:body('Unexpected changed scope'),updated_at:'2026-10-31T13:00:00Z'}];
  const changed=inbox.prepare(root,edited,{now:'2026-10-31T13:00:00.000Z'});
  assert.equal(changed.observations[0].change,'body-changed');assert.equal(changed.observations[0].scopeDiverged,true);
  inbox.acknowledge(root,changed.reportId,{disclosed:true,now:'2026-10-31T13:00:01.000Z'});
  const repeated=inbox.prepare(root,[{...edited[0],updated_at:'2026-10-31T14:00:00Z'}],{now:'2026-10-31T14:00:00.000Z'});
  assert.equal(repeated.observations[0].change,null);assert.equal(repeated.observations[0].scopeDiverged,true);
  const current=f.readProject(root),advanced={...current.state,seenOrderFingerprints:repeated.nextFingerprints};
  f.prepareRecordReplacement(current,'.designeritl/state.json',Buffer.from(JSON.stringify(advanced)),{owner:'inbox',kind:'state'});f.reconcileRecordReplacement(f.readProject(root));
  assert.equal(inbox.pending(root)[0].reportId,repeated.reportId,'lost report receipt still replays after hashes advance');
  inbox.acknowledge(root,repeated.reportId,{disclosed:true,now:'2026-10-31T14:00:01.000Z'});
  assert.equal(inbox.pending(root).length,0);
  assert.ok(readFileSync(join(root,'orders/7.md')).equals(checklist));assert.equal(readFileSync(join(root,'versions/design.current.v1/index.html'),'utf8'),'Current accumulated design');
  const reportPath=join(root,`.designeritl/reports/designer-${first.reportId}.json`);renameSync(reportPath,`${reportPath}.retained`);
  assert.throws(()=>inbox.pending(root),/missing project record/i,'a receipt cannot hide missing report material');
});
