import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {inspectPending} from '../trials/support/pending.mjs';
test('trial verification discloses module-only aborted evidence and refuses malformed/conflicting records',()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-pending-evidence-')),id='1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a';mkdirSync(join(root,'aborted/modules'),{recursive:true});mkdirSync(join(root,id));
  const record={schemaVersion:1,repositoryId:7,orderNumber:2,deliveryId:id,kind:'final',tag:'order-2/final',versionNumber:1,capturedFolder:'design.v1'};writeFileSync(join(root,id,'record.json'),JSON.stringify(record));
  const observed=inspectPending(root,{repositoryId:7,orderNumber:2});assert.equal(observed.operations.length,1);assert.equal(observed.abortedDrivers.length,1);assert.match(observed.abortedDrivers[0].reason,/no operation record/);
  for(const malformed of ['{','null','[]']){writeFileSync(join(root,id,'record.json'),malformed);assert.throws(()=>inspectPending(root,{repositoryId:7,orderNumber:2}),/Malformed operation record retained/);}
  writeFileSync(join(root,id,'record.json'),JSON.stringify({...record,schemaVersion:99}));assert.throws(()=>inspectPending(root,{repositoryId:7,orderNumber:2}),/Unsupported operation record retained/);
  writeFileSync(join(root,id,'record.json'),JSON.stringify({...record,repositoryId:8}));assert.throws(()=>inspectPending(root,{repositoryId:7,orderNumber:2}),/Conflicting or invalid operation identity/);
});
