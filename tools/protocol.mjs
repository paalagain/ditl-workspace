import { readFileSync } from 'node:fs';

export async function loadNamedBlock(reference, tag) {
  const text = readFileSync(reference, 'utf8');
  const blocks = [...text.matchAll(/```javascript ([a-z0-9-]+)\r?\n([\s\S]*?)\r?\n```/g)].filter(block => block[1] === tag);
  if (blocks.length !== 1) throw Error(`Expected exactly one ${tag} snippet: ${reference}`);
  return import(`data:text/javascript;base64,${Buffer.from(blocks[0][2]).toString('base64')}`);
}

export async function integrity(protocol = new URL('../protocols/format.md', import.meta.url)) {
  return loadNamedBlock(protocol, 'integrity-v1');
}

export async function inbox(protocol = new URL('../protocols/inbox.md', import.meta.url), format) {
  const module = await loadNamedBlock(protocol, 'inbox-v1');
  return module.inboxV1(format || await integrity());
}
