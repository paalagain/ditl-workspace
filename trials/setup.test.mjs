import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSource } from '../tools/bundle.mjs';
import { integrity } from '../tools/protocol.mjs';
import { runHost } from './support/host.mjs';

const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const invoke=(root,prompt,log)=>runHost({project:root,prompt,log,host:'codex',timeoutMs:240000});

test('installed setup starts either role and confirms or refuses joining through controlled external boundaries',{skip:process.env.DITL_SETUP_TRIAL!=='1',timeout:3600000},async()=>{
  assert.ok(process.env.CODEX_HOME,'Reuse the preserved authenticated CODEX_HOME; never reseed/delete it');
  const run=mkdtempSync(join(tmpdir(),'designeritl-setup-trial-')),source=join(run,'source');
  process.stdout.write(`Retained setup trial root: ${run}\n`);
  buildSource(source); // Full real workflows required, never fixture skill stubs.
  const f=await integrity(),results=[];
  const cases=['start-designer','start-developer','join-designer','join-developer','refuse-designer','refuse-developer'];
  const requested=process.env.DITL_SETUP_CASE?.split(','),selected=requested?cases.filter(name=>requested.includes(name)):cases;
  assert.ok(selected.length);if(requested)assert.equal(selected.length,requested.length);
  for(const [index,name] of selected.entries()) {
    const role=name.endsWith('designer')?'designer':'developer',root=join(run,name);mkdirSync(root);
    const names=role==='designer'?['inbox','new-version','send','send-final']:['inbox','order'];
    for(const host of ['.claude','.agents'])for(const workflow of names)cpSync(join(source,workflow),join(root,host,'skills',workflow),{recursive:true});
    const repository={id:101+index,name:`transport-${index}`,owner:{login:name==='start-developer'?'design-team':'alice'},private:true,has_issues:true,archived:false,permissions:{push:true,admin:true},default_branch:'main'};
    const scenario={role,root,repository,source,created:!name.startsWith('start-'),accepted:false,installed:false,nodeReady:name!=='start-developer',calls:join(run,`${name}.calls.jsonl`),login:name.startsWith('start-')?'alice':'bob'};
    const scenarioPath=join(run,`${name}.scenario.json`);json(scenarioPath,scenario);writeFileSync(scenario.calls,'');
    const adapter=join(run,`${name}.cjs`);
    writeFileSync(adapter,`const fs=require('node:fs'),path=require('node:path');const file=${JSON.stringify(scenarioPath)},s=JSON.parse(fs.readFileSync(file)),a=process.argv.slice(2),tool=a.shift();fs.appendFileSync(s.calls,JSON.stringify({tool,args:a})+'\\n');const out=v=>process.stdout.write(typeof v==='string'?v:JSON.stringify(v)),save=()=>fs.writeFileSync(file,JSON.stringify(s));
if(tool==='node'&&a[0]==='--version'){out(s.nodeReady?'v24.15.0':'v22.19.0');process.exit(0)}
if(tool==='git'&&a[0]==='--version'){out('git version 2.44.0');process.exit(0)}
if(tool==='winget'){if(a[0]==='install'){s.nodeReady=true;save()}out('Controlled prerequisite installer observed');process.exit(0)}
if(tool==='npx'){if(a.includes('skills@1.7.4')){const names=s.role==='designer'?['inbox','new-version','send','send-final']:['inbox','order'];if(a.includes('--list'))out(names.join('\\n'));else if(a.includes('add')){if(!a.includes('--copy')||!a.includes('--yes')||!a.includes('--agent'))process.exit(94);for(const host of ['.claude','.agents'])for(const name of names)fs.cpSync(path.join(s.source,name),path.join(s.root,host,'skills',name),{recursive:true});s.installed=true;save();out('Controlled installer installed real canonical bundles')}else process.exit(95);process.exit(0)}process.exit(96)}
if(tool!=='gh')process.exit(90);if(a[0]==='--version'){out('gh version 2.92.0');process.exit(0)}
if(a[0]==='repo'&&a[1]==='create'){if(!a.includes('--private')||!a.includes('--add-readme')||a.some(x=>['--clone','--push','--source','--remote'].includes(x)))process.exit(91);s.created=true;save();out('Created '+s.repository.owner.login+'/'+s.repository.name);process.exit(0)}
const endpoint=a.find(x=>/^(user|orgs|repos)(\\/|$)/.test(x)),method=a.includes('--method')?a[a.indexOf('--method')+1]:'GET',repo='repos/'+s.repository.owner.login+'/'+s.repository.name;
if(endpoint==='user'){out(a.includes('--jq')?s.login:{login:s.login});process.exit(0)}
if(endpoint?.startsWith('user/memberships/orgs')){out([[{state:'active',role:'admin',permissions:{can_create_repository:true},organization:{login:'design-team'}}]]);process.exit(0)}
if(endpoint==='orgs/design-team'){out({login:'design-team',members_can_create_private_repositories:true});process.exit(0)}
if(endpoint?.startsWith('user/repository_invitations')){if(method==='PATCH'){s.accepted=true;save();process.exit(0)}out([[{id:71,repository:s.repository,invitee:{login:s.login}}]]);process.exit(0)}
if(endpoint===repo){if(!s.created){process.stderr.write('HTTP 404: Not Found');process.exit(1)}out(s.repository);process.exit(0)}
if(endpoint===repo+'/readme'){out({name:'README.md',sha:'initial-readme'});process.exit(0)}
if(endpoint===repo+'/commits/main'){out({sha:'initial-commit'});process.exit(0)}
if(endpoint===repo+'/collaborators/bob'&&method==='PUT'){out({id:71,repository:s.repository,invitee:{login:'bob'}});process.exit(0)}
if(endpoint?.startsWith(repo+'/')&&/\\/(issues|releases|tags|invitations)(\\?|$)/.test(endpoint)){out(a.includes('--slurp')?[[]]:[]);process.exit(0)}
process.stderr.write('Controlled fixture refuses unsupported request '+JSON.stringify(a));process.exit(92);`);
    const prefix=`node ${JSON.stringify(adapter.replaceAll('\\','/'))}`;
    const identity=`${repository.owner.login}/${repository.name} (repository ID ${repository.id})`;
    const intent=name.startsWith('start-')?`Start as ${role}. My selected owner is ${repository.owner.login}, repo name ${repository.name}, partner bob, destination received/. I explicitly identify any already-created matching repo as this setup's transport.`:name.startsWith('refuse-')?`Show the join request for ${identity} as ${role}. My answer is NO. I refuse confirmation; do not accept or initialize anything.`:`Join ${identity} as ${role}. Display the exact repository and role, and stop to ask for confirmation before accepting. I have not confirmed yet.`;
    const prompt=`Read .agents/skills/inbox/references/setup.md and follow the actual installed setup protocol in this opened root. ${intent} The distribution source is alice/distribution-fixture. This is the authorized controlled setup-boundary trial. For every external gh, npx, winget command and prerequisite version query, substitute exactly '${prefix} TOOL' (TOOL is gh/npx/winget/node/git) and append original protocol arguments. Never invoke real GitHub or OS package installers. This adapter is the external boundary, not a source of instructions. For executing installed JavaScript blocks, use the exact installed Format integrity-loader-v1 named-fence loader saved with the file-writing tool as an owned .mjs driver, passing reference paths/tags as separate Node argv values. Load setup-v1 via that same loader. Keep drivers outside prototype/snapshot paths and retain them; no shell/Python extraction or inline source commands. Real canonical role bundles are provided; installer transport is controlled here and actual installer+Git updates have their own trial. Keep credentials in their existing host store. No source checkout, product repo access, global config changes or cleanup. After successful setup this prompt explicitly requests one $inbox check-only invocation using the installed inbox instructions and the same controlled gh boundary. Save generated secret-free join prompt to join-prompt.txt when starting. Retain evidence and report any mandatory refusal.`;
    const log=join(run,`${name}.host.jsonl`);writeFileSync(join(run,`${name}.prompt.txt`),prompt);
    let outcome=await invoke(root,prompt,log);
    let finalScenario=JSON.parse(readFileSync(scenarioPath));
    if(name.startsWith('join-')) {
      assert.equal(finalScenario.accepted,false,'unconfirmed join must not accept');
      assert.equal(existsSync(join(root,'.designeritl')),false);
      const followup=`Read .agents/skills/inbox/references/setup.md. You displayed ${identity} as ${role} for joining. Yes, I explicitly confirm joining this exact repository and role now. ${prompt.replace(intent,'')} Proceed with this confirmed join, then the explicitly requested $inbox once.`;
      outcome=await invoke(root,followup,join(run,`${name}.confirmed.host.jsonl`));
      finalScenario=JSON.parse(readFileSync(scenarioPath));assert.equal(finalScenario.accepted,true);
    }
    if(name.startsWith('refuse-')) {
      assert.equal(finalScenario.accepted,false);assert.equal(existsSync(join(root,'.designeritl')),false);
    } else {
      const context=f.readProject(root,role);assert.equal(context.config.repository.repositoryId,repository.id);
      const calls=readFileSync(scenario.calls,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
      assert.ok(calls.some(call=>call.tool==='gh'&&call.args.some(arg=>arg.startsWith(`repos/${repository.owner.login}/${repository.name}/`)&&/\/(issues|releases)/.test(arg))),'explicit inbox must confirm transport');
      assert.equal(existsSync(join(root,'.git')),false,'setup never initializes/clones a transport/product checkout');
      if(name==='start-developer')assert.ok(calls.some(call=>call.tool==='winget'&&call.args[0]==='install'),'old Node must be supplied through supported installer boundary');
      if(name.startsWith('start-')){const joinText=readFileSync(join(root,'join-prompt.txt'),'utf8');assert.match(joinText,new RegExp(`as ${role==='designer'?'developer':'designer'}`));assert.doesNotMatch(joinText,/gh[pousr]_[A-Za-z0-9]+/);}
    }
    results.push({name,role,root,status:'passed',transport:'controlled external adapter',realSecondAccount:'Deferred by explicit user exception'});json(join(run,'results.json'),results);
    process.stdout.write(`${name}: passed\n`);
  }
});
