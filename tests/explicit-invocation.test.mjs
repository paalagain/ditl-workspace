import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, buildSource, check, checkSource } from '../tools/bundle.mjs';
import { installProject } from '../tools/install.mjs';
import { runSkills } from '../tools/skills-cli.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const roles = { designer: ['inbox', 'new-version', 'send', 'send-final'], developer: ['inbox', 'order'] };
const names = [...new Set(Object.values(roles).flat())].sort();

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'ditl-explicit-invocation-'));
  t.after(() => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('ditl-explicit-invocation-') || lstatSync(root).isSymbolicLink()) throw Error('Unexpected cleanup target');
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function assertExplicitOnly(base, name) {
  const skill = readFileSync(join(base, 'SKILL.md'), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n\n/);
  assert.ok(frontmatter, `${base}: leading SKILL.md frontmatter`);
  assert.match(frontmatter[1], /^disable-model-invocation: true$/m, `${base}: Claude opt-out`);
  const description = JSON.parse(frontmatter[1].match(/^description: (.+)$/m)[1]);
  const metadata = readFileSync(join(base, 'agents/openai.yaml'), 'utf8');
  assert.match(metadata, /^policy:\n  allow_implicit_invocation: false\n/m, `${base}: Codex opt-out`);
  assert.equal(JSON.parse(metadata.match(/^  short_description: (.+)$/m)[1]), description);
  const firstInstruction = skill.slice(frontmatter[0].length).split('\n\n')[0];
  assert.match(firstInstruction, /^Explicit invocation required\./, `${base}: guard must precede workflow actions`);
  assert.match(firstInstruction, /current user message explicitly invokes this skill by name/);
  assert.ok(firstInstruction.includes(`\`$${name}\``), `${base}: exact Codex invocation`);
  assert.ok(firstInstruction.includes(`\`/${name}\``), `${base}: exact Claude invocation`);
  assert.match(firstInstruction, /host's equivalent/);
  assert.match(firstInstruction, /Otherwise, stop without any action/);
  assert.match(firstInstruction, /before reading references or using tools/);
  assert.match(firstInstruction, /say: "You can run this DITL skill by name:/);
  assert.match(firstInstruction, /Related requests and mentions of the skill are not invocations\./);
  assert.match(description, /explicit invocation only/i, `${base}: human-facing invocation constraint`);
}

function assertDistribution(base) {
  for (const [role, workflows] of Object.entries(roles)) {
    assert.deepEqual(readdirSync(join(base, role)).sort(), [...workflows].sort());
    for (const name of workflows) assertExplicitOnly(join(base, role, name), name);
  }
}

function assertSource(base) {
  assert.deepEqual(readdirSync(base).sort(), names);
  for (const name of names) assertExplicitOnly(join(base, name), name);
}

test('every shipped DITL source skill requires explicit invocation', () => {
  assertSource(join(repo, 'skills'));
});

test('both generators reproduce explicit invocation controls for every workflow', t => {
  const root = temporary(t);
  build(join(root, 'dist'));
  buildSource(join(root, 'skills'));
  assertDistribution(join(root, 'dist'));
  assertSource(join(root, 'skills'));
});

for (const source of [false, true]) test(`${source ? 'source' : 'role'} check rejects invocation metadata and guard drift`, t => {
  const out = temporary(t);
  const generate = source ? buildSource : build;
  const verify = source ? checkSource : check;
  generate(out);
  const base = join(out, ...(source ? [] : ['designer']), 'inbox');
  const changes = [
    ['SKILL.md', text => text.replace('disable-model-invocation: true', 'disable-model-invocation: false')],
    ['agents/openai.yaml', text => text.replace('allow_implicit_invocation: false', 'allow_implicit_invocation: true')],
    ['SKILL.md', text => text.replace(/Explicit invocation required\.[^\n]*\n\n/, '')],
  ];
  for (const [file, alter] of changes) {
    const path = join(base, file), original = readFileSync(path, 'utf8'), changed = alter(original);
    assert.notEqual(changed, original, `${file}: regression must alter the generated control`);
    writeFileSync(path, changed);
    assert.throws(() => verify(out), /canonical drift/);
    writeFileSync(path, original);
  }
  verify(out);
});

for (const distribution of ['dist', 'skills']) for (const role of Object.keys(roles)) for (const host of ['codex', 'claude-code']) {
  test(`fresh ${host} ${role} installer output from ${distribution} preserves invocation controls`, async t => {
    const root = temporary(t);
    const localDistribution = join(root, 'distribution');
    if (distribution === 'dist') build(localDistribution);
    const localSource = distribution === 'dist' ? join(localDistribution, role) : join(repo, 'skills');
    await installProject({ project: root, role }, (args, target) => runSkills(
      [args[0], localSource, ...args.slice(2), '--agent', host, '--yes'],
      target,
      { ...process.env, XDG_STATE_HOME: join(root, 'native-state'), CLAUDE_CONFIG_DIR: join(root, 'claude-profile') },
    ));
    const installed = join(root, host === 'codex' ? '.agents' : '.claude', 'skills');
    assert.deepEqual(readdirSync(installed).sort(), [...roles[role]].sort());
    for (const name of roles[role]) assertExplicitOnly(join(installed, name), name);
  });
}
