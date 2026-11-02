#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isCancel, select, text } from '@clack/prompts';
import { prepareHumanReadme } from './install-human-readme.mjs';
import { runSkills } from './skills-cli.mjs';

const source = 'paalagain/ditl-workspace';
const roles = { designer: ['inbox', 'new-version', 'send', 'send-final'], developer: ['inbox', 'order'] };

async function answer(question) {
  const value = await question;
  if (isCancel(value)) throw Error('Installation cancelled; no files were changed.');
  return value;
}

export async function installProject({ project, role }, install = runSkills) {
  if (typeof project !== 'string' || !project.trim()) throw Error('An explicit project folder is required');
  if (!Object.hasOwn(roles, role)) throw Error('Choose role designer or developer');
  const root = resolve(project.trim());
  const writeGuide = prepareHumanReadme(root, role);
  const config = join(root, '.designeritl/config.json');
  if (existsSync(config) && JSON.parse(readFileSync(config, 'utf8')).role !== role) throw Error('Preserve the existing project role; choose a different folder');
  const installedCount = await install(['add', source, '--skill', ...roles[role], '--copy'], root);
  if (installedCount !== roles[role].length) throw Error('The native installer did not confirm the complete role installation; HUMAN-README.md was not changed');
  return writeGuide();
}

const help = `Install Designer in the loop skills and root HUMAN-README.md together.

Usage: designeritl-install [--project DIRECTORY] [--role designer|developer]

Asks for any missing project folder and role, then opens Vercel's native
platform picker. Run in an interactive terminal; Vercel handles platform
selection, scope and overwrite confirmation.
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { project: { type: 'string' }, role: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) {
      process.stdout.write(help);
    } else {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error(`Run this installer in an interactive terminal.\n${help}`);
      values.project ||= await answer(text({
        message: 'Project folder',
        placeholder: process.cwd(),
        defaultValue: process.cwd(),
        validate(value) {
          try {
            const stat = lstatSync(resolve(value?.trim() || process.cwd()));
            if (!stat.isDirectory() || stat.isSymbolicLink()) return 'Choose an existing regular project folder.';
          } catch { return 'That folder does not exist. Enter an existing project folder.'; }
        },
      }));
      values.project = values.project.trim();
      if (!Object.hasOwn(roles, values.role)) values.role = await answer(select({
        message: 'Your role',
        options: [
          { value: 'designer', label: 'Designer', hint: 'Create prototypes and send deliveries' },
          { value: 'developer', label: 'Developer', hint: 'Send work orders and receive deliveries' },
        ],
      }));
      if (!values.project || !values.role) throw Error(help);
      process.stdout.write(`Installing for ${values.role} in ${resolve(values.project)}; choose platforms in Vercel.\n`);
      const result = await installProject(values);
      process.stdout.write(`${result.status}: ${result.path}\nOpen HUMAN-README.md to start onboarding.\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
