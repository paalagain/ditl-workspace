import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, check, buildSource, checkSource } from '../tools/bundle.mjs';

test('each role bundle is independently installable and detects copied policy drift', () => {
  const out = mkdtempSync(join(tmpdir(), 'ditl-bundle-'));
  build(out);
  check(out);
  const skill = readFileSync(join(out, 'designer/send-final/SKILL.md'), 'utf8');
  assert.match(skill, /disable-model-invocation: true/);
  assert.match(readFileSync(join(out, 'designer/send-final/agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  assert.equal(readFileSync(join(out, 'designer/inbox/SKILL.md'), 'utf8'), readFileSync(join(out, 'developer/inbox/SKILL.md'), 'utf8'));
  writeFileSync(join(out, 'designer/send-final/references/format.md'), 'drift');
  assert.throws(() => check(out), /drift/);
});

test('packaging rejects invalid UTF-8 canonical bytes before decoding or hashing references',()=>{
  const fixture=mkdtempSync(join(tmpdir(),'ditl-invalid-source-')),out=join(fixture,'out');
  mkdirSync(join(fixture,'workflows'));mkdirSync(join(fixture,'protocols'));
  const valid=new Map([
    ['workflows/inbox.json',Buffer.from(JSON.stringify({schemaVersion:1,name:'inbox',roles:['designer','developer'],description:'Check incoming work.',references:['format.md']}))],
    ['workflows/inbox.md',Buffer.from('Read [Format](references/format.md).\n')],
    ['protocols/format.md',Buffer.from('# Format\n\nRevision: 1\n\n')],
  ]);
  for(const [name,bytes] of valid)writeFileSync(join(fixture,name),bytes);
  for(const [name,bytes] of valid) {
    writeFileSync(join(fixture,name),Buffer.concat([bytes,Buffer.from([0xb9,0xb2,0xb3])]));
    assert.throws(()=>buildSource(out,{complete:false,canonicalRoot:fixture}),/Invalid UTF-8/);
    writeFileSync(join(fixture,name),bytes);
  }
});

test('Git distribution exposes one shared inbox with a complete standalone reference closure',()=>{
  const out=mkdtempSync(join(tmpdir(),'ditl-source-'));
  buildSource(out);
  checkSource(out);
  assert.deepEqual(readdirSync(out).sort(),['inbox','new-version','order','send','send-final']);
  const manifest=JSON.parse(readFileSync(join(out,'inbox/bundle.json')));
  assert.deepEqual(manifest.roles,['designer','developer']);
  for (const name of readdirSync(out)) assert.ok(readFileSync(join(out,name,'LICENSE')).equals(readFileSync(new URL('../LICENSE',import.meta.url))));
  assert.ok(readFileSync(join(out,'inbox/references/setup.md')).equals(readFileSync(new URL('../protocols/setup.md',import.meta.url))));
  assert.match(readFileSync(join(out,'inbox/references/setup.md'),'utf8'),/Project setup/);
  writeFileSync(join(out,'inbox/references/setup.md'),'changed');
  assert.throws(()=>checkSource(out),/drift/);
});

test('the shipped Git source matches current canonical instructions and complete role declarations',()=>{
  checkSource();
});
