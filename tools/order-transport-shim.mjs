// Maintainer-only controlled external boundary, excluded from installed bundles.
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {integrity} from './protocol.mjs';

const args=process.argv.slice(2),configPath=args.splice(0,2)[1];
if(!configPath) throw Error('Explicit --fixture-config path required');
const config=JSON.parse(readFileSync(configPath,'utf8'));
const endpoint=args.find(arg=>arg.startsWith('repos/'));
const option=name=>args[args.indexOf(name)+1];
const method=args.includes('--method')?option('--method'):args.includes('--input')?'POST':'GET';
const list=endpoint===`repos/${config.repository}/issues?state=all&per_page=100`;
const create=endpoint===`repos/${config.repository}/issues`&&method==='POST';
const log=value=>appendFileSync(config.log,JSON.stringify({args,method,endpoint,...value})+'\n');
if(config.blocked){log({forwarded:false,blocked:true});process.stderr.write('Controlled transport unavailable until retry.\n');process.exit(74);}
if(args[0]!=='api'||!endpoint?.startsWith(`repos/${config.repository}`)||(!['GET','POST'].includes(method))||(method==='POST'&&!create)) throw Error('Fixture refuses unbound or unsupported mutation');
if(list&&(!args.includes('--paginate')||!args.includes('--slurp'))) throw Error('Fixture requires complete paginated listings');
if(list&&config.incomplete){log({forwarded:false,incomplete:true});process.stderr.write('Injected failure while fetching next issue page.\n');process.exit(75);}
if(list&&config.staleComplete){log({forwarded:false,staleComplete:true});process.stdout.write('[[]]\n');process.exit(0);}
let input;
if(create){
  input=option('--input')==='-'?readFileSync(0):readFileSync(option('--input'));
  const body=JSON.parse(input),f=await integrity(pathToFileURL(config.formatReference)),context=f.readProject(config.project,'developer');
  if(context.mutationIntent) throw Error('Cannot submit before local replacement is completed');
  const request=context.state.pendingOrderCreations.find(record=>record.intendedBody===body.body);
  if(!request||request.title!==body.title||request.result!==null||request.submissionAttempted!==true||Object.keys(body).sort().join('|')!=='body|title') throw Error('Exact request and pre-submit attempt marker must be durably saved before issue creation');
  f.validatePendingOrderCreation(request,context.config.repository.repositoryId);
  log({savedBeforeSubmit:request});
}
const result=spawnSync(config.realGh,args,{input,encoding:null,windowsHide:true,maxBuffer:64*1024*1024});
log({forwarded:true,remoteExit:result.status,stdoutBytes:result.stdout?.length||0});
if(create&&config.loseCreate&&result.status===0){config.loseCreate=false;config.blocked=true;config.faultConsumed=true;writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');process.stderr.write('Injected successful issue create with lost response.\n');process.exit(73);}
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);process.exit(result.status??1);
