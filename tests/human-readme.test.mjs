import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installHumanReadme, prepareHumanReadme } from '../tools/install-human-readme.mjs';
import { buildSource } from '../tools/bundle.mjs';

const script = fileURLToPath(new URL('../tools/install-human-readme.mjs', import.meta.url));
const start = '<!-- designeritl:human-readme:start -->', end = '<!-- designeritl:human-readme:end -->';
const roots = [];
function project() {
  const root = mkdtempSync(join(tmpdir(), 'ditl-human-readme-')); roots.push(root); return root;
}
after(() => {
  for (const root of roots) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('ditl-human-readme-') || lstatSync(root).isSymbolicLink()) throw Error('Unexpected cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});

test('creates a human guide with onboarding for both roles and preserves all other project files', () => {
  const root = project();
  const files = new Map(['AGENTS.md', 'CLAUDE.md', 'README.md'].map(file => [file, Buffer.from(`# Existing ${file}\nKeep æøå and 日本語.\n`)]));
  mkdirSync(join(root, '.designeritl'));
  files.set('.designeritl/state.json', Buffer.from('{"existing":"leave intact"}\n'));
  for (const [file, bytes] of files) writeFileSync(join(root, file), bytes);
  assert.equal(installHumanReadme(root).status, 'created');
  const text = readFileSync(join(root, 'HUMAN-README.md'), 'utf8');
  assert.match(text, /prompts\/start-designer\.md/);
  assert.match(text, /prompts\/start-developer\.md/);
  assert.match(text, /join prompt/); assert.match(text, /Everyday workflow/);
  assert.ok(text.indexOf('## Install as the designer') < text.indexOf('## The full picture'));
  assert.ok(text.indexOf('## Install as the developer') < text.indexOf('## The full picture'));
  for (const [file, bytes] of files) assert.ok(readFileSync(join(root, file)).equals(bytes), file);
});

test('each selected role gets its own two installation options before the shared workflow', () => {
  for (const role of ['designer', 'developer']) {
    const root = project(), path = join(root, 'HUMAN-README.md');
    const other = role === 'designer' ? 'developer' : 'designer';
    const prefix = '# My notes\n\n', suffix = '\nKeep this too.\n';
    writeFileSync(path, prefix + start + '\nOld guide\n' + end + suffix);
    const result = spawnSync(process.execPath, [script, '--project', root, '--role', role], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(path, 'utf8');
    assert.ok(text.startsWith(prefix)); assert.ok(text.endsWith(suffix));
    const installation = text.slice(text.indexOf('## Install as'), text.indexOf('## The full picture'));
    assert.ok(installation.startsWith(`## Install as the ${role}`));
    assert.match(installation, /### With a prompt/);
    assert.match(installation, /### From a terminal/);
    assert.ok(installation.includes(`--role ${role}`));
    assert.ok(installation.includes('npx --yes github:paalagain/ditl-workspace'));
    assert.ok(installation.includes('https://github.com/paalagain/ditl-workspace/blob/main/prompts/'));
    assert.ok(!text.includes('paalaleks/DesignerITLcom'));
    assert.ok(installation.includes(`prompts/start-${role}.md`));
    assert.ok(!installation.includes(`prompts/start-${other}.md`));
    assert.ok(!text.includes(`## Install as the ${other}`));
    assert.ok(!text.includes('<!-- designeritl:role:'));
    assert.match(text, /Everyday workflow/);
    assert.match(text, /`send-final`/); assert.match(text, /`order`/);
    assert.equal(installHumanReadme(root, role).status, 'unchanged');
  }
});

test('an unsupported role leaves the existing human guide unchanged', () => {
  const root = project(), path = join(root, 'HUMAN-README.md');
  writeFileSync(path, 'My notes');
  assert.throws(() => installHumanReadme(root, 'other'), /Choose role/);
  assert.equal(readFileSync(path, 'utf8'), 'My notes');
});

test('preserves UTF-8, BOM and CRLF human notes and is byte-identical on retry', () => {
  const root = project(), path = join(root, 'HUMAN-README.md');
  const original = Buffer.from('\ufeff# Existing notes\r\n\r\nKeep æøå and 日本語.');
  writeFileSync(path, original);
  assert.equal(installHumanReadme(root).status, 'updated');
  const first = readFileSync(path);
  assert.ok(first.subarray(0, original.length).equals(original));
  assert.equal(first.toString().replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(installHumanReadme(root).status, 'unchanged');
  assert.ok(readFileSync(path).equals(first));
});

test('refreshes only the marked guide and keeps notes before and after it', () => {
  const root = project(), path = join(root, 'HUMAN-README.md');
  const prefix = '# Team notes\n\n', suffix = '\n\n## Another tool\nKeep this.\n';
  writeFileSync(path, prefix + start + '\nOld guide\n' + end + suffix);
  installHumanReadme(root);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.startsWith(prefix)); assert.ok(text.endsWith(suffix));
  assert.equal(text.split(start).length, 2);
});

test('an existing root guide matching the template stays byte-identical', () => {
  const root = project(), tools = join(root, 'tools'); mkdirSync(tools);
  cpSync(script, join(tools, 'install-human-readme.mjs'));
  const guide = readFileSync(new URL('../templates/HUMAN-README.md', import.meta.url));
  mkdirSync(join(root, 'templates'));
  writeFileSync(join(root, 'templates/HUMAN-README.md'), guide);
  writeFileSync(join(root, 'HUMAN-README.md'), guide);
  const result = spawnSync(process.execPath, [join(tools, 'install-human-readme.mjs'), '--project', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /^unchanged:/);
  assert.ok(readFileSync(join(root, 'HUMAN-README.md')).equals(guide));
});

test('refuses malformed markers, non-UTF-8 bytes and linked human readmes without replacing them', () => {
  const root = project(), path = join(root, 'HUMAN-README.md');
  for (const invalid of [Buffer.from(start), Buffer.from(end), Buffer.from(start + end + start + end), Buffer.from(end + start), Buffer.from([0xff, 0xfe, 0x41, 0])]) {
    writeFileSync(path, invalid);
    assert.throws(() => installHumanReadme(root), /Malformed|UTF-8/);
    assert.ok(readFileSync(path).equals(invalid));
  }
  const linked = project(), elsewhere = project();
  symlinkSync(elsewhere, join(linked, 'HUMAN-README.md'), 'junction');
  assert.throws(() => installHumanReadme(linked), /regular file/);
});

test('a same-content hardlink replacement during installation cannot change another file', () => {
  const root = project(), path = join(root, 'HUMAN-README.md'), other = join(root, 'other-notes.md');
  const before = Buffer.from('Existing notes\n'); writeFileSync(path, before); writeFileSync(other, before);
  const commit = prepareHumanReadme(root);
  unlinkSync(path); linkSync(other, path);
  assert.throws(commit, /replaced during installation/);
  assert.ok(readFileSync(other).equals(before));
});

test('a guide created while installation runs is preserved rather than overwritten', () => {
  const root = project(), path = join(root, 'HUMAN-README.md');
  const commit = prepareHumanReadme(root); writeFileSync(path, 'New notes');
  assert.throws(commit, /EEXIST/);
  assert.equal(readFileSync(path, 'utf8'), 'New notes');
});

test('terminal usage requires an explicit project and creates only the human guide there', () => {
  const root = project(), elsewhere = project();
  const run = args => spawnSync(process.execPath, [script, ...args], { cwd: elsewhere, encoding: 'utf8' });
  assert.equal(run([]).status, 1);
  assert.equal(run(['--help']).status, 0);
  const result = run(['--project', root]); assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(join(root, 'HUMAN-README.md')));
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md', '.designeritl']) assert.equal(existsSync(join(root, file)), false, file);
  assert.equal(existsSync(join(elsewhere, 'HUMAN-README.md')), false);
});

test('a copied inbox bundle can install and refresh the human guide without the source checkout', () => {
  const root = project(), source = join(project(), 'skills'); buildSource(source);
  const inbox = join(root, '.agents/skills/inbox');
  mkdirSync(join(root, '.agents/skills'), { recursive: true }); cpSync(join(source, 'inbox'), inbox, { recursive: true });
  const shipped = join(inbox, 'scripts/install-human-readme.mjs');
  const run = () => spawnSync(process.execPath, [shipped, '--project', root, '--role', 'designer'], { cwd: project(), encoding: 'utf8' });
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.ok(!readFileSync(join(root, 'HUMAN-README.md'), 'utf8').includes('## Install as the developer'));
  assert.match(run().stdout, /^unchanged:/);
  const updated = readFileSync(join(inbox, 'templates/HUMAN-README.md'), 'utf8') + '\nUpdated human instructions.\n';
  writeFileSync(join(inbox, 'templates/HUMAN-README.md'), updated);
  assert.equal(run().status, 0);
  assert.match(readFileSync(join(root, 'HUMAN-README.md'), 'utf8'), /Updated human instructions/);
  assert.equal(existsSync(join(root, 'AGENTS.md')), false);
});
