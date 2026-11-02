import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrity } from '../tools/protocol.mjs';

const designer = () => ({ schemaVersion:2,role: 'designer', repository: { repositoryId: 101, owner: 'alice', name: 'transport' }});
const state = () => ({ schemaVersion: 1, assignment: null, startedOrders: {}, seenOrderFingerprints: {}, versionReservations: [], versionCreationIntent: null, pendingDeliveryIndex: [], localMutationIntent: null });
function project(config = designer()) {
  const root = mkdtempSync(join(tmpdir(), 'ditl-project-'));
  mkdirSync(join(root, '.designeritl'));
  writeFileSync(join(root, '.designeritl/config.json'), JSON.stringify(config));
  writeFileSync(join(root, '.designeritl/state.json'), JSON.stringify(state()));
  return root;
}

test('project context validates role-specific records and keeps destinations inside the selected context', async () => {
  const f = await integrity(), first = project(), second = project({ schemaVersion:2,role: 'developer', repository: { repositoryId: 202, owner: 'bob', name: 'other' }, deliveryDestination: 'received' });
  writeFileSync(join(second, '.designeritl/state.json'), JSON.stringify({ schemaVersion: 1, seenReleaseFingerprints: {}, completedDownloadReceipts: {}, pendingOrderCreations: [], localMutationIntent: null }));
  assert.equal(f.readProject(first, 'designer').config.repository.repositoryId, 101);
  const developer = f.readProject(second, 'developer');
  assert.equal(developer.deliveryDestination, join(second, 'received'));
  assert.equal(developer.config.repository.repositoryId, 202);
  assert.throws(() => f.readProject(second, 'designer'), /role/i);
  assert.throws(() => f.readProject(mkdtempSync(join(tmpdir(), 'ditl-missing-')), 'designer'), /selection or setup/i);
  const invalid = designer(); invalid.deliveryDestination = 'cross-role';
  assert.throws(() => f.readProject(project(invalid), 'designer'), /configuration/i);
  invalid.schemaVersion = 999;
  assert.throws(() => f.readProject(project(invalid), 'designer'), /unsupported/i);
  const secret = designer(); secret.token = 'test-secret';
  assert.throws(() => f.readProject(project(secret), 'designer'), /configuration/i);
});

test('repository renames retain identity while replacement and malformed local records refuse mutation', async () => {
  const f=await integrity(), root=project(), context=f.readProject(root,'designer');
  assert.deepEqual(f.bindRepository(context,{id:101,name:'renamed',owner:{login:'alice-new'}}),{repositoryId:101,owner:'alice-new',name:'renamed'});
  assert.throws(()=>f.bindRepository(context,{id:202,name:'transport',owner:{login:'alice'}}),/replacement.*setup or migration/i);
  assert.throws(()=>f.bindRepository(context,null),/unknown repository/i);
  const current=state();current.assignment={orderId:{repositoryId:202,issueNumber:1},activationId:'01684688-751b-44a5-8c15-df0b630f084a'};
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(current));
  assert.throws(()=>f.readProject(root,'designer'),/state/i);
  current.assignment=null;current.startedOrders={1:{schemaVersion:2}};
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(current));
  assert.throws(()=>f.readProject(root,'designer'),/unsupported local record/i);
});

test('verified record replacement preserves other owners and resumes before or after rename', async()=> {
  const f=await integrity(), root=project();
  const context=f.readProject(root,'designer'), next={...context.state,seenOrderFingerprints:{1:{bodySha256:'ab'.repeat(32)}}};
  const intent=f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'inbox',kind:'state'});
  assert.deepEqual(JSON.parse(readFileSync(join(root,'.designeritl/state.json'))),state(),'preparation does not replace the authoritative record');
  assert.equal(existsSync(join(root,...intent.tempPath.split('/'))),true);
  f.reconcileRecordReplacement(f.readProject(root,'designer'));
  assert.deepEqual(JSON.parse(readFileSync(join(root,'.designeritl/state.json'))),next);
  assert.equal(existsSync(join(root,'.designeritl/mutation-intent.json')),false);
  assert.equal(existsSync(join(root,`.designeritl/mutation-${intent.operationId}.completed.json`)),true,'completed intent is retained');
  const after=f.readProject(root,'designer'), again={...after.state,seenOrderFingerprints:{2:{bodySha256:'cd'.repeat(32)}}};
  const second=f.prepareRecordReplacement(after,'.designeritl/state.json',Buffer.from(JSON.stringify(again)),{owner:'inbox',kind:'state'});
  renameSync(join(root,...second.tempPath.split('/')),join(root,'.designeritl/state.json'));
  f.reconcileRecordReplacement(f.readProject(root,'designer'));
  assert.deepEqual(JSON.parse(readFileSync(join(root,'.designeritl/state.json'))),again,'a lost rename response completes bookkeeping without rewriting');
  assert.throws(()=>f.prepareRecordReplacement(f.readProject(root,'designer'),'.designeritl/state.json',Buffer.from(JSON.stringify({...again,startedOrders:{3:{path:'orders/3.md'}}})),{owner:'inbox',kind:'state'}),/another owner/i);
});

test('conflicting, corrupt, incomplete and unsupported mutation evidence is retained without overwriting records',async()=> {
  const f=await integrity();
  for(const scenario of ['concurrent','corrupt','incomplete','unsupported']) {
    const root=project(), context=f.readProject(root), next={...context.state,seenOrderFingerprints:{1:{bodySha256:'ab'.repeat(32)}}};
    const intent=f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'inbox',kind:'state'});
    const target=join(root,'.designeritl/state.json'), temp=join(root,...intent.tempPath.split('/')), journal=join(root,'.designeritl/mutation-intent.json');
    if(scenario==='concurrent') writeFileSync(target,JSON.stringify({...context.state,versionReservations:[9]}));
    if(scenario==='corrupt') writeFileSync(temp,'{"schemaVersion":2}');
    if(scenario==='incomplete') renameSync(temp,`${temp}.retained`);
    if(scenario==='unsupported') writeFileSync(journal,JSON.stringify({...intent,schemaVersion:2}));
    const before=readFileSync(target), savedIntent=readFileSync(journal);
    assert.throws(()=>f.reconcileRecordReplacement(f.readProject(root)),/conflict|corrupt|unsupported|incomplete/i,scenario);
    assert.ok(readFileSync(target).equals(before),`${scenario} must retain the authoritative record`);
    assert.ok(readFileSync(journal).equals(savedIntent),`${scenario} must retain intent evidence`);
    assert.throws(()=>f.prepareRecordReplacement(f.readProject(root),'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'inbox',kind:'state'}),/mutation intent/i);
  }
});

test('configuration replacement retains identity and local state evidence is validated completely',async()=> {
  const f=await integrity(),root=project(),context=f.readProject(root);
  assert.throws(()=>f.prepareRecordReplacement(context,'.designeritl/config.json',Buffer.from(JSON.stringify({...context.config,repository:{...context.config.repository,repositoryId:303}})),{owner:'project',kind:'config'}),/setup or migration/i);
  const renamed={...context.config,repository:{...context.config.repository,name:'renamed'}};
  f.prepareRecordReplacement(context,'.designeritl/config.json',Buffer.from(JSON.stringify(renamed)),{owner:'project',kind:'config'});
  f.reconcileRecordReplacement(f.readProject(root));
  assert.equal(f.readProject(root).config.repository.name,'renamed');
  const invalid=state();invalid.completedDeliveries='not an array';
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(invalid));
  assert.throws(()=>f.readProject(root),/complete project state/i);
});

test('stale contexts and domain record proposals cannot overwrite a later writer',async()=>{
  const f=await integrity(),root=project(),context=f.readProject(root);
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify({...context.state,versionReservations:[7]}));
  assert.throws(()=>f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify(context.state)),{owner:'inbox',kind:'state'}),/concurrent/i);
  mkdirSync(join(root,'.designeritl/reports'));
  const original=Buffer.from('# Original owner report');writeFileSync(join(root,'.designeritl/reports/notes.md'),original);
  const fresh=f.readProject(root);writeFileSync(join(root,'.designeritl/reports/notes.md'),'# Later writer retained');
  assert.throws(()=>f.prepareRecordReplacement(fresh,'.designeritl/reports/notes.md',Buffer.from('# Proposed report context'),{owner:'inbox',kind:'owner',expectedPreviousSha256:f.sha256(original)},bytes=>assert.ok(bytes.toString().startsWith('# '))),/concurrent/i);
  assert.equal(readFileSync(join(root,'.designeritl/reports/notes.md'),'utf8'),'# Later writer retained');
});

test('a mutation journal copied from another local root cannot authorize changes',async()=>{
  const f=await integrity(),first=project(),second=project(),context=f.readProject(first),next={...context.state,versionReservations:[5]};
  const intent=f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'versions',kind:'state'});
  writeFileSync(join(second,'.designeritl/mutation-intent.json'),readFileSync(join(first,'.designeritl/mutation-intent.json')));
  writeFileSync(join(second,...intent.tempPath.split('/')),readFileSync(join(first,...intent.tempPath.split('/'))));
  assert.throws(()=>f.readProject(second),/root|conflicting/i);
  assert.deepEqual(JSON.parse(readFileSync(join(second,'.designeritl/state.json'))),state());
});

test('unsupported non-null state mutation markers retain their evidence even beside a matching journal',async()=>{
  const f=await integrity(),root=project(),context=f.readProject(root),next={...context.state,versionReservations:[5]};
  const intent=f.prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify(next)),{owner:'versions',kind:'state'});
  const saved={...context.state,localMutationIntent:{schemaVersion:1,operationId:intent.operationId}};
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(saved));
  assert.throws(()=>f.readProject(root),/reserved mutation marker/i);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'.designeritl/state.json'))),saved);
  assert.equal(existsSync(join(root,'.designeritl/mutation-intent.json')),true);
});

test('coordinated final bookkeeping changes only Orders and Deliveries state together',async()=>{
  const f=await integrity(),root=project(),active={...state(),assignment:{orderId:{repositoryId:101,issueNumber:1},activationId:'01684688-751b-44a5-8c15-df0b630f084a'},pendingDeliveryIndex:['01684688-751b-44a5-8c15-df0b630f084a'],versionReservations:[4]};
  writeFileSync(join(root,'.designeritl/state.json'),JSON.stringify(active));
  const context=f.readProject(root),next={...context.state,assignment:null,pendingDeliveryIndex:[],completedDeliveries:[{schemaVersion:1,repositoryId:101,deliveryId:'01684688-751b-44a5-8c15-df0b630f084a',orderNumber:1}]},bytes=Buffer.from(JSON.stringify(next));
  assert.throws(()=>f.prepareRecordReplacement(context,'.designeritl/state.json',bytes,{owner:'deliveries',kind:'state'}),/another owner/i);
  f.prepareRecordReplacement(context,'.designeritl/state.json',bytes,{owner:['orders','deliveries'],kind:'state'});
  f.reconcileRecordReplacement(f.readProject(root));
  assert.deepEqual(JSON.parse(readFileSync(join(root,'.designeritl/state.json'))),next);
  assert.deepEqual(f.readProject(root).state.versionReservations,[4]);
});
