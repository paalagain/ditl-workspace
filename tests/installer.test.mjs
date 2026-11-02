import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installProject } from '../tools/install.mjs';
import { runSkills } from '../tools/skills-cli.mjs';

const source = fileURLToPath(new URL('../skills/', import.meta.url));
function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'ditl-installer-review-'));
  t.after(() => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('ditl-installer-review-') || lstatSync(root).isSymbolicLink()) throw Error('Unexpected cleanup target');
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function copyInstall(directory = '.agents/skills') {
  return (args, root) => {
    assert.equal(args[1], 'paalagain/ditl-workspace');
    assert.equal(args.includes('--agent'), false);
    assert.equal(args.includes('--yes'), false);
    const names = args.slice(args.indexOf('--skill') + 1, args.indexOf('--copy'));
    const destination = join(root, directory); mkdirSync(destination, { recursive: true });
    for (const name of names) cpSync(join(source, name), join(destination, name), { recursive: true });
    return names.length;
  };
}

function nativeInstall(root, platform, extraArgs = [], extraEnvironment = {}) {
  const distribution = join(root, 'distribution'); cpSync(source, distribution, { recursive: true });
  return (args, target) => runSkills(
    [args[0], distribution, ...args.slice(2), '--agent', platform, '--yes', ...extraArgs],
    target,
    { ...process.env, XDG_STATE_HOME: join(root, 'native-state'), ...extraEnvironment },
  );
}

test('native completion creates the guide and preserves existing project instructions', async t => {
  const root = project(t);
  const originals = new Map(['AGENTS.md', 'CLAUDE.md', 'README.md'].map(name => [name, Buffer.from(`# Preserve ${name}\n`)]));
  for (const [name, bytes] of originals) writeFileSync(join(root, name), bytes);
  const result = await installProject({ project: root, role: 'developer' }, copyInstall());
  assert.equal(result.status, 'created');
  const guide = readFileSync(join(root, 'HUMAN-README.md'), 'utf8');
  assert.match(guide, /## Install as the developer/);
  assert.doesNotMatch(guide, /## Install as the designer/);
  assert.deepEqual(readdirSync(join(root, '.agents/skills')).sort(), ['inbox', 'order']);
  for (const [name, bytes] of originals) assert.ok(readFileSync(join(root, name)).equals(bytes));
  assert.equal((await installProject({ project: root, role: 'developer' }, copyInstall())).status, 'unchanged');
});

test('the requested role determines skills while Vercel owns the platform selection', async t => {
  const root = project(t);
  await installProject({ project: root, role: 'designer' }, copyInstall('.kiro/skills'));
  const guide = readFileSync(join(root, 'HUMAN-README.md'), 'utf8');
  assert.match(guide, /## Install as the designer/);
  assert.doesNotMatch(guide, /## Install as the developer/);
  assert.deepEqual(readdirSync(join(root, '.kiro/skills')).sort(), ['inbox', 'new-version', 'send', 'send-final']);
  assert.equal(existsSync(join(root, 'AGENTS.md')), false);
  assert.equal(existsSync(join(root, 'CLAUDE.md')), false);
});

test('native cancellation and incomplete role counts leave the human guide unchanged', async t => {
  const root = project(t), path = join(root, 'HUMAN-README.md'); writeFileSync(path, 'Preserve this guide');
  await assert.rejects(installProject({ project: root, role: 'developer' }, () => { throw Error('Installation cancelled'); }), /cancelled/);
  for (const count of [undefined, 0, 1, 3]) await assert.rejects(installProject({ project: root, role: 'developer' }, () => count), /complete role installation/);
  assert.equal(readFileSync(path, 'utf8'), 'Preserve this guide');
});

test('malformed human guides stop before the native installer can change skills', async t => {
  const root = project(t), path = join(root, 'HUMAN-README.md');
  const before = '<!-- designeritl:human-readme:start -->\nUnfinished section'; writeFileSync(path, before);
  await assert.rejects(installProject({ project: root, role: 'developer' }, () => assert.fail('must not install')), /Malformed/);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a human guide edited during native installation is preserved', async t => {
  const root = project(t), path = join(root, 'HUMAN-README.md'); writeFileSync(path, 'Initial notes');
  await assert.rejects(installProject({ project: root, role: 'developer' }, () => { writeFileSync(path, 'New human notes'); return 2; }), /changed during installation/);
  assert.equal(readFileSync(path, 'utf8'), 'New human notes');
});

test('preserves a bound role and requires an interactive terminal', async t => {
  const root = project(t); mkdirSync(join(root, '.designeritl'));
  const config = '{"schemaVersion":2,"role":"designer"}\n'; writeFileSync(join(root, '.designeritl/config.json'), config);
  await assert.rejects(installProject({ project: root, role: 'developer' }, () => assert.fail('must not install')), /existing project role/);
  assert.equal(readFileSync(join(root, '.designeritl/config.json'), 'utf8'), config);
  const bin = fileURLToPath(new URL('../tools/install.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [bin, '--help'], { cwd: root, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /Usage: designeritl-install/);
  const noTerminal = spawnSync(process.execPath, [bin, '--project', root, '--role', 'designer'], { cwd: root, encoding: 'utf8' });
  assert.equal(noTerminal.status, 1); assert.match(noTerminal.stderr, /interactive terminal/);
});

test('real native Kiro installation ignores an unrelated foreign Claude skill', async t => {
  const root = project(t), foreign = join(root, '.claude/skills/inbox'); mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, 'SKILL.md'), 'Another tool owns this inbox');
  await installProject({ project: root, role: 'developer' }, nativeInstall(root, 'kiro-cli'));
  assert.equal(readFileSync(join(foreign, 'SKILL.md'), 'utf8'), 'Another tool owns this inbox');
  assert.ok(existsSync(join(root, '.kiro/skills/order/bundle.json')));
  assert.ok(existsSync(join(root, 'HUMAN-README.md')));
});

test('real native Eve frontmatter adaptation still produces the project human guide', async t => {
  const root = project(t);
  await installProject({ project: root, role: 'designer' }, nativeInstall(root, 'eve'));
  for (const name of ['inbox', 'new-version', 'send', 'send-final']) {
    const base = join(root, 'agent/skills', name);
    const installed = readFileSync(join(base, 'SKILL.md'), 'utf8');
    assert.notEqual(installed, readFileSync(join(source, name, 'SKILL.md'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(base, 'bundle.json'), 'utf8'));
    const description = readFileSync(join(base, 'agents/openai.yaml'), 'utf8').match(/^  short_description: (.+)$/m)[1];
    const body = installed.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\n/, '');
    const canonical = `---\nname: ${manifest.workflow}\ndescription: ${description}\ndisable-model-invocation: true\n---\n\n${body}`;
    assert.equal(createHash('sha256').update(canonical).digest('hex'), manifest.sources['SKILL.md']);
  }
  assert.ok(existsSync(join(root, 'HUMAN-README.md')));
});

test('real native global installation honors a custom Claude profile and creates the local guide', async t => {
  const root = project(t), profile = join(root, 'custom-claude-profile');
  await installProject({ project: root, role: 'developer' }, nativeInstall(root, 'claude-code', ['--global'], { CLAUDE_CONFIG_DIR: profile }));
  assert.ok(existsSync(join(profile, 'skills/inbox/SKILL.md')));
  assert.ok(existsSync(join(profile, 'skills/order/SKILL.md')));
  assert.ok(existsSync(join(root, 'HUMAN-README.md')));
  assert.equal(existsSync(join(root, '.agents')), false);
});
