import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const roles = ['designer', 'developer'];
const read = path => readFileSync(path);
const links = text => [...text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)].map(m => m[1]);
function regular(path) {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error(`Not a regular canonical file: ${path}`);
  const bytes=read(path);
  if(!bytes.equals(Buffer.from(bytes.toString('utf8'),'utf8')))throw Error(`Invalid UTF-8 text: ${path}`);
  return bytes;
}
function canonicalText(path) {
  const bytes=regular(path);
  if(bytes.includes(Buffer.from('\r\n'))) throw Error(`Canonical instructions must use LF bytes: ${path}`);
  return bytes;
}
function expected(source = false, canonicalRoot = root) {
  const files = new Map();
  for (const entry of readdirSync(join(canonicalRoot, 'workflows')).filter(x => x.endsWith('.json'))) {
    const declaration = JSON.parse(regular(join(canonicalRoot, 'workflows', entry)));
    const { name, description, references } = declaration;
    if (declaration.schemaVersion !== 1 || !/^[a-z][a-z-]*$/.test(name) || !description || !Array.isArray(references) || !declaration.roles?.length || declaration.roles.some(r => !roles.includes(r))) throw Error(`Unsupported workflow declaration: ${entry}`);
    const body = canonicalText(join(canonicalRoot, 'workflows', `${name}.md`));
    const refs = new Map();
    function visit(ref) {
      if (!/^[a-z][a-z-]*\.md$/.test(ref)) throw Error(`Unsafe reference ${ref}`);
      if (refs.has(ref)) return;
      const bytes = canonicalText(join(canonicalRoot, 'protocols', ref));
      if (!/^Revision: [1-9][0-9]*$/m.test(bytes.toString())) throw Error(`Missing revision: ${ref}`);
      refs.set(ref, bytes);
      for (const child of links(bytes.toString())) visit(child);
    }
    references.forEach(visit);
    for (const ref of links(body.toString())) {
      if (!ref.startsWith('references/') || !refs.has(ref.slice(11))) throw Error(`Undeclared reference in ${name}: ${ref}`);
    }
    const skill = Buffer.from(`---\nname: ${name}\ndescription: ${JSON.stringify(description)}\ndisable-model-invocation: true\n---\n\n${body}`);
    const metadata = Buffer.from(`interface:\n  display_name: ${JSON.stringify(name)}\n  short_description: ${JSON.stringify(description)}\npolicy:\n  allow_implicit_invocation: false\n`);
    for (const role of source ? [null] : declaration.roles) {
      const prefix = source ? `${name}/` : `${role}/${name}/`;
      const contents = new Map([['SKILL.md', skill], ['agents/openai.yaml', metadata], ...[...refs].map(([n,b]) => [`references/${n}`, b])]);
      if (existsSync(join(canonicalRoot, 'LICENSE'))) contents.set('LICENSE', canonicalText(join(canonicalRoot, 'LICENSE')));
      if (refs.has('setup.md')) {
        contents.set('scripts/install-human-readme.mjs', canonicalText(join(canonicalRoot, 'tools/install-human-readme.mjs')));
        contents.set('templates/HUMAN-README.md', canonicalText(join(canonicalRoot, 'templates/HUMAN-README.md')));
      }
      const sources = Object.fromEntries([...contents].map(([n,b]) => [n, hash(b)]));
      const revisions = Object.fromEntries([...refs].map(([name, bytes]) => [name, Number(bytes.toString().match(/^Revision: ([1-9][0-9]*)$/m)[1])]));
      contents.set('bundle.json', Buffer.from(JSON.stringify({ schemaVersion: 1, workflow: name, ...(source ? {roles:declaration.roles} : {role}), supportedVersions:{bundle:1,config:2,state:1}, revisions, sources }, null, 2) + '\n'));
      for (const [name, bytes] of contents) files.set(prefix + name, bytes);
    }
  }
  return files;
}
function installedFiles(base, relative = '') {
  return readdirSync(join(base, relative), { withFileTypes: true }).flatMap(entry => {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error(`Linked bundle entry: ${path}`);
    if (entry.isDirectory()) return installedFiles(base, path);
    if (!entry.isFile()) throw Error(`Unsupported bundle entry: ${path}`);
    return [path];
  });
}
export function build(out = join(root, 'dist'), source = false, canonicalRoot = root) {
  const files = expected(source,canonicalRoot);
  if (existsSync(out) && installedFiles(out).some(path => !files.has(path))) throw Error('Output contains stale or foreign files; choose a clean output directory');
  for (const [name, bytes] of files) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), bytes);
  }
  check(out, source, canonicalRoot);
}
export function check(out = join(root, 'dist'), source = false, canonicalRoot = root) {
  const files = expected(source,canonicalRoot);
  for (const [name, bytes] of files) {
    const path = join(out, name);
    if (!existsSync(path) || !regular(path).equals(bytes)) throw Error(`Missing file or canonical drift: ${name}`);
  }
  for (const path of installedFiles(out)) if (!files.has(path)) throw Error(`Unexpected bundle file: ${path}`);
}
function completeRoleSets(canonicalRoot=root) {
  const declared = roles.map(role => [...expected(false,canonicalRoot).keys()].filter(path => path.startsWith(`${role}/`) && path.endsWith('/SKILL.md')).map(path => path.split('/')[1]).sort());
  const required = [['inbox','new-version','send','send-final'],['inbox','order']].map(names => names.sort());
  if (JSON.stringify(declared) !== JSON.stringify(required)) throw Error('Distribution requires the complete actual four designer and two developer workflows');
}
export function buildSource(out = join(root, 'skills'), {complete=true,canonicalRoot=root}={}) { if(complete)completeRoleSets(canonicalRoot); build(out, true,canonicalRoot); }
export function checkSource(out = join(root, 'skills'), {complete=true,canonicalRoot=root}={}) { if(complete)completeRoleSets(canonicalRoot); check(out, true,canonicalRoot); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--source')) {
    if (process.argv.includes('--check')) checkSource(); else buildSource();
  } else if (process.argv.includes('--check')) check(); else build();
}
