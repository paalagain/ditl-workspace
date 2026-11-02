import {integrity,loadNamedBlock} from './protocol.mjs';
import {orders} from './orders.mjs';

export async function sending(protocol=new URL('../protocols/sending.md',import.meta.url)) {
  const module=await loadNamedBlock(protocol,'sending-v1');
  return module.createSending(await integrity(),await orders());
}
