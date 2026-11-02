import {existsSync,lstatSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

function contents(root,prefix='') {
  return readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
    const path=prefix+entry.name;
    if(entry.isSymbolicLink())throw Error(`Linked pending evidence: ${path}`);
    if(entry.isDirectory())return [path+'/',...contents(join(root,entry.name),path+'/')];
    if(!entry.isFile())throw Error(`Unsupported pending evidence: ${path}`);
    return [path];
  });
}
// Verification tooling counts supported operations, retaining/disclosing module-only failed drivers.
export function inspectPending(root,{repositoryId,orderNumber}) {
  const operations=[],abortedDrivers=[];
  for(const entry of readdirSync(root,{withFileTypes:true})) {
    if(!entry.isDirectory()||entry.isSymbolicLink())throw Error(`Unexpected pending entry: ${entry.name}`);
    const directory=join(root,entry.name),recordPath=join(directory,'record.json');
    if(!existsSync(recordPath)) {
      const retained=contents(directory);
      if(retained.some(path=>path!=='modules/'&&!path.startsWith('modules/')))throw Error(`Unrecorded delivery evidence requires reconciliation: ${directory}`);
      abortedDrivers.push({directory,retained,reason:'Module-only aborted driver; no operation record or snapshot'});continue;
    }
    if(lstatSync(recordPath).isSymbolicLink()||!lstatSync(recordPath).isFile())throw Error(`Unsafe operation record: ${recordPath}`);
    let record;try {record=JSON.parse(readFileSync(recordPath,'utf8'));}catch {throw Error(`Malformed operation record retained: ${recordPath}`);}
    if(!record||typeof record!=='object'||Array.isArray(record))throw Error(`Malformed operation record retained: ${recordPath}`);
    if(record.schemaVersion!==1)throw Error(`Unsupported operation record retained: ${recordPath}`);
    if(record.repositoryId!==repositoryId||record.orderNumber!==orderNumber||record.deliveryId!==entry.name||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(record.deliveryId)||record.kind!=='final'||record.tag!==`order-${orderNumber}/final`||record.versionNumber!==1||record.capturedFolder!=='design.v1')throw Error(`Conflicting or invalid operation identity retained: ${recordPath}`);
    operations.push({directory,record});
  }
  return {operations,abortedDrivers};
}
