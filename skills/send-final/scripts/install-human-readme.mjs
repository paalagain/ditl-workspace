import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const start = '<!-- designeritl:human-readme:start -->';
const end = '<!-- designeritl:human-readme:end -->';

function edit(before, role) {
  const text = before === null ? '' : before.toString('utf8');
  if (before !== null && !Buffer.from(text, 'utf8').equals(before)) throw Error('HUMAN-README.md must be UTF-8; preserve it and convert it explicitly first');
  const newline = text.match(/\r?\n/)?.[0] || '\n';
  let guide = readFileSync(new URL('../templates/HUMAN-README.md', import.meta.url), 'utf8');
  if (role) guide = guide.replace(/<!-- designeritl:role:(designer|developer):start -->\n([\s\S]*?)<!-- designeritl:role:\1:end -->\n?/g,
    (_, sectionRole, content) => sectionRole === role ? content : '').replace(/\n{3,}/g, '\n\n');
  guide = guide.trimEnd().replaceAll('\n', newline);
  if (before !== null && text.trimEnd() === guide) return before;
  const block = [start, guide, end].join(newline);
  const starts = text.split(start).length - 1, ends = text.split(end).length - 1;
  if (starts === 0 && ends === 0) {
    const separator = !text || text.endsWith(newline + newline) ? '' : text.endsWith(newline) ? newline : newline + newline;
    return Buffer.from(text + separator + block + newline, 'utf8');
  }
  if (starts !== 1 || ends !== 1 || text.indexOf(end) < text.indexOf(start)) throw Error('Malformed or duplicate Designer in the loop markers; preserve HUMAN-README.md and repair the marked block first');
  return Buffer.from(text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length), 'utf8');
}

export function prepareHumanReadme(project, role) {
  if (typeof project !== 'string' || !project.trim()) throw Error('An explicit --project directory is required');
  if (role !== undefined && !['designer', 'developer'].includes(role)) throw Error('Choose role designer or developer');
  const root = resolve(project), stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error(`Expected a regular project directory: ${root}`);
  const path = join(root, 'HUMAN-README.md');
  let before = null;
  let original = null;
  try {
    const file = lstatSync(path, { bigint: true });
    if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1n) throw Error(`Expected an unlinked regular file: ${path}`);
    original = file;
    before = readFileSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const after = edit(before, role);
  const status = before?.equals(after) ? 'unchanged' : before === null ? 'created' : 'updated';
  return () => {
    if (original !== null) {
      const current = lstatSync(path, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || current.dev !== original.dev || current.ino !== original.ino) throw Error('HUMAN-README.md was replaced during installation; preserve it and rerun the installer');
    }
    if (before !== null && !readFileSync(path).equals(before)) throw Error('HUMAN-README.md changed during installation; preserve it and rerun the installer');
    if (status !== 'unchanged') writeFileSync(path, after, { flag: before === null ? 'wx' : 'w' });
    return { path, status };
  };
}

export function installHumanReadme(project, role) {
  return prepareHumanReadme(project, role)();
}

const help = `Leave human onboarding and usage instructions in a selected project.

Usage: node install-human-readme.mjs --project DIRECTORY [--role designer|developer]

Creates HUMAN-README.md or updates only its marked Designer in the loop block.
Preserves other content. Reruns do not duplicate the guide. This does not edit
AGENTS.md, CLAUDE.md or README.md, initialize a project, or perform GitHub actions.
With --role, starts with that role's installation steps. Without it, includes both roles.
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { project: { type: 'string' }, role: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) {
      process.stdout.write(help);
    } else {
      if (positionals.length || !values.project || values.project.startsWith('--')) throw Error(help);
      const { path, status } = installHumanReadme(values.project, values.role);
      process.stdout.write(`${status}: ${path}\nOpen HUMAN-README.md for onboarding and everyday commands.\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
