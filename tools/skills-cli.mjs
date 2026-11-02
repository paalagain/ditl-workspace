import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('skills/package.json'));

export function interactiveEnvironment(environment) {
  const child = { ...environment, DISABLE_TELEMETRY: '1' };
  // Native skills treats these inherited agent signals as implicit --yes.
  // This entry point is for a human; change only the child's environment.
  for (const key of [
    'AI_AGENT', 'CURSOR_TRACE_ID', 'CURSOR_AGENT', 'CURSOR_EXTENSION_HOST_ROLE',
    'GEMINI_CLI', 'CODEX_SANDBOX', 'CODEX_CI', 'CODEX_THREAD_ID',
    'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT', 'OPENCODE_CLIENT', 'CLAUDECODE',
    'CLAUDE_CODE', 'CLAUDE_CODE_IS_COWORK', 'REPL_ID', 'COPILOT_MODEL',
    'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN',
  ]) delete child[key];
  return child;
}

export function completedSkillCount(output) {
  // The pinned CLI can exit zero on cancellation or partial failure.
  const messages = stripVTControlCharacters(output).split(/[\r\n]+/).map(line => line.trim().replace(/^(?:[|│]\s*)?(?:[o◇■x×✗✓✔•—]\s+)?/u, ''));
  if (messages.some(line => /^Installation cancelled$/i.test(line))) throw Error('Installation cancelled; HUMAN-README.md was not changed');
  const completed = messages.map(line => line.match(/^Installed (\d+) skills?(?:\s|$)/)).find(Boolean);
  if (messages.some(line => /^(?:Failed to install \d+\b|Installation failed$)/i.test(line)) || !completed) throw Error('Skills installation did not complete; HUMAN-README.md was not changed');
  return Number(completed[1]);
}

export async function runSkills(args, root, environment = process.env) {
  const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const cli = join(packageRoot, metadata.bin.skills);
  const scripted = args.includes('--yes') || args.includes('-y');
  if (!scripted && existsSync('/opt/.devin')) throw Error('The native installer auto-confirms inside this Devin environment; run the interactive installation from a regular terminal');
  process.stdin.pause();
  const output = await new Promise((fulfill, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root, env: scripted ? { ...environment, DISABLE_TELEMETRY: '1' } : interactiveEnvironment(environment),
      stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true,
    });
    let captured = '';
    for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on('data', bytes => {
      captured += bytes.toString(); target.write(bytes);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) reject(Error(`Skills installation failed (${code ?? signal}); HUMAN-README.md was not changed`));
      else fulfill(captured);
    });
  });
  return completedSkillCount(output);
}
