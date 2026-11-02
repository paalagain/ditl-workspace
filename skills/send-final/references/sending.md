# Intentional order and version selection

Revision: 4

Read [Project](project.md), [Orders](orders.md), [Versions](versions.md), [Send recovery](send-recovery.md) and [Format](format.md). Both send actions use this sequence before a **new** capture. Existing pending deliveries are reconciled first; the selection functions never replace their identity, captured bytes or frozen evidence.

Before selection/capture execute [Observed cancellation](cancellation.md), then refresh complete issue/release observations. These selection helpers exclude requests but do not substitute for applying/reporting their effects. Preserve any prepared delivery when cancellation blocks continuing it. Both sends execute the same owner again immediately before publication.

Execute the block below with `createSending(formatModule, ordersModule)`, using the exact installed Format block and `createOrders(formatModule)` from Orders. Supply current complete repository-bound issue/release/tag listings after Project preflight. Network errors or incomplete pages stop the action; they are not empty lists.

```javascript sending-v1
import {existsSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export function createSending(format,orders) {
  const fail=message=>{throw Error(message);};
  const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function context(root) {
    const project=format.readProject(root,'designer');
    format.reconcileRecordReplacement(project,bytes=>format.validatePendingRecord(bytes,project.config.repository.repositoryId));
    return format.readProject(project.root,'designer');
  }
  function records(project) {
    const base=join(project.root,'.designeritl','pending'),found=[];
    if(existsSync(base)) {
      if(!lstatSync(base).isDirectory()||lstatSync(base).isSymbolicLink()) fail('Unsafe pending directory');
      for(const id of readdirSync(base)) {
        if(!uuid(id)) fail('Unsupported pending directory; preserve and reconcile it');
        const record=format.validatePendingRecord(format.readProjectRecord(project.root,`.designeritl/pending/${id}/record.json`),project.config.repository.repositoryId);
        if(record.deliveryId!==id) fail('Conflicting pending directory identity');
        found.push(record);
      }
    }
    if(project.state.pendingDeliveryIndex.some(id=>!uuid(id)||!found.some(record=>record.deliveryId===id))) fail('Missing or malformed indexed pending delivery');
    for(const reservation of project.state.deliveryTagReservations||[]) if(found.some(record=>(record.deliveryId===reservation.deliveryId&&record.tag!==reservation.tag)||(record.tag===reservation.tag&&record.deliveryId!==reservation.deliveryId))) fail('Conflicting local delivery tag reservation');
    return found;
  }
  function pending(project,issues,releases) {
    if(!Array.isArray(issues)||!Array.isArray(releases)) fail('Complete issue and release observations are required');
    const found=records(project),completed=project.state.completedDeliveries||[],unfinished=[];
    for(const record of found) {
      const receipts=completed.filter(entry=>entry.deliveryId===record.deliveryId);
      if(receipts.length>1) fail('Conflicting completed delivery identities');
      if(!receipts.length) {unfinished.push(record);continue;}
      const saved=format.verifyPendingDelivery(join(project.root,'.designeritl','pending',record.deliveryId),project.config.repository.repositoryId),receipt=receipts[0];
      const matches=releases.filter(release=>release.tag_name===record.tag);
      if(matches.length!==1||matches[0].draft!==false) fail('Retained completion no longer matches published history');
      const release=matches[0],blocks=[...(release.body||'').matchAll(/^```designeritl-delivery\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
      if(blocks.length!==1) fail('Retained release descriptor is malformed');
      format.verifyDelivery(saved.zip,JSON.parse(blocks[0][1]));
      const assets=release.assets;
      if(!Array.isArray(assets)||assets.length!==1||assets[0].name!==saved.descriptor.assetName||assets[0].size!==saved.descriptor.assetBytes) fail('Retained release asset identity changed');
      for(const [key,value] of Object.entries({repositoryId:record.repositoryId,orderNumber:record.orderNumber,tag:record.tag,releaseId:release.id,assetId:assets[0].id,manifestSha256:saved.descriptor.manifestSha256,zipSha256:saved.descriptor.zipSha256})) if(receipt[key]!==value) fail('Retained completion receipt changed');
      const stillAssigned=record.kind==='final'&&same(project.state.assignment,record.assignmentToken);
      const closed=record.kind!=='final'||issues.some(issue=>issue.number===record.orderNumber&&issue.state==='closed');
      if(project.state.pendingDeliveryIndex.includes(record.deliveryId)||stillAssigned||!closed) unfinished.push(record);
    }
    return unfinished;
  }
  function ready(root,observed) {
    const project=context(root),unfinished=pending(project,observed.issues,observed.releases);
    return {project,unfinished};
  }
  function selectOrder(root,{issues,releases,orderNumber}={}) {
    const {project,unfinished}=ready(root,{issues,releases});
    if(unfinished.length) return {status:unfinished.length>1?'choose-pending':'resume-pending',pending:unfinished.map(record=>({deliveryId:record.deliveryId,orderNumber:record.orderNumber,kind:record.kind,tag:record.tag}))};
    const observed=format.observedOrderIssues(issues),available=observed.filter(row=>!row.error&&row.state==='open'&&row.parsed?.kind==='order'&&!observed.some(cancel=>cancel.state==='open'&&cancel.parsed?.kind==='cancellation'&&cancel.parsed.metadata.cancelsOrderNumber===row.issueNumber));
    const active=project.state.assignment,number=orderNumber??active?.orderId.issueNumber;
    const chosen=available.find(row=>row.issueNumber===number);
    if(!chosen) {
      if(orderNumber!==undefined) fail('Selected work order is not open and available');
      return {status:'choose-order',orders:available.map(row=>({number:row.issueNumber,goal:row.parsed.goal})),warnings:observed.filter(row=>row.error).map(row=>({number:row.issueNumber,error:row.error}))};
    }
    const result=active?.orderId.issueNumber===number?{assignment:active,checklist:orders.readChecklist(project.root,number)}:orders.activate(project.root,number,issues);
    return {status:'selected',assignment:result.assignment,checklist:result.checklist};
  }
  function selectVersion(root,selection,{issues,releases,versionNumber}={}) {
    const {project,unfinished}=ready(root,{issues,releases});
    if(unfinished.length) fail('Reconcile pending delivery before selecting a version');
    if(selection?.status!=='selected'||!same(project.state.assignment,selection.assignment)) fail('Order selection changed; choose the intended order again');
    const observed=format.observedOrderIssues(issues).find(row=>row.issueNumber===selection.assignment.orderId.issueNumber);
    if(!observed||observed.error||observed.state!=='open'||observed.parsed?.kind!=='order') fail('Selected work order is no longer open');
    const versions=format.inspectVersions(project);
    if(versionNumber===undefined) return {status:'choose-version',versions:versions.versions,recommended:versions.recommended?.number??null};
    const version=versions.versions.find(entry=>entry.number===versionNumber);
    if(!version) fail('Selected prototype version does not exist');
    return {status:'selected',assignment:selection.assignment,checklist:orders.readChecklist(project.root,selection.assignment.orderId.issueNumber),version,sourcePath:join(project.root,'versions',version.folder)};
  }
  function reserve(root,selection,{issues,releases,tags,kind='send',now=new Date().toISOString()}={}) {
    const {project,unfinished}=ready(root,{issues,releases});
    if(unfinished.length) fail('Reconcile pending delivery before allocating another identity');
    if(!['send','final'].includes(kind)||!Array.isArray(tags)) fail('Complete tag observations and a supported send kind are required');
    const chosen=selectVersion(project.root,selection,{issues,releases,versionNumber:selection?.version?.number});
    if(chosen.status!=='selected') fail('An explicit numbered version choice is required');
    const number=chosen.assignment.orderId.issueNumber,observed=format.observedOrderIssues(issues);
    if(observed.some(row=>row.state==='open'&&row.parsed?.kind==='cancellation'&&row.parsed.metadata.cancelsOrderNumber===number)) fail('Observed cancellation prevents a new delivery');
    if(releases.some(release=>release.tag_name===`order-${number}/final`&&release.draft===false)) fail('A published final prevents a new delivery');
    const local=records(project),reservations=project.state.deliveryTagReservations||[];
    const allTags=[...tags.map(tag=>typeof tag?.name==='string'?tag.name:fail('Incomplete remote tag evidence')),...releases.map(release=>typeof release?.tag_name==='string'?release.tag_name:fail('Incomplete remote release evidence')),...local.map(record=>record.tag),...reservations.map(record=>record.tag)];
    let maximum=0;
    const prefix=`order-${number}/send-`;
    for(const tag of allTags) if(tag.startsWith(prefix)) {
      const suffix=tag.slice(prefix.length),ordinal=Number(suffix);
      if(!/^[1-9][0-9]*$/.test(suffix)||!Number.isSafeInteger(ordinal)||ordinal<1) fail('Malformed delivery-like tag prevents safe allocation');
      maximum=Math.max(maximum,ordinal);
    }
    if(maximum===Number.MAX_SAFE_INTEGER) fail('Delivery send-number space exhausted');
    const tag=kind==='final'?`order-${number}/final`:`order-${number}/send-${maximum+1}`;
    if(allTags.includes(tag)) fail('Occupied delivery tag; preserve conflicting identity');
    format.inventory(chosen.sourcePath);
    const deliveryId=randomUUID(),relative=`.designeritl/pending/${deliveryId}`,record={schemaVersion:1,repositoryId:project.config.repository.repositoryId,orderNumber:number,deliveryId,tag,kind,versionNumber:chosen.version.number,capturedFolder:chosen.version.folder,capturedAt:now,assignmentToken:chosen.assignment,sourcePath:chosen.sourcePath,stagingPath:join(project.root,relative,'snapshot',chosen.version.folder),draftCreation:{schemaVersion:1,attempts:[]}};
    const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n'),validate=value=>format.validatePendingRecord(value,record.repositoryId);
    validate(bytes);format.ensureProjectDirectory(project.root,relative);
    format.prepareRecordReplacement(project,`${relative}/record.json`,bytes,{owner:'deliveries',kind:'owner',expectedPreviousSha256:null},validate);
    format.reconcileRecordReplacement(format.readProject(project.root,'designer'),validate);
    const fresh=context(project.root),state={...fresh.state,pendingDeliveryIndex:[...fresh.state.pendingDeliveryIndex,deliveryId],deliveryTagReservations:[...(fresh.state.deliveryTagReservations||[]),{deliveryId,tag}]};
    format.prepareRecordReplacement(fresh,'.designeritl/state.json',Buffer.from(JSON.stringify(state,null,2)+'\n'),{owner:'deliveries',kind:'state'});
    format.reconcileRecordReplacement(format.readProject(project.root,'designer'));
    return record;
  }
  function nonfinalManifest(root,deliveryId,deliveryNote) {
    if(!uuid(deliveryId)) fail('Invalid selected delivery identity');
    const project=context(root),record=format.validatePendingRecord(format.readProjectRecord(project.root,`.designeritl/pending/${deliveryId}/record.json`),project.config.repository.repositoryId);
    if(record.deliveryId!==deliveryId||record.kind!=='send') fail('Nonfinal manifest requires its reserved send identity');
    const snapshot=join(project.root,'.designeritl','pending',deliveryId,'snapshot',record.capturedFolder);
    if(resolve(record.stagingPath)!==snapshot) fail('Captured snapshot escapes its pending operation');
    const captured=format.inventory(snapshot);
    if(record.payloadSha256!==captured.payloadSha256) fail('Coherent captured payload evidence is required');
    const directories=captured.directories??record.capturedDirectories;
    if(!Array.isArray(directories)||!directories.includes('assets/')) fail('Complete captured directory evidence is required');
    for(const path of directories) {if(typeof path!=='string'||!path.endsWith('/')) fail('Invalid captured directory evidence');format.safePath(path,true);}
    const checklist=orders.readChecklist(project.root,record.orderNumber),manifest={schemaVersion:2,repositoryId:record.repositoryId,orderNumber:record.orderNumber,deliveryId:record.deliveryId,tag:record.tag,kind:'send',versionNumber:record.versionNumber,capturedFolder:record.capturedFolder,capturedAt:record.capturedAt,inventory:captured.files,directories,payloadSha256:captured.payloadSha256,scopeSha256:checklist.scope.originalBodySha256,localProgress:{checkedOrdinals:checklist.checkedOrdinals,taskContext:checklist.taskContext},deliveryNote,evidence:null,deliveredUncheckedOrdinals:null};
    const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');format.validateManifest(bytes);return bytes;
  }
  return {selectOrder,selectVersion,reserve,nonfinalManifest,beginCaptureReplacement:format.beginCaptureReplacement,resumeCaptureReplacement:format.resumeCaptureReplacement};
}
```

1. Call `selectOrder` before asking about versions. `choose-pending` requires an explicit pending UUID choice; `resume-pending` follows Send recovery. Neither permits a new transaction. A verified retained completion is skipped only when its actual package, current published descriptor/asset, completion entry and required closed issue agree; phase fields are irrelevant.
2. If `choose-order`, show supported available open work orders and ask which one to send for. Do not choose a version yet. An explicit choice calls the same Orders activation policy as designer Inbox, preserving exact scope/progress/context and accumulated design. Reuse a currently active open order's token; do not reactivate it merely because send was invoked.
3. Call `selectVersion` after order selection. Show every valid numbered version and recommend its returned most-recently-edited number. Obtain an explicit version choice. Choosing an older version for delivery changes no working marker. Missing/multiple working markers do not justify silently picking a different delivery version; an explicit numbered choice is still required. Duplicate identities refuse selection.
4. Call `reserve` with that selected version, `kind: send|final` and complete current issues/releases/tags. Nonfinal `order-N/send-K` is strictly above all matching published tags, remote drafts/releases, retained local records and permanent local `deliveryTagReservations`. The optional ledger is an array of unique `{deliveryId,tag}` pairs owned by Deliveries. Keep entries permanently, including unused gaps; never delete or change one to renumber a retry. A pending record and ledger must agree. A final always uses its fixed final tag and occupied tags conflict.
5. The helper saves a validated pending record through Project, then journals the pending index/ledger. A crash between them leaves the record discoverable and its tag reserved; repair the index from that same record instead of allocating a new identity. The UUID/tag are saved before remote mutation. Capture and publish through Deliveries/Send recovery after this reservation. A packaged retry cannot call fresh reservation. An explicit pre-package capture replacement follows Send recovery under the same UUID/tag/ledger, retaining prior capture and evidence.
6. After coherent capture, save `payloadSha256`, `capturedInventory` and `capturedDirectories` from `capturePrototype` through Project's owner-record replacement. A new nonfinal send then calls `nonfinalManifest(root, deliveryId, deliveryNote)` for exact manifest bytes. It verifies the actual captured inventory and saved scope, retains local progress as context, and sets both final-evidence fields to null. Save these bytes once, then package and publish through the shared protocol. Unchecked tasks remain local progress context.
