import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSource } from '../tools/bundle.mjs';

test('published Git source supports installer update followed by copy-preserving reinstall in both hosts',{skip:process.env.DITL_INSTALLER_TRIAL!=='1',timeout:600000},()=>{
  const run=mkdtempSync(join(tmpdir(),'designeritl-installer-trial-')), source=join(run,'distribution'), project=join(run,'project');
  mkdirSync(source);mkdirSync(project);
  process.stdout.write(`Retained installer trial root: ${run}\n`);
  const environment={...process.env,DISABLE_TELEMETRY:'1',XDG_STATE_HOME:join(run,'native-state')};
  const evidence={run,commands:[],secondAccountTrial:'Not exercised: user explicitly deferred real second-account invitation/join.'};
  const execute=(command,args,cwd=project)=>{
    const result=spawnSync(command,args,{cwd,env:environment,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
    const ordinal=evidence.commands.length;
    writeFileSync(join(run,`${ordinal}.stdout.log`),result.stdout||'');writeFileSync(join(run,`${ordinal}.stderr.log`),result.stderr||'');
    evidence.commands.push({command,args,cwd,status:result.status,error:result.error?.message});
    writeFileSync(join(run,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    assert.equal(result.status,0,`Command failed; see ${run}/${ordinal}.stdout.log`);
    return result.stdout.trim();
  };
  const npx=process.env.DITL_NPX_ENTRY||join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js');
  assert.ok(existsSync(npx),'Set DITL_NPX_ENTRY to the installed npm npx CLI');
  const productRoot=dirname(dirname(fileURLToPath(import.meta.url)));
  evidence.productRevision=execute('git',['rev-parse','HEAD'],productRoot);
  evidence.productWorkingTree=execute('git',['status','--porcelain'],productRoot);
  const full=process.env.DITL_INSTALLER_FULL_ROLES==='1';
  const participants=full?[{role:'designer',names:['inbox','new-version','send','send-final']},{role:'developer',names:['inbox','order']}]:[{role:'early-inbox-fixture',names:['inbox']}];
  for(const participant of participants){participant.root=join(project,participant.role);mkdirSync(participant.root);}
  evidence.coverage=full?'complete real role workflows':'early inbox distribution fixture only';
  buildSource(join(source,'skills'),{complete:full});
  writeFileSync(join(source,'.gitattributes'),'/skills/** -text\n');
  execute('git',['init'],source);
  execute('git',['add','.'],source);
  execute('git',['-c','user.name=DesignerITL installer fixture','-c','user.email=fixture@example.invalid','commit','-m','Installer fixture v1'],source);
  evidence.sourceRevision1=execute('git',['rev-parse','HEAD'],source);
  const owner=execute('gh',['api','user','--jq','.login']);
  const repository=`${owner}/designeritl-distribution-${Date.now()}`;
  execute('gh',['repo','create',repository,'--private','--source',source,'--remote','origin','--push'],source);
  evidence.repository=repository;
  const install=names=>['--yes','skills@1.7.4','add',repository,'--agent','claude-code','codex','--skill',...names,'--copy','--yes'];
  const verify=(phase)=>{
    const copies=[];
    const walk=(base,relative='')=>readdirSync(join(base,relative),{withFileTypes:true}).flatMap(entry=>{
      const next=join(relative,entry.name);assert.equal(lstatSync(join(base,next)).isSymbolicLink(),false,`Linked ${next}`);
      return entry.isDirectory()?walk(base,next):[next];
    });
    for(const participant of participants)for(const host of ['.agents','.claude']) {
      const expectedNames=[...participant.names];
      assert.deepEqual(readdirSync(join(participant.root,host,'skills')).sort(),expectedNames.sort(),'only selected role workflows are installed');
      for(const name of participant.names) {
      const expected=join(source,'skills',name),installed=join(participant.root,host,'skills',name);
      assert.deepEqual(walk(installed).sort(),walk(expected).sort());
      for(const path of walk(expected))assert.ok(readFileSync(join(installed,path)).equals(readFileSync(join(expected,path))),`Drift ${host}/${name}/${path}`);
      const manifest=JSON.parse(readFileSync(join(installed,'bundle.json')));
      for(const [path,digest] of Object.entries(manifest.sources))assert.equal(createHash('sha256').update(readFileSync(join(installed,path))).digest('hex'),digest,'installed canonical hashes match');
      copies.push({role:participant.role,host,name,files:walk(installed).length});
      }
    }
    evidence[phase]=copies;writeFileSync(join(run,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  };
  for(const participant of participants)execute(process.execPath,[npx,...install(participant.names)],participant.root);
  verify('initialCopy');
  const skill=join(source,'skills/inbox/SKILL.md'),canonicalSkill=readFileSync(skill);
  writeFileSync(skill,canonicalSkill.toString('utf8')+'\nInstaller fixture revision two.\n');
  const manifestPath=join(source,'skills/inbox/bundle.json'),canonicalManifest=readFileSync(manifestPath),manifest=JSON.parse(canonicalManifest);
  manifest.sources['SKILL.md']=createHash('sha256').update(readFileSync(skill)).digest('hex');
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  execute('git',['add','.'],source);
  execute('git',['-c','user.name=DesignerITL installer fixture','-c','user.email=fixture@example.invalid','commit','-m','Installer fixture v2'],source);
  evidence.sourceRevision2=execute('git',['rev-parse','HEAD'],source);
  execute('git',['push','origin','HEAD'],source);
  evidence.intermediate=[];evidence.locks=[];
  for(const participant of participants) {
    execute(process.execPath,[npx,'--yes','skills@1.7.4','update',...participant.names,'-p','-y'],participant.root);
    const claudeUpdated=readFileSync(join(participant.root,'.claude/skills/inbox/SKILL.md')).equals(readFileSync(skill));
    const codexUpdated=readFileSync(join(participant.root,'.agents/skills/inbox/SKILL.md')).equals(readFileSync(skill));
    evidence.intermediate.push({role:participant.role,claudeLinked:lstatSync(join(participant.root,'.claude/skills/inbox')).isSymbolicLink(),claudeUpdated,codexUpdated});
    assert.equal(codexUpdated,true,'supported update must retrieve the new published canonical bytes');
    execute(process.execPath,[npx,...install(participant.names)],participant.root);
    const lock=JSON.parse(readFileSync(join(participant.root,'skills-lock.json')));
    evidence.locks.push({role:participant.role,lock});assert.equal(lock.skills.inbox.sourceType,'github');
  }
  verify('updatedCopy');
  // Leave retained projects and Git HEAD on exact canonical product bytes for subsequent product trials.
  writeFileSync(skill,canonicalSkill);writeFileSync(manifestPath,canonicalManifest);
  execute('git',['add','.'],source);
  execute('git',['-c','user.name=DesignerITL installer fixture','-c','user.email=fixture@example.invalid','commit','-m','Restore exact canonical product source after controlled update'],source);
  evidence.sourceRevision3=execute('git',['rev-parse','HEAD'],source);
  execute('git',['push','origin','HEAD'],source);
  for(const participant of participants)execute(process.execPath,[npx,...install(participant.names)],participant.root);
  verify('restoredCanonicalCopy');
  writeFileSync(join(run,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
});
