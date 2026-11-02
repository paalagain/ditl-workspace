import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrity } from '../tools/protocol.mjs';

test('embedded format preserves exact payload and empty assets through ZIP reception', async () => {
  const f = await integrity();
  const root = mkdtempSync(join(tmpdir(), 'ditl-format-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), 'abc');
  const inv = f.inventory(root);
  assert.deepEqual(inv.files, [{path:'index.html',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}]);
  const entries = [{path:'design.current.v1/',data:Buffer.alloc(0)}, {path:'design.current.v1/assets/',data:Buffer.alloc(0)}, {path:'design.current.v1/index.html',data:readFileSync(join(root,'index.html'))}];
  const zip = f.writeZip(entries);
  const decoded = f.readZip(zip);
  const dest = join(root,'received');
  f.extractZip(decoded,dest);
  assert.equal(readFileSync(join(dest,'design.current.v1/index.html'),'utf8'), 'abc');
  assert.deepEqual(f.inventory(join(dest,'design.current.v1')), inv);
  assert.ok(zip.equals(f.writeZip(entries)), 'defined ZIP bytes are deterministic');
});

test('delivery verification binds exact manifest and final evidence to the received files', async () => {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-delivery-'));
  mkdirSync(join(root,'assets')); writeFileSync(join(root,'index.html'),'<!doctype html><h1>Ready</h1>');
  const inv=f.inventory(root),body='# Goal\nShow Ready.\n\n- [ ] 1. Show Ready\n\n```designeritl-order\n{"schemaVersion":1,"requestId":"4ecbd5e0-a285-4a5b-9787-fb48ffdbb56a","followsOrderNumber":null,"cancelsOrderNumber":null}\n```\n';
  const agreedScope=f.parseLocalChecklist(f.createLocalChecklist({repositoryId:123,issueNumber:7},body,'2026-10-31T12:00:00.000Z')).scope,scope=agreedScope.originalBodySha256;
  const frozen=record=>{const json=JSON.stringify(record); return {json,sha256:f.sha256(Buffer.from(json))};};
  const manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId:'1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',tag:'order-7/final',kind:'final',versionNumber:1,capturedFolder:'design.current.v1',capturedAt:'2026-10-31T12:00:00.000Z',inventory:inv.files,payloadSha256:inv.payloadSha256,scopeSha256:scope,localProgress:{checkedOrdinals:[1],taskContext:'Done'},deliveryNote:{summary:'Order 7 version 1',outsideOrder:'None',workInProgress:'None'},deliveredUncheckedOrdinals:[],evidence:{reassessment:frozen({payloadSha256:inv.payloadSha256,scopeSha256:scope,agreedScope,tasks:[{ordinal:1,result:'fulfilled',evidenceOrReason:'Visible heading'}]}),decision:null}};
  manifest.evidence.decision=frozen({schemaVersion:2,payloadSha256:inv.payloadSha256,scopeSha256:scope,reassessmentSha256:manifest.evidence.reassessment.sha256,acknowledgedUnfinishedOrdinals:[],explicitDesignerStatement:'Deliver the observed clean fixture as-is',recordedAt:'2026-10-31T12:01:00.000Z'});
  const packaged=f.packageDelivery(Buffer.from(JSON.stringify(manifest)),root);
  const verified=f.verifyDelivery(packaged.zip,packaged.descriptor);
  assert.equal(verified.manifest.orderNumber,7);
  assert.equal(verified.entries.find(e=>e.path.endsWith('/index.html')).data.toString(),'<!doctype html><h1>Ready</h1>');
  assert.throws(()=>f.verifyDelivery(packaged.zip,{...packaged.descriptor,deliveryId:'057619e4-c1e4-42d8-b250-8c289387c022'}),/identity/);
  const bad={...manifest,evidence:{...manifest.evidence,decision:null}};
  assert.throws(()=>f.packageDelivery(Buffer.from(JSON.stringify(bad)),root),/evidence/);
});
