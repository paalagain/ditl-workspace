import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../tools/bundle.mjs';

test('documented Node loader executes exact installed named blocks through paths containing spaces',()=>{
  const run=mkdtempSync(join(tmpdir(),'ditl protocol loader ')),out=join(run,'installed bundles');build(out);
  const reference=join(out,'designer/inbox/references'),format=join(reference,'format.md'),orders=join(reference,'orders.md');
  const example=[...readFileSync(format,'utf8').matchAll(/```javascript integrity-loader-v1\r?\n([\s\S]*?)\r?\n```/g)];
  assert.equal(example.length,1);
  const driver=join(run,'documented driver.mjs');
  writeFileSync(driver,example[0][1]+"\nconst selected = await loadNamedBlock(process.argv[4], process.argv[5]);\nconsole.log(typeof selected.createOrders);\n");
  const result=spawnSync(process.execPath,[driver,format,'integrity-v1',orders,'orders-v1'],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr.slice(0,300));
  assert.deepEqual(result.stdout.trim().split(/\r?\n/),['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','function']);
  const unknown=spawnSync(process.execPath,[driver,format,'integrity-v1',orders,'unknown-v1'],{encoding:'utf8',windowsHide:true});
  assert.notEqual(unknown.status,0);assert.match(unknown.stderr,/exactly one named protocol block/);
  const duplicate=join(run,'duplicate reference.md');writeFileSync(duplicate,readFileSync(orders,'utf8').repeat(2));
  const conflicting=spawnSync(process.execPath,[driver,format,'integrity-v1',duplicate,'orders-v1'],{encoding:'utf8',windowsHide:true});
  assert.notEqual(conflicting.status,0);assert.match(conflicting.stderr,/exactly one named protocol block/);
});
