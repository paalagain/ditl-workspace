import {appendFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {productFaultPoint} from '../trials/support/product.mjs';

// Maintainer transport boundary. Every non-invitation effect is real gh.
export function main(configPath,args) {
  const config=JSON.parse(readFileSync(configPath,'utf8'));if(config.schemaVersion!==1)throw Error('Unknown product-boundary configuration');
  const append=value=>appendFileSync(config.calls,JSON.stringify({recordedAt:new Date().toISOString(),args,...value})+'\n');
  const fault=existsSync(config.fault)?JSON.parse(readFileSync(config.fault,'utf8')):null;
  if(fault?.blocked){append({blocked:true,point:fault.point});process.stderr.write('Injected post-effect transport outage: actual state unknown to this invocation.\n');return 88;}
  const endpoint=args.find(arg=>arg.startsWith('repos/')),method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
  if(method==='PUT'&&/\/collaborators\//.test(endpoint||'')) {
    if(!endpoint.endsWith('/collaborators/fixture-partner'))throw Error('No real invitation is authorized in this trial');
    const result=spawnSync('gh',['api',endpoint.slice(0,endpoint.indexOf('/collaborators/'))],{encoding:'utf8',windowsHide:true});
    if(result.status!==0){append({status:result.status});process.stderr.write(result.stderr||'');return result.status||1;}
    const repository=JSON.parse(result.stdout);append({controlledInvite:true,actuallyInvited:false,repositoryId:repository.id});process.stdout.write(JSON.stringify({id:160000,repository,invitee:{login:'fixture-partner'}}));return 0;
  }
  const input=args.includes('--input')&&args[args.indexOf('--input')+1]==='-'?readFileSync(0):undefined;
  const result=spawnSync(config.command||'gh',[...(config.prefixArgs||[]),...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),point=fault&&productFaultPoint(args,fault);
  if(fault?.point==='order-list-lag'&&result.status===0) {
    if(method==='POST'&&endpoint===`repos/${fault.repository}/issues`) {
      const created=JSON.parse(result.stdout),next={...fault,created:[...(fault.created||[]),{number:created.number,input:input?.toString('utf8'),response:created}],remaining:2};writeFileSync(config.fault,JSON.stringify(next,null,2)+'\n');append({status:0,orderCreated:created.number});process.stdout.write(result.stdout);return 0;
    }
    if(method==='GET'&&endpoint?.split('?')[0]===`repos/${fault.repository}/issues`&&fault.remaining>0&&fault.created?.length) {
      const pages=JSON.parse(result.stdout),hidden=new Set(fault.created.map(row=>row.number)),concealed=pages.flat().filter(row=>hidden.has(row.number));
      if(concealed.length) {const filtered=pages.map(page=>page.filter(row=>!hidden.has(row.number)));writeFileSync(config.fault,JSON.stringify({...fault,remaining:fault.remaining-1,lookups:[...(fault.lookups||[]),{actual:pages,returned:filtered}]},null,2)+'\n');append({status:0,controlledLag:true,concealed:concealed.map(row=>row.number)});process.stdout.write(JSON.stringify(filtered));return 0;}
    }
  }
  if(result.status===0&&fault?.point===point&&!fault.consumed) {
    writeFileSync(config.fault,JSON.stringify({...fault,consumed:true,blocked:true,actualStatus:result.status,actualStdout:result.stdout,actualStderr:result.stderr,observedAt:new Date().toISOString()},null,2)+'\n');append({status:result.status,interceptedSuccess:true,point});process.stderr.write(`Injected lost ${point} response after actual successful gh effect; transport remains unavailable.\n`);return 89;
  }
  append({status:result.status,controlledInvite:false});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');return result.status??1;
}
