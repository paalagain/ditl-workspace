// Maintainer-only transport boundary. Never included in installed skill bundles.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
const configPath=args[0]==='--fixture-config'?args.splice(0,2)[1]:process.env.DITL_GH_FAULT_CONFIG;
if(!configPath) throw Error('DITL_GH_FAULT_CONFIG is required');
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.schemaVersion!==1||typeof config.repository!=='string'||!config.repository.includes('/')||typeof config.realGh!=='string'||!Array.isArray(config.faults)||typeof config.log!=='string') throw Error('Invalid fault fixture configuration');
const endpoint=args.find(arg=>/^(?:https:\/\/[^/]+\/)?(?:api\/v3\/)?repos\//.test(arg.replace(/^\//,'')));
const option=name=>{const index=args.indexOf(name);return index<0?args.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1):args[index+1];};
const field=name=>args.some(arg=>arg===`${name}=false`||arg===`${name}=closed`);
const method=(option('--method')||option('-X')||(args.includes('-f')||args.includes('-F')||args.includes('--input')?'POST':'GET')).toUpperCase();
let body={};
if(option('--input')&&option('--input')!=='-') try {body=JSON.parse(readFileSync(option('--input'),'utf8'));} catch {}
let operation='read';
if(args[0]==='release'&&args[1]==='create') operation='draft.create';
if(args[0]==='release'&&args[1]==='upload') operation='asset.upload';
if(args[0]==='release'&&args[1]==='edit'&&(args.includes('--draft=false')||option('--draft')==='false')) operation='release.publish';
if(args[0]==='issue'&&args[1]==='close') operation='order.close';
if(args[0]==='api'&&endpoint&&method!=='GET') {
  if(/\/releases(?:\?.*)?$/.test(endpoint)&&method==='POST') operation='draft.create';
  else if(/\/releases\/\d+(?:\?.*)?$/.test(endpoint)&&method==='PATCH'&&(field('draft')||body.draft===false)) operation='release.publish';
  else if(/\/releases\/\d+\/assets(?:\?.*)?$/.test(endpoint)&&method==='POST') operation='asset.upload';
  else if(/\/issues\/\d+(?:\?.*)?$/.test(endpoint)&&method==='PATCH'&&(field('state')||body.state==='closed')) operation='order.close';
  else operation='other.mutation';
}
const repository=option('--repo')||option('-R');
if(operation!=='read'&&repository!==config.repository&&!endpoint?.includes(`repos/${config.repository}/`)&&!endpoint?.endsWith(`repos/${config.repository}`)) throw Error('Fault fixture refuses mutation outside its dedicated repository');
const observe=value=>appendFileSync(config.log,JSON.stringify({at:new Date().toISOString(),operation,args,...value})+'\n');
const save=()=>writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
if(config.blocked) {observe({forwarded:false,blocked:true});process.stderr.write('Fixture interruption: transport unavailable until the next invocation.\n');process.exit(74);}
const fault=config.faults.find(item=>item.remaining>0&&item.operation===operation);
if(fault) {
  if(!['before','after'].includes(fault.mode)) throw Error('Unknown fault mode');
  fault.remaining--; if(fault.barrier) config.blocked=true; save();
  if(fault.mode==='before') {observe({fault:fault.id,forwarded:false});process.stderr.write(`Injected pre-request failure ${fault.id}\n`);process.exit(72);}
}
const input=option('--input')==='-'?readFileSync(0):undefined;
const result=spawnSync(config.realGh,[...(config.realArgs||[]),...args],{encoding:null,windowsHide:true,maxBuffer:64*1024*1024,stdio:[input?'pipe':'inherit','pipe','pipe'],input});
observe({fault:fault?.id||null,forwarded:true,remoteExit:result.status,stdoutBytes:result.stdout?.length||0});
if(fault&&result.status===0) {
  if(fault.holdAfter) {
    config.holdingFault=fault.id; save();
    // Controller kills the host tree at this named boundary, after remote effect.
    const deadline=Date.now()+120000;
    while(Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,250));
  }
  process.stderr.write(`Injected lost response ${fault.id}\n`);process.exit(73);
}
if(result.stdout) process.stdout.write(result.stdout);
if(result.stderr) process.stderr.write(result.stderr);
if(result.error) process.stderr.write(result.error.message+'\n');
process.exit(result.status??1);
