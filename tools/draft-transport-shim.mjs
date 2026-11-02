// Maintainer-only real transport boundary. Never shipped in role bundles.
import {appendFileSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {integrity} from './protocol.mjs';

const args=process.argv.slice(2),configPath=args[0]==='--fixture-config'?args.splice(0,2)[1]:null;
if(!configPath)throw Error('Explicit fixture configuration required');
const config=JSON.parse(readFileSync(configPath,'utf8'));
const option=name=>args[args.indexOf(name)+1],endpoint=args.find(arg=>arg.startsWith('repos/'));
const cliCreate=args[0]==='release'&&args[1]==='create';
const method=(cliCreate?'POST':args.includes('--method')?option('--method'):args.includes('-X')?option('-X'):args.includes('--input')?'POST':'GET').toUpperCase();
const create=cliCreate||(endpoint===`repos/${config.repository}/releases`&&method==='POST'),list=endpoint===`repos/${config.repository}/releases?per_page=100`&&method==='GET';
const log=value=>appendFileSync(config.log,JSON.stringify({at:new Date().toISOString(),args,method,endpoint,...value})+'\n');
const bound=endpoint?.startsWith(`repos/${config.repository}/`)||endpoint===`repos/${config.repository}`;
const scopedCommand=['release','issue'].includes(args[0])&&(option('--repo')===config.repository||option('-R')===config.repository)&&['view','download','upload','edit','close','create'].includes(args[1]);
const expectedMutation=method==='GET'||create||(method==='POST'&&new RegExp(`^repos/${config.repository}/releases/[0-9]+/assets(?:\\?.*)?$`).test(endpoint||''))||(method==='PATCH'&&new RegExp(`^repos/${config.repository}/(?:releases|issues)/[0-9]+$`).test(endpoint||''));
if(!(scopedCommand||(args[0]==='api'&&bound&&expectedMutation)))throw Error('Fixture refuses unsupported or unbound request');
if(list&&(!args.includes('--paginate')||!args.includes('--slurp')))throw Error('Fixture requires complete release listing');
if(list&&config.staleComplete){log({forwarded:false,staleComplete:true});process.stdout.write('[[]]\n');process.exit(0);}
let input;
if(create){
  log({createRequested:true});
  if(!cliCreate)input=option('--input')==='-'?readFileSync(0):readFileSync(option('--input'));
  const body=cliCreate?{tag_name:args[2],draft:args.includes('--draft'),body:readFileSync(option('--notes-file'),'utf8')}:JSON.parse(input),f=await integrity(pathToFileURL(config.formatReference)),context=f.readProject(config.project,'designer');
  if(context.mutationIntent)throw Error('Draft attempt must be installed before request');
  const pending=join(config.project,'.designeritl/pending',config.deliveryId),saved=f.verifyPendingDelivery(pending,context.config.repository.repositoryId),attempt=saved.record.draftCreation?.attempts.at(-1);
  if(!attempt||attempt.nonDispatchProof!==null||body.draft!==true||body.tag_name!==saved.record.tag||!body.body.includes(JSON.stringify(saved.descriptor)))throw Error('Exact draft descriptor and durable unresolved attempt required');
  log({savedBeforeSubmit:attempt,deliveryId:saved.record.deliveryId,tag:saved.record.tag,descriptor:saved.descriptor});
  if(config.beforeOnce){
    config.beforeOnce=false;writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
    const proof={schemaVersion:1,repositoryId:context.config.repository.repositoryId,deliveryId:config.deliveryId,tag:saved.record.tag,attemptId:attempt.attemptId,descriptorSha256:attempt.descriptorSha256,kind:'controlled-before-forward',requestDispatched:false,statusCode:null,observedAt:new Date().toISOString()},path=join(pending,'evidence',`draft-nondispatch-${attempt.attemptId}.json`);
    mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',flush:true});
    log({forwarded:false,controlledBeforeForward:true,attemptId:attempt.attemptId,proofPath:path});process.stderr.write('Controlled before-forward refusal; independent bound proof saved at '+path+'\n');process.exit(72);
  }
}
const result=spawnSync(config.realGh,args,{input,encoding:null,windowsHide:true,maxBuffer:64*1024*1024});
log({forwarded:true,remoteExit:result.status,stdoutBytes:result.stdout?.length||0});
if(create&&config.loseCreate&&result.status===0){config.loseCreate=false;config.staleComplete=true;config.faultConsumed=true;writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');log({lostCreateResponse:true});process.stderr.write('Injected successful draft creation with lost response. Subsequent release lists deliberately lag.\n');process.exit(73);}
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error)process.stderr.write(result.error.message+'\n');process.exit(result.status??1);
