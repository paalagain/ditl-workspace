// Maintainer-only real transport fault/crossing adapter, excluded from bundles.
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),configPath=args.splice(0,2)[1],config=JSON.parse(readFileSync(configPath,'utf8'));
const log=value=>appendFileSync(config.log,JSON.stringify({args,...value})+'\n'),save=()=>writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
const endpoint=args.find(arg=>arg.startsWith('repos/')),option=name=>args[args.indexOf(name)+1];
const bound=endpoint?.startsWith(`repos/${config.repository}`)||option('--repo')===config.repository;
if(!bound)throw Error('Cancellation fixture refuses unbound transport');
if(config.blocked){log({forwarded:false,blocked:true});process.stderr.write('Injected transport interruption until retry\n');process.exit(74);}
const publish=args[0]==='release'&&args[1]==='edit'&&args.includes('--draft=false');
if(publish&&config.crossingBody&&!config.crossingNumber){const created=spawnSync(config.realGh,['api','--method','POST',`repos/${config.repository}/issues`,'--input','-'],{input:JSON.stringify({title:'Crossing cancellation',body:config.crossingBody}),encoding:'utf8',windowsHide:true});if(created.status!==0)throw Error('Crossing request injection failed: '+created.stderr);config.crossingNumber=JSON.parse(created.stdout).number;save();log({crossingNumber:config.crossingNumber});}
const close=args[0]==='issue'&&args[1]==='close'&&Number(args[2])===config.loseTargetClose;
const input=option('--input')==='-'?readFileSync(0):undefined,result=spawnSync(config.realGh,args,{input,encoding:null,windowsHide:true,maxBuffer:64*1024*1024});
log({forwarded:true,remoteExit:result.status,stdoutBytes:result.stdout?.length||0,publish,close});
if(close&&result.status===0&&!config.faultConsumed){config.faultConsumed=true;config.blocked=true;save();process.stderr.write('Injected lost successful target-close response\n');process.exit(73);}
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);process.exit(result.status??1);
