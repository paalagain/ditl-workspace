import {integrity,loadNamedBlock} from './protocol.mjs';

export async function cancellation(protocol=new URL('../protocols/cancellation.md',import.meta.url)) {
  const module=await loadNamedBlock(protocol,'cancellation-v1');
  return module.createCancellation(await integrity());
}
