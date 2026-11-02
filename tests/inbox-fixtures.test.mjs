import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from '../tools/bundle.mjs';
import {integrity} from '../tools/protocol.mjs';
import {createInboxFixtureManifest} from '../trials/support/inbox-fixture.mjs';

test('Inbox trial final survives installed reception with complete agreed-scope proof and bound choice',async()=>{
  const run=mkdtempSync(join(tmpdir(),'ditl-inbox-proof-')),out=join(run,'bundles'),prototype=join(run,'prototype');
  build(out);mkdirSync(join(prototype,'assets'),{recursive:true});writeFileSync(join(prototype,'index.html'),'<!doctype html><h1>Inbox retained iteration 3</h1>');
  const format=await integrity(pathToFileURL(join(out,'developer/inbox/references/format.md')));
  const manifest=createInboxFixtureManifest(format,{repositoryId:123,prototypeRoot:prototype,number:3,deliveryId:'1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',capturedAt:'2026-10-31T12:00:00.000Z'});
  const packaged=format.packageDelivery(Buffer.from(JSON.stringify(manifest)),prototype);
  const installed=join(run,'received'),received=format.receiveDelivery(packaged.zip,packaged.descriptor,installed);
  const reassessment=JSON.parse(received.manifest.evidence.reassessment.json),decision=JSON.parse(received.manifest.evidence.decision.json);
  assert.equal(reassessment.agreedScope.originalBodySha256,format.sha256(Buffer.from(reassessment.agreedScope.originalBody)));
  assert.deepEqual(reassessment.agreedScope.tasks,[{ordinal:1,text:'Show the retained iteration heading'}]);
  assert.deepEqual(reassessment.tasks.map(task=>task.ordinal),[1]);
  assert.deepEqual(decision.acknowledgedUnfinishedOrdinals,[]);
  assert.equal(decision.reassessmentSha256,received.manifest.evidence.reassessment.sha256);
  assert.equal(readFileSync(join(installed,'design.v3/index.html'),'utf8'),'<!doctype html><h1>Inbox retained iteration 3</h1>');
});
