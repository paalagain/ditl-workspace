import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrity } from '../tools/protocol.mjs';

test('implicit parent directories have a single portable spelling before ZIP extraction', async()=> {
  const f=await integrity();
  for(const paths of [['v/A/x.txt','v/a/y.txt'],['v/A/x.txt','V/A/y.txt'],['v/A/x.txt','v/a/']]) {
    assert.throws(()=>f.writeZip(paths.map(path=>({path,data:Buffer.from(path.endsWith('/')?'':'x')}))),/case-colliding/);
  }
});
import { fixtureZip, deliveryFixture, finalArchiveFixture } from './archive-fixtures.mjs';
import { deflateRawSync } from 'node:zlib';
import zlib from 'node:zlib';

test('ZIP subset refuses trailing deflate bytes and unsupported creator systems', async()=> {
  const f=await integrity(), data=Buffer.from('abc');
  assert.throws(()=>f.readZip(fixtureZip([{path:'x',data,method:8,packed:Buffer.concat([deflateRawSync(data),Buffer.from('hidden')])}])));
  assert.throws(()=>f.readZip(fixtureZip([{path:'x',data,creator:0xff14}])));
});

test('delivery structure requires captured root and refuses unrelated empty directories', async()=> {
  const f=await integrity(), fixture=deliveryFixture(f);
  for(const entries of [fixture.entries.filter(e=>e.path!=='design.current.v1/'),[...fixture.entries,{path:'design.current.v1/extra/'}]]) {
    const {zip,descriptor}=fixture.pack(entries);
    assert.throws(()=>f.verifyDelivery(zip,descriptor),/structure|directory/);
  }
});
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

test('reception checks known destination capacity before inflation and creates no failed tree', async()=> {
  const f=await integrity(), fixture=deliveryFixture(f), root=mkdtempSync(join(tmpdir(),'ditl-receive-'));
  const good=fixture.pack(fixture.entries.map(entry=>entry.path.endsWith('/index.html')?{...entry,method:8}:entry)), dest=join(root,'good');
  const result=f.receiveDelivery(good.zip,good.descriptor,dest);
  assert.equal(readFileSync(join(dest,result.manifest.capturedFolder,'index.html'),'utf8'),'<h1>Safe</h1>');
  assert.throws(()=>f.receiveDelivery(good.zip,good.descriptor,dest),/exists/);
  const original=fs.statfsSync, originalInflate=zlib.inflateRawSync, operations=[];
  try {
    zlib.inflateRawSync=(...args)=>{operations.push('inflate');return originalInflate(...args);};syncBuiltinESMExports();
    for(const capacity of [null,{bavail:0n,bsize:4096n},{bavail:-1n,bsize:4096n},{bavail:100n,bsize:0n}]) {
      operations.length=0;fs.statfsSync=()=>{operations.push('capacity');return capacity;};syncBuiltinESMExports();
      const target=join(root,'refused');
      assert.throws(()=>f.receiveDelivery(good.zip,good.descriptor,target),/capacity/);
      assert.equal(existsSync(target),false);
      assert.deepEqual(operations,['capacity'],'Unknown or insufficient capacity refuses before any deflate inflation');
    }
    const declared=f.inspectZip(good.zip).totalBytes;
    operations.length=0;fs.statfsSync=()=>{operations.push('capacity');return {bavail:2n*BigInt(declared),bsize:1n};};syncBuiltinESMExports();
    assert.equal(f.receiveDelivery(good.zip,good.descriptor,join(root,'exact')).manifest.deliveryId,fixture.manifest.deliveryId);
    assert.deepEqual(operations,['capacity','inflate','capacity'],'Exact capacity permits actual raw-deflate extraction after the preflight');
    operations.length=0;fs.statfsSync=()=>{operations.push('capacity');return {bavail:2n*BigInt(declared)-1n,bsize:1n};};syncBuiltinESMExports();
    assert.throws(()=>f.receiveDelivery(good.zip,good.descriptor,join(root,'one-short')),/capacity/);
    assert.deepEqual(operations,['capacity']);
  } finally {fs.statfsSync=original;zlib.inflateRawSync=originalInflate;syncBuiltinESMExports();}
});
import { writeFileSync } from 'node:fs';

test('frozen evidence refuses an explicitly unsupported record version even with a matching hash', async()=> {
  const f=await integrity(), fixture=finalArchiveFixture(f), m=structuredClone(fixture.manifest);
  const reassessment=JSON.parse(m.evidence.reassessment.json);reassessment.schemaVersion=2;
  const json=JSON.stringify(reassessment);m.evidence.reassessment={json,sha256:f.sha256(Buffer.from(json))};
  assert.throws(()=>f.validateManifest(Buffer.from(JSON.stringify(m))),error=>/Unsupported frozen evidence version/.test(error.message));
});

test('captured inventory retains named empty directories and verifies their exact archive structure', async()=> {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-empty-'));
  mkdirSync(join(root,'assets'));mkdirSync(join(root,'empty'));writeFileSync(join(root,'index.html'),'<h1>Safe</h1>');
  const inv=f.inventory(root), fixture=deliveryFixture(f,{directories:['assets/','empty/']});
  assert.deepEqual(inv.directories,['assets/','empty/']);
  const packaged=f.packageDelivery(Buffer.from(JSON.stringify(fixture.manifest)),root);
  assert.ok(f.verifyDelivery(packaged.zip,packaged.descriptor).entries.some(e=>e.path==='design.current.v1/empty/'));
});
import { maliciousDeliveries, expectedArchiveRefusal } from './archive-fixtures.mjs';

test('real malicious archive bytes refuse reception without creating any destination', async()=> {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-archives-'));
  for(const item of maliciousDeliveries(f)) {
    const destination=join(root,item.name);
    assert.throws(()=>f.receiveDelivery(item.zip,item.descriptor,destination),error=>expectedArchiveRefusal(item.name).test(error.message),item.name);
    assert.equal(existsSync(destination),false,`${item.name}: no extraction tree`);
  }
});

test('default metadata limits accept exact boundaries and refuse the next unit', async()=> {
  const f=await integrity();
  assert.deepEqual(f.limitsV1,{entries:5000,totalBytes:536870912,entryBytes:268435456,ratio:100});
  assert.equal(f.inspectZip(fixtureZip(Array.from({length:5000},(_,n)=>({path:`x/${n}`})))).records.length,5000);
  assert.throws(()=>f.inspectZip(fixtureZip(Array.from({length:5001},(_,n)=>({path:`x/${n}`})))),error=>/limit/.test(error.message));
  const entry=size=>({path:'large',method:8,size,data:'',packed:Buffer.alloc(Math.ceil(size/100))});
  assert.equal(f.inspectZip(fixtureZip([entry(268435456)])).totalBytes,268435456);
  assert.throws(()=>f.inspectZip(fixtureZip([entry(268435457)])),error=>/limit/.test(error.message));
  assert.equal(f.inspectZip(fixtureZip([entry(268435456),{...entry(268435456),path:'second'}])).totalBytes,536870912);
  assert.throws(()=>f.inspectZip(fixtureZip([entry(268435456),{...entry(268435456),path:'second'},{path:'one',data:'x'}])),error=>/limit/.test(error.message));
  assert.equal(f.inspectZip(fixtureZip([{path:'ratio',size:100,method:8,packed:Buffer.alloc(1)}])).totalBytes,100);
  assert.throws(()=>f.inspectZip(fixtureZip([{path:'ratio',size:101,method:8,packed:Buffer.alloc(1)}])),error=>/limit/.test(error.message));
  assert.throws(()=>f.inspectZip(fixtureZip([]),{...f.limitsV1,totalBytes:536870913}),error=>/limits/.test(error.message));
});

test('actual inflation rejects understated lengths and truncated deflate streams within configured bounds', async()=> {
  const f=await integrity(), packed=deflateRawSync(Buffer.alloc(4096,97));
  for(const e of [{path:'x',method:8,packed,size:1},{path:'x',method:8,packed:packed.subarray(0,packed.length-1),size:4096}]) {
    assert.throws(()=>f.readZip(fixtureZip([e])),error=>Boolean(error.message));
  }
  assert.equal(f.readZip(fixtureZip([{path:'x',method:8,data:Buffer.from('abc')}]))[0].data.toString(),'abc');
});
import { symlinkSync } from 'node:fs';
import { createInboxFixtureManifest } from '../trials/support/inbox-fixture.mjs';

test('shared synthetic final fixture binds the requested order and receives with its agreed scope', async()=> {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-final-archive-'));
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'index.html'),'<h1>Safe</h1>');
  const manifest=createInboxFixtureManifest(f,{repositoryId:123,prototypeRoot:root,number:3,orderNumber:148,capturedAt:'2026-10-31T12:00:00.000Z'});
  assert.equal(manifest.orderNumber,148);
  const scope=JSON.parse(manifest.evidence.reassessment.json).agreedScope;
  assert.equal(scope.orderId.issueNumber,148);assert.equal(scope.originalBodySha256,manifest.scopeSha256);
  const packaged=f.packageDelivery(Buffer.from(JSON.stringify(manifest)),root);
  const received=f.receiveDelivery(packaged.zip,packaged.descriptor,join(root,'received'));
  assert.equal(received.manifest.kind,'final');assert.equal(received.manifest.tag,'order-148/final');
});

test('canonical format is valid UTF-8 and refuses Windows superscript device aliases', async()=> {
  const f=await integrity();
  for(const codePoint of [0x00b9,0x00b2,0x00b3]) {
    for(const prefix of ['COM','LPT','com','lpt']) {
      const path=`assets/${prefix}${String.fromCodePoint(codePoint)}.txt`;
      assert.throws(()=>f.safePath(path),error=>/Unsafe path/.test(error.message),path);
      assert.throws(()=>f.readZip(fixtureZip([{path,data:'x'}])),error=>/Unsafe path/.test(error.message),path);
    }
  }
  const canonical=readFileSync(new URL('../protocols/format.md',import.meta.url));
  assert.ok(Buffer.from(canonical.toString('utf8'),'utf8').equals(canonical),'canonical protocol bytes must round-trip as UTF-8');
});

test('destination junction ancestors cannot redirect staged extraction', async()=> {
  const f=await integrity(), root=mkdtempSync(join(tmpdir(),'ditl-junction-')), outside=join(root,'outside'), link=join(root,'redirect');
  mkdirSync(outside);symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  const fixture=deliveryFixture(f), item=fixture.pack(fixture.entries), dest=join(link,'extracted');
  assert.throws(()=>f.receiveDelivery(item.zip,item.descriptor,dest),error=>/ancestor/.test(error.message));
  assert.equal(existsSync(join(outside,'extracted')),false);
});
test('Unicode case folding cannot merge distinct implicit directories', async()=> {
  const f=await integrity();
  for(const paths of [['v/S/x','v/ſ/y'],['v/Σ/x','v/ς/y'],['v/STRASSE/x','v/Straße/y']]) {
    assert.throws(()=>f.readZip(fixtureZip(paths.map(path=>({path,data:'x'})))),error=>/case-colliding/.test(error.message));
  }
});
