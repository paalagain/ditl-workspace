import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrity } from '../tools/protocol.mjs';

async function fixture() {
  const f=await integrity(),payload=Buffer.from('<h1>Older selected version</h1>');
  const body='# Goal\nShow the agreed states.\n\n- [ ] 2. Show the heading\n- [ ] 5. Show details\n\n```designeritl-order\n{"schemaVersion":1,"requestId":"4ecbd5e0-a285-4a5b-9787-fb48ffdbb56a","followsOrderNumber":null,"cancelsOrderNumber":null}\n```\n';
  const scope=f.parseLocalChecklist(f.createLocalChecklist({repositoryId:123,issueNumber:7},body,'2026-10-31T12:00:00.000Z')).scope;
  const frozen=value=>{const json=JSON.stringify(value,null,2)+'\n';return {json,sha256:f.sha256(Buffer.from(json))};};
  const inventory=[{path:'index.html',bytes:payload.length,sha256:f.sha256(payload)}],payloadSha256=f.payloadDigest(inventory);
  const manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId:'1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',tag:'order-7/final',kind:'final',versionNumber:1,capturedFolder:'design.v1',capturedAt:'2026-10-31T12:00:00.000Z',inventory,payloadSha256,scopeSha256:scope.originalBodySha256,localProgress:{checkedOrdinals:[2,5],taskContext:'Current design progress is separate'},deliveryNote:{summary:'Older selected reference',outsideOrder:'None',workInProgress:'None'},deliveredUncheckedOrdinals:[],evidence:{reassessment:frozen({payloadSha256,scopeSha256:scope.originalBodySha256,agreedScope:scope,tasks:[{ordinal:2,result:'fulfilled',evidenceOrReason:'Captured heading observed'},{ordinal:5,result:'fulfilled',evidenceOrReason:'Captured details observed'}]}),decision:null}};
  function authorize(statement='Deliver this captured version as complete') {
    manifest.evidence.decision=frozen({schemaVersion:2,payloadSha256:manifest.payloadSha256,scopeSha256:manifest.scopeSha256,reassessmentSha256:manifest.evidence.reassessment.sha256,acknowledgedUnfinishedOrdinals:manifest.deliveredUncheckedOrdinals,explicitDesignerStatement:statement,recordedAt:'2026-10-31T12:01:00.000Z'});
  }
  function receive() {
    const bytes=Buffer.from(JSON.stringify(manifest)),zip=f.writeZip([{path:'manifest.json',data:bytes},{path:'design.v1/',data:Buffer.alloc(0)},{path:'design.v1/assets/',data:Buffer.alloc(0)},{path:'design.v1/index.html',data:payload}]);
    return f.verifyDelivery(zip,{schemaVersion:1,repositoryId:123,orderNumber:7,deliveryId:manifest.deliveryId,tag:manifest.tag,kind:'final',assetName:'delivery.zip',assetBytes:zip.length,manifestSha256:f.sha256(bytes),zipSha256:f.sha256(zip)}).manifest;
  }
  authorize();
  return {manifest,frozen,authorize,receive};
}

test('receiver refuses a final that omits a real agreed task despite internally matching hashes', async()=>{
  const x=await fixture(),report=JSON.parse(x.manifest.evidence.reassessment.json);
  report.tasks.pop();x.manifest.localProgress.checkedOrdinals=[2];
  x.manifest.evidence.reassessment=x.frozen(report);x.authorize();
  assert.throws(x.receive,/scope|agreed|task/i);
});

test('every final retains a genuine bound designer completion statement including when no exception is needed',async()=>{
  const x=await fixture();
  assert.equal(JSON.parse(x.receive().evidence.decision.json).explicitDesignerStatement,'Deliver this captured version as complete');
  x.manifest.evidence.decision=null;
  assert.throws(x.receive,/evidence|decision/i);
});

test('delivered unchecked tasks include false local ticks, locally unchecked fulfilled work, and unknown work',async()=>{
  for(const scenario of [{ticks:[2,5],result:'unfinished',ordinal:2,unchecked:[2]},{ticks:[2],result:'fulfilled',ordinal:5,unchecked:[5]},{ticks:[2,5],result:'unknown',ordinal:5,unchecked:[5]}]) {
    const x=await fixture(),report=JSON.parse(x.manifest.evidence.reassessment.json);
    report.tasks.find(task=>task.ordinal===scenario.ordinal).result=scenario.result;
    x.manifest.evidence.reassessment=x.frozen(report);x.manifest.localProgress.checkedOrdinals=scenario.ticks;x.manifest.deliveredUncheckedOrdinals=scenario.unchecked;x.authorize('I explicitly acknowledge the listed unchecked tasks for this capture');
    const received=x.receive();
    assert.deepEqual(received.deliveredUncheckedOrdinals,scenario.unchecked);
    assert.deepEqual(received.localProgress.checkedOrdinals,scenario.ticks);
    const decision=JSON.parse(x.manifest.evidence.decision.json);decision.acknowledgedUnfinishedOrdinals=[];x.manifest.evidence.decision=x.frozen(decision);
    assert.throws(x.receive,/decision/i);
  }
});

test('receiver rejects changed agreement identity, body proof, or task order even with a newly bound statement',async()=>{
  for(const change of [scope=>scope.orderId.issueNumber=8,scope=>scope.originalBody+='Edited after agreement',scope=>scope.tasks[0].text='Renamed task',scope=>scope.originalBodySha256='ab'.repeat(32)]) {
    const x=await fixture(),report=JSON.parse(x.manifest.evidence.reassessment.json);change(report.agreedScope);x.manifest.evidence.reassessment=x.frozen(report);x.authorize();
    assert.throws(x.receive,/scope|identity/i);
  }
  const x=await fixture(),report=JSON.parse(x.manifest.evidence.reassessment.json);report.tasks.reverse();x.manifest.evidence.reassessment=x.frozen(report);x.authorize();
  assert.throws(x.receive,/ordered agreed task/i);
});

test('changing exact reassessment bytes invalidates the earlier completion decision',async()=>{
  const x=await fixture(),old=x.manifest.evidence.reassessment;
  x.manifest.evidence.reassessment={json:old.json+'\n',sha256:(await integrity()).sha256(Buffer.from(old.json+'\n'))};
  assert.throws(x.receive,/decision/i);
  x.authorize();assert.ok(x.receive());
});
