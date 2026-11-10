import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {existsSync,mkdtempSync,mkdirSync,readdirSync,writeFileSync,readFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from '../tools/bundle.mjs';
import {integrity, inbox} from '../tools/protocol.mjs';

async function fixture() {
  const root=mkdtempSync(join(tmpdir(),'ditl-inbox-')), bundle=join(root,'bundle');build(bundle);
  const format=await integrity(new URL('file:///'+join(bundle,'developer/inbox/references/format.md').replaceAll('\\','/')));
  const api=await inbox(new URL('file:///'+join(bundle,'developer/inbox/references/inbox.md').replaceAll('\\','/')),format);
  const prototype=join(root,'source');mkdirSync(join(prototype,'assets'),{recursive:true});writeFileSync(join(prototype,'index.html'),'abc');
  const inv=format.inventory(prototype), manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId:'1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',tag:'order-7/send-1',kind:'send',versionNumber:1,capturedFolder:'design.v1',capturedAt:'2026-10-31T12:00:00.000Z',inventory:inv.files,payloadSha256:inv.payloadSha256,scopeSha256:'ab'.repeat(32),localProgress:{checkedOrdinals:[],taskContext:''},deliveryNote:{summary:'Iteration',outsideOrder:'None',workInProgress:'None'},evidence:null,deliveredUncheckedOrdinals:null};
  const packed=format.packageDelivery(Buffer.from(JSON.stringify(manifest)),prototype);
  const release={id:77,draft:false,tag_name:manifest.tag,body:'```designeritl-delivery\n'+JSON.stringify(packed.descriptor)+'\n```'};
  const assets=[{id:88,name:'delivery.zip',size:packed.zip.length}];
  return {root,format,api,manifest,packed,release,assets};
}

test('installed Inbox verifies exact installed bytes before repairing a missing receipt',async()=>{
  const {root,format,api,manifest,packed,release,assets}=await fixture();
  const observation=api.observeRelease(release,123,assets), destination=join(root,'received');
  const tree=format.verifyDelivery(packed.zip,packed.descriptor);format.extractZip(tree.entries,destination);
  const verified=api.verifyInstalled(destination,observation,tree.entries);
  assert.equal(verified.manifest.payloadSha256,manifest.payloadSha256);
  assert.equal(readFileSync(join(destination,'design.v1/index.html'),'utf8'),'abc');
  writeFileSync(join(destination,'extra.txt'),'unclaimed');
  assert.throws(()=>api.verifyInstalled(destination,observation,tree.entries),/inventory|structure/i);
});

test('verified receive removes only its own staging after the receipt is stored',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets),destinationRoot=join(root,'received'),receipts={};
  const stagingRoot=join(destinationRoot,'.designeritl-staging'),other=join(stagingRoot,'other-operation');
  mkdirSync(other,{recursive:true});writeFileSync(join(other,'delivery.zip'),'retained recovery bytes');
  let operation;
  const result=await api.receiveOne({observation,destinationRoot,receipts,
    download:async path=>{operation=join(path,'..');writeFileSync(path,packed.zip);},refresh:async()=>observation,
    persistReceipt:async(key,receipt)=>{
      assert.ok(existsSync(join(operation,'delivery.zip')));
      assert.equal(readFileSync(join(receipt.destination,'design.v1/index.html'),'utf8'),'abc');
      receipts[key]=receipt;
    }});
  assert.equal(result.status,'installed');assert.equal(Object.keys(receipts).length,1);
  assert.equal(existsSync(operation),false);
  assert.deepEqual(readdirSync(stagingRoot),['other-operation']);
  assert.equal(readFileSync(join(other,'delivery.zip'),'utf8'),'retained recovery bytes');
});

test('failed download, verification and receipt persistence retain their own staging',async()=>{
  const failures={download:/download interrupted/,archive:/Unsupported ZIP trailer/,installed:/Installed manifest hash divergence/,refresh:/refresh interrupted/,receipt:/receipt interrupted/};
  for(const [phase,expected] of Object.entries(failures)) {
    const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets),destinationRoot=join(root,'received'),receipts={};
    let zipPath,refreshes=0;
    await assert.rejects(()=>api.receiveOne({observation,destinationRoot,receipts,
      download:async path=>{zipPath=path;writeFileSync(path,phase==='archive'?packed.zip.subarray(0,70):packed.zip);if(phase==='download')throw Error('download interrupted');},
      refresh:async()=>{
        refreshes++;
        if(phase==='installed'&&refreshes===1) {
          const target=join(destinationRoot,'order-7',packed.descriptor.deliveryId);
          mkdirSync(target,{recursive:true});writeFileSync(join(target,'manifest.json'),'divergent install');
        }
        if(phase==='refresh'&&refreshes===2)throw Error('refresh interrupted');
        return observation;
      },persistReceipt:async()=>{throw Error('receipt interrupted');}}),expected,phase);
    assert.ok(existsSync(zipPath),phase);
    assert.deepEqual(receipts,{},phase);
  }
});

test('staging cleanup failure reports retained staging without failing the verified install',async(t)=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets),destinationRoot=join(root,'received'),receipts={};
  let operation;
  const remove=fs.rmSync;
  t.mock.method(fs,'rmSync',(path,options)=>{if(path===operation)throw Error('cleanup blocked');return remove(path,options);});
  syncBuiltinESMExports();
  try {
    const result=await api.receiveOne({observation,destinationRoot,receipts,
      download:async path=>{operation=join(path,'..');writeFileSync(path,packed.zip);},refresh:async()=>observation,
      persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}});
    assert.equal(result.status,'installed');assert.equal(Object.keys(receipts).length,1);
    assert.equal(result.staging,operation);assert.match(result.cleanupWarning,/cleanup blocked/);
    assert.ok(existsSync(join(operation,'delivery.zip')));
    assert.equal(readFileSync(join(result.destination,'design.v1/index.html'),'utf8'),'abc');
  } finally {t.mock.restoreAll();syncBuiltinESMExports();}
});

test('interrupted receipt persistence repairs installed delivery without replacing files or older receipts',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets), destinationRoot=join(root,'received'), receipts={};
  const effects={observation,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>observation,persistReceipt:async()=>{throw Error('receipt write interrupted');}};
  await assert.rejects(()=>api.receiveOne(effects),/receipt write interrupted/);
  const retained=readdirSync(join(destinationRoot,'.designeritl-staging'));
  const target=join(destinationRoot,'order-7',packed.descriptor.deliveryId), installed=readFileSync(join(target,'design.v1/index.html'));
  assert.deepEqual(receipts,{});
  const result=await api.receiveOne({...effects,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}});
  assert.equal(result.status,'repaired');assert.equal(Object.keys(receipts).length,1);
  assert.deepEqual(readdirSync(join(destinationRoot,'.designeritl-staging')),retained);
  assert.ok(installed.equals(readFileSync(join(target,'design.v1/index.html'))));
  const original=JSON.stringify(receipts);
  const repeat=await api.receiveOne({...effects,persistReceipt:async()=>assert.fail('repeat must retain receipt')});
  assert.equal(repeat.status,'skipped');assert.equal(JSON.stringify(receipts),original);
});

test('local divergence preserves bytes and receipts while explicit recovery appends history',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets), destinationRoot=join(root,'received'), receipts={};
  const options={observation,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>observation,persistReceipt:async(key,receipt)=>{assert.equal(Object.hasOwn(receipts,key),false);receipts[key]=receipt;}};
  const first=await api.receiveOne(options), original=JSON.stringify(receipts);
  writeFileSync(join(first.destination,'design.v1/index.html'),'local edit');
  await assert.rejects(()=>api.receiveOne(options),/divergence/);
  assert.equal(JSON.stringify(receipts),original);assert.equal(readFileSync(join(first.destination,'design.v1/index.html'),'utf8'),'local edit');
  const recovered=await api.receiveOne({...options,recoveryDestination:join(destinationRoot,'explicit-recovery')});
  assert.equal(recovered.status,'installed');assert.equal(Object.keys(receipts).length,2);
  assert.equal(JSON.stringify(receipts[packed.descriptor.deliveryId]),JSON.stringify(JSON.parse(original)[packed.descriptor.deliveryId]));
  assert.equal(readFileSync(join(recovered.destination,'design.v1/index.html'),'utf8'),'abc');
});

test('remote asset replacement is divergence even for identical bytes and never replaces history',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets), destinationRoot=join(root,'received'), receipts={};
  const options={observation,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>observation,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}};
  const first=await api.receiveOne(options), original=JSON.stringify(receipts), changed={...observation,assetId:99};
  await assert.rejects(()=>api.receiveOne({...options,observation:changed,refresh:async()=>changed}),/Remote identity divergence/);
  assert.equal(JSON.stringify(receipts),original);assert.equal(readFileSync(join(first.destination,'design.v1/index.html'),'utf8'),'abc');
});

test('partial transfers and extraction staging never block another independent delivery',async()=>{
  const {root,api,format,manifest,packed,release,assets}=await fixture(), first=api.observeRelease(release,123,assets), destinationRoot=join(root,'received'),receipts={};
  const nextManifest={...manifest,deliveryId:'057619e4-c1e4-42d8-b250-8c289387c022',tag:'order-7/send-2'},next=format.packageDelivery(Buffer.from(JSON.stringify(nextManifest)),join(root,'source'));
  const second=api.observeRelease({...release,id:78,tag_name:nextManifest.tag,body:'```designeritl-delivery\n'+JSON.stringify(next.descriptor)+'\n```'},123,[{...assets[0],id:89,size:next.zip.length}]);
  const results=await api.receiveAll([first,second],{destinationRoot,receipts,download:async(path,observation)=>{writeFileSync(path,observation===first?packed.zip.subarray(0,70):next.zip);},refresh:async observation=>observation,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}});
  assert.deepEqual(results.map(r=>r.status),['refused','installed']);assert.equal(Object.keys(receipts).length,1);
  assert.equal(readFileSync(join(results[1].destination,'design.v1/index.html'),'utf8'),'abc');
  const repaired=await api.receiveOne({observation:first,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>first,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}});
  assert.equal(repaired.status,'installed');assert.equal(Object.keys(receipts).length,2);
});

test('delivery discovery ignores drafts/unrelated releases and refuses malformed machine or asset identity',async()=>{
  const {api,release,assets}=await fixture();
  assert.equal(api.observeRelease({...release,draft:true,body:'broken'},123,[]),null);
  assert.equal(api.observeRelease({...release,tag_name:'v1.0',body:'ordinary release'},123,[]),null);
  for(const changed of [{...release,body:'```designeritl-delivery\n{}\n```'},{...release,body:release.body+'\n'+release.body},{...release,tag_name:'order-8/final'}])assert.throws(()=>api.observeRelease(changed,123,assets));
  assert.throws(()=>api.observeRelease(release,124,assets));
  assert.throws(()=>api.observeRelease(release,123,[...assets,...assets]));
  assert.throws(()=>api.observeRelease(release,123,[{...assets[0],size:1}]));
});

test('repeat verifies retained tree and current identity without repeating a finished download',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets), destinationRoot=join(root,'received'),receipts={};
  const options={observation,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>observation,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}};
  await api.receiveOne(options);
  const result=await api.receiveOne({...options,download:async()=>assert.fail('finished download repeated')});
  assert.equal(result.status,'skipped');
});

test('malformed earlier receipt history refuses mutation rather than silently replacing evidence',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets);
  await assert.rejects(()=>api.receiveOne({observation,destinationRoot:join(root,'received'),receipts:{legacy:{deliveryId:packed.descriptor.deliveryId,schemaVersion:99}},download:async()=>assert.fail('invalid history must stop before download'),refresh:async()=>observation,persistReceipt:async()=>assert.fail('invalid history must not mutate')}),/receipt history/i);
});

test('abandoned extraction and occupied promotion paths retain their bytes and retry in separate staging',async()=>{
  const {root,api,packed,release,assets}=await fixture(), observation=api.observeRelease(release,123,assets),destinationRoot=join(root,'received'),receipts={};
  const partial=join(destinationRoot,'.designeritl-staging/abandoned/tree/design.v1');mkdirSync(partial,{recursive:true});writeFileSync(join(partial,'index.html'),'interrupted extraction');
  const occupied=join(destinationRoot,'order-7',packed.descriptor.deliveryId);mkdirSync(occupied,{recursive:true});writeFileSync(join(occupied,'manifest.json'),'interrupted promotion');
  const options={observation,destinationRoot,receipts,download:async path=>writeFileSync(path,packed.zip),refresh:async()=>observation,persistReceipt:async(key,receipt)=>{receipts[key]=receipt;}};
  await assert.rejects(()=>api.receiveOne(options));assert.deepEqual(receipts,{});
  assert.equal(readFileSync(join(occupied,'manifest.json'),'utf8'),'interrupted promotion');assert.equal(readFileSync(join(partial,'index.html'),'utf8'),'interrupted extraction');
  const result=await api.receiveOne({...options,recoveryDestination:join(destinationRoot,'recovery')});
  assert.equal(result.status,'installed');assert.equal(readFileSync(join(result.destination,'design.v1/index.html'),'utf8'),'abc');
});
