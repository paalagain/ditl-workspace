import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {integrity} from '../tools/protocol.mjs';
import {cancellation} from '../tools/cancellation.mjs';

const activationId='01684688-751b-44a5-8c15-df0b630f084a';
const token={orderId:{repositoryId:101,issueNumber:7},activationId};
async function fixture(){const f=await integrity(),root=mkdtempSync(join(tmpdir(),'ditl-cancel-'));mkdirSync(join(root,'.designeritl'));mkdirSync(join(root,'versions/design.current.v1/assets'),{recursive:true});writeFileSync(join(root,'versions/design.current.v1/index.html'),'Retained design');writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:token,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));const order=f.createOrderRequest({repositoryId:101,title:'Checkout',goal:'Show checkout',tasks:[{ordinal:1,text:'Show cart'}]}),cancel=f.createOrderRequest({repositoryId:101,title:'Cancel',goal:'Withdraw checkout',tasks:[],cancelsOrderNumber:7});return{f,root,issues:[{number:7,state:'open',state_reason:null,body:order.intendedBody},{number:8,state:'open',state_reason:null,body:cancel.intendedBody}]};}

test('developer cancellation has no tasks and uses durable exact-request identity',async()=>{
  const f=await integrity(),saved=f.createOrderRequest({repositoryId:101,title:'Withdraw checkout',goal:'Cancel earlier checkout work.',tasks:[],cancelsOrderNumber:7});
  const order=f.parseWorkOrderBody(saved.intendedBody);
  assert.equal(order.kind,'cancellation');assert.equal(order.metadata.cancelsOrderNumber,7);assert.deepEqual(order.tasks,[]);assert.equal(order.metadata.followsOrderNumber,null);
  assert.equal(saved.submissionAttempted,false);f.validatePendingOrderCreation(saved,101);
  assert.throws(()=>f.createOrderRequest({repositoryId:101,title:'Bad',goal:'Cancel',tasks:[{ordinal:1,text:'New work'}],cancelsOrderNumber:7}));
});

test('cancellation creation permits only a completely observed open work order before any POST',async()=>{
  const f=await integrity(),{issues}=await fixture();
  const saved=f.createOrderRequest({repositoryId:101,title:'Cancel',goal:'Withdraw checkout',tasks:[],cancelsOrderNumber:7});
  const target=issues[0];
  assert.equal(f.reconcileOrderRequest(saved,[[target]],true),null,'An open target allows the first create');
  for(const state_reason of ['completed','not_planned','duplicate',null,'future-reason']) {
    let posts=0;
    assert.throws(()=>{f.reconcileOrderRequest(saved,[[{...target,state:'closed',state_reason}]],true);posts++;},/already closed.*follow-up order/i);
    assert.equal(posts,0,'Refusal precedes the remote create boundary');
  }
  for(const [pages,complete] of [
    [[target],false],
    [[],true],
    [[{...target,state:'unknown'}],true],
    [[{number:7,state:'open',body:target.body}],true],
    [[{...target,state_reason:'unknown'}],true],
    [[{...target,body:'Ordinary issue'}],true],
    [[{...target,pull_request:{url:'pull/7'}}],true],
    [[{...issues[1],number:7}],true],
    [[{...target,body:target.body+target.body}],true],
  ]) {
    let posts=0;
    assert.throws(()=>{f.reconcileOrderRequest(saved,[pages],complete);posts++;});
    assert.equal(posts,0);
  }
  // Resuming an already-created request still reconciles its identity after closure.
  assert.equal(f.reconcileOrderRequest({...saved,submissionAttempted:true},[[{...target,state:'closed',state_reason:'completed'},{...issues[1],body:saved.intendedBody}]],true),8);
});

test('observed cancellation reconciles actual closures and preserves a later activation and local bytes',async()=>{
  const {f,root,issues}=await fixture(),api=await cancellation(),design=readFileSync(join(root,'versions/design.current.v1/index.html'));
  const plans=api.observe(root,[issues],[[]],{complete:true});assert.equal(plans.length,1);
  const id=plans[0].operationId;assert.deepEqual(api.next(root,id,[issues],[[]],{complete:true}),{action:'close',issueNumber:7,reason:'not planned'});
  // Lost close response: the next invocation sees the actual desired status, not a phase flag.
  issues[0]={...issues[0],state:'closed',state_reason:'not_planned'};
  assert.deepEqual(api.next(root,id,[issues],[[]],{complete:true}),{action:'close',issueNumber:8,reason:'completed'});
  issues[1]={...issues[1],state:'closed',state_reason:'completed'};
  const context=f.readProject(root,'designer'),later={...token,activationId:'635a9584-4904-477f-a7f4-840a4ad41b74'};
  f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify({...context.state,assignment:later})),{owner:'orders',kind:'state'});f.reconcileRecordReplacement(f.readProject(root));
  const result=api.complete(root,id,[issues],[[]],{complete:true});assert.equal(result.outcome,'cancelled');assert.deepEqual(f.readProject(root).state.assignment,later);
  assert.deepEqual(api.observe(root,[issues],[[]],{complete:true}),[],'The same cancellation closure cannot be recast as a fresh hand closure that clears the later token');
  assert.ok(readFileSync(join(root,'versions/design.current.v1/index.html')).equals(design));
  assert.equal(api.pending(root).length,1,'Result remains reportable until disclosed');api.acknowledge(root,id,{disclosed:true});assert.equal(api.pending(root).length,0);
});

function release(kind='send') {return {id:31,draft:false,tag_name:kind==='final'?'order-7/final':'order-7/send-1',body:'```designeritl-delivery\n'+JSON.stringify({schemaVersion:1,repositoryId:101,orderNumber:7,deliveryId:'15977609-edee-4a69-b182-6229c3b90a92',tag:kind==='final'?'order-7/final':'order-7/send-1',kind,assetName:'delivery.zip',assetBytes:100,manifestSha256:'ab'.repeat(32),zipSha256:'cd'.repeat(32)})+'\n```',assets:[{id:32,name:'delivery.zip',size:100}]};}

test('a crossing nonfinal is retained and named, while a published final leaves the order and assignment untouched',async()=>{
  for(const kind of ['send','final']) {
    const {f,root,issues}=await fixture(),api=await cancellation(),published=release(kind),before=JSON.stringify(published),[plan]=api.observe(root,[issues],[[published]],{complete:true});
    if(kind==='send') {assert.equal(api.next(root,plan.operationId,[issues],[[published]],{complete:true}).issueNumber,7);issues[0]={...issues[0],state:'closed',state_reason:'not_planned'};}
    assert.deepEqual(api.next(root,plan.operationId,[issues],[[published]],{complete:true}),{action:'close',issueNumber:8,reason:'completed'});
    issues[1]={...issues[1],state:'closed',state_reason:'completed'};
    const applied=api.complete(root,plan.operationId,[issues],[[published]],{complete:true});
    assert.equal(applied.outcome,kind==='final'?'no-effect':'cancelled');assert.equal(applied.publishedDeliveries[0].descriptor.tag,published.tag_name);assert.equal(JSON.stringify(published),before);
    assert.deepEqual(f.readProject(root).state.assignment,kind==='final'?token:null);
    if(kind==='final')assert.equal(issues[0].state,'open','Cancellation never closes an order after its published final');
  }
});

test('hand closure requires no remote closure, and unknown status or malformed publication cannot authorize application',async()=>{
  const {f,root,issues}=await fixture(),api=await cancellation();issues.pop();issues[0]={...issues[0],state:'closed',state_reason:'completed'};
  const [plan]=api.observe(root,[issues],[[]],{complete:true}),step=api.next(root,plan.operationId,[issues],[[]],{complete:true});assert.equal(step.action,'record');assert.equal(step.outcome,'hand-closed');
  assert.throws(()=>api.complete(root,plan.operationId,[issues],[[]],{complete:false}),/incomplete/i);
  const bad=release('final');bad.body=bad.body.replace('"schemaVersion":1','"schemaVersion":2');assert.throws(()=>api.next(root,plan.operationId,[issues],[[bad]],{complete:true}));
  assert.deepEqual(f.readProject(root).state.assignment,token);
  api.complete(root,plan.operationId,[issues],[[]],{complete:true});assert.equal(f.readProject(root).state.assignment,null);
  const reopened=[{...issues[0],state:'open',state_reason:null}];assert.throws(()=>api.complete(root,plan.operationId,[reopened],[[]],{complete:true}),'Historical success cannot conceal changed remote status');
});

test('conflicting request closure refuses target mutation before another effect',async()=>{
  const {root,issues}=await fixture(),api=await cancellation(),[plan]=api.observe(root,[issues],[[]],{complete:true});
  issues[1]={...issues[1],state:'closed',state_reason:'not_planned'};
  assert.throws(()=>api.next(root,plan.operationId,[issues],[[]],{complete:true}),/request|closure/i);
  assert.equal(issues[0].state,'open');
});
