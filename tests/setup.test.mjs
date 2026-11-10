import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrity } from '../tools/protocol.mjs';

async function setup() {
  const text=readFileSync(new URL('../protocols/setup.md',import.meta.url),'utf8');
  const block=[...text.matchAll(/```javascript setup-v1\r?\n([\s\S]*?)\r?\n```/g)];
  assert.equal(block.length,1);
  return import(`data:text/javascript;base64,${Buffer.from(block[0][1]).toString('base64')}`);
}

test('setup creates a bound project for either role and preserves its existing records on retry or conflicting setup',async()=>{
  const s=await setup(), f=await integrity();
  for(const role of ['designer','developer']) {
    const root=mkdtempSync(join(tmpdir(),'ditl-setup-'));
    const config=s.projectConfiguration(role,{id:101,name:'transport',owner:{login:'alice'},private:true,permissions:{push:true}},'received');
    assert.equal(s.initializeProject(root,config,f).config.role,role);
    const path=join(root,'.designeritl/state.json'), before=readFileSync(path);
    s.initializeProject(root,config,f);
    assert.ok(readFileSync(path).equals(before));
    const replacement=structuredClone(config);replacement.repository.repositoryId=102;
    assert.throws(()=>s.initializeProject(root,replacement,f),/existing project/i);
    assert.ok(readFileSync(path).equals(before));
    writeFileSync(path,'{"schemaVersion":99}');
    assert.throws(()=>s.initializeProject(root,config,f),/Unsupported/);
    assert.equal(readFileSync(path,'utf8'),'{"schemaVersion":99}');
  }
});

test('designer onboarding provides a working starter that the next version copies',async()=>{
  const s=await setup(), f=await integrity();
  const root=mkdtempSync(join(tmpdir(),'ditl-starter-'));
  const config=s.projectConfiguration('designer',{id:101,name:'transport',owner:{login:'alice'},private:true,permissions:{push:true}});
  let context=s.initializeProject(root,config,f);
  const starter=f.inspectVersions(context).working;
  assert.equal(starter.number,1);
  const html=join(root,'versions',starter.folder,'index.html');
  assert.match(readFileSync(html,'utf8'),/<h1>Prototype<\/h1>/);
  assert.ok(existsSync(join(root,'versions',starter.folder,'assets')));
  writeFileSync(html,'<!doctype html><title>Edited prototype</title>');
  context=s.initializeProject(root,config,f);
  assert.equal(f.inspectVersions(context).versions.length,1);
  f.reserveVersion(context);
  f.stageVersion(f.readProject(root,'designer'));
  const next=f.finishVersion(f.readProject(root,'designer'));
  assert.equal(next.number,2);
  assert.equal(readFileSync(join(root,next.folder,'index.html'),'utf8'),'<!doctype html><title>Edited prototype</title>');
});

test('either starter can choose a personal account or an observed eligible organisation',async()=>{
  const s=await setup();
  const memberships=[
    {state:'active',role:'admin',organization:{login:'owners'}},
    {state:'active',role:'member',organization:{login:'allowed'},permissions:{can_create_repository:true}},
    {state:'active',role:'member',organization:{login:'unknown'},permissions:{can_create_repository:true}},
    {state:'pending',role:'admin',organization:{login:'pending'}},
  ];
  assert.deepEqual(s.eligibleOwners('alice',memberships,{allowed:{members_can_create_private_repositories:true}}),{eligible:['alice','owners','allowed'],unavailable:['unknown','pending']});
  assert.deepEqual(s.missingPrerequisites({node:'v22.19.0',git:null,gh:'gh version 2.92.0'}),['node','git']);
  assert.deepEqual(s.missingPrerequisites({node:'v22.20.0',git:'git version 2.44.0',gh:'gh version 2.92.0'}),[]);
});

test('joining requires confirmation of the exact repository and role before selecting an invitation',async()=>{
  const s=await setup(), identity={repositoryId:101,owner:'alice',name:'transport'};
  const invitations=[{id:55,repository:{id:101,owner:{login:'alice'},name:'transport'},invitee:{login:'bob'}}];
  assert.throws(()=>s.invitationToAccept(identity,'designer',false,invitations,'bob'),/confirmation/i);
  assert.equal(s.invitationToAccept(identity,'designer',true,invitations,'bob'),55);
  assert.equal(s.invitationToAccept(identity,'developer',true,[],'bob'),null);
  assert.throws(()=>s.invitationToAccept({...identity,repositoryId:102},'designer',true,invitations,'bob'),/identity/i);
  assert.throws(()=>s.invitationToAccept(identity,'designer',true,[...invitations,...invitations],'bob'),/multiple/i);
  assert.throws(()=>s.invitationToAccept(identity,'designer',true,invitations,'charlie'),/invitee/i);
  assert.throws(()=>s.invitationToAccept(identity,'tester',true,invitations,'bob'),/role/i);
});

test('join prompts carry only whitelisted transport identity and the other role, while local projects stay isolated',async()=>{
  const s=await setup(),f=await integrity();
  const prompt=s.joinPrompt({repositoryId:101,owner:'alice',name:'transport',token:'DO_NOT_COPY',localRoot:'C:/private'},'developer');
  assert.match(prompt,/https:\/\/github.com\/alice\/transport/);
  assert.match(prompt,/repository ID 101/);
  assert.match(prompt,/as developer/);
  assert.ok(prompt.includes('paalagain/ditl-workspace'));
  assert.match(prompt,/current folder and ask whether to use it/);
  assert.doesNotMatch(prompt,/DO_NOT_COPY|C:\/private|skip watching/);
  assert.match(s.joinPrompt({repositoryId:101,owner:'alice',name:'transport'},'designer'),/skip watching/);
  assert.throws(()=>s.joinPrompt({repositoryId:101,owner:'alice',name:'transport'},'developer','https://token@example.com/repo'),/identity\/source/);
  const a=mkdtempSync(join(tmpdir(),'ditl-setup-a-')),b=mkdtempSync(join(tmpdir(),'ditl-setup-b-'));
  s.initializeProject(a,s.projectConfiguration('designer',{id:101,owner:{login:'alice'},name:'transport',private:true,permissions:{push:true}}),f);
  s.initializeProject(b,s.projectConfiguration('developer',{id:202,owner:{login:'bob'},name:'other',private:true,permissions:{push:true}},'downloads'),f);
  assert.equal(f.readProject(a).config.repository.repositoryId,101);
  assert.equal(f.readProject(b).config.repository.repositoryId,202);
  assert.equal(f.readProject(b).deliveryDestination,join(b,'downloads'));
  assert.throws(()=>s.projectConfiguration(null,{id:101}),/Choose designer or developer/);
  assert.throws(()=>s.projectConfiguration('developer',{id:101,owner:{login:'alice'},name:'transport',private:false,permissions:{push:true}}),/private transport/);
});

function watchFixture({subscription,afterWrite,writeStatus=0,scope='repo',login='designer',remoteId=101,verifyLogin='designer',repositoryStatus=200,sso=false,missingDocument='https://docs.github.com/rest/activity/watching#get-a-repository-subscription'}={}) {
  const repository={id:101,name:'transport',owner:{login:'alice'},private:true,permissions:{push:true}};
  const endpoint='repos/alice/transport/subscription',calls=[];
  const response=(status,body)=>({
    status:status===200?0:1,
    stdout:['HTTP/2.0 '+status+' '+(status===200?'OK':'Error'),'X-OAuth-Scopes: '+scope,...(sso?['X-GitHub-SSO: required']:[]),'',JSON.stringify(body)].join('\r\n'),
  });
  const runGh=args=>{
    assert.deepEqual(args.slice(0,4),['api','--hostname','github.com','--include']);
    if(args[4]==='user')return response(200,{id:73,login:verifyLogin});
    if(args[4]==='repos/alice/transport')return response(repositoryStatus,{...repository,id:remoteId});
    if(args[4]===endpoint){
      calls.push('read');
      if(typeof subscription==='number')return response(subscription,{message:'Not Found',documentation_url:missingDocument});
      return response(200,{repository_url:'https://api.github.com/repos/alice/transport',...subscription});
    }
    assert.deepEqual(args.slice(4),['--method','PUT',endpoint,'-F','subscribed=true','-F','ignored=false']);
    calls.push('write');
    subscription=afterWrite??{subscribed:true,ignored:false};
    return {status:writeStatus,stdout:''};
  };
  return {repository,calls,options:{watching:{login,choice:'enable',runGh}}};
}

test('first designer setup enables a missing watch and verifies it even if the write response is lost',async()=>{
  const s=await setup(),f=await integrity();
  const root=mkdtempSync(join(tmpdir(),'ditl-watch-'));
  const {repository,calls,options}=watchFixture({subscription:404,writeStatus:null});
  const config=s.projectConfiguration('designer',repository);
  const result=s.initializeProject(root,config,f,options);
  assert.deepEqual(calls,['read','write','read']);
  assert.equal(result.watching.status,'watching');
  assert.equal(f.readProject(root).config.repository.repositoryId,repository.id);

  const afterUnwatch=watchFixture({subscription:404});
  s.initializeProject(root,config,f,afterUnwatch.options);
  assert.deepEqual(afterUnwatch.calls,[]);
});

test('a designer setup that finishes while another checks watching keeps its watch choice',async()=>{
  const s=await setup(),f=await integrity();
  const root=mkdtempSync(join(tmpdir(),'ditl-watch-'));
  const {repository,calls,options}=watchFixture({subscription:404});
  const config=s.projectConfiguration('designer',repository);
  const {runGh}=options.watching;
  options.watching.runGh=args=>{
    const result=runGh(args);
    if(args[4]?.endsWith('/subscription')) {
      const completed=s.initializeProject(root,config,f,{watching:{...options.watching,choice:'skip'}});
      assert.equal(completed.watching.status,'skipped');
    }
    return result;
  };
  assert.throws(()=>s.initializeProject(root,config,f,options),/Project appeared during setup/);
  assert.deepEqual(calls,['read']);
  assert.equal(f.readProject(root).config.repository.repositoryId,repository.id);
});

test('designer setup preserves every existing subscription',async()=>{
  const s=await setup(),f=await integrity();
  for(const observed of [{subscribed:true,ignored:false},{subscribed:false,ignored:true},{subscribed:false,ignored:false}]){
    const root=mkdtempSync(join(tmpdir(),'ditl-watch-'));
    const {repository,calls,options}=watchFixture({subscription:observed});
    const result=s.initializeProject(root,s.projectConfiguration('designer',repository),f,options);
    assert.deepEqual(calls,['read']);
    assert.equal(result.watching.status,observed.subscribed?'watching':'preserved');
    if(!observed.subscribed)assert.equal(result.watching.ignored,observed.ignored);
  }
});

test('designer setup finishes with watching unconfirmed when access or readback is uncertain',async()=>{
  const s=await setup(),f=await integrity();
  for(const [settings,expected] of [
    [{subscription:403},['read']],
    [{subscription:404,scope:''},['read']],
    [{subscription:404,missingDocument:'https://docs.github.com/rest'},['read']],
    [{subscription:{subscribed:true,ignored:false,repository_url:'https://api.github.com/repos/alice/other'}},['read']],
    [{subscription:404,sso:true},[]],
    [{subscription:404,remoteId:102},[]],
    [{subscription:404,verifyLogin:'other-account'},[]],
    [{subscription:404,repositoryStatus:404},[]],
    [{subscription:404,afterWrite:500},['read','write','read']],
  ]){
    const root=mkdtempSync(join(tmpdir(),'ditl-watch-'));
    const {repository,calls,options}=watchFixture(settings);
    const result=s.initializeProject(root,s.projectConfiguration('designer',repository),f,options);
    assert.deepEqual(calls,expected);
    assert.equal(result.watching.status,'unconfirmed');
    assert.equal(f.readProject(root).config.role,'designer');
  }
});

test('skip, developer setup, and an invalid local project never touch GitHub watching',async()=>{
  const s=await setup(),f=await integrity();
  const {repository}=watchFixture();
  let calls=0;
  const watching={login:'designer',choice:'enable',runGh:()=>{calls++;}};
  const designer=s.projectConfiguration('designer',repository);
  const skipRoot=mkdtempSync(join(tmpdir(),'ditl-watch-skip-'));
  assert.equal(s.initializeProject(skipRoot,designer,f,{watching:{...watching,choice:'skip'}}).watching.status,'skipped');
  const developerRoot=mkdtempSync(join(tmpdir(),'ditl-watch-developer-'));
  assert.equal(s.initializeProject(developerRoot,s.projectConfiguration('developer',repository),f,{watching}).watching,undefined);
  const invalidRoot=mkdtempSync(join(tmpdir(),'ditl-watch-invalid-'));
  writeFileSync(join(invalidRoot,'.designeritl'),'foreign content');
  assert.throws(()=>s.initializeProject(invalidRoot,designer,f,{watching}));
  assert.equal(calls,0);
});
