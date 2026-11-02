import {spawn,spawnSync} from 'node:child_process';
import {appendFileSync,writeFileSync} from 'node:fs';

// Shared maintainer runner. The caller owns the retained auth lineage and serializes runs.
export async function runClaude(project,prompt,log) {
  if(!process.env.CLAUDE_CONFIG_DIR)throw Error('Reuse the retained CLAUDE_CONFIG_DIR; do not seed/delete credentials');
  const actualPrompt=prompt+'\n\nFixture evidence constraint: use the canonical Node driver/loader example in the installed Format reference. No shell extraction of protocol blocks and no Python fallback. Retain all executed verbatim Node modules and audit copies. Do not perform recursive cleanup or replace canonical inventory/hashing/ZIP operations with shell or OS commands, even for diagnostics. Keep stdout and stderr separate when recording subprocess observations.';
  const args=['-p','--model','sonnet','--setting-sources','project','--strict-mcp-config','--no-chrome','--no-session-persistence','--allowedTools','Read,Write,Edit,Bash,Skill,Glob,Grep','--permission-mode','dontAsk','--output-format','stream-json','--verbose',actualPrompt];
  writeFileSync(log+'.command.json',JSON.stringify({command:process.env.DITL_CLAUDE_COMMAND||'claude',args,project},null,2)+'\n');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.env.DITL_CLAUDE_COMMAND||'claude',args,{cwd:project,env:process.env,windowsHide:true});
    writeFileSync(log,'');writeFileSync(log+'.stderr.log','');child.stdout.on('data',data=>appendFileSync(log,data));child.stderr.on('data',data=>appendFileSync(log+'.stderr.log',data));
    child.stdin.end();
    const timer=setTimeout(()=>{spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});reject(Error('Claude trial timeout: '+log));},600000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`Claude exit ${code}; ${log}`));});
  });
}
