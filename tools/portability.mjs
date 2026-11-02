import { loadNamedBlock } from './protocol.mjs';
export async function portability(protocol = new URL('../protocols/portability.md', import.meta.url)) {
  return loadNamedBlock(protocol,'portability-v1');
}
