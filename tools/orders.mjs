import { integrity, loadNamedBlock } from './protocol.mjs';

export async function orders(protocol=new URL('../protocols/orders.md',import.meta.url)) {
  const module=await loadNamedBlock(protocol,'orders-v1');
  return module.createOrders(await integrity());
}
