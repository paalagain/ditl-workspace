import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInboxFixtureManifest } from '../trials/support/inbox-fixture.mjs';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function expectedArchiveRefusal(name) {
  const classes=[
    [/^(traversal|absolute|drive|unc|control|del|unicodeControl|emptySegment|dotSegment|trailingDot|trailingSpace|device|deviceSuperscript|nonNFC)$/, /Unsafe path/],
    [/^invalid-utf8$/, /Invalid UTF-8/],
    [/^(duplicate|explicit-case|implicit-directory-case)$/, /case-colliding/],
    [/^file-directory$/, /File\/directory collision/],
    [/^(symlink|fifo|socket|reparse|encryption|extra|zip64|unsupportedCompression|unsupportedCreator)$/, /Unsupported ZIP flags, type or extension/],
    [/^localExtra$/, /Conflicting ZIP local header/],
    [/^understated-expansion$/, /Buffer larger|output length|ZIP length/i],
    [/^trailing-deflate$/, /Unaccounted deflate bytes/],
    [/^(missing-file|extra-file|wrong-length)$/, /Extracted inventory mismatch/],
    [/^(missing-assets|missing-root-directory|extra-directory)$/, /ZIP directory structure/],
    [/^unsupported-manifest$/, /Invalid delivery identity or unsupported format/],
    [/^conflicting-payload$/, /Invalid inventory digest or order/],
    [/^entries-limit$/, /Invalid ZIP index or entry limit/],
    [/^(entry-size-limit|total-size-limit|ratio-limit)$/, /Extraction limit exceeded/],
    [/^descriptor-identity$/, /Delivery identity mismatch/],
    [/^zip-hash$/, /Delivery ZIP hash or descriptor mismatch/],
    [/^manifest-hash$/, /Manifest bytes mismatch/],
    [/^(incomplete-evidence|conflicting-evidence)$/, /Frozen evidence hash mismatch/],
    [/^unsupported-evidence$/, /Unsupported frozen evidence version/],
  ];
  const match=classes.find(([names])=>names.test(name));
  if(!match) throw Error(`No intended refusal class for archive fixture: ${name}`);
  return match[1];
}
function crc(bytes) {
  let value=0xffffffff;
  for(const byte of bytes) { value^=byte; for(let n=0;n<8;n++) value=(value>>>1)^((value&1)?0xedb88320:0); }
  return (value^0xffffffff)>>>0;
}
// Independent fixture encoder deliberately permits malformed metadata and paths.
export function fixtureZip(entries) {
  const locals=[],centrals=[];let offset=0;
  for(const e of entries) {
    const name=Buffer.isBuffer(e.path)?e.path:Buffer.from(e.path), data=Buffer.from(e.data??''), method=e.method??0;
    const packed=e.packed??(method===8?deflateRawSync(data):data), size=e.size??data.length;
    const local=Buffer.alloc(30), central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(e.version??20,4);local.writeUInt16LE(e.flags??0x800,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc(data),14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(e.localExtra?.length??0,28);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(e.creator??20,4);central.writeUInt16LE(e.version??20,6);central.writeUInt16LE(e.flags??0x800,8);central.writeUInt16LE(method,10);
    central.writeUInt32LE(crc(data),16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(e.extra?.length??0,30);central.writeUInt16LE(e.comment?.length??0,32);
    central.writeUInt32LE(e.attributes??(String(e.path).endsWith('/')?0x10:0),38);central.writeUInt32LE(offset,42);
    locals.push(local,name,e.localExtra??Buffer.alloc(0),packed);centrals.push(central,name,e.extra??Buffer.alloc(0),e.comment??Buffer.alloc(0));offset+=30+name.length+(e.localExtra?.length??0)+packed.length;
  }
  const directory=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
export function deliveryFixture(f, changes={}) {
  const data=Buffer.from('<h1>Safe</h1>'), inventory=[{path:'index.html',bytes:data.length,sha256:sha(data)}];
  const manifest={schemaVersion:2,repositoryId:123,orderNumber:7,deliveryId:'1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',tag:'order-7/send-1',kind:'send',versionNumber:1,capturedFolder:'design.current.v1',capturedAt:'2026-10-31T12:00:00.000Z',inventory,payloadSha256:f.payloadDigest(inventory),scopeSha256:'ab'.repeat(32),localProgress:{checkedOrdinals:[],taskContext:'Ready'},deliveryNote:{summary:'Fixture',outsideOrder:'None',workInProgress:'None'},deliveredUncheckedOrdinals:null,evidence:null,...changes};
  const entries=[{path:'manifest.json',data:Buffer.from(JSON.stringify(manifest))},{path:manifest.capturedFolder+'/'},{path:manifest.capturedFolder+'/assets/'},{path:manifest.capturedFolder+'/index.html',data}];
  return {manifest,entries,pack:items=> {
    const zip=fixtureZip(items);
    return {zip,descriptor:{schemaVersion:1,repositoryId:manifest.repositoryId,orderNumber:manifest.orderNumber,deliveryId:manifest.deliveryId,tag:manifest.tag,kind:manifest.kind,assetName:'delivery.zip',assetBytes:zip.length,zipSha256:sha(zip),manifestSha256:sha(items.find(e=>e.path==='manifest.json').data)}};
  }};
}
export function finalArchiveFixture(f,{orderNumber=7,deliveryId='1ecbd5e0-a285-4a5b-9787-fb48ffdbb56a'}={}) {
  const prototypeRoot=mkdtempSync(join(tmpdir(),'ditl-final-archive-fixture-'));
  mkdirSync(join(prototypeRoot,'assets'));writeFileSync(join(prototypeRoot,'index.html'),'<h1>Safe</h1>');
  const manifest=createInboxFixtureManifest(f,{repositoryId:123,prototypeRoot,number:3,orderNumber,deliveryId,capturedAt:'2026-10-31T12:00:00.000Z'});
  f.validateManifest(Buffer.from(JSON.stringify(manifest)));
  return deliveryFixture(f,manifest);
}
export function maliciousDeliveries(f) {
  const cases=[];
  const add=(name,edit,changes={})=>{
    const base=deliveryFixture(f,{deliveryId:`00000000-0000-4000-8000-${String(cases.length+1).padStart(12,'0')}`,tag:`order-7/send-${cases.length+1}`,...changes});
    const packed=base.pack(edit(base.entries,base.manifest));
    cases.push({name,...packed});
  };
  for(const [name,path] of Object.entries({traversal:'../escape',absolute:'/escape',drive:'C:/escape',unc:'\\\\server\\share',control:'a\x01b',del:'a\x7fb',unicodeControl:'a\u0085b',emptySegment:'a//b',dotSegment:'a/./b',trailingDot:'a./b',trailingSpace:'a /b',device:'assets/CON.txt',deviceSuperscript:'assets/COM¹.txt',nonNFC:'assets/e\u0301.txt'})) add(name,entries=>[...entries,{path,data:'x'}]);
  add('invalid-utf8',entries=>[...entries,{path:Buffer.from([0xff]),data:'x'}]);
  add('duplicate',entries=>[...entries,entries.at(-1)]);
  add('explicit-case',entries=>[...entries,{path:'design.current.v1/INDEX.html',data:'x'}]);
  add('implicit-directory-case',entries=>[...entries,{path:'design.current.v1/A/x',data:'x'},{path:'design.current.v1/a/y',data:'y'}]);
  add('file-directory',entries=>[...entries,{path:'design.current.v1/index.html/child',data:'x'}]);
  for(const [name,attributes] of Object.entries({symlink:0xa1ff0000,fifo:0x11a40000,socket:0xc1ff0000,reparse:0x400})) add(name,entries=>[...entries,{path:'design.current.v1/special',data:'x',creator:0x314,attributes}]);
  for(const [name,metadata] of Object.entries({encryption:{flags:0x801},extra:{extra:Buffer.from([0,0,0,0])},localExtra:{localExtra:Buffer.from([0,0,0,0])},zip64:{version:45},unsupportedCompression:{method:12},unsupportedCreator:{creator:0xff14}})) add(name,entries=>entries.map((e,n)=>n===3?{...e,...metadata}:e));
  add('understated-expansion',entries=>entries.map((e,n)=>n===3?{...e,data:Buffer.alloc(8192,97),method:8,size:1}:e));
  add('trailing-deflate',entries=>entries.map((e,n)=>n===3?{...e,method:8,packed:Buffer.concat([deflateRawSync(e.data),Buffer.from('hidden')])}:e));
  add('missing-file',entries=>entries.filter((_,n)=>n!==3));
  add('extra-file',entries=>[...entries,{path:'design.current.v1/extra',data:'x'}]);
  add('missing-assets',entries=>entries.filter((_,n)=>n!==2));
  add('missing-root-directory',entries=>entries.filter((_,n)=>n!==1));
  add('extra-directory',entries=>[...entries,{path:'design.current.v1/extra/'}]);
  add('wrong-length',entries=>entries.map((e,n)=>n===3?{...e,data:'different'}:e));
  add('unsupported-manifest',entries=>entries,{schemaVersion:999});
  add('conflicting-payload',entries=>entries,{payloadSha256:'00'.repeat(32)});
  add('entries-limit',entries=>[...entries,...Array.from({length:4997},(_,n)=>({path:`design.current.v1/assets/${n}`}))]);
  add('entry-size-limit',entries=>[...entries,{path:'design.current.v1/large',method:8,data:'',size:268435457,packed:Buffer.alloc(2684355)}]);
  add('total-size-limit',entries=>[...entries,...[0,1,2].map(n=>({path:`design.current.v1/large-${n}`,method:8,data:'',size:200000000,packed:Buffer.alloc(2000000)}))]);
  add('ratio-limit',entries=>[...entries,{path:'design.current.v1/ratio',method:8,data:'',size:101,packed:Buffer.alloc(1)}]);
  for(const [name,field] of [['descriptor-identity','deliveryId'],['zip-hash','zipSha256'],['manifest-hash','manifestSha256']]) {
    const base=deliveryFixture(f,{deliveryId:`00000000-0000-4000-8000-${String(cases.length+1).padStart(12,'0')}`,tag:`order-7/send-${cases.length+1}`}), packaged=base.pack(base.entries);
    cases.push({name,zip:packaged.zip,descriptor:{...packaged.descriptor,[field]:field==='deliveryId'?'00000000-0000-4000-8000-999999999999':'00'.repeat(32)}});
  }
  for(const name of ['incomplete-evidence','conflicting-evidence','unsupported-evidence']) {
    const base=finalArchiveFixture(f,{orderNumber:100+cases.length,deliveryId:`00000000-0000-4000-8000-${String(cases.length+1).padStart(12,'0')}`});
    const manifest=structuredClone(base.manifest);
    if(name==='incomplete-evidence') manifest.evidence.reassessment=null;
    if(name==='conflicting-evidence') manifest.evidence.reassessment.sha256='00'.repeat(32);
    if(name==='unsupported-evidence') {
      const reassessment=JSON.parse(manifest.evidence.reassessment.json);reassessment.schemaVersion=2;
      const json=JSON.stringify(reassessment);manifest.evidence.reassessment={json,sha256:sha(Buffer.from(json))};
    }
    const entries=base.entries.map(entry=>entry.path==='manifest.json'?{...entry,data:Buffer.from(JSON.stringify(manifest))}:entry);
    cases.push({name,...base.pack(entries)});
  }
  return cases;
}
