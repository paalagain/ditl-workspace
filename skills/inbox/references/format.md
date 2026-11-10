# Delivery format v1

Revision: 10

Canonical integrity implementation follows. Execute this exact fenced module using Node 22.20+; only the invocation parameters and calling code may vary. It is protocol text, not a shipped workspace CLI. All hashing, including auxiliary diagnostics, uses this block's `sha256` and inventory helpers. Prefer importing the verbatim block as a Node data module without temporary files. If materialized, use a unique owned temporary directory; retain it when a fixture requests evidence. Otherwise remove only the exact known owned module files with Node after verifying their absolute paths. Do not replace hashing, ZIP, inventories, inspection or extraction with shell/OS tools.

```javascript integrity-v1
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync, statfsSync, existsSync, copyFileSync, renameSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute, sep, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export const limitsV1 = Object.freeze({entries:5000,totalBytes:512*1024*1024,entryBytes:256*1024*1024,ratio:100});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(message); };
const utf8Order = (a,b) => Buffer.compare(Buffer.from(a.path),Buffer.from(b.path));
export function safePath(path, directory = false) {
  if (typeof path !== 'string' || !path || path.normalize('NFC') !== path || /[\p{Cc}\\:<>"|?*]/u.test(path) || path.startsWith('/')) fail('Unsafe path');
  const value = directory && path.endsWith('/') ? path.slice(0,-1) : path;
  if (!value || Buffer.byteLength(path)>65535 || value.split('/').some(p => !p || p==='.' || p==='..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(p))) fail(`Unsafe path: ${path}`);
  return value;
}
function uniquePaths(entries) {
  const explicit=new Set(), identities=new Map();
  for(const e of entries) {
    const directory=e.path.endsWith('/'), path=safePath(e.path,directory), key=path.toUpperCase().toLowerCase();
    if(explicit.has(key)) fail(`Duplicate or case-colliding path: ${e.path}`);
    explicit.add(key);
    const parts=path.split('/');
    for(let n=1;n<=parts.length;n++) {
      const spelling=parts.slice(0,n).join('/'), folded=spelling.toUpperCase().toLowerCase(), type=n<parts.length||directory?'directory':'file', prior=identities.get(folded);
      if(prior && prior.spelling!==spelling) fail(`Implicit or explicit case-colliding path: ${e.path}`);
      if(prior && prior.type!==type) fail('File/directory collision');
      identities.set(folded,{spelling,type});
    }
  }
}
export function payloadDigest(files) {
  return sha256(Buffer.concat([...files].sort(utf8Order).map(e=>Buffer.from(`${e.path}\0${e.bytes}\0${e.sha256}\n`,'utf8'))));
}
function collectTree(sourcePath,path,entries) {
  if(path) safePath(path);
  const item=lstatSync(sourcePath);
  if(item.isSymbolicLink()) fail(`Link refused: ${path || sourcePath}`);
  if(item.isDirectory()) {
    const prefix=path ? path+'/' : '';
    if(path) entries.push({path:prefix});
    for(const name of readdirSync(sourcePath)) collectTree(join(sourcePath,name),prefix+name,entries);
  } else if(path && item.isFile()) {
    entries.push({path,sourcePath,size:item.size});
  } else fail(`Special file or invalid directory refused: ${path || sourcePath}`);
}
function inventoryEntries(entries) {
  uniquePaths(entries);
  const files=[], directories=[];
  for(const entry of [...entries].sort(utf8Order)) {
    if(entry.path.endsWith('/')) directories.push(entry.path);
    else {
      const data=readFileSync(entry.sourcePath);
      files.push({path:entry.path,bytes:data.length,sha256:sha256(data)});
    }
  }
  return {files,directories,payloadSha256:payloadDigest(files)};
}
export function inventoryDelivery(root,payloadType) {
  const entries=[];
  collectTree(root,'',entries);
  const result=inventoryEntries(entries);
  if(payloadType==='files') return result;
  if(!result.files.some(entry=>entry.path==='index.html') || !result.directories.includes('assets/')) fail('Prototype requires index.html and assets directory');
  return result;
}
export function inventory(root) {
  return inventoryDelivery(root);
}
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) { crc^=byte; for(let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
export function writeZip(entries) {
  uniquePaths(entries);
  if(entries.length>65535) fail('ZIP64 unsupported');
  const local=[], central=[]; let offset=0;
  for(const entry of [...entries].sort(utf8Order)) {
    const name=Buffer.from(entry.path), data=Buffer.from(entry.data), directory=entry.path.endsWith('/');
    if(directory && data.length) fail('Directory has data');
    if(data.length>0xffffffff || offset>0xffffffff) fail('ZIP64 unsupported');
    const crc=crc32(data), header=Buffer.alloc(30), record=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6);
    header.writeUInt16LE(33,12); header.writeUInt32LE(crc,14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26);
    record.writeUInt32LE(0x02014b50,0); record.writeUInt16LE(20,4); record.writeUInt16LE(20,6); record.writeUInt16LE(0x800,8);
    record.writeUInt16LE(33,14); record.writeUInt32LE(crc,16); record.writeUInt32LE(data.length,20); record.writeUInt32LE(data.length,24); record.writeUInt16LE(name.length,28);
    record.writeUInt32LE(directory?0x10:0,38); record.writeUInt32LE(offset,42);
    local.push(header,name,data); central.push(record,name); offset+=header.length+name.length+data.length;
  }
  const index=Buffer.concat(central), end=Buffer.alloc(22);
  if(offset+index.length>0xffffffff) fail('ZIP64 unsupported');
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(index.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,index,end]);
}
export function inspectZip(input, limits=limitsV1) {
  const zip=Buffer.from(input); let total=0,localEnd=0;
  if(!limits || Object.keys(limitsV1).some(k=>!Number.isSafeInteger(limits[k])||limits[k]<1||limits[k]>limitsV1[k])) fail('Invalid extraction limits');
  const end=zip.length-22;
  if(end<0 || zip.readUInt32LE(end)!==0x06054b50 || zip.readUInt16LE(end+4)!==0 || zip.readUInt16LE(end+6)!==0 || zip.readUInt16LE(end+20)!==0) fail('Unsupported ZIP trailer');
  const count=zip.readUInt16LE(end+10), start=zip.readUInt32LE(end+16), length=zip.readUInt32LE(end+12);
  if(count!==zip.readUInt16LE(end+8) || count===65535 || start===0xffffffff || length===0xffffffff || count>limits.entries || start+length!==end) fail('Invalid ZIP index or entry limit');
  let cursor=start; const records=[];
  for(let n=0;n<count;n++) {
    if(cursor+46>end || zip.readUInt32LE(cursor)!==0x02014b50) fail('Invalid ZIP central record');
    const flags=zip.readUInt16LE(cursor+8), method=zip.readUInt16LE(cursor+10), compressed=zip.readUInt32LE(cursor+20), size=zip.readUInt32LE(cursor+24), nameLength=zip.readUInt16LE(cursor+28), extra=zip.readUInt16LE(cursor+30), comment=zip.readUInt16LE(cursor+32), offset=zip.readUInt32LE(cursor+42), attributes=zip.readUInt32LE(cursor+38);
    if(zip.readUInt16LE(cursor+4)!==20 || flags!==0x800 || ![0,8].includes(method) || extra || comment || zip.readUInt16LE(cursor+34) || ![0,0x10].includes(attributes) || zip.readUInt16LE(cursor+6)!==20 || cursor+46+nameLength>end) fail('Unsupported ZIP flags, type or extension');
    const nameBytes=zip.subarray(cursor+46,cursor+46+nameLength), path=nameBytes.toString('utf8');
    if(!Buffer.from(path).equals(nameBytes)) fail('Invalid UTF-8');
    safePath(path,path.endsWith('/'));
    if(path.endsWith('/')!==Boolean(attributes&0x10) || (path.endsWith('/') && size!==0)) fail('Invalid ZIP directory');
    total+=size;
    if(size>limits.entryBytes || total>limits.totalBytes || (size>0 && (!compressed || size/compressed>limits.ratio))) fail('Extraction limit exceeded');
    if(offset!==localEnd || offset+30>start || zip.readUInt32LE(offset)!==0x04034b50) fail('Invalid ZIP local record');
    const localName=zip.readUInt16LE(offset+26), localExtra=zip.readUInt16LE(offset+28), dataStart=offset+30+localName;
    if(localExtra || localName!==nameLength || !zip.subarray(offset+30,dataStart).equals(nameBytes) || zip.readUInt16LE(offset+4)!==20 || zip.readUInt16LE(offset+6)!==flags || zip.readUInt16LE(offset+8)!==method || zip.readUInt32LE(offset+14)!==zip.readUInt32LE(cursor+16) || zip.readUInt32LE(offset+18)!==compressed || zip.readUInt32LE(offset+22)!==size || dataStart+compressed>start || (method===0 && size!==compressed)) fail('Conflicting ZIP local header');
    records.push({path,size,compressed,method,crc:zip.readUInt32LE(cursor+16),dataStart});
    localEnd=dataStart+compressed; cursor+=46+nameLength;
  }
  if(cursor!==end || localEnd!==start) fail('Unaccounted ZIP bytes');
  uniquePaths(records);
  return {records,totalBytes:total};
}
export function readZip(input, limits=limitsV1) {
  const zip=Buffer.from(input), {records}=inspectZip(zip,limits);
  return records.map(record=> {
    const packed=zip.subarray(record.dataStart,record.dataStart+record.compressed);
    const inflated=record.method===8 ? inflateRawSync(packed,{maxOutputLength:Math.max(1,record.size),info:true}) : null;
    if(inflated && inflated.engine.bytesWritten!==packed.length) fail('Unaccounted deflate bytes');
    const data=inflated ? inflated.buffer : Buffer.from(packed);
    if(data.length!==record.size || crc32(data)!==record.crc) fail('ZIP length or CRC mismatch');
    return {path:record.path,data};
  });
}
function extractionDestination(destination,bytes) {
  const root=resolve(destination), parent=dirname(root);
  if(existsSync(root)) fail('Extraction destination already exists');
  let current=parent;
  for(;;) {
    const stat=lstatSync(current);
    if(!stat.isDirectory()||stat.isSymbolicLink()) fail('Unsafe extraction destination ancestor');
    const above=dirname(current); if(above===current) break; current=above;
  }
  let disk;
  try { disk=statfsSync(parent,{bigint:true}); } catch { fail('Unknown extraction capacity'); }
  if(!disk||typeof disk.bavail!=='bigint'||typeof disk.bsize!=='bigint'||disk.bavail<0n||disk.bsize<=0n) fail('Unknown extraction capacity');
  if(disk.bavail*disk.bsize<2n*BigInt(bytes)) fail('Insufficient extraction capacity');
  return root;
}
export function extractZip(entries,destination,limits=limitsV1) {
  uniquePaths(entries);
  if(!limits || Object.keys(limitsV1).some(k=>!Number.isSafeInteger(limits[k])||limits[k]<1||limits[k]>limitsV1[k])) fail('Invalid extraction limits');
  let bytes=0;
  if(entries.length>limits.entries) fail('Extraction limit exceeded');
  for(const entry of entries) {
    if(!Buffer.isBuffer(entry.data)||entry.data.length>limits.entryBytes||(entry.path.endsWith('/')&&entry.data.length)) fail('Invalid extraction entry');
    bytes+=entry.data.length;
    if(bytes>limits.totalBytes) fail('Extraction limit exceeded');
  }
  const root=extractionDestination(destination,bytes);
  mkdirSync(root);
  const device=lstatSync(root).dev;
  for(const entry of entries) {
    const directory=entry.path.endsWith('/'), path=safePath(entry.path,directory), target=join(root,...path.split('/'));
    mkdirSync(directory?target:dirname(target),{recursive:true});
    const stat=lstatSync(directory?target:dirname(target));
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==device) fail('Extraction escaped destination filesystem');
    if(!directory) writeFileSync(target,entry.data,{flag:'wx'});
  }
}
export function receiveDelivery(zip,descriptor,destination,limits=limitsV1) {
  const declared=inspectZip(zip,limits);
  extractionDestination(destination,declared.totalBytes);
  const verified=verifyDelivery(zip,descriptor,limits);
  extractZip(verified.entries,destination,limits);
  const manifestBytes=readFileSync(join(destination,'manifest.json'));
  const inv=inventoryDelivery(join(destination,verified.manifest.capturedFolder),verified.manifest.payloadType);
  if(sha256(manifestBytes)!==descriptor.manifestSha256||!same(inv.files,verified.manifest.inventory)||!same(inv.directories,manifestDirectories(verified.manifest))||inv.payloadSha256!==verified.manifest.payloadSha256) fail('Extracted delivery changed during reception');
  return verified;
}
const isHash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const utc=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parseJSON(bytes) {
  const data=Buffer.from(bytes), value=data.toString('utf8');
  if(!Buffer.from(value).equals(data) || value.charCodeAt(0)===0xfeff) fail('Invalid UTF-8 JSON');
  const parsed=JSON.parse(value);
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) fail('Expected JSON object');
  return parsed;
}
function ordinals(values) {
  return Array.isArray(values)&&values.every(positive)&&new Set(values).size===values.length;
}
function identity(record,version=1) {
  if(record.schemaVersion!==version || !positive(record.repositoryId)||!positive(record.orderNumber)||!uuid(record.deliveryId)||!['send','final'].includes(record.kind)||!(record.kind==='final'?record.tag===`order-${record.orderNumber}/final`:new RegExp(`^order-${record.orderNumber}/send-[1-9][0-9]*$`).test(record.tag))) fail('Invalid delivery identity or unsupported format');
}
function frozen(record,version=1) {
  if(!record||typeof record.json!=='string'||!isHash(record.sha256)||sha256(Buffer.from(record.json))!==record.sha256) fail('Frozen evidence hash mismatch');
  const parsed=parseJSON(Buffer.from(record.json));
  if(parsed.schemaVersion!==undefined&&parsed.schemaVersion!==version) fail('Unsupported frozen evidence version');
  return parsed;
}
export function manifestDirectories(m) {
  if(m.directories!==undefined&&(!Array.isArray(m.directories)||m.directories.some(path=>typeof path!=='string'||!path.endsWith('/')))) fail('Invalid manifest directories');
  const required=new Set(m.payloadType==='files'?[]:['assets/']);
  for(const item of [...m.inventory,...(m.directories||[]).map(path=>({path}))]) {
    const parts=safePath(item.path,item.path.endsWith('/')).split('/');
    for(let n=1;n<parts.length;n++) required.add(parts.slice(0,n).join('/')+'/');
  }
  const paths=m.directories===undefined?[...required]:m.directories;
  uniquePaths([...m.inventory,...paths.map(path=>({path}))]);
  const sorted=[...paths].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  if(m.directories!==undefined&&!same(paths,sorted)||[...required].some(path=>!paths.includes(path))) fail('Missing or unsorted manifest directories');
  return sorted;
}
function validateInventory(m) {
  if(!Array.isArray(m.inventory)) fail('Invalid inventory');
  for(const e of m.inventory) if(!text(e?.path)||!Number.isSafeInteger(e.bytes)||e.bytes<0||!isHash(e.sha256)||e.path.endsWith('/')) fail('Invalid inventory');
  manifestDirectories(m);
  if(!same(m.inventory,[...m.inventory].sort(utf8Order))||payloadDigest(m.inventory)!==m.payloadSha256) fail('Invalid inventory digest or order');
}
function validVersionCapture(record) {
  return positive(record.versionNumber)&&text(record.capturedFolder)&&new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.v${record.versionNumber}$`).test(record.capturedFolder);
}
function validFilesCapture(record) {
  return record.kind==='send'&&record.payloadType==='files'&&record.capturedFolder==='files'&&record.versionNumber===undefined;
}
export function validateManifest(bytes) {
  const m=parseJSON(bytes);
  const files=m.payloadType==='files';
  identity(m,files?3:2);
  if(files ? !validFilesCapture(m)||!Array.isArray(m.directories)||!(m.inventory?.length||m.directories.length)
    : m.payloadType!==undefined||!validVersionCapture(m)) fail('Invalid manifest capture identity');
  if(!utc(m.capturedAt)||!isHash(m.scopeSha256)||!ordinals(m.localProgress?.checkedOrdinals)||typeof m.localProgress.taskContext!=='string'||!['summary','outsideOrder','workInProgress'].every(k=>text(m.deliveryNote?.[k]))) fail('Invalid manifest fields');
  safePath(m.capturedFolder);
  validateInventory(m);
  if(files&&(m.inventory.length+m.directories.length+2>limitsV1.entries||bytes.length>limitsV1.entryBytes||
    m.inventory.some(entry=>entry.bytes>limitsV1.entryBytes)||
    m.inventory.reduce((total,entry)=>total+entry.bytes,bytes.length)>limitsV1.totalBytes)) fail('Selected files and manifest exceed delivery limits');
  if(!files&&!m.inventory.some(e=>e.path==='index.html')) fail('Invalid inventory digest or order');
  if(m.kind==='final') {
    if(!exactKeys(m.evidence,['reassessment','decision'])) fail('Invalid final evidence fields');
    const reassessment=frozen(m.evidence.reassessment);
    if(reassessment.payloadSha256!==m.payloadSha256||reassessment.scopeSha256!==m.scopeSha256||!Array.isArray(reassessment.tasks)||!reassessment.tasks.length||!ordinals(reassessment.tasks.map(t=>t.ordinal))||reassessment.tasks.some(t=>!['fulfilled','unfinished','unknown'].includes(t.result)||!text(t.evidenceOrReason))) fail('Invalid reassessment evidence');
    const scope=validateScope(reassessment.agreedScope,{repositoryId:m.repositoryId,issueNumber:m.orderNumber});
    if(scope.originalBodySha256!==m.scopeSha256||!same(reassessment.tasks.map(t=>t.ordinal),scope.tasks.map(t=>t.ordinal))) fail('Reassessment must cover the exact ordered agreed task scope');
    if(m.localProgress.checkedOrdinals.some(n=>!reassessment.tasks.some(t=>t.ordinal===n))) fail('Local progress names unknown task');
    const unchecked=reassessment.tasks.filter(t=>t.result!=='fulfilled'||!m.localProgress.checkedOrdinals.includes(t.ordinal)).map(t=>t.ordinal);
    if(!same(unchecked,m.deliveredUncheckedOrdinals)) fail('Delivered checklist does not match final evidence');
    const decision=frozen(m.evidence.decision,2);
    if(!exactKeys(decision,['schemaVersion','payloadSha256','scopeSha256','reassessmentSha256','acknowledgedUnfinishedOrdinals','explicitDesignerStatement','recordedAt'])||decision.schemaVersion!==2) fail('Invalid final decision fields');
    if(decision.payloadSha256!==m.payloadSha256||decision.scopeSha256!==m.scopeSha256||decision.reassessmentSha256!==m.evidence.reassessment.sha256||!same(decision.acknowledgedUnfinishedOrdinals,unchecked)||!text(decision.explicitDesignerStatement)||!utc(decision.recordedAt)) fail('Invalid final decision evidence binding');
  } else if(m.evidence!==null || m.deliveredUncheckedOrdinals!==null) fail('Nonfinal delivery cannot claim final evidence');
  return m;
}
export function fileDeliveryManifest(record) {
  const {scopeSha256,localProgress,deliveryNote}=record.fileDeliveryContext;
  const {files,directories,payloadSha256}=record.selectedInventory;
  const manifest={schemaVersion:3,payloadType:'files',repositoryId:record.repositoryId,orderNumber:record.orderNumber,
    deliveryId:record.deliveryId,tag:record.tag,kind:record.kind,capturedFolder:record.capturedFolder,capturedAt:record.capturedAt,
    inventory:files,directories,payloadSha256,scopeSha256,localProgress,deliveryNote,evidence:null,deliveredUncheckedOrdinals:null};
  const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  validateManifest(bytes);
  return bytes;
}
export function packageDelivery(manifestBytes,captureRoot) {
  const m=validateManifest(manifestBytes), inv=inventoryDelivery(captureRoot,m.payloadType);
  if(!same(inv.files,m.inventory)||!same(inv.directories,manifestDirectories(m))||inv.payloadSha256!==m.payloadSha256) fail('Captured bytes disagree with manifest');
  const entries=[{path:'manifest.json',data:Buffer.from(manifestBytes)},{path:m.capturedFolder+'/',data:Buffer.alloc(0)}];
  function walk(root,prefix) {
    for(const name of readdirSync(root)) {
      const source=join(root,name), stat=lstatSync(source), path=prefix+name;
      if(stat.isSymbolicLink()) fail('Link refused');
      if(stat.isDirectory()) {entries.push({path:path+'/',data:Buffer.alloc(0)}); walk(source,path+'/');}
      else if(stat.isFile()) entries.push({path,data:readFileSync(source)}); else fail('Special file refused');
    }
  }
  walk(captureRoot,m.capturedFolder+'/');
  const zip=writeZip(entries), descriptor={schemaVersion:1,repositoryId:m.repositoryId,orderNumber:m.orderNumber,deliveryId:m.deliveryId,tag:m.tag,kind:m.kind,assetName:'delivery.zip',assetBytes:zip.length,manifestSha256:sha256(manifestBytes),zipSha256:sha256(zip)};
  verifyDelivery(zip,descriptor);
  if(!same(inventoryDelivery(captureRoot,m.payloadType),inv)) fail('Capture changed during packaging');
  return {zip,descriptor};
}
export function verifyDelivery(zip,descriptor,limits=limitsV1) {
  identity(descriptor);
  if(descriptor.assetName!=='delivery.zip'||!positive(descriptor.assetBytes)||!isHash(descriptor.manifestSha256)||!isHash(descriptor.zipSha256)||zip.length!==descriptor.assetBytes||sha256(zip)!==descriptor.zipSha256) fail('Delivery ZIP hash or descriptor mismatch');
  const entries=readZip(zip,limits), manifests=entries.filter(e=>e.path==='manifest.json');
  if(manifests.length!==1||sha256(manifests[0].data)!==descriptor.manifestSha256) fail('Manifest bytes mismatch');
  const manifest=validateManifest(manifests[0].data);
  for(const key of ['repositoryId','orderNumber','deliveryId','tag','kind']) if(manifest[key]!==descriptor[key]) fail('Delivery identity mismatch');
  const prefix=manifest.capturedFolder+'/', files=[], directories=new Set([prefix,...manifestDirectories(manifest).map(path=>prefix+path)]);
  for(const entry of entries) {
    if(entry.path==='manifest.json') continue;
    if(!entry.path.startsWith(prefix)) fail('Unexpected ZIP root');
    if(entry.path.endsWith('/') && !directories.delete(entry.path)) fail('Unexpected ZIP directory structure');
    if(!entry.path.endsWith('/')) files.push({path:entry.path.slice(prefix.length),bytes:entry.data.length,sha256:sha256(entry.data)});
  }
  files.sort(utf8Order);
  if(directories.size) fail('Missing ZIP directory structure');
  if(!same(files,manifest.inventory)||payloadDigest(files)!==manifest.payloadSha256) fail('Extracted inventory mismatch');
  return {manifest,entries};
}

export function prototypeDirectories(root) {
  const directories=[];
  function walk(path,prefix='') {
    for(const name of readdirSync(path)) {
      const full=join(path,name), stat=lstatSync(full), entry=prefix+name;
      safePath(entry);
      if(stat.isSymbolicLink()) fail('Capture link refused');
      if(stat.isDirectory()) { directories.push(entry+'/'); walk(full,entry+'/'); }
      else if(!stat.isFile()) fail('Capture special file refused');
    }
  }
  walk(root);
  return directories.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
}
function containsPath(root,path) {
  const child=relative(root,path);
  return !child || (child!=='..'&&!child.startsWith('..'+sep)&&!isAbsolute(child));
}
export function capturePrototype(source,destination) {
  const from=resolve(source), target=resolve(destination);
  if(containsPath(from,target)||containsPath(target,from)) fail('Capture paths overlap');
  if(existsSync(target)) fail('Capture staging already exists; preserve and reconcile it');
  const before={...inventory(from),directories:prototypeDirectories(from)};
  function copy(path,to) {
    mkdirSync(to);
    for(const name of readdirSync(path)) {
      const original=join(path,name), next=join(to,name), stat=lstatSync(original);
      if(stat.isSymbolicLink()) fail('Capture link refused');
      if(stat.isDirectory()) copy(original,next);
      else if(stat.isFile()) copyFileSync(original,next); else fail('Capture special file refused');
    }
  }
  copy(from,target);
  const captured={...inventory(target),directories:prototypeDirectories(target)};
  const after={...inventory(from),directories:prototypeDirectories(from)};
  if(!same(before,captured)||!same(before,after)) fail('Source changed during capture; preserve incomplete staging');
  return captured;
}
function validateFileSources(sources) {
  if(!Array.isArray(sources)||!sources.length||sources.length>limitsV1.entries-2) fail('Choose one or more files or folders');
  for(const source of sources) {
    if(!exactKeys(source,['path','sourcePath'])||!text(source.sourcePath)||resolve(source.sourcePath)!==source.sourcePath) fail('Invalid selected file source');
    safePath(source.path);
  }
  uniquePaths(sources);
}
function selectedFileEntries(sources,target) {
  validateFileSources(sources);
  const entries=[];
  for(const {sourcePath,path} of sources) {
    if(target&&(containsPath(sourcePath,target)||containsPath(target,sourcePath))) fail('Capture paths overlap');
    if(!sameLocalPath(realpathSync(sourcePath),sourcePath)) fail('Linked file source refused');
    collectTree(sourcePath,path,entries);
  }
  const parents=new Set();
  for(const entry of entries) {
    const parts=entry.path.replace(/\/$/,'').split('/');
    for(let n=1;n<parts.length;n++) parents.add(parts.slice(0,n).join('/')+'/');
  }
  const explicit=new Set(entries.map(entry=>entry.path));
  for(const path of parents) if(!explicit.has(path)) entries.push({path});
  if(entries.length>limitsV1.entries-2||entries.some(entry=>entry.size>limitsV1.entryBytes)) fail('Selected files exceed delivery limits');
  if(entries.reduce((total,entry)=>total+(entry.size??0),0)>=limitsV1.totalBytes) fail('Selected files leave insufficient space for the delivery manifest');
  return entries;
}
export function inspectFileSelection(projectRoot,paths,target) {
  if(!Array.isArray(paths)||!paths.length||paths.some(path=>!text(path))) fail('Choose one or more files or folders');
  const sourceFiles=paths.map(path=>{
    const sourcePath=resolve(projectRoot,path);
    const archivePath=containsPath(projectRoot,sourcePath)?relative(projectRoot,sourcePath).split(sep).join('/'):basename(sourcePath);
    return {path:archivePath,sourcePath};
  });
  return {sourceFiles,selectedInventory:inventoryEntries(selectedFileEntries(sourceFiles,target))};
}
export function captureFiles(sources,destination,expected) {
  const target=resolve(destination);
  if(!sameLocalPath(realpathSync(dirname(target)),dirname(target))) fail('Linked snapshot parent refused');
  const entries=selectedFileEntries(sources,target);
  if(!same(inventoryEntries(entries),expected)) fail('Selected files changed since reservation');
  mkdirSync(target);
  for(const {path,sourcePath} of entries) {
    const output=join(target,...path.split('/'));
    if(path.endsWith('/')) mkdirSync(output,{recursive:true});
    else {
      mkdirSync(dirname(output),{recursive:true});
      copyFileSync(sourcePath,output);
    }
  }
  const captured=inventoryDelivery(target,'files');
  const after=inventoryEntries(selectedFileEntries(sources,target));
  if(!same(captured,expected)||!same(after,expected)) fail('Selected files changed during capture; preserve incomplete staging');
  return captured;
}
export function validatePendingRecord(bytes,repositoryId) {
  const record=parseJSON(bytes); identity(record);
  if(record.repositoryId!==repositoryId) fail('Pending repository identity mismatch');
  if(!utc(record.capturedAt)) fail('Invalid pending capture time');
  if(record.payloadType==='files') {
    if(!validFilesCapture(record)||record.sourcePath!==undefined||record.captureReplacement!==undefined) fail('Invalid pending file delivery');
    validateFileSources(record.sourceFiles);
    const selected=record.selectedInventory;
    if(!exactKeys(selected,['files','directories','payloadSha256'])||!Array.isArray(selected.directories)||
      !(selected.files?.length||selected.directories.length)) fail('Invalid selected inventory');
    if(!exactKeys(record.fileDeliveryContext,['scopeSha256','localProgress','deliveryNote'])) fail('Invalid file delivery context');
    fileDeliveryManifest(record);
    if(record.payloadSha256!==undefined&&
      (!same(record.capturedInventory,selected.files)||!same(record.capturedDirectories,selected.directories)||record.payloadSha256!==selected.payloadSha256)) fail('Pending capture does not match selected files');
  } else if(record.payloadType!==undefined||!validVersionCapture(record)||!text(record.sourcePath)||!isAbsolute(record.sourcePath)) {
    fail('Invalid pending version or capture path');
  }
  safePath(record.capturedFolder);
  const token=record.assignmentToken;
  if(!token||token.orderId?.repositoryId!==repositoryId||token.orderId.issueNumber!==record.orderNumber||!uuid(token.activationId)) fail('Invalid pending assignment token');
  if(!text(record.stagingPath)||!isAbsolute(record.stagingPath)) fail('Invalid pending capture path');
  if(record.payloadSha256!==undefined&&!isHash(record.payloadSha256)) fail('Invalid pending payload hash');
  if(['zipSha256','manifestSha256','assetBytes'].some(key=>record[key]!==undefined)&&(!isHash(record.zipSha256)||!isHash(record.manifestSha256)||!positive(record.assetBytes)||!isHash(record.payloadSha256))) fail('Incomplete pending package digest');
  if(['releaseId','assetId'].some(key=>record[key]!==undefined&&!positive(record[key]))) fail('Invalid pending remote identity');
  if(['closureCompleted','localBookkeepingCompleted'].some(key=>record[key]!==undefined&&typeof record[key]!=='boolean')) fail('Invalid pending completion hint');
  if(record.draftCreation!==undefined) validateDraftCreation(record);
  if(record.captureReplacement!==undefined) validateCaptureReplacement(record);
  return record;
}
function validateCaptureReplacement(record) {
  const p=record.captureReplacement;
  if(!exactKeys(p,['schemaVersion','operationId','projectRoot','versionNumber','capturedFolder','sourcePath','capturedAt','explicitDesignerStatement','expected','originalRecordJson','originalRecordSha256'])||p.schemaVersion!==1||!uuid(p.operationId)||!text(p.projectRoot)||!isAbsolute(p.projectRoot)||!positive(p.versionNumber)||!text(p.capturedFolder)||!utc(p.capturedAt)||!text(p.explicitDesignerStatement)||typeof p.originalRecordJson!=='string'||sha256(Buffer.from(p.originalRecordJson))!==p.originalRecordSha256) fail('Invalid capture replacement intent');
  safePath(p.capturedFolder);
  if(!new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.v${p.versionNumber}$`).test(p.capturedFolder)||p.sourcePath!==join(p.projectRoot,'versions',p.capturedFolder)) fail('Invalid replacement version');
  const original=parseJSON(Buffer.from(p.originalRecordJson));
  if(original.captureReplacement!==undefined) fail('Nested capture replacement intent');
  validatePendingRecord(Buffer.from(p.originalRecordJson),record.repositoryId);
  const {captureReplacement,...current}=record;
  if(!same(current,original)) fail('Pending selection changed during capture replacement');
  const inv=p.expected;
  if(!exactKeys(inv,['files','directories','payloadSha256'])||!Array.isArray(inv.files)||!same(inv.files,[...inv.files].sort(utf8Order))||inv.files.some(e=>!exactKeys(e,['path','bytes','sha256'])||!Number.isSafeInteger(e.bytes)||e.bytes<0||!isHash(e.sha256))||!inv.files.some(e=>e.path==='index.html')||payloadDigest(inv.files)!==inv.payloadSha256) fail('Invalid replacement inventory');
  manifestDirectories({inventory:inv.files,directories:inv.directories});
  return p;
}
export function beginCaptureReplacement(root,deliveryId,choice,observation) {
  const c=readProject(root,'designer');reconcileRecordReplacement(c);
  const fresh=readProject(root,'designer'),path=`.designeritl/pending/${deliveryId}/record.json`;
  if(!uuid(deliveryId)) fail('Invalid delivery identity');
  const bytes=readProjectRecord(fresh.root,path),record=validatePendingRecord(bytes,fresh.config.repository.repositoryId);
  if(record.payloadType==='files') fail('Numbered version replacement requires a prototype delivery');
  if(record.deliveryId!==deliveryId||record.captureReplacement!==undefined) fail('Reconcile the selected pending operation first');
  replacementPreflight(fresh,record,observation);
  if(!positive(choice?.versionNumber)||!text(choice.explicitDesignerStatement)) fail('Explicit numbered replacement choice required');
  const selected=inspectVersions(fresh).versions.find(v=>v.number===choice.versionNumber);
  if(!selected) fail('Replacement version does not exist');
  const original=inventory(record.stagingPath);
  if(original.payloadSha256!==record.payloadSha256||!same(original.files,record.capturedInventory)||!same(original.directories,record.capturedDirectories)) fail('Original captured bytes changed');
  const sourcePath=join(fresh.root,'versions',selected.folder),expected=inventory(sourcePath);
  const plan={schemaVersion:1,operationId:randomUUID(),projectRoot:fresh.root,versionNumber:selected.number,capturedFolder:selected.folder,sourcePath,capturedAt:new Date().toISOString(),explicitDesignerStatement:choice.explicitDesignerStatement,expected,originalRecordJson:bytes.toString('utf8'),originalRecordSha256:sha256(bytes)};
  prepareRecordReplacement(fresh,path,Buffer.from(JSON.stringify({...record,captureReplacement:plan},null,2)+'\n'),{owner:'deliveries',kind:'owner',expectedPreviousSha256:sha256(bytes)});
  reconcileRecordReplacement(readProject(fresh.root,'designer'));
  return plan;
}
function replacementPreflight(context,record,observation) {
  const base=join(context.root,'.designeritl/pending',record.deliveryId);
  if(!context.state.pendingDeliveryIndex.includes(record.deliveryId)||record.stagingPath!==join(base,'snapshot',record.capturedFolder)) fail('Pending operation is not bound to this project');
  if(['manifest.json','delivery.zip','descriptor.json','release-notes.md'].some(name=>lstatSync(join(base,name),{throwIfNoEntry:false})!==undefined)||['manifestSha256','zipSha256','assetBytes','releaseId','assetId'].some(key=>record[key]!==undefined)||!record.draftCreation||record.draftCreation.attempts.length) fail('Package or remote attempt prevents capture replacement');
  if(observation?.repositoryId!==record.repositoryId||observation.complete!==true||!Array.isArray(observation.releases)||!Array.isArray(observation.tags)) fail('Complete bound remote observations required');
  if(observation.tags.some(tag=>!text(tag?.name))||observation.releases.some(release=>!text(release?.tag_name))) fail('Incomplete remote identity');
  if(observation.tags.some(tag=>tag.name===record.tag)||observation.releases.some(release=>release.tag_name===record.tag||typeof release.body==='string'&&release.body.includes(record.deliveryId))) fail('Occupied remote identity prevents capture replacement');
}
export function reselectFiles(root,deliveryId,choice,observation) {
  if(!uuid(deliveryId)||!text(choice?.explicitDesignerStatement)) fail('Explicit file reselection required');
  validateFileSources(choice.sourceFiles);
  const project=readProject(root,'designer');
  const validate=bytes=>validatePendingRecord(bytes,project.config.repository.repositoryId);
  reconcileRecordReplacement(project,validate);
  const fresh=readProject(project.root,'designer'), path=`.designeritl/pending/${deliveryId}/record.json`;
  const previous=readProjectRecord(fresh.root,path), record=validate(previous);
  if(record.deliveryId!==deliveryId||record.payloadType!=='files'||record.payloadSha256!==undefined) fail('Reselection requires an incomplete file capture');
  replacementPreflight(fresh,record,observation);
  if(lstatSync(record.stagingPath,{throwIfNoEntry:false})) fail('Reconcile the existing snapshot before selecting again');
  const selection=inspectFileSelection(fresh.root,choice.sourceFiles.map(source=>source.sourcePath),join(fresh.root,'.designeritl','pending'));
  if(!same(selection.sourceFiles,choice.sourceFiles)||!same(selection.selectedInventory,choice.selectedInventory)) fail('Selected files changed since preview');
  const fileDeliveryContext={...record.fileDeliveryContext,deliveryNote:choice.deliveryNote};
  const next={...record,...selection,fileDeliveryContext,capturedAt:new Date().toISOString()};
  const bytes=Buffer.from(JSON.stringify(next,null,2)+'\n');
  prepareRecordReplacement(fresh,path,bytes,{owner:'deliveries',kind:'owner',expectedPreviousSha256:sha256(previous)},validate);
  reconcileRecordReplacement(readProject(fresh.root,'designer'),validate);
  return validate(readProjectRecord(fresh.root,path));
}
export function resumeCaptureReplacement(root,deliveryId,observation) {
  if(!uuid(deliveryId)) fail('Invalid delivery identity');
  const initial=readProject(root,'designer');reconcileRecordReplacement(initial);
  const c=readProject(root,'designer'),path=`.designeritl/pending/${deliveryId}/record.json`,bytes=readProjectRecord(c.root,path),record=validatePendingRecord(bytes,c.config.repository.repositoryId);
  if(record.deliveryId!==deliveryId) fail('Pending delivery identity does not match its directory');
  replacementPreflight(c,record,observation);
  if(record.captureReplacement===undefined) return record;
  const p=validateCaptureReplacement(record);
  if(p.projectRoot!==c.root) fail('Replacement intent belongs to another project');
  const base=`.designeritl/pending/${deliveryId}`,history=ensureProjectDirectory(c.root,`${base}/capture-history/${p.operationId}`),work=ensureProjectDirectory(c.root,`${base}/capture-staging/${p.operationId}`);
  const archivedRecord=join(history,'record.json');
  if(!existsSync(archivedRecord)) writeFileSync(archivedRecord,p.originalRecordJson,{flag:'wx',flush:true});
  if(!readProjectRecord(c.root,`${base}/capture-history/${p.operationId}/record.json`).equals(Buffer.from(p.originalRecordJson))) fail('Original capture record changed');
  const canonical=join(c.root,base,'snapshot'),staging=join(work,'snapshot'),target=join(staging,p.capturedFolder),old=join(history,'snapshot');
  const promoted=existsSync(old)&&existsSync(canonical);
  if(!promoted) {
    if(!existsSync(target)) {
      if(existsSync(staging)) fail('Incomplete replacement staging requires explicit reconciliation');
      if(!same(inventory(p.sourcePath),p.expected)) fail('Selected source changed before replacement capture');
      ensureProjectDirectory(c.root,`${base}/capture-staging/${p.operationId}/snapshot`);
      capturePrototype(p.sourcePath,target);
    }
    if(!same(inventory(target),p.expected)) fail('Replacement capture does not match selected bytes');
  }
  const originalRoot=existsSync(old)?join(old,record.capturedFolder):record.stagingPath;
  const original=inventory(originalRoot);
  if(original.payloadSha256!==record.payloadSha256||!same(original.files,record.capturedInventory)||!same(original.directories,record.capturedDirectories)) fail('Original captured bytes changed');
  replacementPreflight(readProject(c.root,'designer'),record,observation);
  if(!readProjectRecord(c.root,path).equals(bytes)) fail('Pending capture selection changed concurrently');
  if(!existsSync(old)) renameSync(canonical,old);
  if(!existsSync(canonical)) renameSync(staging,canonical);
  const captured=inventory(join(canonical,p.capturedFolder));
  if(!same(captured,p.expected)) fail('Promoted replacement bytes changed');
  const evidence=join(c.root,base,'evidence'),retained=join(history,'evidence');
  if(existsSync(evidence)) {
    if(existsSync(retained)) fail('Conflicting retained evidence');
    ensureProjectDirectory(c.root,`${base}/evidence`);
    renameSync(evidence,retained);
  }
  const {captureReplacement,...originalRecord}=record;
  const next={...originalRecord,versionNumber:p.versionNumber,capturedFolder:p.capturedFolder,capturedAt:p.capturedAt,sourcePath:p.sourcePath,stagingPath:join(canonical,p.capturedFolder),payloadSha256:captured.payloadSha256,capturedInventory:captured.files,capturedDirectories:captured.directories};
  const choicePath=`${base}/capture-history/${p.operationId}/choice.json`,choiceBytes=Buffer.from(JSON.stringify(p,null,2)+'\n');
  if(!existsSync(join(c.root,choicePath))) writeFileSync(join(c.root,choicePath),choiceBytes,{flag:'wx',flush:true});
  if(!readProjectRecord(c.root,choicePath).equals(choiceBytes)) fail('Saved replacement choice changed');
  prepareRecordReplacement(readProject(c.root,'designer'),path,Buffer.from(JSON.stringify(next,null,2)+'\n'),{owner:'deliveries',kind:'owner',expectedPreviousSha256:sha256(bytes)});
  reconcileRecordReplacement(readProject(c.root,'designer'));
  return next;
}
function validateDraftCreation(record) {
  const saved=record.draftCreation;
  if(!exactKeys(saved,['schemaVersion','attempts'])||saved.schemaVersion!==1||!Array.isArray(saved.attempts)) fail('Invalid draft creation evidence');
  const ids=new Set();
  for(const attempt of saved.attempts) {
    if(!exactKeys(attempt,['attemptId','descriptorSha256','startedAt','nonDispatchProof',...(attempt.createReceipt!==undefined?['createReceipt']:[])])||!uuid(attempt.attemptId)||ids.has(attempt.attemptId)||!isHash(attempt.descriptorSha256)||!utc(attempt.startedAt)) fail('Invalid draft creation attempt');
    ids.add(attempt.attemptId);
    const proof=attempt.nonDispatchProof;
    if(proof!==null&&(!exactKeys(proof,['path','sha256'])||proof.path!==`.designeritl/pending/${record.deliveryId}/evidence/draft-nondispatch-${attempt.attemptId}.json`||!isHash(proof.sha256))) fail('Invalid draft non-dispatch evidence reference');
    const receipt=attempt.createReceipt;
    if(receipt!==undefined&&(proof!==null||!exactKeys(receipt,['path','sha256','releaseId'])||receipt.path!==`.designeritl/pending/${record.deliveryId}/evidence/draft-create-${attempt.attemptId}.json`||!isHash(receipt.sha256)||!positive(receipt.releaseId))) fail('Invalid draft create receipt reference');
  }
  if(saved.attempts.slice(0,-1).some(attempt=>attempt.nonDispatchProof===null)) fail('Uncertain draft attempt cannot be retried');
  return saved;
}
function draftTransition(previous,next) {
  if(!same(previous.draftCreation,next.draftCreation)) {
    if(previous.draftCreation===undefined||next.draftCreation===undefined) fail('Missing legacy draft attempt evidence cannot be initialized or removed');
    const before=validateDraftCreation(previous).attempts,after=validateDraftCreation(next).attempts;
    if(after.length<before.length||after.length>before.length+1) fail('Draft attempt evidence is append-only');
    if(after.length>before.length&&after.at(-1).createReceipt!==undefined) fail('Draft create receipt requires an existing current attempt');
    for(let n=0;n<before.length;n++) {
      const a=before[n],b=after[n];
      if(['attemptId','descriptorSha256','startedAt'].some(key=>a[key]!==b[key])||(a.nonDispatchProof!==null&&!same(a.nonDispatchProof,b.nonDispatchProof))||(a.nonDispatchProof===null&&b.nonDispatchProof!==null&&n!==before.length-1)) fail('Draft attempt evidence is immutable');
      if((a.createReceipt!==undefined&&!same(a.createReceipt,b.createReceipt))||(a.createReceipt===undefined&&b.createReceipt!==undefined&&(n!==before.length-1||after.length!==before.length))) fail('Draft create receipt is immutable and belongs to the current attempt');
    }
  }
}
function releaseObservation(release) {
  if(!positive(release?.id)||!text(release.tag_name)||typeof release.draft!=='boolean'||!(release.body===null||typeof release.body==='string')) fail('Invalid release observation');
  const blocks=[...(release.body||'').matchAll(/^```designeritl-delivery\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
  let observed=null;
  if(blocks.length) {
    if(blocks.length!==1) fail('Conflicting release descriptor blocks');
    observed=parseJSON(Buffer.from(blocks[0][1]));identity(observed);
  }
  return {id:release.id,tag_name:release.tag_name,draft:release.draft,descriptor:observed};
}
export function reconcileDraftCreation(record,descriptor,pages,complete,tags,observations={}) {
  validatePendingRecord(Buffer.from(JSON.stringify(record)),record.repositoryId);identity(descriptor);
  for(const key of ['repositoryId','orderNumber','deliveryId','tag','kind','zipSha256','manifestSha256','assetBytes']) if(record[key]!==descriptor[key]) fail('Saved draft descriptor conflict');
  if(record.draftCreation!==undefined&&validateDraftCreation(record).attempts.some(attempt=>attempt.descriptorSha256!==sha256(Buffer.from(JSON.stringify(descriptor))))) fail('Attempted draft descriptor is immutable');
  if(complete!==true||!Array.isArray(pages)||!pages.every(Array.isArray)||!Array.isArray(tags)||tags.some(tag=>!text(tag?.name))) fail('Incomplete draft identity lookup');
  const sources=[pages],graphql=observations.graphql;
  if(graphql!==undefined) {
    if(graphql?.complete!==true||!Array.isArray(graphql.pages)||!graphql.pages.every(Array.isArray)) fail('Incomplete GraphQL draft identity lookup');
    sources.push(graphql.pages);
  }
  const releases=new Map();
  for(const source of sources) for(const release of source.flat()) {
    const observed=releaseObservation(release),prior=releases.get(observed.id);
    if(prior&&!same(prior,observed)) fail('Conflicting observations for release id');
    releases.set(observed.id,observed);
  }
  const last=record.draftCreation?.attempts.at(-1),receipt=last?.createReceipt,matches=[];
  for(const release of releases.values()) {
    const observed=release.descriptor;
    if(release.id===receipt?.releaseId||release.tag_name===record.tag||observed?.deliveryId===record.deliveryId) {
      if(release.tag_name!==record.tag||!same(observed,descriptor)) fail('Occupied identity or draft descriptor conflict');
      matches.push(release);
    }
  }
  if(matches.length>1) fail('Duplicate draft delivery identity');
  if(matches.length===1&&receipt&&matches[0].id!==receipt.releaseId) fail('Duplicate draft delivery identity');
  if(matches.length===1) return {action:'resume',releaseId:matches[0].id,draft:matches[0].draft};
  if(tags.some(tag=>tag.name===record.tag)) fail('Occupied delivery tag without matching release');
  if(receipt) {
    if(observations.directRelease!==undefined) {
      const release=releaseObservation(observations.directRelease);
      if(release.id!==receipt.releaseId||release.tag_name!==record.tag||release.draft!==true||!same(release.descriptor,descriptor)) fail('Direct draft receipt identity or descriptor conflict');
      return {action:'resume-unlisted',releaseId:release.id,draft:release.draft};
    }
    fail(`Draft ${receipt.releaseId} exists but is not yet listed by GitHub; rerun later`);
  }
  if(record.draftCreation===undefined) fail('Missing legacy draft attempt evidence; creation is uncertain');
  if(last&&last.nonDispatchProof===null) fail('Uncertain draft create attempt; reconcile read-only and wait for identity');
  return {action:'create'};
}
export function requireDraftPublication(record,descriptor,pages,complete,tags,releaseId,observations={}) {
  const result=reconcileDraftCreation(record,descriptor,pages,complete,tags,observations);
  if(result.action!=='resume'||result.releaseId!==releaseId||result.draft!==true) fail('Publication requires a unique listed draft delivery identity');
  return result;
}
function draftContext(root,deliveryId) {
  const first=readProject(root,'designer'),validate=bytes=>validatePendingRecord(bytes,first.config.repository.repositoryId);
  reconcileRecordReplacement(first,validate);
  const context=readProject(root,'designer'),path=`.designeritl/pending/${deliveryId}/record.json`;
  if(!uuid(deliveryId)) fail('Invalid draft delivery identity');
  const bytes=readProjectRecord(context.root,path),record=validate(bytes),saved=verifyPendingDelivery(join(context.root,'.designeritl/pending',deliveryId),context.config.repository.repositoryId);
  if(record.deliveryId!==deliveryId) fail('Conflicting draft record path');
  return {context,path,bytes,record,saved,validate};
}
function verifyNonDispatch(context,record,attempt) {
  const reference=attempt.nonDispatchProof;
  if(!reference) fail('Independent non-dispatch proof is required');
  const bytes=readProjectRecord(context.root,reference.path),proof=parseJSON(bytes);
  if(sha256(bytes)!==reference.sha256||!exactKeys(proof,['schemaVersion','repositoryId','deliveryId','tag','attemptId','descriptorSha256','kind','requestDispatched','statusCode','observedAt'])||proof.schemaVersion!==1||proof.repositoryId!==record.repositoryId||proof.deliveryId!==record.deliveryId||proof.tag!==record.tag||proof.attemptId!==attempt.attemptId||proof.descriptorSha256!==attempt.descriptorSha256||!utc(proof.observedAt)) fail('Conflicting draft non-dispatch proof');
  const before=['controlled-before-forward','spawn-not-started','tool-not-executed'].includes(proof.kind)&&proof.requestDispatched===false&&proof.statusCode===null;
  const rejected=proof.kind==='http-rejected'&&proof.requestDispatched===true&&[400,401,403,404,405,409,410,422].includes(proof.statusCode);
  if(!before&&!rejected) fail('Observation does not prove draft non-dispatch or rejection');
  return proof;
}
function saveDraftRecord(value,next) {
  const {context,path,bytes,validate}=value;
  prepareRecordReplacement(context,path,Buffer.from(JSON.stringify(next,null,2)+'\n'),{owner:'deliveries',kind:'owner',expectedPreviousSha256:sha256(bytes)},validate);
  reconcileRecordReplacement(readProject(context.root,'designer'),validate);
  return validate(readProjectRecord(context.root,path));
}
export function beginDraftCreation(root,deliveryId,pages,complete,tags,observations={}) {
  const value=draftContext(root,deliveryId),{record,saved,context}=value;
  if(reconcileDraftCreation(record,saved.descriptor,pages,complete,tags,observations).action!=='create') fail('Matching release must resume instead of create');
  for(const attempt of record.draftCreation.attempts) verifyNonDispatch(context,record,attempt);
  const attempt={attemptId:randomUUID(),descriptorSha256:sha256(Buffer.from(JSON.stringify(saved.descriptor))),startedAt:new Date().toISOString(),nonDispatchProof:null};
  const installed=saveDraftRecord(value,{...record,draftCreation:{schemaVersion:1,attempts:[...record.draftCreation.attempts,attempt]}});
  if(!same(installed.draftCreation.attempts.at(-1),attempt)) fail('Draft attempt read-back failed');
  return attempt;
}
export function recordDraftNonDispatch(root,deliveryId) {
  const value=draftContext(root,deliveryId),{record,context}=value,last=record.draftCreation?.attempts.at(-1);
  if(!last||last.nonDispatchProof!==null||last.createReceipt!==undefined) fail('An unresolved draft attempt without a receipt is required');
  const path=`.designeritl/pending/${deliveryId}/evidence/draft-nondispatch-${last.attemptId}.json`,bytes=readProjectRecord(context.root,path),attempt={...last,nonDispatchProof:{path,sha256:sha256(bytes)}};
  verifyNonDispatch(context,record,attempt);
  return saveDraftRecord(value,{...record,draftCreation:{schemaVersion:1,attempts:[...record.draftCreation.attempts.slice(0,-1),attempt]}});
}
export function recordDraftCreateReceipt(root,deliveryId) {
  const value=draftContext(root,deliveryId),{record,context,saved}=value,last=record.draftCreation?.attempts.at(-1);
  if(!last||last.nonDispatchProof!==null||last.createReceipt!==undefined) fail('An unresolved draft attempt without a receipt is required');
  const path=`.designeritl/pending/${deliveryId}/evidence/draft-create-${last.attemptId}.json`,bytes=readProjectRecord(context.root,path),release=releaseObservation(parseJSON(bytes));
  const attempt={...last,createReceipt:{path,sha256:sha256(bytes),releaseId:release.id}};
  verifyDraftCreateReceipt(bytes,record,attempt,saved.descriptor);
  return saveDraftRecord(value,{...record,draftCreation:{schemaVersion:1,attempts:[...record.draftCreation.attempts.slice(0,-1),attempt]}});
}
function verifyDraftCreateReceipt(bytes,record,attempt,descriptor) {
  const receipt=attempt.createReceipt,release=releaseObservation(parseJSON(bytes));
  if(sha256(bytes)!==receipt.sha256||release.id!==receipt.releaseId||attempt.descriptorSha256!==sha256(Buffer.from(JSON.stringify(descriptor)))||release.tag_name!==record.tag||release.draft!==true||!same(release.descriptor,descriptor)) fail('Conflicting draft create receipt descriptor or bytes');
}
export function verifyPendingDelivery(pendingRoot,repositoryId) {
  const root=resolve(pendingRoot), read=name=>{
    const path=join(root,name), stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()) fail('Unsafe pending file');
    return readFileSync(path);
  };
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()) fail('Unsafe pending root');
  const record=validatePendingRecord(read('record.json'),repositoryId);
  if(basename(root)!==record.deliveryId) fail('Pending directory identity mismatch');
  const descriptor=parseJSON(read('descriptor.json')), zip=read('delivery.zip'), storedManifest=read('manifest.json');
  const verified=verifyDelivery(zip,descriptor), manifest=verified.manifest;
  for(const key of ['repositoryId','orderNumber','deliveryId','tag','kind','payloadType','versionNumber','capturedFolder','capturedAt','payloadSha256']) if(record[key]!==manifest[key]) fail('Pending record identity or capture mismatch');
  for(const key of ['zipSha256','manifestSha256','assetBytes']) if(record[key]!==descriptor[key]) fail('Pending record digest mismatch');
  if(sha256(storedManifest)!==descriptor.manifestSha256) fail('Pending manifest bytes mismatch');
  if(record.payloadType==='files'&&!fileDeliveryManifest(record).equals(storedManifest)) fail('Pending manifest does not match reserved files');
  const snapshot=join(root,'snapshot',manifest.capturedFolder);
  if(resolve(record.stagingPath)!==snapshot) fail('Invalid pending capture path');
  const captured=inventoryDelivery(snapshot,manifest.payloadType);
  if(!same(captured.files,manifest.inventory)||captured.payloadSha256!==manifest.payloadSha256) fail('Pending capture does not match frozen manifest');
  if(!same(captured.directories,manifestDirectories(manifest))) fail('Pending capture directory structure mismatch');
  if(manifest.kind==='final') for(const name of ['reassessment','decision']) {
    const evidence=manifest.evidence[name];
    if(evidence!==null&&!read(`evidence/${name}.json`).equals(Buffer.from(evidence.json))) fail('Pending frozen evidence bytes mismatch');
  }
  for(const attempt of record.draftCreation?.attempts||[]) if(attempt.createReceipt!==undefined) {
    const evidence=lstatSync(join(root,'evidence'));
    if(!evidence.isDirectory()||evidence.isSymbolicLink()) fail('Unsafe draft create receipt directory');
    verifyDraftCreateReceipt(read(`evidence/draft-create-${attempt.attemptId}.json`),record,attempt,descriptor);
  }
  return {record,descriptor,manifest,zip,snapshot};
}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,keys)=>object(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
function repository(value) {
  return exactKeys(value,['repositoryId','owner','name'])&&positive(value.repositoryId)&&typeof value.owner==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value.owner)&&typeof value.name==='string'&&/^[a-zA-Z0-9_.-]+$/.test(value.name)&&!['.','..'].includes(value.name);
}
export function validateConfig(value) {
  if(!object(value)||value.schemaVersion!==2) fail('Unsupported project configuration format; update or set up explicitly');
  const common=['schemaVersion','role','repository'];
  if(!repository(value.repository)||!['designer','developer'].includes(value.role)) fail('Invalid project configuration identity or role');
  if(value.role==='designer') {
    if(!exactKeys(value,common)) fail('Invalid designer configuration');
  } else if(!exactKeys(value,[...common,'deliveryDestination'])||!text(value.deliveryDestination)||/[\x00-\x1f\x7f]/u.test(value.deliveryDestination)) fail('Invalid developer configuration');
  return value;
}
function supportedRecords(value) {
  if(Array.isArray(value)) value.forEach(supportedRecords);
  else if(object(value)) {
    if(Object.hasOwn(value,'schemaVersion')&&value.schemaVersion!==1) fail('Unsupported local record format');
    Object.values(value).forEach(supportedRecords);
  }
}
export function validateState(value,config) {
  validateConfig(config);
  if(!object(value)||value.schemaVersion!==1) fail('Unsupported project state format');
  const maps=config.role==='designer'?['startedOrders','seenOrderFingerprints']:['seenReleaseFingerprints','completedDownloadReceipts'];
  const arrays=config.role==='designer'?['versionReservations','pendingDeliveryIndex']:['pendingOrderCreations'];
  if(value.localMutationIntent!==null) fail('Unsupported reserved mutation marker; preserve evidence for explicit reconciliation');
  if(maps.some(key=>!object(value[key]))||arrays.some(key=>!Array.isArray(value[key]))||(Object.hasOwn(value,'completedDeliveries')&&!Array.isArray(value.completedDeliveries))) fail('Invalid complete project state');
  if(Object.hasOwn(value,'deliveryTagReservations')) {
    const reservations=value.deliveryTagReservations;
    if(!Array.isArray(reservations)||reservations.some(entry=>{
      if(!exactKeys(entry,['deliveryId','tag'])||!uuid(entry.deliveryId)||typeof entry.tag!=='string') return true;
      const tag=/^order-([1-9][0-9]*)\/(?:final|send-([1-9][0-9]*))$/.exec(entry.tag);
      return !tag||!positive(Number(tag[1]))||(tag[2]!==undefined&&!positive(Number(tag[2])));
    })||new Set(reservations.map(entry=>entry.deliveryId)).size!==reservations.length||new Set(reservations.map(entry=>entry.tag)).size!==reservations.length) fail('Invalid delivery tag reservations');
  }
  if(config.role==='designer') {
    const assignment=value.assignment;
    if(value.versionReservations.some(n=>!positive(n))||new Set(value.versionReservations).size!==value.versionReservations.length)fail('Invalid version reservations');
    if(!(assignment===null||(exactKeys(assignment,['orderId','activationId'])&&exactKeys(assignment.orderId,['repositoryId','issueNumber'])&&assignment.orderId.repositoryId===config.repository.repositoryId&&positive(assignment.orderId.issueNumber)&&uuid(assignment.activationId)))||!(value.versionCreationIntent===null||object(value.versionCreationIntent))||['seenReleaseFingerprints','completedDownloadReceipts','pendingOrderCreations'].some(key=>Object.hasOwn(value,key))) fail('Invalid designer state or role fields');
  } else if(['assignment','startedOrders','seenOrderFingerprints','versionReservations','versionCreationIntent','pendingDeliveryIndex','completedDeliveries','deliveryTagReservations'].some(key=>Object.hasOwn(value,key))) fail('Invalid developer state role fields');
  if(config.role==='developer') {
    const requests=new Set();
    for(const record of value.pendingOrderCreations) {
      validatePendingOrderCreation(record,config.repository.repositoryId);
      if(requests.has(record.requestId)) fail('Duplicate saved order request identity');
      requests.add(record.requestId);
    }
  }
  supportedRecords(value);
  return value;
}
function projectFile(root,relative,required=true) {
  safePath(relative);
  const base=resolve(root);
  if(!lstatSync(base).isDirectory()||lstatSync(base).isSymbolicLink()) fail('Unsafe project root');
  let current=base;
  const parts=relative.split('/');
  for(let n=0;n<parts.length;n++) {
    current=join(current,parts[n]);
    if(!existsSync(current)) { if(required) fail(`Missing project record: ${relative}`); return join(base,...parts); }
    const stat=lstatSync(current);
    if(stat.isSymbolicLink()||(n<parts.length-1?!stat.isDirectory():!stat.isFile())) fail(`Unsafe project record: ${relative}`);
  }
  return current;
}
export function readProject(root,requiredRole=null) {
  const base=realpathSync(resolve(root)), configPath=projectFile(base,'.designeritl/config.json',false);
  if(!existsSync(configPath)) fail('Project selection or setup required in the explicitly opened root');
  const configBytes=readFileSync(configPath), config=validateConfig(parseJSON(configBytes));
  if(requiredRole!==null&&config.role!==requiredRole) fail(`This action requires the ${requiredRole} role`);
  const statePath=projectFile(base,'.designeritl/state.json'), stateBytes=readFileSync(statePath), state=validateState(parseJSON(stateBytes),config);
  const context={root:base,config,state,configSha256:sha256(configBytes),stateSha256:sha256(stateBytes),deliveryDestination:config.role==='developer'?resolve(base,config.deliveryDestination):null};
  const journal=projectFile(base,'.designeritl/mutation-intent.json',false);
  context.mutationIntent=existsSync(journal)?validateIntent(parseJSON(readFileSync(journal)),context):null;
  if(config.role==='designer'&&state.versionCreationIntent!==null)validateVersionIntent(context);
  return context;
}
export function bindRepository(context,observed) {
  validateConfig(context.config);
  if(!object(observed)||!positive(observed.id)||!text(observed.owner?.login)||!text(observed.name)) fail('Unknown repository status; no mutation permitted');
  if(observed.id!==context.config.repository.repositoryId) fail('Replacement repository requires explicit setup or migration');
  const result={repositoryId:observed.id,owner:observed.owner.login,name:observed.name};
  if(!repository(result)) fail('Invalid observed repository identity');
  return result;
}
const stateOwners={project:['localMutationIntent'],orders:['assignment','startedOrders','pendingOrderCreations'],versions:['versionReservations','versionCreationIntent'],inbox:['seenOrderFingerprints','seenReleaseFingerprints','completedDownloadReceipts'],deliveries:['pendingDeliveryIndex','completedDeliveries','deliveryTagReservations']};
function mutationOwners(owner) {
  const owners=Array.isArray(owner)?owner:[owner];
  if(!owners.length||new Set(owners).size!==owners.length||owners.some(name=>!Object.hasOwn(stateOwners,name))) fail('Invalid mutation owner');
  return owners;
}
function recordValue(bytes,kind,context,validateOwnerRecord,recordPath) {
  if(kind==='config') return validateConfig(parseJSON(bytes));
  if(kind==='state') return validateState(parseJSON(bytes),context.config);
  const order=/^orders\/([1-9][0-9]*)\.md$/.exec(recordPath??'');
  if(kind==='owner'&&order) return parseLocalChecklist(bytes,{repositoryId:context.config.repository.repositoryId,issueNumber:Number(order[1])});
  const report=/^\.designeritl\/reports\/designer-([a-f0-9-]+)(\.receipt)?\.json$/.exec(recordPath??'');
  if(kind==='owner'&&report) return validateDesignerInboxRecord(bytes,context,report[1],Boolean(report[2]));
  const cancellation=/^\.designeritl\/reports\/cancellation-([a-f0-9-]+)(?:\.(applied|receipt))?\.json$/.exec(recordPath??'');
  if(kind==='owner'&&cancellation) return validateCancellationRecord(bytes,context,cancellation[1],cancellation[2]||'plan');
  const pending=/^\.designeritl\/pending\/([a-f0-9-]+)\/record\.json$/.exec(recordPath??'');
  if(kind==='owner'&&pending) {const record=validatePendingRecord(bytes,context.config.repository.repositoryId);if(record.deliveryId!==pending[1]) fail('Conflicting pending record path');return record;}
  if(kind==='owner'&&typeof validateOwnerRecord==='function') { validateOwnerRecord(bytes); return null; }
  fail('A complete domain record validator is required');
}
function validateIntent(intent,context) {
  if(!exactKeys(intent,['schemaVersion','operationId','projectRoot','repositoryId','role','owner','kind','recordPath','tempPath','previousSha256','proposedSha256'])||intent.schemaVersion!==1||!uuid(intent.operationId)||intent.projectRoot!==context.root||intent.repositoryId!==context.config.repository.repositoryId||intent.role!==context.config.role||!['config','state','owner'].includes(intent.kind)||!(intent.previousSha256===null||isHash(intent.previousSha256))||!isHash(intent.proposedSha256)) fail('Unsupported or conflicting mutation intent or project root');
  const owners=mutationOwners(intent.owner);
  safePath(intent.recordPath);safePath(intent.tempPath);
  if(dirname(intent.recordPath)!==dirname(intent.tempPath)||intent.tempPath!==`${intent.recordPath}.${intent.operationId}.tmp`||(intent.kind==='config'&&intent.recordPath!=='.designeritl/config.json')||(intent.kind==='state'&&intent.recordPath!=='.designeritl/state.json')||(intent.kind==='owner'&&!/^(orders\/|\.designeritl\/pending\/|\.designeritl\/reports\/)/.test(intent.recordPath))) fail('Unsafe mutation intent paths');
  if(intent.kind==='config'&&(owners.length!==1||owners[0]!=='project')) fail('Configuration belongs to Project');
  if(intent.kind==='owner'&&((intent.recordPath.startsWith('orders/')&&!owners.includes('orders'))||(intent.recordPath.startsWith('.designeritl/pending/')&&!owners.includes('deliveries'))||(intent.recordPath.startsWith('.designeritl/reports/')&&!owners.includes('inbox')))) fail('Record path belongs to another domain owner');
  return intent;
}
export function prepareRecordReplacement(context,recordPath,proposedBytes,{owner,kind,expectedPreviousSha256},validateOwnerRecord) {
  const fresh=readProject(context.root,context.config.role);
  if(fresh.configSha256!==context.configSha256||fresh.stateSha256!==context.stateSha256) fail('Concurrent local record change; reread and reconcile before mutation');
  const journal=projectFile(context.root,'.designeritl/mutation-intent.json',false);
  if(existsSync(journal)||fresh.state.localMutationIntent!==null) fail('Reconcile the existing mutation intent before another mutation');
  const target=projectFile(context.root,recordPath,kind!=='owner'), previous=existsSync(target)?readFileSync(target):null, bytes=Buffer.from(proposedBytes), value=recordValue(bytes,kind,fresh,validateOwnerRecord,recordPath);
  const expected=kind==='state'?fresh.stateSha256:kind==='config'?fresh.configSha256:expectedPreviousSha256;
  if(!(expected===null||isHash(expected))) fail('The original domain record hash is required');
  if((previous===null?null:sha256(previous))!==expected) fail('Concurrent domain record change; reread before proposing replacement');
  if(kind==='owner'&&/^\.designeritl\/pending\/[a-f0-9-]+\/record\.json$/.test(recordPath)&&previous!==null) draftTransition(validatePendingRecord(previous,fresh.config.repository.repositoryId),value);
  if(kind==='state') {
    const allowed=mutationOwners(owner).flatMap(name=>stateOwners[name]);
    for(const key of new Set([...Object.keys(fresh.state),...Object.keys(value)])) if(!allowed.includes(key)&&!same(fresh.state[key],value[key])) fail(`Cannot change another owner state section: ${key}`);
    if(fresh.config.role==='developer') for(const saved of fresh.state.pendingOrderCreations) {
      const next=value.pendingOrderCreations.find(record=>record.requestId===saved.requestId);
      if(!next||['schemaVersion','repositoryId','requestId','title','intendedBody','intendedBodySha256'].some(key=>next[key]!==saved[key])||(saved.submissionAttempted&&!next.submissionAttempted)||(saved.result!==null&&next.result!==saved.result)) fail('Immutable order request or attempted submission evidence cannot be changed or removed');
    }
  }
  if(kind==='config'&&(value.role!==fresh.config.role||value.repository.repositoryId!==fresh.config.repository.repositoryId)) fail('Role or repository replacement requires explicit setup or migration');
  const operationId=randomUUID(), intent=validateIntent({schemaVersion:1,operationId,projectRoot:fresh.root,repositoryId:fresh.config.repository.repositoryId,role:fresh.config.role,owner,kind,recordPath,tempPath:`${recordPath}.${operationId}.tmp`,previousSha256:previous===null?null:sha256(previous),proposedSha256:sha256(bytes)},fresh);
  const temp=projectFile(context.root,intent.tempPath,false), intentBytes=Buffer.from(JSON.stringify(intent,null,2)+'\n');
  // A failed or interrupted write retains this intent and any staging bytes.
  writeFileSync(journal,intentBytes,{flag:'wx',flush:true});
  if(!readFileSync(journal).equals(intentBytes)) fail('Mutation intent read-back mismatch');
  writeFileSync(temp,bytes,{flag:'wx',flush:true});
  const checked=readFileSync(temp);recordValue(checked,kind,fresh,validateOwnerRecord,recordPath);
  if(sha256(checked)!==intent.proposedSha256) fail('Proposed record read-back mismatch');
  return intent;
}
export function reconcileRecordReplacement(context,validateOwnerRecord) {
  const journal=projectFile(context.root,'.designeritl/mutation-intent.json',false);
  if(!existsSync(journal)) {
    if(context.state.localMutationIntent!==null) fail('Conflicting saved mutation marker without its journal');
    return {outcome:'none'};
  }
  const journalBytes=readFileSync(journal), intent=validateIntent(parseJSON(journalBytes),context), target=projectFile(context.root,intent.recordPath,false), temp=projectFile(context.root,intent.tempPath,false);
  const current=existsSync(target)?readFileSync(target):null, currentHash=current===null?null:sha256(current), staged=existsSync(temp)?readFileSync(temp):null;
  if(currentHash!==intent.previousSha256&&currentHash!==intent.proposedSha256) fail('Conflicting concurrent record change; mutation evidence retained');
  if(staged!==null) {
    recordValue(staged,intent.kind,context,validateOwnerRecord,intent.recordPath);
    if(sha256(staged)!==intent.proposedSha256) fail('Corrupt proposed record; mutation evidence retained');
  }
  if(currentHash!==intent.proposedSha256) {
    if(staged===null) fail('Incomplete mutation staging; preserve evidence and request deliberate recovery');
    const recheck=existsSync(target)?sha256(readFileSync(target)):null;
    if(recheck!==intent.previousSha256||!readFileSync(journal).equals(journalBytes)) fail('Concurrent mutation before replacement; evidence retained');
    renameSync(temp,target);
  }
  const installed=readFileSync(target);recordValue(installed,intent.kind,context,validateOwnerRecord,intent.recordPath);
  if(sha256(installed)!==intent.proposedSha256) fail('Replacement verification failed; intent retained');
  const completed=projectFile(context.root,`.designeritl/mutation-${intent.operationId}.completed.json`,false);
  if(existsSync(completed)) fail('Conflicting completed mutation identity; evidence retained');
  if(!readFileSync(journal).equals(journalBytes)) fail('Concurrent mutation intent change; evidence retained');
  renameSync(journal,completed);
  return {outcome:'verified',operationId:intent.operationId,recordPath:intent.recordPath};
}
export function validatePendingOrderCreation(record,repositoryId) {
  if(!exactKeys(record,['schemaVersion','repositoryId','requestId','title','intendedBody','intendedBodySha256','submissionAttempted','result'])||record.schemaVersion!==1||record.repositoryId!==repositoryId||!positive(repositoryId)||!uuid(record.requestId)||!text(record.title)||/[\r\n\x00]/.test(record.title)||typeof record.intendedBody!=='string'||!isHash(record.intendedBodySha256)||sha256(Buffer.from(record.intendedBody,'utf8'))!==record.intendedBodySha256||typeof record.submissionAttempted!=='boolean'||!(record.result===null||(record.submissionAttempted&&positive(record.result)))) fail('Invalid or unsupported saved order request');
  const order=parseWorkOrderBody(record.intendedBody);
  if(!order||order.metadata.requestId!==record.requestId) fail('Saved request identity conflicts with its exact body');
  return record;
}
export function cancellationPublications(releases,repositoryId) {
  if(!Array.isArray(releases))fail('Complete release observations required');
  const found=[],ids=new Set(),tags=new Set(),uuids=new Set();
  for(const release of releases) {
    if(!object(release)||!positive(release.id)||typeof release.draft!=='boolean'||typeof release.tag_name!=='string'||typeof release.body!=='string'||ids.has(release.id))fail('Unknown or duplicated release observation');
    ids.add(release.id);
    if(!release.tag_name.startsWith('order-')&&!release.body.includes('designeritl-delivery'))continue;
    const blocks=[...release.body.matchAll(/^```designeritl-delivery\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
    if(blocks.length!==1)fail('Malformed delivery identity prevents cancellation reconciliation');
    const d=parseJSON(Buffer.from(blocks[0][1]));identity(d);
    if(!exactKeys(d,['schemaVersion','repositoryId','orderNumber','deliveryId','tag','kind','assetName','assetBytes','manifestSha256','zipSha256'])||d.repositoryId!==repositoryId||d.tag!==release.tag_name||d.assetName!=='delivery.zip'||!positive(d.assetBytes)||!isHash(d.manifestSha256)||!isHash(d.zipSha256)||tags.has(d.tag)||uuids.has(d.deliveryId))fail('Conflicting or unsupported published identity');
    tags.add(d.tag);uuids.add(d.deliveryId);
    if(!release.draft) {
      if(!Array.isArray(release.assets)||release.assets.length!==1||!positive(release.assets[0].id)||release.assets[0].name!==d.assetName||release.assets[0].size!==d.assetBytes)fail('Unknown published delivery asset identity');
      found.push({releaseId:release.id,assetId:release.assets[0].id,descriptor:d});
    }
  }
  return found.sort((a,b)=>a.releaseId-b.releaseId);
}
export function validateCancellationRecord(bytes,context,expectedId,kind='plan') {
  const r=parseJSON(bytes),base=['schemaVersion','operationId','projectRoot','repositoryId'];
  if(r.schemaVersion!==1||!uuid(r.operationId)||r.operationId!==expectedId||r.projectRoot!==context.root||r.repositoryId!==context.config.repository.repositoryId||context.config.role!=='designer')fail('Unsupported or conflicting cancellation record identity');
  if(kind==='receipt') {
    if(!exactKeys(r,[...base,'appliedSha256','disclosedAt'])||!isHash(r.appliedSha256)||!utc(r.disclosedAt))fail('Invalid cancellation disclosure receipt');
    const applied=readProjectRecord(context.root,`.designeritl/reports/cancellation-${expectedId}.applied.json`);validateCancellationRecord(applied,context,expectedId,'applied');if(sha256(applied)!==r.appliedSha256)fail('Changed cancellation application evidence');return r;
  }
  if(kind==='applied') {
    if(!exactKeys(r,[...base,'planSha256','observedAt','outcome','targetState','targetReason','requestState','requestReason','publishedDeliveries'])||!isHash(r.planSha256)||!utc(r.observedAt)||!['cancelled','hand-closed','no-effect'].includes(r.outcome)||!['open','closed'].includes(r.targetState)||![null,'completed','not_planned','duplicate'].includes(r.targetReason)||![null,'closed'].includes(r.requestState)||![null,'completed'].includes(r.requestReason)||!Array.isArray(r.publishedDeliveries))fail('Invalid cancellation application report');
    const planBytes=readProjectRecord(context.root,`.designeritl/reports/cancellation-${expectedId}.json`),plan=validateCancellationRecord(planBytes,context,expectedId);
    if(sha256(planBytes)!==r.planSha256||(r.outcome!=='no-effect'&&r.targetState!=='closed')||(plan.requestNumber===null?(r.requestState!==null||r.requestReason!==null||!['hand-closed','no-effect'].includes(r.outcome)):(r.requestState!=='closed'||r.requestReason!=='completed'||r.outcome==='hand-closed'))||(r.outcome==='no-effect'&&plan.targetState==='open'&&!r.publishedDeliveries.some(p=>p.descriptor.kind==='final')))fail('Cancellation report conflicts with saved plan or verified closure');
    for(const p of r.publishedDeliveries)if(!exactKeys(p,['releaseId','assetId','descriptor'])||!positive(p.releaseId)||!positive(p.assetId)||p.descriptor.repositoryId!==r.repositoryId||p.descriptor.orderNumber!==plan.targetNumber)fail('Invalid retained publication observation');
    cancellationPublications(r.publishedDeliveries.map(p=>({id:p.releaseId,draft:false,tag_name:p.descriptor.tag,body:'```designeritl-delivery\n'+JSON.stringify(p.descriptor)+'\n```',assets:[{id:p.assetId,name:p.descriptor.assetName,size:p.descriptor.assetBytes}]})),r.repositoryId);
    return r;
  }
  if(kind!=='plan'||!exactKeys(r,[...base,'targetNumber','targetBody','targetState','requestNumber','requestBody','assignmentToken','observedAt'])||!positive(r.targetNumber)||typeof r.targetBody!=='string'||!['open','closed'].includes(r.targetState)||!utc(r.observedAt)||!(r.requestNumber===null||positive(r.requestNumber))||r.requestNumber===r.targetNumber)fail('Invalid cancellation observation plan');
  const target=parseWorkOrderBody(r.targetBody);
  if(!target||target.kind!=='order')fail('Cancellation target is not a supported work order');
  if(r.requestNumber===null) {if(r.requestBody!==null||r.targetState!=='closed')fail('Hand closure requires a closed observed order');}
  else {const request=parseWorkOrderBody(r.requestBody);if(!request||request.kind!=='cancellation'||request.metadata.cancelsOrderNumber!==r.targetNumber)fail('Cancellation request target identity mismatch');}
  const a=r.assignmentToken;
  if(!(a===null||(exactKeys(a,['orderId','activationId'])&&exactKeys(a.orderId,['repositoryId','issueNumber'])&&a.orderId.repositoryId===r.repositoryId&&a.orderId.issueNumber===r.targetNumber&&uuid(a.activationId))))fail('Invalid cancellation assignment token');
  return r;
}
export function createOrderRequest({repositoryId,title,goal,tasks,followsOrderNumber=null,cancelsOrderNumber=null}) {
  if(!positive(repositoryId)||!text(title)||/[\r\n\x00]/.test(title)||!text(goal)||!Array.isArray(tasks)||!(followsOrderNumber===null||positive(followsOrderNumber))||!(cancelsOrderNumber===null||positive(cancelsOrderNumber))||(cancelsOrderNumber===null?tasks.length===0:tasks.length!==0||followsOrderNumber!==null)) fail('An order needs numbered tasks; a cancellation needs a target and no tasks or feedback relation');
  const requestId=randomUUID(),metadata={schemaVersion:1,requestId,followsOrderNumber,cancelsOrderNumber};
  for(const task of tasks) if(!exactKeys(task,['ordinal','text'])||!positive(task.ordinal)||!text(task.text)||/[\r\n]/.test(task.text)) fail('Invalid stable task definition');
  const intendedBody=`# Goal\n${goal}\n\n${cancelsOrderNumber===null?`## Tasks\n${tasks.map(task=>`- [ ] ${task.ordinal}. ${task.text}`).join('\n')}\n\n`:''}\`\`\`designeritl-order\n${JSON.stringify(metadata)}\n\`\`\`\n`;
  return validatePendingOrderCreation({schemaVersion:1,repositoryId,requestId,title,intendedBody,intendedBodySha256:sha256(Buffer.from(intendedBody,'utf8')),submissionAttempted:false,result:null},repositoryId);
}
export function requireCancellationTarget(issue,{complete=false}={}) {
  if(complete!==true||!object(issue)||!positive(issue.number)||issue.pull_request||typeof issue.body!=='string') fail('Cancellation target is unreadable or is not a supported work order; stop before mutation');
  const parsed=parseWorkOrderBody(issue.body);
  if(parsed?.kind!=='order') fail('Cancellation target is not a supported work order; stop before mutation');
  if(!['open','closed'].includes(issue.state)||!Object.hasOwn(issue,'state_reason')) fail('Cancellation target state is unknown or incomplete; stop before mutation');
  if(issue.state==='closed') fail('Cancellation target is already closed; use a follow-up order to ask for more work');
  if(issue.state_reason!==null) fail('Cancellation target state is unknown or incomplete; stop before mutation');
  return parsed;
}
export function reconcileOrderRequest(saved,pages,complete) {
  validatePendingOrderCreation(saved,saved.repositoryId);
  if(complete!==true||!Array.isArray(pages)||!pages.length||pages.some(page=>!Array.isArray(page))) fail('Incomplete paginated issue lookup; another create is refused');
  const observed=observedOrderIssues(pages.flat());
  if(observed.some(issue=>issue.error)) fail('Unsupported or malformed issue metadata prevents request reconciliation');
  const matches=observed.filter(issue=>issue.parsed?.metadata.requestId===saved.requestId);
  if(matches.length>1) fail('Duplicate structured order request identity; another create is refused');
  if(!matches.length) {
    if(saved.result!==null) fail('Previously completed issue is missing; another create is refused');
    if(saved.submissionAttempted) fail('Submission was attempted; absent listing identity is uncertain, wait and reconcile without another create');
    const targetNumber=parseWorkOrderBody(saved.intendedBody).metadata.cancelsOrderNumber;
    if(targetNumber!==null) requireCancellationTarget(pages.flat().find(issue=>issue.number===targetNumber),{complete:true});
    return null;
  }
  const match=matches[0];
  if(match.body!==saved.intendedBody) fail('Matching order request has a changed exact body; evidence retained');
  if(saved.result!==null&&saved.result!==match.issueNumber) fail('Saved issue number conflicts with structured request identity');
  return match.issueNumber;
}
function versionState(context,changes) {
  prepareRecordReplacement(context,'.designeritl/state.json',Buffer.from(JSON.stringify({...context.state,...changes},null,2)+'\n'),{owner:'versions',kind:'state'});
  reconcileRecordReplacement(readProject(context.root,'designer'));
  return readProject(context.root,'designer');
}
function freshVersionContext(context) {
  const fresh=readProject(context.root,'designer');
  if(fresh.configSha256!==context.configSha256||fresh.stateSha256!==context.stateSha256)fail('Stale or concurrent version context; reread before mutation');
  if(fresh.mutationIntent)fail('Reconcile existing mutation intent before version mutation');
}
function versionDirectory(root,relative,create=false) {
  safePath(relative);let path=root;
  for(const component of relative.split('/')) {
    path=join(path,component);
    if(!existsSync(path)) { if(create) mkdirSync(path); else return join(root,...relative.split('/')); }
    if(existsSync(path)&&(!lstatSync(path).isDirectory()||lstatSync(path).isSymbolicLink())) fail('Unsafe version directory');
  }
  return path;
}
export function inspectVersions(context) {
  if(context.config.role!=='designer') fail('Versions require the designer role');
  const base=versionDirectory(context.root,'versions'), versions=[];
  if(existsSync(base)) for(const folder of readdirSync(base)) {
    const match=/^(.+?)(\.current)?\.v([1-9][0-9]*)$/.exec(folder);
    if(!match||!positive(Number(match[3]))) fail(`Unrecognized version folder: ${folder}`);
    safePath(folder);const path=versionDirectory(context.root,`versions/${folder}`);
    let modifiedAt=0;
    function visit(directory) {for(const name of readdirSync(directory)) {const full=join(directory,name),stat=lstatSync(full);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())) fail('Unsafe version content');if(stat.isDirectory())visit(full);else modifiedAt=Math.max(modifiedAt,stat.mtimeMs);}}
    visit(path);versions.push({number:Number(match[3]),label:match[1],current:!!match[2],folder,modifiedAt:modifiedAt||lstatSync(path).mtimeMs});
  }
  if(new Set(versions.map(v=>v.number)).size!==versions.length) fail('Duplicate version number; resolve folders explicitly');
  versions.sort((a,b)=>a.number-b.number);
  const marked=versions.filter(v=>v.current),recommended=[...versions].sort((a,b)=>b.modifiedAt-a.modifiedAt||b.number-a.number)[0]||null;
  return {versions,working:marked.length===1?marked[0]:null,requiresChoice:versions.length>0&&marked.length!==1,recommended};
}
function validateVersionIntent(context) {
  const i=context.state.versionCreationIntent;
  if(!exactKeys(i,['schemaVersion','operationId','projectRoot','repositoryId','number','label','source','previousWorking','expected','stagingPath','resultPath','currentPath'])||i.schemaVersion!==1||!uuid(i.operationId)||i.projectRoot!==context.root||i.repositoryId!==context.config.repository.repositoryId||!positive(i.number)||!validVersionLabel(i.label)||!(i.source===null||(exactKeys(i.source,['kind','path'])&&['version','import','capture'].includes(i.source.kind)&&typeof i.source.path==='string'&&resolve(i.source.path)===i.source.path))||!(i.previousWorking===null||positive(i.previousWorking))||i.stagingPath!==`.designeritl/version-staging/${i.operationId}`||i.resultPath!==`versions/${i.label}.v${i.number}`||i.currentPath!==`versions/${i.label}.current.v${i.number}`||!context.state.versionReservations.includes(i.number)) fail('Unsupported or conflicting version creation intent');
  const e=i.expected;
  if(!exactKeys(e,['files','directories','payloadSha256'])||!Array.isArray(e.files)||!Array.isArray(e.directories)||!isHash(e.payloadSha256)||e.files.some(f=>!exactKeys(f,['path','bytes','sha256'])||!Number.isSafeInteger(f.bytes)||f.bytes<0||!isHash(f.sha256))||e.directories.some(d=>typeof d!=='string')||payloadDigest(e.files)!==e.payloadSha256)fail('Invalid version inventory evidence');
  uniquePaths([...e.files,...e.directories.map(path=>({path:path+'/'}))]);
  if(!e.files.some(f=>f.path==='index.html')||!e.directories.includes('assets'))fail('Invalid version format evidence');
  [i.stagingPath,i.resultPath,i.currentPath].forEach(p=>safePath(p));return i;
}
function validVersionLabel(label) {return typeof label==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label)&&!label.includes('.current')&&!/\.v[0-9]+$/.test(label);}
function versionSnapshot(path) {
  const result=inventory(path),directories=[];
  function walk(base,prefix='') {for(const name of readdirSync(base))if(lstatSync(join(base,name)).isDirectory()){directories.push(prefix+name);walk(join(base,name),prefix+name+'/');}}
  walk(path);directories.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));return {...result,directories};
}
function sameLocalPath(a,b) {return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function expectedVersion(path,expected) {if(!sameLocalPath(realpathSync(path),resolve(path)))fail('Linked version source or result refused');const found=versionSnapshot(path);if(!same(found.files,expected.files)||!same(found.directories,expected.directories)||found.payloadSha256!==expected.payloadSha256)fail('Version inventory mismatch; evidence retained');return found;}
export function reserveVersion(context,{mode='copy',label='prototype',fromNumber=null,importPath=null,capturePath=null,payloadSha256=null,workingNumber=null}={}) {
  freshVersionContext(context);
  if(context.mutationIntent||context.state.versionCreationIntent) fail('Reconcile existing version or mutation intent first');
  if(!['empty','copy','import','capture'].includes(mode)) fail('Unsupported version source');
  safePath(label);if(!validVersionLabel(label)) fail('Invalid version label');
  let observed=inspectVersions(context);
  if(observed.requiresChoice) {if(!positive(workingNumber))fail(`Explicit working version choice required; recommend v${observed.recommended.number}`);resolveWorkingVersion(context,workingNumber);observed=inspectVersions(context);}
  const reservations=context.state.versionReservations;if(reservations.some(n=>!positive(n))||new Set(reservations).size!==reservations.length) fail('Invalid version reservations');
  let source=null,expected={files:[{path:'index.html',bytes:Buffer.byteLength(emptyPrototype),sha256:sha256(Buffer.from(emptyPrototype))}],directories:['assets']};expected.payloadSha256=payloadDigest(expected.files);
  if(mode==='copy') {
    const selected=fromNumber===null?observed.working:observed.versions.find(v=>v.number===fromNumber);
    if(!selected)fail('Select an existing source version or explicitly request empty/import');
    source={kind:'version',path:join(context.root,'versions',selected.folder)};
  } else if(mode==='import'||mode==='capture') {
    const supplied=mode==='import'?importPath:capturePath;if(!text(supplied))fail('Explicit local source path required');
    source={kind:mode,path:realpathSync(resolve(context.root,supplied))};
    // Resolve every ancestor before inventory; a linked root/parent is not an import boundary.
    if(!sameLocalPath(resolve(context.root,supplied),source.path))fail('Linked import/capture path refused');
  }
  if(source) {expected=versionSnapshot(source.path);if(mode==='capture'&&(!isHash(payloadSha256)||expected.payloadSha256!==payloadSha256))fail('Captured source hash mismatch');}
  const number=Math.max(0,...reservations,...observed.versions.map(v=>v.number))+1;if(!positive(number))fail('Version number exhausted');
  const operationId=randomUUID(),intent={schemaVersion:1,operationId,projectRoot:context.root,repositoryId:context.config.repository.repositoryId,number,label,source,previousWorking:observed.working?.number||null,expected,stagingPath:`.designeritl/version-staging/${operationId}`,resultPath:`versions/${label}.v${number}`,currentPath:`versions/${label}.current.v${number}`};
  versionState(context,{versionReservations:[...reservations,number],versionCreationIntent:intent});return intent;
}
const emptyPrototype='<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototype</title><body><main><h1>Prototype</h1></main></body></html>\n';
export function stageVersion(context) {
  freshVersionContext(context);
  const i=validateVersionIntent(context);inspectVersions(context);
  if(existsSync(versionDirectory(context.root,i.resultPath))||existsSync(versionDirectory(context.root,i.currentPath)))fail('Result already exists; reconcile marker transfer instead of recopying');
  if(i.source)expectedVersion(i.source.path,i.expected);
  const path=versionDirectory(context.root,i.stagingPath,true);
  // Resume only a matching subset; never overwrite partial or foreign bytes.
  function checkPartial(base,prefix='') {for(const name of readdirSync(base)){const relative=prefix+name,full=join(base,name),stat=lstatSync(full);if(stat.isSymbolicLink())fail('Unsafe partial staging');if(stat.isDirectory()){if(!i.expected.directories.includes(relative))fail('Unexpected staging directory');checkPartial(full,relative+'/');}else {const e=i.expected.files.find(f=>f.path===relative);if(!stat.isFile()||!e||sha256(readFileSync(full))!==e.sha256||stat.size!==e.bytes)fail('Conflicting partial staging; evidence retained');}}}
  checkPartial(path);
  for(const directory of i.expected.directories)versionDirectory(context.root,i.stagingPath+'/'+directory,true);
  for(const entry of i.expected.files) {const target=join(path,...entry.path.split('/'));if(!existsSync(target))writeFileSync(target,i.source?readFileSync(join(i.source.path,...entry.path.split('/'))):Buffer.from(emptyPrototype),{flag:'wx',flush:true});}
  const found=expectedVersion(path,i.expected);if(i.source)expectedVersion(i.source.path,i.expected);return found;
}
export function resolveWorkingVersion(context,number) {
  freshVersionContext(context);
  const observed=inspectVersions(context),selected=observed.versions.find(v=>v.number===number);if(!selected)fail('Explicit choice must name an existing version');
  inventory(join(context.root,'versions',selected.folder));
  for(const v of observed.versions.filter(v=>v.current&&v.number!==number))renameSync(join(context.root,'versions',v.folder),join(context.root,'versions',`${v.label}.v${v.number}`));
  if(!selected.current)renameSync(join(context.root,'versions',selected.folder),join(context.root,'versions',`${selected.label}.current.v${number}`));
  if(inspectVersions(context).working?.number!==number)fail('Working marker verification failed');
}
export function finishVersion(context,{workingNumber=null}={}) {
  freshVersionContext(context);
  const i=validateVersionIntent(context),staging=versionDirectory(context.root,i.stagingPath),result=versionDirectory(context.root,i.resultPath),current=versionDirectory(context.root,i.currentPath);
  const before=inspectVersions(context);
  if(existsSync(staging)) {expectedVersion(staging,i.expected);if(existsSync(result)||existsSync(current))fail('Conflicting version results');versionDirectory(context.root,'versions',true);renameSync(staging,result);}
  const observed=inspectVersions(context);
  if(existsSync(result)) {
    expectedVersion(result,i.expected);if(existsSync(current))fail('Conflicting version results');
    if(observed.requiresChoice&&!(before.versions.length===0&&i.previousWorking===null)&&workingNumber!==i.number)fail(`Explicit working version choice required; recommend v${observed.recommended.number}`);
    if(!observed.requiresChoice&&observed.working&&observed.working.number!==i.previousWorking&&workingNumber!==i.number)fail('Working version changed during creation; explicit choice required');
    for(const v of observed.versions.filter(v=>v.current))renameSync(join(context.root,'versions',v.folder),join(context.root,'versions',`${v.label}.v${v.number}`));
    renameSync(result,current);
  }
  if(!existsSync(current))fail('Incomplete version creation; evidence retained');
  expectedVersion(current,i.expected);const final=inspectVersions(context);
  if(final.requiresChoice) {if(workingNumber!==i.number)fail(`Explicit working version choice required; recommend v${final.recommended.number}`);resolveWorkingVersion(context,i.number);}
  if(inspectVersions(context).working?.number!==i.number)fail('New version is not the sole working version');
  versionState(context,{versionCreationIntent:null});return {number:i.number,folder:i.currentPath};
}
function utf8Text(bytes) {
  const data=Buffer.from(bytes),value=data.toString('utf8');
  if(!Buffer.from(value).equals(data)||value.charCodeAt(0)===0xfeff) fail('Invalid UTF-8 local record');
  return value;
}
export function parseWorkOrderBody(body) {
  if(typeof body!=='string'||Buffer.from(body).toString('utf8')!==body) fail('Invalid work-order body');
  const blocks=[...body.matchAll(/^```designeritl-order\r?\n([\s\S]*?)\r?\n```\s*$/gm)];
  if(!blocks.length&&!body.includes('```designeritl-order')) return null;
  if(blocks.length!==1) fail('Expected exactly one work-order metadata block');
  const metadata=parseJSON(Buffer.from(blocks[0][1]));
  const metadataKeys=[...blocks[0][1].matchAll(/"(?:\\.|[^"\\])*"\s*:/g)].map(match=>JSON.parse(match[0].slice(0,match[0].lastIndexOf(':')).trim()));
  if(metadataKeys.length!==4||new Set(metadataKeys).size!==4) fail('Duplicate or unsupported work-order metadata keys');
  if(!exactKeys(metadata,['schemaVersion','requestId','followsOrderNumber','cancelsOrderNumber'])||metadata.schemaVersion!==1||!uuid(metadata.requestId)||![metadata.followsOrderNumber,metadata.cancelsOrderNumber].every(n=>n===null||positive(n))||(metadata.followsOrderNumber!==null&&metadata.cancelsOrderNumber!==null)) fail('Unsupported or malformed work-order metadata');
  const prose=body.slice(0,blocks[0].index)+body.slice(blocks[0].index+blocks[0][0].length);
  const taskRows=[...prose.matchAll(/^- \[[ xX]\] .*$/gm)],tasks=[];
  for(const row of taskRows) {
    const parsed=/^- \[[ xX]\] ([1-9][0-9]*)\. (.+?)\r?$/.exec(row[0]);
    if(!parsed||!positive(Number(parsed[1]))||!text(parsed[2])) fail('Work-order tasks require stable positive numbered definitions');
    tasks.push({ordinal:Number(parsed[1]),text:parsed[2]});
  }
  if(!ordinals(tasks.map(task=>task.ordinal))) fail('Duplicate work-order task ordinal');
  const goal=prose.slice(0,taskRows[0]?.index??prose.length).trim().replace(/^# Goal\s*\r?\n/i,'').replace(/\r?\n## Tasks\s*$/i,'').trim();
  const kind=metadata.cancelsOrderNumber===null?'order':'cancellation';
  if(!text(goal)||(kind==='order'&&!tasks.length)||(kind==='cancellation'&&tasks.length)) fail('Invalid work-order goal or task-free cancellation request');
  return {metadata,kind,goal,tasks};
}
export function validateScope(scope,expected) {
  const keys=['orderId','originalBody','originalBodySha256','goal','tasks','startedAt'];
  if(!exactKeys(scope,Object.hasOwn(scope??{},'schemaVersion')?['schemaVersion',...keys]:keys)||(Object.hasOwn(scope,'schemaVersion')&&scope.schemaVersion!==1)||!exactKeys(scope.orderId,['repositoryId','issueNumber'])||!positive(scope.orderId.repositoryId)||!positive(scope.orderId.issueNumber)||!utc(scope.startedAt)||!isHash(scope.originalBodySha256)) fail('Unsupported or malformed agreed scope');
  if(expected&&(scope.orderId.repositoryId!==expected.repositoryId||scope.orderId.issueNumber!==expected.issueNumber)) fail('Local checklist identity mismatch');
  const original=parseWorkOrderBody(scope.originalBody);
  if(!original||original.kind!=='order'||sha256(Buffer.from(scope.originalBody))!==scope.originalBodySha256||scope.goal!==original.goal||!same(scope.tasks,original.tasks)) fail('Agreed scope does not match its original body bytes');
  return scope;
}
export function parseLocalChecklist(bytes,expected=null) {
  const value=utf8Text(bytes),progress=/^# Local progress\r?$/m.exec(value);
  if(!progress) fail('Local checklist requires a progress section');
  const prefix=value.slice(0,progress.index),blocks=[...prefix.matchAll(/^```designeritl-scope\r?\n([\s\S]*?)\r?\n```/gm)];
  if(blocks.length!==1) fail('Local checklist requires one immutable scope block');
  if(prefix.slice(0,blocks[0].index).trim()!=='# Agreed scope'||prefix.slice(blocks[0].index+blocks[0][0].length).trim()) fail('Unsupported content outside local checklist sections; preserve it for explicit reconciliation');
  const scope=validateScope(parseJSON(Buffer.from(blocks[0][1])),expected),remaining=value.slice(progress.index+progress[0].length).replace(/^\r?\n/,'');
  const context=/^# Task context\r?$/m.exec(remaining);
  if(!context) fail('Local checklist requires a task-context section');
  const lines=remaining.slice(0,context.index).split(/\r?\n/).filter(line=>line.trim()),checkedOrdinals=[];
  if(lines.length!==scope.tasks.length) fail('Local checklist progress lost task definitions');
  lines.forEach((line,index)=>{
    const task=scope.tasks[index],row=/^- \[([ xX])\] ([1-9][0-9]*)\. (.+)$/.exec(line);
    if(!row||Number(row[2])!==task.ordinal||row[3]!==task.text) fail('Local progress cannot change agreed task definitions');
    if(row[1].toLowerCase()==='x') checkedOrdinals.push(task.ordinal);
  });
  const taskContext=remaining.slice(context.index+context[0].length).replace(/^\r?\n/,'').replace(/\r?\n$/,'');
  return {scope,scopeBlock:blocks[0][0],scopeBlockSha256:sha256(Buffer.from(blocks[0][0])),checkedOrdinals,taskContext};
}
function checklistBytes(scope,scopeBlock,checkedOrdinals,taskContext) {
  validateScope(scope);
  if(!ordinals(checkedOrdinals)||checkedOrdinals.some(n=>!scope.tasks.some(task=>task.ordinal===n))) fail('Local checklist progress names an unknown task');
  if(typeof taskContext!=='string') fail('Invalid task context');
  const rows=scope.tasks.map(task=>`- [${checkedOrdinals.includes(task.ordinal)?'x':' '}] ${task.ordinal}. ${task.text}`).join('\n');
  const bytes=Buffer.from(`# Agreed scope\n\n${scopeBlock}\n\n# Local progress\n\n${rows}\n\n# Task context\n${taskContext}\n`);
  parseLocalChecklist(bytes,scope.orderId);
  return bytes;
}
export function createLocalChecklist(orderId,originalBody,startedAt) {
  const parsed=parseWorkOrderBody(originalBody);
  if(!parsed||parsed.kind!=='order') fail('Cancellation requests and unrelated issues cannot be started');
  const scope={schemaVersion:1,orderId,originalBody,originalBodySha256:sha256(Buffer.from(originalBody)),goal:parsed.goal,tasks:parsed.tasks,startedAt};
  validateScope(scope);
  return checklistBytes(scope,'```designeritl-scope\n'+JSON.stringify(scope,null,2)+'\n```',[],'');
}
export function updateLocalChecklist(bytes,checkedOrdinals,taskContext) {
  const current=parseLocalChecklist(bytes);
  return checklistBytes(current.scope,current.scopeBlock,checkedOrdinals,taskContext);
}
export function readProjectRecord(root,relative,required=true) {
  const path=projectFile(root,relative,required);
  return existsSync(path)?readFileSync(path):null;
}
export function ensureProjectDirectory(root,relative) {
  safePath(relative);
  let path=realpathSync(resolve(root));
  for(const part of relative.split('/')) {
    path=join(path,part);
    if(existsSync(path)) {const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink()) fail('Unsafe project directory');}
    else mkdirSync(path);
  }
  return path;
}
export function observedOrderIssues(issues) {
  if(!Array.isArray(issues)) fail('Complete issue listing required');
  const seen=new Set(),result=[];
  for(const issue of issues) {
    if(!object(issue)||!positive(issue.number)||seen.has(issue.number)||typeof issue.body!=='string'||!['open','closed'].includes(String(issue.state).toLowerCase())) fail('Invalid or duplicated issue observation');
    seen.add(issue.number);
    if(issue.pull_request) continue;
    let parsed=null,error=null;
    try {parsed=parseWorkOrderBody(issue.body);} catch(reason) {error=reason.message;}
    result.push({issueNumber:issue.number,state:String(issue.state).toLowerCase(),body:issue.body,bodySha256:sha256(Buffer.from(issue.body)),parsed,error});
  }
  return result.sort((a,b)=>a.issueNumber-b.issueNumber);
}
export function orderIssueProblem(rows,number) {
  const row=rows.find(row=>row.issueNumber===number);
  if(row?.error)return `Issue #${number}: ${row.error}`;
  for(const targetNumber of [row?.parsed?.metadata.followsOrderNumber,row?.parsed?.metadata.cancelsOrderNumber]) {
    const target=rows.find(row=>row.issueNumber===targetNumber);
    if(target?.error)return `Issue #${number} relation targets malformed issue #${targetNumber}: ${target.error}`;
  }
  return null;
}
function fingerprintMap(value) {
  if(!object(value)||Object.entries(value).some(([number,entry])=>!/^([1-9][0-9]*)$/.test(number)||!positive(Number(number))||!exactKeys(entry,['bodySha256','state'])||!isHash(entry.bodySha256)||!['open','closed'].includes(entry.state))) fail('Unsupported order-observation record');
  return value;
}
export function designerFingerprintDigest(value) {return sha256(Buffer.from(JSON.stringify(fingerprintMap(value))));}
export function validateDesignerInboxRecord(bytes,context,expectedId=null,receipt=false) {
  const record=parseJSON(bytes);
  if(record.schemaVersion!==1||!uuid(record.reportId)||(expectedId!==null&&record.reportId!==expectedId)||record.projectRoot!==context.root||record.repositoryId!==context.config.repository.repositoryId) fail('Unsupported or conflicting designer inbox report identity');
  if(receipt) {
    if(!exactKeys(record,['schemaVersion','reportId','projectRoot','repositoryId','reportSha256','appliedFingerprintsSha256','disclosedAt'])||!isHash(record.reportSha256)||!isHash(record.appliedFingerprintsSha256)||!utc(record.disclosedAt)) fail('Invalid designer inbox report receipt');
    return record;
  }
  if(!exactKeys(record,['schemaVersion','reportId','projectRoot','repositoryId','createdAt','baseFingerprints','nextFingerprints','observations','startableOrderNumbers','cancellationRequestNumbers'])||!utc(record.createdAt)||!Array.isArray(record.observations)||!ordinals(record.observations.map(row=>row.issueNumber))) fail('Invalid designer inbox report');
  fingerprintMap(record.baseFingerprints);fingerprintMap(record.nextFingerprints);
  const next={...record.baseFingerprints},cancelTargets=new Set(),cancellations=[];
  for(const row of record.observations) {
    if(!exactKeys(row,['issueNumber','state','body','bodySha256','kind','error','change','agreedScopeSha256','scopeDiverged'])||!['open','closed'].includes(row.state)||typeof row.body!=='string'||sha256(Buffer.from(row.body))!==row.bodySha256||!['order','cancellation','invalid'].includes(row.kind)||!(row.agreedScopeSha256===null||isHash(row.agreedScopeSha256))) fail('Invalid saved order observation');
    let parsed=null,error=null;try{parsed=parseWorkOrderBody(row.body);}catch(reason){error=reason.message;}
    if(row.kind==='invalid') {if((parsed&&!error)||!text(row.error)) fail('Invalid malformed-order report');}
    else if(!parsed||error||parsed.kind!==row.kind||row.error!==null) fail('Saved order metadata mismatch');
    const prior=record.baseFingerprints[row.issueNumber],change=!prior?'new':prior.bodySha256!==row.bodySha256?'body-changed':prior.state!==row.state?'status-changed':null;
    if(row.change!==change||row.scopeDiverged!==(row.agreedScopeSha256!==null&&row.agreedScopeSha256!==row.bodySha256)) fail('Saved inbox change or scope-divergence mismatch');
    next[row.issueNumber]={bodySha256:row.bodySha256,state:row.state};
    if(row.kind==='cancellation') {cancellations.push(row.issueNumber);if(row.state==='open')cancelTargets.add(parsed.metadata.cancelsOrderNumber);}
  }
  const observed=observedOrderIssues(record.observations.map(row=>({number:row.issueNumber,state:row.state,body:row.body})));
  const legacyStartable=record.observations.filter(row=>row.kind==='order'&&row.state==='open'&&!cancelTargets.has(row.issueNumber)).map(row=>row.issueNumber);
  const startable=legacyStartable.filter(number=>!orderIssueProblem(observed,number));
  if(!same(next,record.nextFingerprints)||!(same(startable,record.startableOrderNumbers)||same(legacyStartable,record.startableOrderNumbers))||!same(cancellations,record.cancellationRequestNumbers)) fail('Saved inbox observation set mismatch');
  return record;
}
```

The writer uses stored entries, UTF-8 names, fixed DOS timestamp 1980-01-01, no encryption, ZIP64, extra fields, comments, or data descriptors. The reader accepts stored or raw-deflate entries in that subset, verifies local/central agreement and CRC, and refuses unknown attributes/types. Inventories include every regular file in the capture, sorted by path UTF-8 bytes. Digest records are `path NUL decimal-length NUL lowercase-sha256 LF` without a BOM. Every directory is an explicit ZIP entry. Manifests record all relative directory paths in sorted `directories`. Legacy version 2 manifests without that list imply only `assets/` and file ancestors. Captures containing additional empty directories must record them. The ZIP must contain exactly the captured root and declared directories.

`packageDelivery(manifestBytes, captureRoot)` returns one exact ZIP and a descriptor. Persist both for retry. `verifyDelivery(zip, descriptor)` validates descriptor, exact manifest hash, embedded evidence text and hashes, identities, complete archive contents, and payload inventory before extraction. Developer reception calls `receiveDelivery(zip, descriptor, absentStagingPath)` to inspect ZIP metadata, verify destination ancestors and known free capacity against twice the expanded size, perform bounded extraction, and reverify installed staging bytes. The parent staging directory must already exist on the configured destination filesystem. Unknown capacity, links in destination ancestors, occupied targets and any validation failure refuse completion. Low-level `extractZip(entries, absentStagingPath)` repeats path, byte-limit and capacity checks before writing. Re-inventory the installed capture before a receipt. The limits are 5,000 entries, 512 MiB total expanded bytes, 256 MiB per entry, and 100:1 per-entry expansion. File reservation verifies that the exact manifest fits within the same byte budget as the selected files.

Both manifests bind repository, order, delivery, kind, tag, UTC capture time, full inventory and payload hash, scope hash, local progress and the delivery note. A numbered prototype uses schema version 2, its version number and folder name. A file delivery uses schema version 3, `kind: send`, `payloadType: files`, `capturedFolder: files` and a complete sorted `directories` list. It omits the version number and carries null final evidence and unchecked ordinals. Absolute source paths stay in the designer's pending record.

Final evidence uses `evidence: {reassessment, decision}` with two required `{json: exactUTF8JSONText, sha256}` records. Reassessment has payload and scope hashes, `agreedScope` from the validated local checklist, and ordered `{ordinal,result,evidenceOrReason}` tasks. Reception reparses `agreedScope.originalBody`, recomputes its UTF-8 hash, checks repository and order identity and exact goal and task definitions, and requires the entire reassessment ordinal sequence to match that agreement.

`deliveredUncheckedOrdinals` includes every locally unchecked or not-fulfilled task in agreement order. Final decision schemaVersion 2 binds payload, scope, exact reassessment hash, exact unchecked ordinals, the genuine designer statement and UTC recordedAt. A decision records the designer's completion choice and never changes task progress. Nonfinal manifests have `evidence: null` and `deliveredUncheckedOrdinals: null`.

Configuration schemaVersion 2 contains role and repository plus the developer's destination where applicable. State, descriptors and pending records use schemaVersion 1. Unsupported formats are preserved and require explicit reconciliation under their producing version before upgrading; installation never resets project records or regenerates existing packages.

Release notes contain exactly one descriptor in a `designeritl-delivery` fenced JSON block. The descriptor identifies schemaVersion, repositoryId, orderNumber, deliveryId, tag, kind, assetName, assetBytes, manifestSha256 and zipSha256. Surrounding prose is a human note and cannot change machine identity. Hashes provide integrity inside the trusted private transport, not independent publisher authentication.

`capturePrototype(source, absentSnapshot)` runs only after the delivery identity and capture intent are saved. The snapshot parent must already exist. It preserves all directories and compares complete file inventories and directory lists before/copy/after; a mismatch or interruption leaves evidence in staging and never promotes a partial capture. It detects cooperating edits, not adversarial write-and-revert races. An existing snapshot is reconciled rather than overwritten.

`captureFiles(sourceFiles, absentSnapshot, selectedInventory)` applies the same capture checks to the reserved file selection. It compares both the source and copy against the exact preview inventory and preserves empty directories. A changed source requires an explicit reselection before any package or remote attempt.

For a packaged retry call `verifyPendingDelivery(pendingRoot, configuredRepositoryId)` before remote mutation. It verifies the saved identity, assignment token, exact manifest/ZIP/descriptor, frozen evidence files and captured tree. It deliberately does not read the editable source or trust `phase`. Preserve a failure as conflicting evidence; never repair it by repackaging newer source bytes.

## Load the installed integrity module

Keep temporary engine and driver modules outside the captured prototype and delivery snapshot. Use the file-writing tool to save this example as a temporary `.mjs` driver; keep source code out of shell commands. Pass reference paths and fence tags as separate Node arguments: `node DRIVER INSTALLED_FORMAT_REFERENCE integrity-v1`. Keep its imports and named-fence loader unchanged. After the smoke check succeeds, replace only the final smoke-check statement with the action's calls. Additional modules use `loadNamedBlock(process.argv[4], process.argv[5])` and further reference/tag pairs, for example the invoked skill's Orders reference with `orders-v1` or Designer Inbox reference with `designer-inbox-v1`. Retain drivers during interruption trials. This Node-only loader avoids Python dependencies and shell quoting of fenced source.

```javascript integrity-loader-v1
import { readFileSync } from 'node:fs';

async function loadNamedBlock(referencePath, tag) {
  if (!referencePath || !tag) throw Error('Pass the installed reference path and fence tag as Node arguments');
  const source = readFileSync(referencePath, 'utf8');
  const blocks = [...source.matchAll(/```javascript ([a-z0-9-]+)\r?\n([\s\S]*?)\r?\n```/g)].filter(block => block[1] === tag);
  if (blocks.length !== 1) throw Error('Expected exactly one named protocol block');
  return import('data:text/javascript;base64,' + Buffer.from(blocks[0][2], 'utf8').toString('base64'));
}
const integrity = await loadNamedBlock(process.argv[2], process.argv[3] || 'integrity-v1');

// Smoke check; replace this statement with the workflow's canonical calls.
console.log(integrity.sha256(Buffer.from('abc', 'utf8')));
```

The smoke check must print `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. Use only the explicitly invoked skill's installed Format reference. The temporary driver does not replace or reimplement the integrity module.
