import assert from 'node:assert/strict';
import {lstatSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export const roleWorkflows=Object.freeze({designer:['inbox','new-version','send','send-final'],developer:['inbox','order']});
export function productFaultPoint(args,identity) {
  const value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;
  if(value('--repo')!==identity.repository)return null;
  if(args[0]==='release'&&args[2]===identity.tag) {
    if(args[1]==='upload')return 'upload';
    if(args[1]==='edit'&&args.includes('--draft=false'))return 'publication';
  }
  if(args[0]==='issue'&&args[1]==='close'&&Number(args[2])===identity.orderNumber&&value('--reason')==='completed')return 'closure';
  return null;
}
export function fileTree(root,f) {
  const result=[];
  function walk(path,prefix='') {
    assert.ok(lstatSync(path).isDirectory()&&!lstatSync(path).isSymbolicLink(),'Independent regular directory required');
    for(const name of readdirSync(path)) {
      const full=join(path,name),relative=prefix+name,stat=lstatSync(full);assert.equal(stat.isSymbolicLink(),false,'Linked installation refused');
      if(stat.isDirectory())walk(full,relative+'/');
      else {assert.ok(stat.isFile(),'Special installation file refused');const bytes=readFileSync(full);result.push({path:relative,bytes:bytes.length,sha256:f.sha256(bytes)});}
    }
  }
  walk(root);return result.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
}
export function verifyRoleInstallation(project,sourceRoot,role,f) {
  assert.ok(roleWorkflows[role],'Known role required');const copies=[];
  for(const host of ['.agents','.claude']) {
    const base=join(project,host,'skills'),names=[...roleWorkflows[role]];
    assert.deepEqual(readdirSync(base).sort(),names.sort(),'Installed role set differs');
    for(const name of roleWorkflows[role]) {
      const actual=join(base,name),files=fileTree(actual,f),expected=fileTree(join(sourceRoot,name),f);assert.deepEqual(files,expected,'Installed content differs: '+host+'/'+name);
      const manifest=JSON.parse(readFileSync(join(actual,'bundle.json'),'utf8'));assert.equal(manifest.schemaVersion,1);assert.ok(manifest.roles?manifest.roles.includes(role):manifest.role===role);
      for(const [path,digest]of Object.entries(manifest.sources))assert.equal(f.sha256(readFileSync(join(actual,path))),digest,'Installed canonical digest differs');
      copies.push({host,name,files:files.length,treeSha256:f.sha256(Buffer.from(JSON.stringify(files)))});
    }
  }
  return copies;
}
