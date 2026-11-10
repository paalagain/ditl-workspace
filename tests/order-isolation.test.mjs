import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';
import {orders} from '../tools/orders.mjs';
import {designerInbox} from '../tools/designer-inbox.mjs';
import {sending} from '../tools/sending.mjs';
import {cancellation} from '../tools/cancellation.mjs';

async function fixture() {
  const f=await integrity(),root=mkdtempSync(join(tmpdir(),'ditl-isolation-'));
  mkdirSync(join(root,'.designeritl'));
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));
  const issue=(number,relation={})=>({number,state:'open',state_reason:null,body:f.createOrderRequest({repositoryId:101,title:'Design',goal:`Work for ${number}`,tasks:relation.cancelsOrderNumber?[]:[{ordinal:1,text:'Show cart'}],...relation}).intendedBody});
  return {f,root,issue,inbox:await designerInbox(),send:await sending(),cancel:await cancellation(),order:await orders()};
}
function malformed(issue,kind) {
  const duplicate=issue.body.replace('- [ ] 1. Show cart','- [ ] 1. Show cart\n- [ ] 1. Duplicate');
  return {...issue,body:kind==='tasks'?duplicate:kind==='blocks'?issue.body+issue.body:duplicate+issue.body};
}

for(const kind of ['tasks','blocks','both']) test(`a malformed order (${kind}) is reported while the sole valid order starts and sends`,async()=>{
  const {f,root,issue,inbox,send,cancel}=await fixture(),bad=malformed(issue(9),kind),issues=[bad,issue(7)],before=JSON.stringify(bad);
  assert.deepEqual(cancel.observe(root,[issues],[[]],{complete:true}),[]);
  const report=inbox.prepare(root,issues);
  assert.deepEqual(report.startableOrderNumbers,[7]);
  assert.match(report.observations.find(row=>row.issueNumber===9).error,/duplicate.*ordinal|exactly one.*block/i);
  inbox.acknowledge(root,report.reportId,{disclosed:true});
  assert.equal(inbox.beginWork(root,{issues,releases:[]}).assignment.orderId.issueNumber,7,'S10 still starts the single eligible order without asking');
  const selected=send.selectOrder(root,{issues,releases:[]});
  const version=send.selectVersion(root,selected,{issues,releases:[],versionNumber:1});
  const record=send.reserve(root,version,{issues,releases:[],tags:[]});
  assert.equal(record.orderNumber,7);
  const relative=`.designeritl/pending/${record.deliveryId}/record.json`,pending=join(root,'.designeritl/pending',record.deliveryId);
  mkdirSync(join(pending,'snapshot'));
  const captured=f.capturePrototype(record.sourcePath,record.stagingPath);
  const validate=bytes=>f.validatePendingRecord(bytes,101);
  f.prepareRecordReplacement(f.readProject(root),relative,Buffer.from(JSON.stringify({...record,payloadSha256:captured.payloadSha256,capturedInventory:captured.files,capturedDirectories:captured.directories})),{owner:'deliveries',kind:'owner',expectedPreviousSha256:f.sha256(f.readProjectRecord(root,relative))},validate);
  f.reconcileRecordReplacement(f.readProject(root),validate);
  const packed=f.packageDelivery(send.nonfinalManifest(root,record.deliveryId,{summary:'Cart',outsideOrder:'None',workInProgress:'Draft'}),record.stagingPath);
  assert.equal(f.verifyDelivery(packed.zip,packed.descriptor).manifest.orderNumber,7);
  assert.equal(JSON.stringify(bad),before);
  assert.equal(existsSync(join(root,'orders/9.md')),false);
});

test('a cancellation of a valid order progresses beside malformed issues without modifying them',async()=>{
  const {root,issue,cancel}=await fixture(),bad=malformed(issue(9),'both'),issues=[issue(7),issue(8,{cancelsOrderNumber:7}),bad],before=JSON.stringify(bad);
  const [plan]=cancel.observe(root,[issues],[[]],{complete:true});
  assert.deepEqual(cancel.next(root,plan.operationId,[issues],[[]],{complete:true}),{action:'close',issueNumber:7,reason:'not planned'});
  issues[0]={...issues[0],state:'closed',state_reason:'not_planned'};
  assert.deepEqual(cancel.next(root,plan.operationId,[issues],[[]],{complete:true}),{action:'close',issueNumber:8,reason:'completed'});
  issues[1]={...issues[1],state:'closed',state_reason:'completed'};
  assert.equal(cancel.complete(root,plan.operationId,[issues],[[]],{complete:true}).outcome,'cancelled');
  assert.equal(JSON.stringify(bad),before);
});

test('named malformed orders and relations to them refuse only their own start or send',async()=>{
  const {f,root,issue,inbox,send,cancel,order}=await fixture(),bad=malformed(issue(9),'both');
  const issues=[issue(7),bad,issue(10,{cancelsOrderNumber:9}),issue(11,{followsOrderNumber:9})],before=readFileSync(join(root,'.designeritl/state.json'));
  assert.deepEqual(cancel.observe(root,[issues],[[]],{complete:true}),[]);
  const problems=cancel.inspect(root,[issues],[[]],{complete:true});
  assert.ok(problems.some(row=>row.issueNumber===9&&/exactly one.*block/i.test(row.error)));
  assert.ok(problems.some(row=>row.issueNumber===10&&/#9/.test(row.error)));
  for(const number of [9,11]) {
    assert.throws(()=>order.activate(root,number,issues),/#9/);
    assert.throws(()=>inbox.beginWork(root,{issues,releases:[],orderNumber:number}),/#9/);
    assert.throws(()=>send.selectOrder(root,{issues,releases:[],orderNumber:number}),/#9/);
  }
  assert.throws(()=>cancel.observe(root,[issues],[[]],{complete:true,orderNumber:9}),error=>error.orderNumber===9&&/#9/.test(error.message));
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  assert.equal(existsSync(join(root,'orders')),false);
  const report=inbox.prepare(root,issues);
  assert.deepEqual(report.startableOrderNumbers,[7]);
  assert.doesNotThrow(()=>f.validateDesignerInboxRecord(Buffer.from(JSON.stringify({...report,startableOrderNumbers:[7,11]})),f.readProject(root),report.reportId),'Earlier saved reports remain replayable; their choices never authorize activation');
  inbox.acknowledge(root,report.reportId,{disclosed:true});
  assert.equal(send.selectOrder(root,{issues,releases:[],orderNumber:7}).assignment.orderId.issueNumber,7);
});

test('a malformed active order stops continuation but an explicit valid order remains selectable',async()=>{
  const {root,issue,inbox,send,order}=await fixture(),valid=issue(9);
  order.activate(root,9,[valid]);
  const issues=[malformed(valid,'tasks'),issue(7)],before=readFileSync(join(root,'.designeritl/state.json')),checklist=readFileSync(join(root,'orders/9.md'));
  assert.throws(()=>inbox.beginWork(root,{issues,releases:[]}),/#9.*duplicate/i);
  assert.throws(()=>send.selectOrder(root,{issues,releases:[]}),/#9.*duplicate/i);
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  assert.ok(readFileSync(join(root,'orders/9.md')).equals(checklist));
  assert.equal(inbox.beginWork(root,{issues,releases:[],orderNumber:7}).assignment.orderId.issueNumber,7);
});

test('a saved cancellation whose target becomes malformed is isolated from other plans',async()=>{
  const {root,issue,cancel}=await fixture(),issues=[issue(7),issue(8,{cancelsOrderNumber:7}),issue(9),issue(10,{cancelsOrderNumber:9})];
  const plans=cancel.observe(root,[issues],[[]],{complete:true}),badPlan=plans.find(row=>row.targetNumber===9),goodPlan=plans.find(row=>row.targetNumber===7);
  issues[2]=malformed(issues[2],'both');
  assert.throws(()=>cancel.next(root,badPlan.operationId,[issues],[[]],{complete:true}),error=>error.orderNumber===9&&/#9/.test(error.message));
  assert.equal(cancel.next(root,goodPlan.operationId,[issues],[[]],{complete:true}).issueNumber,7);
  assert.equal(cancel.pending(root).length,2,'Blocked saved evidence remains available');
});

test('incomplete listings and global identity or local state conflicts still stop all cancellation work',async()=>{
  const {root,issue,cancel}=await fixture(),issues=[issue(7),malformed(issue(9),'both')],before=readFileSync(join(root,'.designeritl/state.json'));
  assert.throws(()=>cancel.observe(root,[issues],[[]],{complete:false}),/incomplete/i);
  assert.throws(()=>cancel.observe(root,[issues,null],[[]],{complete:true}),/incomplete/i);
  assert.throws(()=>cancel.observe(root,[[issues[0],issues[0]]],[[]],{complete:true}),/duplicated issue/i);
  assert.throws(()=>cancel.observe(root,[[{...issues[0],state:'unknown'}]],[[]],{complete:true}),/issue observation/i);
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  writeFileSync(join(root,'.designeritl/state.json'),'{corrupt');
  assert.throws(()=>cancel.observe(root,[issues],[[]],{complete:true}));
  assert.equal(existsSync(join(root,'.designeritl/reports')),false);
});
