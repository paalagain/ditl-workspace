import { integrity, loadNamedBlock } from './protocol.mjs';
import { orders } from './orders.mjs';

export async function designerInbox(protocol=new URL('../protocols/designer-inbox.md',import.meta.url)) {
  const module=await loadNamedBlock(protocol,'designer-inbox-v1');
  return module.createDesignerInbox(await integrity(),await orders());
}
