import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrity } from '../tools/protocol.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

test('a coherent capture preserves empty structure and refuses partial staging without replacing evidence', async () => {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-capture-'));
  const source=join(root,'source'), snapshot=join(root,'snapshot');
  mkdirSync(join(source,'assets','empty'),{recursive:true}); writeFileSync(join(source,'index.html'),'original');
  const captured=f.capturePrototype(source,snapshot);
  assert.deepEqual(captured.directories,['assets/','assets/empty/']);
  writeFileSync(join(source,'index.html'),'later edit');
  assert.equal(readFileSync(join(snapshot,'index.html'),'utf8'),'original');
  assert.throws(()=>f.capturePrototype(source,snapshot),/already exists/);
  assert.equal(readFileSync(join(snapshot,'index.html'),'utf8'),'original');
  assert.throws(()=>f.capturePrototype(source,join(source,'nested')),/overlap/);
});

test('a filesystem edit crossing capture blocks it and retains the copied attempt', async () => {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-changing-capture-')), source=join(root,'source'), snapshot=join(root,'snapshot');
  mkdirSync(join(source,'assets'),{recursive:true}); writeFileSync(join(source,'index.html'),'before edit');
  const copy=fs.copyFileSync;
  // Controlled external filesystem boundary, not an internal workflow mock.
  fs.copyFileSync=(from,to,...args)=>{copy(from,to,...args);writeFileSync(join(source,'index.html'),'crossing edit');};
  syncBuiltinESMExports();
  try {assert.throws(()=>f.capturePrototype(source,snapshot),/changed during capture/);} finally {fs.copyFileSync=copy;syncBuiltinESMExports();}
  assert.equal(readFileSync(join(snapshot,'index.html'),'utf8'),'before edit');
  assert.equal(readFileSync(join(source,'index.html'),'utf8'),'crossing edit');
  assert.throws(()=>f.capturePrototype(source,snapshot),/already exists/);
});

test('packaged retry verifies saved bytes and identity rather than phase or newer source', async () => {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-pending-'));
  const source=join(root,'source'); mkdirSync(join(source,'assets'),{recursive:true}); writeFileSync(join(source,'index.html'),'captured');
  const deliveryId='1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a', pending=join(root,deliveryId), snapshot=join(pending,'snapshot','design.current.v1');
  mkdirSync(join(pending,'snapshot'),{recursive:true}); cpSync(source,snapshot,{recursive:true});
  const inv=f.inventory(snapshot), manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId,tag:'order-7/send-1',kind:'send',versionNumber:1,capturedFolder:'design.current.v1',capturedAt:'2026-10-31T12:00:00.000Z',inventory:inv.files,payloadSha256:inv.payloadSha256,scopeSha256:'ab'.repeat(32),localProgress:{checkedOrdinals:[],taskContext:''},deliveryNote:{summary:'Order 7 v1',outsideOrder:'None',workInProgress:'Unfinished'},deliveredUncheckedOrdinals:null,evidence:null};
  const manifestBytes=Buffer.from(JSON.stringify(manifest)), packaged=f.packageDelivery(manifestBytes,snapshot);
  const record={...manifest,schemaVersion:1,inventory:undefined,localProgress:undefined,deliveryNote:undefined,evidence:undefined,deliveredUncheckedOrdinals:undefined,assignmentToken:{orderId:{repositoryId:123,issueNumber:7},activationId:'057619e4-c1e4-42d8-b250-8c289387c022'},sourcePath:source,stagingPath:snapshot,phase:'complete',zipSha256:packaged.descriptor.zipSha256,manifestSha256:packaged.descriptor.manifestSha256,assetBytes:packaged.zip.length};
  writeFileSync(join(pending,'record.json'),JSON.stringify(record)); writeFileSync(join(pending,'descriptor.json'),JSON.stringify(packaged.descriptor)); writeFileSync(join(pending,'manifest.json'),manifestBytes); writeFileSync(join(pending,'delivery.zip'),packaged.zip);
  writeFileSync(join(source,'index.html'),'new working design');
  assert.equal(f.verifyPendingDelivery(pending,123).manifest.payloadSha256,inv.payloadSha256);
  assert.throws(()=>f.verifyPendingDelivery(pending,456),/repository/);
  writeFileSync(join(snapshot,'index.html'),'corrupt capture');
  assert.throws(()=>f.verifyPendingDelivery(pending,123),/capture/);
  writeFileSync(join(snapshot,'index.html'),'captured');
  writeFileSync(join(pending,'manifest.json'),Buffer.concat([manifestBytes,Buffer.from('\n')]));
  assert.throws(()=>f.verifyPendingDelivery(pending,123),/manifest/);
  assert.ok(readFileSync(join(pending,'delivery.zip')).equals(packaged.zip));
});
