import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('product gh boundary forwards exact structured stdin to the transport',()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-product-boundary-')),fake=join(root,'transport.mjs'),config=join(root,'config.json'),launcher=join(root,'launcher.mjs');
  writeFileSync(fake,"import{readFileSync}from'node:fs';process.stdout.write(JSON.stringify({received:readFileSync(0,'utf8')}));\n");
  writeFileSync(config,JSON.stringify({schemaVersion:1,calls:join(root,'calls.jsonl'),fault:join(root,'fault.json'),command:process.execPath,prefixArgs:[fake]}));
  writeFileSync(launcher,`import{main}from ${JSON.stringify(new URL('../tools/product-gh-boundary.mjs',import.meta.url).href)};process.exitCode=main(${JSON.stringify(config)},process.argv.slice(2));\n`);
  const input=JSON.stringify({title:'Exact work order',body:'Unicode \u00e6 and an intentional\nnewline'}),result=spawnSync(process.execPath,[launcher,'api','--method','POST','repos/fixture/input-test/issues','--input','-'],{input,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).received,input);
});
