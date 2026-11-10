# Intentional order and delivery selection

Revision: 6

Read [Project](project.md), [Orders](orders.md), [Versions](versions.md), [Send recovery](send-recovery.md) and [Format](format.md). Both send actions use this sequence before a **new** capture. Existing pending deliveries are reconciled first; the selection functions never replace their identity, captured bytes or frozen evidence.

Before selection/capture execute [Observed cancellation](cancellation.md), including `inspect` and disclosure of every malformed issue's number and reason, then refresh complete issue/release observations. Apply its per-order isolation policy when resuming saved cancellation plans. Exclude malformed issues and orders whose relations target them; never modify those issues. A malformed selected/active order stops its own send with an explanation, while an explicitly selected valid order can proceed. These selection helpers exclude requests but do not substitute for applying/reporting their effects. Preserve any prepared delivery when cancellation blocks continuing it. Both sends execute the same owner again immediately before publication. Incomplete listings, network errors, conflicting identity and corrupt local state remain global blockers.

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
    const observed=format.observedOrderIssues(issues),available=observed.filter(row=>!format.orderIssueProblem(observed,row.issueNumber)&&row.state==='open'&&row.parsed?.kind==='order'&&!observed.some(cancel=>cancel.state==='open'&&cancel.parsed?.kind==='cancellation'&&cancel.parsed.metadata.cancelsOrderNumber===row.issueNumber));
    const active=project.state.assignment,number=orderNumber??active?.orderId.issueNumber;
    const problem=format.orderIssueProblem(observed,number);if(problem)fail(problem);
    const chosen=available.find(row=>row.issueNumber===number);
    if(!chosen) {
      if(orderNumber!==undefined) fail('Selected work order is not open and available');
      return {status:'choose-order',orders:available.map(row=>({number:row.issueNumber,goal:row.parsed.goal})),warnings:observed.filter(row=>row.error).map(row=>({number:row.issueNumber,error:row.error}))};
    }
    const result=active?.orderId.issueNumber===number?{assignment:active,checklist:orders.readChecklist(project.root,number)}:orders.activate(project.root,number,issues);
    return {status:'selected',assignment:result.assignment,checklist:result.checklist};
  }
  function selectedProject(root,selection,{issues,releases}) {
    const {project,unfinished}=ready(root,{issues,releases});
    if(unfinished.length) fail('Reconcile pending delivery before selecting what to send');
    if(selection?.status!=='selected'||!same(project.state.assignment,selection.assignment)) fail('Order selection changed; choose the intended order again');
    const rows=format.observedOrderIssues(issues),observed=rows.find(row=>row.issueNumber===selection.assignment.orderId.issueNumber);
    const problem=format.orderIssueProblem(rows,selection.assignment.orderId.issueNumber);if(problem)fail(problem);
    if(!observed||observed.error||observed.state!=='open'||observed.parsed?.kind!=='order') fail('Selected work order is no longer open');
    return project;
  }
  function selectVersion(root,selection,{issues,releases,versionNumber}={}) {
    const project=selectedProject(root,selection,{issues,releases});
    const versions=format.inspectVersions(project);
    if(versionNumber===undefined) return {status:'choose-version',versions:versions.versions,recommended:versions.recommended?.number??null};
    const version=versions.versions.find(entry=>entry.number===versionNumber);
    if(!version) fail('Selected prototype version does not exist');
    return {status:'selected',assignment:selection.assignment,checklist:orders.readChecklist(project.root,selection.assignment.orderId.issueNumber),version,sourcePath:join(project.root,'versions',version.folder)};
  }
  function selectFiles(root,selection,{issues,releases,paths}={}) {
    const project=selectedProject(root,selection,{issues,releases});
    const files=format.inspectFileSelection(project.root,paths,join(project.root,'.designeritl','pending'));
    return {status:'selected',assignment:selection.assignment,payloadType:'files',...files};
  }
  function reserve(root,selection,{issues,releases,tags,kind='send',deliveryNote,now=new Date().toISOString()}={}) {
    const {project,unfinished}=ready(root,{issues,releases});
    if(unfinished.length) fail('Reconcile pending delivery before allocating another identity');
    if(!['send','final'].includes(kind)||!Array.isArray(tags)) fail('Complete tag observations and a supported send kind are required');
    const files=selection?.payloadType==='files';
    if(files&&kind==='final') fail('Final delivery requires a numbered version');
    const chosen=files
      ? selectFiles(project.root,selection,{issues,releases,paths:selection.sourceFiles?.map(file=>file.sourcePath)})
      : selectVersion(project.root,selection,{issues,releases,versionNumber:selection?.version?.number});
    if(chosen.status!=='selected') fail('An explicit numbered version choice is required');
    if(files&&(!same(chosen.sourceFiles,selection.sourceFiles)||!same(chosen.selectedInventory,selection.selectedInventory))) {
      fail('Selected files changed since preview; review the selection again');
    }
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
    if(!files) format.inventory(chosen.sourcePath);
    const deliveryId=randomUUID(),relative=`.designeritl/pending/${deliveryId}`;
    const capture=files
      ? {payloadType:'files',capturedFolder:'files',sourceFiles:chosen.sourceFiles,selectedInventory:chosen.selectedInventory}
      : {versionNumber:chosen.version.number,capturedFolder:chosen.version.folder,sourcePath:chosen.sourcePath};
    const record={schemaVersion:1,repositoryId:project.config.repository.repositoryId,orderNumber:number,deliveryId,tag,kind,
      ...capture,capturedAt:now,assignmentToken:chosen.assignment,stagingPath:join(project.root,relative,'snapshot',capture.capturedFolder),
      draftCreation:{schemaVersion:1,attempts:[]}};
    if(files) {
      const checklist=orders.readChecklist(project.root,number);
      record.fileDeliveryContext={
        scopeSha256:checklist.scope.originalBodySha256,
        localProgress:{checkedOrdinals:checklist.checkedOrdinals,taskContext:checklist.taskContext},
        deliveryNote
      };
    }
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
    const captured=format.inventoryDelivery(snapshot,record.payloadType);
    if(record.payloadSha256!==captured.payloadSha256) fail('Coherent captured payload evidence is required');
    if(record.payloadType==='files') {
      if(!same(captured,record.selectedInventory)) fail('Captured files differ from the reserved selection');
      return format.fileDeliveryManifest(record);
    }
    const checklist=orders.readChecklist(project.root,record.orderNumber),manifest={schemaVersion:2,versionNumber:record.versionNumber,repositoryId:record.repositoryId,orderNumber:record.orderNumber,deliveryId:record.deliveryId,tag:record.tag,kind:'send',capturedFolder:record.capturedFolder,capturedAt:record.capturedAt,inventory:captured.files,directories:captured.directories,payloadSha256:captured.payloadSha256,scopeSha256:checklist.scope.originalBodySha256,localProgress:{checkedOrdinals:checklist.checkedOrdinals,taskContext:checklist.taskContext},deliveryNote,evidence:null,deliveredUncheckedOrdinals:null};
    const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');format.validateManifest(bytes);return bytes;
  }
  return {selectOrder,selectVersion,selectFiles,reserve,nonfinalManifest,beginCaptureReplacement:format.beginCaptureReplacement,resumeCaptureReplacement:format.resumeCaptureReplacement};
}
```

1. Call `selectOrder` before asking what to send. `choose-pending` requires an explicit pending UUID choice. `resume-pending` follows Send recovery. A verified retained completion is skipped only when its actual package, current published descriptor/asset, completion entry and required closed issue agree.
2. If `choose-order`, show available open work orders and ask which one to send for. An explicit choice uses the Orders activation policy from designer Inbox. Reuse a currently active open order's token.
3. For `send`, use the explicit choice in the invocation or ask for files, folders or a numbered version. For files and folders, call `selectFiles(root, order, {issues, releases, paths})` with the designer's exact paths. Resolve relative paths from the project. For each selected folder, include its descendants and empty directories. Preserve paths relative to the project for project files and start outside selections at their basename. Report collisions or unsafe paths and ask for a revised selection. Show the resolved inventory before reserving it. For a numbered version or `send-final`, call `selectVersion`. If a number is missing, show every valid version and recommend the most recently edited one. Wait for the explicit number and preserve the working marker.
4. Call `reserve` with the returned selection, `kind: send|final` and complete current issues/releases/tags. For files, supply `deliveryNote` in the options with a summary, `outsideOrder` and `workInProgress` (explicit `None` when applicable). Reservation checks the preview again and freezes the manifest context so it can verify the exact combined size before writing a pending record. Ask the designer to review any changed selection. Nonfinal `order-N/send-K` is strictly above all matching published tags, remote drafts/releases, retained local records and permanent local `deliveryTagReservations`. Keep the unique `{deliveryId,tag}` pairs permanently, including unused gaps. A pending record and ledger must agree. A final always uses its fixed final tag and occupied tags conflict.
5. The helper saves a validated pending record through Project, then journals the pending index/ledger. A crash between them leaves the record discoverable and its tag reserved; repair the index from that same record instead of allocating a new identity. The UUID/tag are saved before remote mutation. Capture and publish through Deliveries/Send recovery after this reservation. A packaged retry cannot call fresh reservation. An explicit pre-package capture replacement follows Send recovery under the same UUID/tag/ledger, retaining prior capture and evidence.
6. After coherent capture, save `payloadSha256`, `capturedInventory` and `capturedDirectories` from the capture helper through Project's owner-record replacement. A nonfinal send calls `nonfinalManifest(root, deliveryId)` for files or `nonfinalManifest(root, deliveryId, deliveryNote)` for a numbered prototype. Both verify the capture, retain local progress as context and set both final-evidence fields to null. Save these exact manifest bytes, then package and publish through the shared protocol.
