import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';

// Maintainer-only host driver. The caller supplies and retains an existing auth home.
function killTree(pid) {
  if(process.platform==='win32')spawnSync('taskkill',['/pid',String(pid),'/T','/F'],{windowsHide:true});
  else try{process.kill(-pid,'SIGKILL');}catch{try{process.kill(pid,'SIGKILL');}catch{}}
}
export async function runHost({project,prompt,log,environment=process.env,host=environment.DITL_TEST_HOST||'codex',timeoutMs=180000}) {
  assert.ok(['claude','codex'].includes(host),'Choose claude or codex explicitly');
  let command,args,childEnvironment={...environment};
  if(host==='claude') {
    assert.ok(environment.CLAUDE_CONFIG_DIR,'Use the retained Claude auth home; never reseed or delete it');
    command=environment.DITL_CLAUDE_COMMAND||'claude';
    args=['-p','--model','sonnet','--setting-sources','project','--strict-mcp-config','--no-chrome','--no-session-persistence','--permission-mode','bypassPermissions','--allowedTools','Bash,Read,Write,Edit,Skill','--verbose','--output-format','stream-json',prompt];
  } else {
    assert.ok(environment.CODEX_HOME&&existsSync(join(environment.CODEX_HOME,'auth.json')),'Use the retained authenticated CODEX_HOME; never reseed or delete it');
    const launcher=environment.DITL_CODEX_COMMAND||(process.platform==='win32'&&environment.APPDATA?join(environment.APPDATA,'npm/node_modules/@openai/codex/bin/codex.js'):null);
    assert.ok(launcher&&existsSync(launcher),'Set DITL_CODEX_COMMAND to the installed codex.js Node launcher');
    command=process.execPath;
    args=[launcher,'exec','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--ephemeral','--json','-s','danger-full-access','-c','approval_policy="never"','-C',project,'-'];
    childEnvironment={...childEnvironment,HOME:dirname(environment.CODEX_HOME),USERPROFILE:dirname(environment.CODEX_HOME)};
  }
  writeFileSync(`${log}.invocation.json`,JSON.stringify({command,args,project,host},null,2)+'\n');
  writeFileSync(`${log}.prompt.txt`,prompt);
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:project,env:childEnvironment,windowsHide:true,detached:process.platform!=='win32'}),stdout=[],stderr=[];
    writeFileSync(`${log}.pid.json`,JSON.stringify({pid:child.pid,project},null,2)+'\n');
    child.stdout.on('data',bytes=>{stdout.push(bytes);writeFileSync(log,Buffer.concat(stdout));});
    child.stderr.on('data',bytes=>{stderr.push(bytes);writeFileSync(`${log}.stderr.log`,Buffer.concat(stderr));});
    child.stdin.end(host==='codex'?prompt:undefined);
    const timer=setTimeout(()=>{killTree(child.pid);reject(Error(`${host} trial timed out; retained ${log}`));},timeoutMs);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`${host} exited ${code}; retained ${log}`));});
  });
  const events=readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  let result,commands,finalText;
  if(host==='claude') {
    result=events.findLast(event=>event.type==='result');
    assert.ok(result,'Host result is required');assert.equal(result.is_error,false,log);assert.deepEqual(result.permission_denials||[],[],log);
    assert.ok(Object.keys(result.modelUsage||{}).some(name=>name.includes('sonnet')),'Claude testing uses the requested Sonnet model');
    commands=events.filter(event=>event.type==='assistant').flatMap(event=>event.message.content||[]).filter(block=>block.type==='tool_use'&&block.name==='Bash').map(block=>block.input.command||'');
    finalText=result.result||'';
  } else {
    const completed=events.findLast(event=>event.type==='turn.completed');
    assert.ok(completed,'Codex completed turn is required');assert.ok(!events.some(event=>event.type==='turn.failed'),'Codex turn failed');
    commands=events.filter(event=>event.type==='item.completed'&&event.item?.type==='command_execution').map(event=>event.item.command||'');
    finalText=events.filter(event=>event.type==='item.completed'&&event.item?.type==='agent_message').at(-1)?.item.text||'';
    result={is_error:false,host:'codex',usage:completed.usage,result:finalText};
  }
  for(const command of commands) {
    assert.doesNotMatch(command,/\b(sha256sum|Get-FileHash|Compress-Archive)\b/i,'All integrity and diagnostic hashing uses canonical Node');
    assert.doesNotMatch(command,/(?:^|[;&|\n])\s*(?:rm|rmdir|del|Remove-Item)\b/i,'Trial evidence and temporary modules must be retained');
  }
  return {events,result,commands,host,finalText};
}
