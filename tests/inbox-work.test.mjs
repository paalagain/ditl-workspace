import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {designerInbox} from '../tools/designer-inbox.mjs';
import {integrity,loadNamedBlock} from '../tools/protocol.mjs';
import {orders} from '../tools/orders.mjs';
import {build} from '../tools/bundle.mjs';

const body=(goal='Create a dental landing page',cancelsOrderNumber=null)=>`# Goal\n${goal}\n\n${cancelsOrderNumber?'':'- [ ] 1. Show the appointment form\n'}\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId:'01684688-751b-44a5-8c15-df0b630f084a',followsOrderNumber:null,cancelsOrderNumber})}\n\`\`\`\n`;
const issue=(number=1,goal)=>({number,state:'open',body:body(goal)});
function project() {
  const root=mkdtempSync(join(tmpdir(),'ditl-inbox-work-'));
  mkdirSync(join(root,'.designeritl'));
  writeFileSync(join(root,'.designeritl/config.json'),JSON.stringify({schemaVersion:2,role:'designer',repository:{repositoryId:101,owner:'alice',name:'transport'}}));
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}));
  return root;
}
function disclose(api,root,issues) {
  const report=api.prepare(root,issues);
  api.acknowledge(root,report.reportId,{disclosed:true});
}

test('Inbox starts the sole order and creates its first working prototype from scratch',async()=>{
  const api=await designerInbox(),f=await integrity(),root=project(),issues=[issue()];
  disclose(api,root,issues);
  const result=api.beginWork(root,{issues,releases:[]});
  assert.equal(result.status,'started');
  assert.equal(result.assignment.orderId.issueNumber,1);
  assert.equal(result.checklist.scope.originalBody,issues[0].body);
  assert.deepEqual(result.checklist.checkedOrdinals,[]);
  const working=f.inspectVersions(f.readProject(root)).working;
  assert.equal(working.number,1);
  assert.ok(existsSync(join(root,'versions',working.folder,'index.html')));
  assert.ok(existsSync(join(root,'versions',working.folder,'assets')));
  assert.equal(f.readProject(root).state.versionCreationIntent,null);
});

test('explicit check-only and setup-connectivity checks leave a greenfield project unassigned',async()=>{
  const api=await designerInbox(),f=await integrity(),root=project(),issues=[issue()];
  disclose(api,root,issues);
  const before=readFileSync(join(root,'.designeritl/state.json'));
  assert.equal(api.beginWork(root,{issues,releases:[],orderNumber:1,checkOnly:true}).status,'checked');
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  assert.equal(existsSync(join(root,'orders')),false);
  assert.equal(f.inspectVersions(f.readProject(root)).versions.length,0);
});

test('Inbox resumes active work with saved progress and scope, switching only for a named order',async()=>{
  const api=await designerInbox(),orderApi=await orders(),f=await integrity(),root=project(),first=[issue()];
  disclose(api,root,first);
  const started=api.beginWork(root,{issues:first,releases:[]});
  orderApi.updateProgress(root,1,[1],'Appointment form verified; preserve this context.');
  const checklist=readFileSync(join(root,'orders/1.md')),working=f.inspectVersions(f.readProject(root)).working;
  const prototype=join(root,'versions',working.folder,'index.html');
  writeFileSync(prototype,'Accumulated dental design');
  const changed=[issue(1,'Unexpected changed scope'),issue(2,'Show profile')];
  disclose(api,root,changed);
  const resumed=api.beginWork(root,{issues:changed,releases:[]});
  assert.equal(resumed.status,'resumed');
  assert.deepEqual(resumed.assignment,started.assignment);
  assert.equal(resumed.scopeDiverged,true);
  assert.deepEqual(resumed.checklist.checkedOrdinals,[1]);
  assert.equal(resumed.checklist.taskContext,'Appointment form verified; preserve this context.');
  const switched=api.beginWork(root,{issues:changed,releases:[],orderNumber:2});
  assert.equal(switched.assignment.orderId.issueNumber,2);
  assert.notEqual(switched.assignment.activationId,started.assignment.activationId);
  assert.ok(readFileSync(join(root,'orders/1.md')).equals(checklist));
  assert.equal(readFileSync(prototype,'utf8'),'Accumulated dental design');
  assert.equal(f.inspectVersions(f.readProject(root)).working.folder,working.folder);
});

test('Inbox asks for genuinely ambiguous orders and continues after one selection',async()=>{
  const api=await designerInbox(),root=project(),issues=[issue(),issue(2,'Show profile')];
  disclose(api,root,issues);
  const before=readFileSync(join(root,'.designeritl/state.json'));
  assert.deepEqual(api.beginWork(root,{issues,releases:[]}),{status:'choose-order',orders:[{number:1,goal:'Create a dental landing page'},{number:2,goal:'Show profile'}]});
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  assert.equal(api.beginWork(root,{issues,releases:[],orderNumber:2}).assignment.orderId.issueNumber,2);
});

test('Inbox excludes cancellation requests, withdrawn targets, closed, malformed and completed work',async()=>{
  const api=await designerInbox(),root=project();
  const issues=[issue(),{...issue(2),body:body('Cancel dental work',1)},{...issue(3),state:'closed'},{...issue(4),body:'```designeritl-order\n{"schemaVersion":99}\n```'},issue(5)];
  const descriptor={schemaVersion:1,repositoryId:101,orderNumber:5,deliveryId:'057619e4-c1e4-42d8-b250-8c289387c022',tag:'order-5/final',kind:'final',assetName:'delivery.zip',assetBytes:10,manifestSha256:'a'.repeat(64),zipSha256:'b'.repeat(64)};
  const releases=[{id:20,draft:false,tag_name:'order-5/final',body:'```designeritl-delivery\n'+JSON.stringify(descriptor)+'\n```',assets:[{id:30,name:'delivery.zip',size:10}]}];
  disclose(api,root,issues);
  const before=readFileSync(join(root,'.designeritl/state.json'));
  assert.deepEqual(api.beginWork(root,{issues,releases}),{status:'no-work',orders:[]});
  for(const orderNumber of [1,2,3,4,5,99])assert.throws(()=>api.beginWork(root,{issues,releases,orderNumber}),/not open and available/);
  assert.ok(readFileSync(join(root,'.designeritl/state.json')).equals(before));
  assert.equal(existsSync(join(root,'versions')),false);
});

test('Inbox refuses an unrelated root and incomplete observations before creating work',async()=>{
  const api=await designerInbox(),root=project(),visualizations=mkdtempSync(join(tmpdir(),'ditl-visualizations-')),issues=[issue()];
  assert.throws(()=>api.beginWork(visualizations,{issues,releases:[]}),/project selection or setup/i);
  assert.equal(existsSync(join(visualizations,'.designeritl')),false);
  assert.throws(()=>api.beginWork(root,{issues}),/complete release observations/i);
  assert.throws(()=>api.beginWork(root,{issues:null,releases:[]}),/issue/i);
  assert.equal(existsSync(join(root,'orders')),false);
  disclose(api,root,issues);
  assert.equal(api.beginWork(root,{issues,releases:[]}).assignment.orderId.issueNumber,1);
});

test('undisclosed reports block activation and interrupted version creation retains its reservation',async()=>{
  const api=await designerInbox(),f=await integrity(),root=project(),issues=[issue()];
  const report=api.prepare(root,issues);
  assert.throws(()=>api.beginWork(root,{issues,releases:[]}),/disclose saved/i);
  assert.equal(f.readProject(root).state.assignment,null);
  api.acknowledge(root,report.reportId,{disclosed:true});
  const intent=f.reserveVersion(f.readProject(root),{mode:'empty',label:'retained'});
  const result=api.beginWork(root,{issues,releases:[]});
  assert.equal(result.versionCreationPending,true);
  assert.deepEqual(f.readProject(root).state.versionReservations,[1]);
  assert.equal(f.readProject(root).state.versionCreationIntent.operationId,intent.operationId);
  f.stageVersion(f.readProject(root));f.finishVersion(f.readProject(root));
  const resumed=api.beginWork(root,{issues,releases:[]});
  assert.deepEqual(resumed.assignment,result.assignment);
  assert.equal(resumed.workingVersion.number,1);
  assert.deepEqual(f.readProject(root).state.versionReservations,[1]);
});

test('the independently packaged Inbox can enter work using only its installed reference closure',async()=>{
  const out=mkdtempSync(join(tmpdir(),'ditl-inbox-standalone-'));build(out);
  const reference=name=>pathToFileURL(join(out,'designer/inbox/references',name+'.md'));
  const f=await integrity(reference('format'));
  const orderModule=await loadNamedBlock(reference('orders'),'orders-v1');
  const inboxModule=await loadNamedBlock(reference('designer-inbox'),'designer-inbox-v1');
  const api=inboxModule.createDesignerInbox(f,orderModule.createOrders(f)),root=project(),issues=[issue()];
  disclose(api,root,issues);
  const result=api.beginWork(root,{issues,releases:[]});
  assert.equal(result.assignment.orderId.issueNumber,1);
  assert.equal(result.workingVersion.number,1);
  assert.ok(existsSync(join(out,'designer/inbox/references/versions.md')));
  assert.ok(existsSync(join(root,'versions',result.workingVersion.folder,'index.html')));
  assert.equal(existsSync(join(out,'designer/start')),false);
});
