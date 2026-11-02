import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {appendFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../tools/bundle.mjs';
import {integrity} from '../tools/protocol.mjs';
import {portability} from '../tools/portability.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function command(binary,args,options={}) {const r=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,...options});if(r.status!==0)throw Error(`${binary}: ${r.stderr||r.error}`);return r.stdout.trim();}
const gh=(...args)=>command('gh',args), json=(...args)=>JSON.parse(gh(...args)), sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const writeJSON=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
function records(root) {
  return readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
    const path=join(root,entry.name);
    if(entry.isDirectory())return records(path);
    if(!entry.isFile()||!entry.name.endsWith('.json'))return [];
    try{return [{path,value:JSON.parse(readFileSync(path,'utf8'))}];}catch{return [];}
  });
}
async function host(project,prompt,log) {
  const args=['-p','--model','sonnet','--setting-sources','project','--strict-mcp-config','--no-chrome','--no-session-persistence','--allowedTools','Read,Write,Edit,Bash,Skill,Glob,Grep','--permission-mode','dontAsk','--output-format','stream-json','--verbose',prompt];
  writeJSON(log+'.command.json',{command:process.env.DITL_CLAUDE_COMMAND||'claude',args,project});
  await new Promise((resolve,reject)=>{
    const child=spawn(process.env.DITL_CLAUDE_COMMAND||'claude',args,{cwd:project,env:process.env,windowsHide:true});
    writeFileSync(log,'');child.stdout.on('data',data=>appendFileSync(log,data));child.stderr.on('data',data=>appendFileSync(log,data));
    const timer=setTimeout(()=>{spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});reject(Error('Claude trial timeout: '+log));},600000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`Claude exit ${code}; ${log}`));});
  });
}
function audio() {const b=Buffer.alloc(44+1600);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);return b;}
function prototype(root,kind) {
  mkdirSync(join(root,'assets'),{recursive:true});cpSync(process.env.DITL_LOCAL_FONT||'C:/Windows/Fonts/arial.ttf',join(root,'assets/local.ttf'));
  writeFileSync(join(root,'assets/mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>');
  writeFileSync(join(root,'assets/tone.wav'),audio());
  writeFileSync(join(root,'assets/style.css'),'@font-face{font-family:FixtureLocal;src:url(local.ttf)}body{font-family:FixtureLocal}');
  const reference=kind==='missing'?'assets/missing.svg':kind==='escaped'?'../outside.svg':'assets/mark.svg';
  const script=kind==='network'?';fetch("http://127.0.0.1:9/portability-fixture").catch(()=>{})':kind==='dynamic'?';button.addEventListener("dblclick",()=>fetch(window.fixtureUnknownPath))':'';
  writeFileSync(join(root,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/style.css"><title>Portability fixture</title></head><body><h1>Ready for design</h1><img src="${reference}" alt="Local image"><audio preload="metadata" src="assets/tone.wav"></audio><button>Show details</button><output>Closed</output><script>const button=document.querySelector('button');button.addEventListener('click',()=>document.querySelector('output').textContent='Details opened')${script};</script></body></html>`);
}

test('installed Claude Sonnet send gate permits local font/media and refuses unsafe or unverified captures',{skip:process.env.DITL_PORTABILITY_TRIAL!=='1',timeout:2400000},async()=>{
  assert.ok(process.env.CLAUDE_CONFIG_DIR&&existsSync(join(process.env.CLAUDE_CONFIG_DIR,'.credentials.json')),'Reuse preserved Claude config; do not seed credentials');
  assert.ok(process.env.DITL_PLAYWRIGHT_MODULE);
  const run=mkdtempSync(join(tmpdir(),'designeritl-portability-'));process.stdout.write(`Retained portability root: ${run}\n`);
  const out=join(run,'bundles');build(out);const f=await integrity(), p=await portability();
  const owner=json('api','user').login,name=`designeritl-portability-${Date.now()}`,repo=`${owner}/${name}`;
  gh('repo','create',repo,'--private','--add-readme','--description','Dedicated retained portability acceptance fixture');
  const repositoryId=json('api',`repos/${repo}`).id, outcomes=[];
  writeJSON(join(run,'environment.json'),{repo,repositoryId,node:process.version,os:process.platform,claude:command('claude',['--version']),model:'sonnet',browserChannel:'msedge',playwrightModule:process.env.DITL_PLAYWRIGHT_MODULE});
  for(const kind of ['valid','missing','escaped','network','dynamic','unperformed']) {
    build(out);
    const project=join(run,kind),version=join(project,'versions/design.current.v1');mkdirSync(join(project,'.claude/skills'),{recursive:true});cpSync(join(out,'designer'),join(project,'.claude/skills'),{recursive:true});
    mkdirSync(join(project,'.designeritl'));mkdirSync(join(project,'orders'));prototype(version,kind);
    const requestId=randomUUID(),body=`# Goal\nPortable local font, image, audio and detail interaction.\n\n- [ ] 1. Show the heading and local media, and open details.\n\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId,followsOrderNumber:null,cancelsOrderNumber:null})}\n\`\`\`\n`;
    const bodyFile=join(run,`${kind}-body.md`);writeFileSync(bodyFile,body);const url=gh('issue','create','--repo',repo,'--title',`Portability ${kind}`,'--body-file',bodyFile),number=Number(url.split('/').at(-1)),orderId={repositoryId,issueNumber:number};
    writeJSON(join(project,'.designeritl/config.json'),{schemaVersion:2,role:'designer',repository:{repositoryId,owner,name}});
    writeJSON(join(project,'.designeritl/state.json'),{schemaVersion:1,assignment:{orderId,activationId:randomUUID()},startedOrders:{[number]:{path:`orders/${number}.md`}},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null});
    const scope={orderId,originalBody:body,originalBodySha256:sha(Buffer.from(body)),goal:'Portable local font, image, audio and detail interaction.',tasks:[{ordinal:1,text:'Show the heading and local media, and open details.'}],startedAt:new Date().toISOString()};
    writeFileSync(join(project,'orders',`${number}.md`),`# Agreed scope\n\n\`\`\`designeritl-scope\n${JSON.stringify(scope)}\n\`\`\`\n\n# Local progress\n\n- [x] 1. Show the heading and local media, and open details.\n\n# Task context\nDo not repair during this as-is delivery test.\n`);
    const original=f.inventory(version),initialAssignment=JSON.parse(readFileSync(join(project,'.designeritl/state.json'))).assignment,report=p.inspectPortability(version,f);writeJSON(join(project,'.designeritl','independent-static.json'),report);
    const tool=join(source,'tools/portability-browser.mjs');
    const instructions=kind==='unperformed'?'The direct-file browser/network capability is intentionally unavailable in this environment. Do not invoke a browser or fabricate runtime evidence; record necessary checks not run and refuse portability.':`The maintainer test capability is available as node ${JSON.stringify(tool)} CAPTURE_ROOT STATIC_REPORT_JSON RUNTIME_OUTPUT_JSON EXTRACTED_VERBATIM_INTEGRITY_MODULE. It observes real file:// requests, font/image/audio and button state; it does not claim manual source review. Use this actual capability on captured bytes, then add reviewedFiles only after reading all relevant source files. Keep unresolved dynamic candidates unresolved when their dependency cannot be established; no permission to execute external unknown content.`;
    const prompt=`/send-final\nExplicitly invoke the installed send-final skill. This opened project is the authorized dedicated fixture. Order ${number}, version v1, send as-is, no source repair. No unrelated changes. I acknowledge any unfinished tasks for these exact bytes, but portability cannot be waived. Follow installed Versions -> Captured portability protocol and its exact snippets; read full source, create coherent capture, inspect dependencies, retain static/runtime/decision JSON, and only publish if eligible. ${instructions} Do not load source-checkout protocols or sibling policy references. Preserve a blocked capture with reasons and leave its order open. A successful case publishes/verifies then closes completed. Finish autonomously with these explicit choices.`;
    writeFileSync(join(run,`${kind}-prompt.txt`),prompt);await host(project,prompt,join(run,`${kind}-host.jsonl`));
    const releases=json('api','--paginate','--slurp',`repos/${repo}/releases?per_page=100`).flat(),matching=releases.filter(r=>r.tag_name===`order-${number}/final`),issue=json('api',`repos/${repo}/issues/${number}`);
    assert.deepEqual(f.inventory(version),original,'As-is source bytes must be preserved');
    const pendingRoot=join(project,'.designeritl/pending'),pending=readdirSync(pendingRoot);assert.equal(pending.length,1);
    const capturedRoot=join(pendingRoot,pending[0],'snapshot/design.current.v1');assert.deepEqual(f.inventory(capturedRoot),original,'Gate must assess the actual unchanged capture');
    const evidence=records(join(pendingRoot,pending[0])),staticReports=evidence.filter(e=>Array.isArray(e.value.inspectedFiles)&&Array.isArray(e.value.violations)),decisions=evidence.filter(e=>['eligible','blocked'].includes(e.value.status)&&Array.isArray(e.value.reasons));
    assert.ok(staticReports.some(e=>e.value.payloadSha256===original.payloadSha256),'Fresh capture-bound static report retained');
    assert.ok(decisions.some(e=>e.value.payloadSha256===original.payloadSha256&&e.value.status===(kind==='valid'?'eligible':'blocked')),'Payload-bound gate decision retained');
    const runtime=evidence.find(e=>e.value.networkObservation===true&&Array.isArray(e.value.reviewedFiles))?.value;
    assert.equal(p.decidePortability(p.inspectPortability(capturedRoot,f),runtime).status,kind==='valid'?'eligible':'blocked');
    if(kind==='valid') {assert.equal(matching.length,1);assert.equal(matching[0].draft,false);assert.equal(issue.state_reason,'completed');}
    else {assert.equal(matching.filter(r=>!r.draft).length,0,`${kind} must not publish`);assert.equal(issue.state,'open');assert.deepEqual(JSON.parse(readFileSync(join(project,'.designeritl/state.json'))).assignment,initialAssignment);assert.ok(existsSync(join(project,'.designeritl/pending')),'Blocked evidence retained');}
    outcomes.push({kind,number,issueState:issue.state,releases:matching.map(r=>({id:r.id,draft:r.draft})),payloadSha256:original.payloadSha256});writeJSON(join(run,'outcomes.json'),outcomes);
  }
  writeJSON(join(run,'result.json'),{status:'passed',repo,repositoryId,outcomes});
});
