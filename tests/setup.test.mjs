import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  assert.doesNotMatch(prompt,/DO_NOT_COPY|C:\/private/);
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
