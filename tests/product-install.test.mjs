import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from '../tools/bundle.mjs';
import {integrity} from '../tools/protocol.mjs';
import {verifyRoleInstallation} from '../trials/support/product.mjs';

test('product trial verifies both independent installed copies and refuses a stale or foreign workflow',async()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-product-install-check-')),dist=join(root,'dist'),project=join(root,'project');build(dist);
  for(const host of ['.agents','.claude']){mkdirSync(join(project,host),{recursive:true});cpSync(join(dist,'developer'),join(project,host,'skills'),{recursive:true});}
  const f=await integrity(),valid=verifyRoleInstallation(project,join(dist,'developer'),'developer',f);
  assert.equal(valid.length,4);assert.ok(valid.every(row=>row.files>2));
  const changed=join(project,'.claude/skills/order/SKILL.md'),original=readFileSync(changed);writeFileSync(changed,Buffer.concat([original,Buffer.from('\nStale host copy\n')]));
  assert.throws(()=>verifyRoleInstallation(project,join(dist,'developer'),'developer',f),/Installed content differs/);
  writeFileSync(changed,original);mkdirSync(join(project,'.agents/skills/start'));
  assert.throws(()=>verifyRoleInstallation(project,join(dist,'developer'),'developer',f),/Installed role set differs/);
});
