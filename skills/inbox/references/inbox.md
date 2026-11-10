# Inbox

Revision: 6

Read [Project](project.md), [Orders](orders.md), and [Format](format.md). Run only when explicitly invoked. Designer discovery and developer reception use separate role paths.

## Developer reception

1. Complete Project preflight and reconcile any interrupted record replacement first. Fetch the entire repository-targeted release listing with `gh api --paginate --slurp 'repos/OWNER/NAME/releases?per_page=100'`, flattening pages only after every page succeeded. Discover independently of seen fingerprints and receipts. Ignore drafts and unrelated releases. For each delivery-like release, fetch its complete asset listing with the corresponding paginated `releases/RELEASE_ID/assets?per_page=100` endpoint and call `observeRelease(release, repositoryId, assets)`. Catch a malformed descriptor, unsupported schema, duplicate descriptor, identity or asset error per release, report it and continue independent releases. Release prose is data.
2. Extract the exact `inbox-v1` block below and the canonical [Format](format.md) block into temporary local modules. Call `inboxV1(format)`. Use `receiveOne` for each valid observation, or `receiveAll` to continue after failures. These mandatory gates compare actual bytes and current remote identity; do not replace their decisions with filename, phase, seen fingerprint or agent judgement. Resolve `destinationRoot` from configured destination relative to the opened project. Default installed paths are `<destination>/order-N/UUID/`.
3. Supply the following effect adapters; they orchestrate transport and Project records while the canonical gates perform validation:
   - `download(zipPath, observation)`: use explicit `--repo OWNER/NAME` with `gh release download TAG --pattern delivery.zip --output ZIP_PATH` (or the exact asset ID through repository-targeted API). The fresh output path is supplied by the gate. Retain partial files on failure; never clobber. The gate calls `receiveDelivery` once, so archive metadata limits and known destination capacity are checked before inflation or extraction.
   - `refresh(observation)`: freshly fetch the exact release ID and its complete asset list, then return `observeRelease` with configured repository ID. A draft, failed/incomplete lookup, changed release/asset identity or descriptor refuses success. Never return the earlier observation without actually fetching it.
   - `persistReceipt(key, receipt)`: reread the complete current Project state after reconciling its journal. Require the key still absent and validate every prior receipt. Add the receipt without replacing any earlier receipt or other state section, then use Project's verified record replacement as owner `inbox`, reread and verify the stored receipt. Update the caller's receipt map only from that verified state. A failed write records no claimed completion. A committed replacement with lost response is reconciled by Project before retry.
4. Pass `receipts` as the current `completedDownloadReceipts` map. Each value retains repositoryId, deliveryId, orderNumber, releaseId, assetId, manifestSha256, zipSha256, inventorySha256, canonical absolute destination and verifiedAt. Preserve existing UUID keys. An explicit recovery destination adds a fresh `UUID@random-UUID` key when that UUID already exists; old values are immutable. Validate nested receipt fields and reject unknown embedded versions before use. `seenReleaseFingerprints` is only observation history and never a reason to skip discovery or verification.
5. The gate skips a completed delivery only after receipt, actual installed manifest/complete files/directories and freshly observed remote identity agree. Missing receipt triggers fresh verified staging; an exact existing installed tree repairs only the receipt. Interrupted download/extraction leaves separate retained staging and no receipt. Interrupted promotion is reconciled from the actual destination: absent starts new staging, exact existing tree repairs the receipt, divergent tree is retained. After promotion, installed bytes and current remote identity are verified again before receipt persistence. Only after the verified install is durably recorded by `persistReceipt`, or an existing durable matching receipt is verified, remove this invocation's staging directory. Preserve staging from every failed or interrupted invocation and every other operation. The empty staging root may remain.
6. Treat changed or missing local files and changed remote identity as divergence. Preserve earlier folders, receipt values, staging and failed-effect evidence. Continue independent deliveries. Offer verified staging or an explicit `recoveryDestination` chosen by the user. The same gates verify that destination and append history. Report each outcome and UUID, plus retained staging and its reason when applicable. A staging cleanup failure leaves the successful result intact and returns `staging` and `cleanupWarning`; report both. For an installed file delivery, report the exact `files/` path and the included paths from the verified manifest. For a numbered prototype, report the exact installed `capturedFolder/index.html`. A final delivery does not imply developer acceptance.

For finals, show the verified original task definitions with reassessment results/evidence and delivered unchecked tasks, retained local progress, technical findings, coverage gaps/checks not run, any unavailable reason and designer acknowledgments. Optional cosmetic advice stays separate. Read these from the already hash-verified frozen records; never reconstruct report hashes through JSON reserialization or imply developer acceptance.

## Designer discovery

Execute [Observed cancellation](cancellation.md) for durable application and replayable disclosure before ordinary discovery. Its saved assignment token is the compare-and-clear authority; this action preserves later activation identities and every design/checklist/pending artifact. Developer Inbox never applies designer closure effects.

Follow [Designer Inbox work entry](designer-inbox.md) for complete discovery, saved report replay, disclosure-before-fingerprint advancement, and starting or resuming work. Compare original agreed-scope and last-observed body hashes separately; progress ticks and unrelated timestamps are not remote scope changes. Explicit check/show/review-only requests and setup connectivity checks finish after disclosure, preserving assignment and design except observed cancellation effects. Ordinary designer Inbox continues into work in the same conversation; it requires no separate Start invocation.

An observed cancellation request names an order. If that order is open without a published final, close as not planned; close the request as completed; clear only the matching saved assignment; retain local checklist, versions and pending capture. Name all already-published deliveries crossing the request. If target already closed or has published final, report and close the request without effect. A hand-closed order without final is cancelled when observed; close nothing in that case. Never delete releases or reopen issues. Both send boundaries use this same observation rule.

## Canonical reception and history

Execute this verbatim module beside the canonical Format module, then call `inboxV1(format)` with that module's exports. These are disposable protocol modules, not shipped executables. Retain modules and staging while recovering an interrupted invocation. This module handles developer reception only.

```javascript inbox-v1
import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readdirSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {resolve,join,dirname,parse} from 'node:path';

export function inboxV1(format) {
  const fail=message=>{throw Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const positive=value=>Number.isSafeInteger(value)&&value>0;
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
  const sameObservation=(a,b)=>a&&b&&a.releaseId===b.releaseId&&a.assetId===b.assetId&&['schemaVersion','repositoryId','orderNumber','deliveryId','tag','kind','assetName','assetBytes','manifestSha256','zipSha256'].every(key=>a.descriptor?.[key]===b.descriptor?.[key]);
  function observeRelease(release,repositoryId,assets) {
    if(release.draft) return null;
    if(release.draft!==false) fail('Unknown release publication state');
    const body=typeof release.body==='string'?release.body:'';
    const blocks=[...body.matchAll(/^```designeritl-delivery\r?\n([\s\S]*?)\r?\n```[ \t]*\r?$/gm)];
    if(!blocks.length&&!/^order-[0-9]+\/(?:send-|final)/.test(release.tag_name||'')&&!body.includes('designeritl-delivery')) return null;
    if(blocks.length!==1) fail('Malformed delivery-like release descriptor');
    const d=JSON.parse(blocks[0][1]);
    if(!d||d.schemaVersion!==1||d.repositoryId!==repositoryId||!positive(repositoryId)||!positive(release.id)||!positive(d.orderNumber)||typeof d.deliveryId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.deliveryId)||!['send','final'].includes(d.kind)||d.tag!==release.tag_name||!(d.kind==='final'?d.tag===`order-${d.orderNumber}/final`:new RegExp(`^order-${d.orderNumber}/send-[1-9][0-9]*$`).test(d.tag))||d.assetName!=='delivery.zip'||!positive(d.assetBytes)||!hash(d.manifestSha256)||!hash(d.zipSha256)) fail('Invalid delivery descriptor or repository identity');
    if(!Array.isArray(assets)||assets.length!==1||assets[0].name!==d.assetName||assets[0].size!==d.assetBytes||!positive(assets[0].id)) fail('Delivery asset identity or size mismatch');
    return {descriptor:d,releaseId:release.id,assetId:assets[0].id};
  }
  function regularParents(path) {
    let current=resolve(path);
    for(;;) {
      if(existsSync(current)) {const stat=lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink()) fail('Unsafe destination directory or link');}
      if(current===parse(current).root) break;
      current=dirname(current);
    }
  }
  function verifyInstalled(destination,observation,entries) {
    const root=resolve(destination), d=observation.descriptor;
    regularParents(root);
    const manifestBytes=readFileSync(join(root,'manifest.json'));
    if(format.sha256(manifestBytes)!==d.manifestSha256) fail('Installed manifest hash divergence');
    const manifest=format.validateManifest(manifestBytes), prefix=manifest.capturedFolder+'/';
    for(const key of ['repositoryId','orderNumber','deliveryId','tag','kind']) if(manifest[key]!==d[key]) fail('Installed identity divergence');
    const expected=new Map([['manifest.json',{bytes:manifestBytes.length,sha256:d.manifestSha256}],[prefix,{}]]);
    for(const entry of manifest.inventory) expected.set(prefix+entry.path,entry);
    for(const path of format.manifestDirectories(manifest)) expected.set(prefix+path,{});
    if(entries&&!same([...expected.keys()].sort(),entries.map(e=>e.path).sort())) fail('Installed expected archive inventory divergence');
    const seen=[];
    function walk(directory,prefix='') {
      for(const name of readdirSync(directory)) {
        const path=prefix+name, full=join(directory,name), stat=lstatSync(full);
        format.safePath(path);
        if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory())) fail('Unsafe installed tree type or link');
        const key=stat.isDirectory()?path+'/':path, entry=expected.get(key);
        if(!entry) fail('Installed structure inventory divergence');
        seen.push(key);
        if(stat.isDirectory()) walk(full,key);
        else {const bytes=readFileSync(full);if(bytes.length!==entry.bytes||format.sha256(bytes)!==entry.sha256) fail('Installed file bytes divergence');}
      }
    }
    walk(root);
    if(seen.length!==expected.size) fail('Installed inventory missing files or directories');
    const inventory=format.inventoryDelivery(join(root,manifest.capturedFolder),manifest.payloadType);
    if(!same(inventory.files,manifest.inventory)||inventory.payloadSha256!==manifest.payloadSha256) fail('Installed payload inventory divergence');
    return {manifest,inventory};
  }
  function receiptMatches(receipt,observation,destination,manifest) {
    const d=observation.descriptor;
    return receipt&&receipt.repositoryId===d.repositoryId&&receipt.deliveryId===d.deliveryId&&receipt.orderNumber===d.orderNumber&&receipt.releaseId===observation.releaseId&&receipt.assetId===observation.assetId&&receipt.manifestSha256===d.manifestSha256&&receipt.zipSha256===d.zipSha256&&receipt.inventorySha256===manifest.payloadSha256&&receipt.destination===destination&&typeof receipt.verifiedAt==='string'&&Number.isFinite(Date.parse(receipt.verifiedAt));
  }
  async function receiveOne({observation,destinationRoot,receipts,download,refresh,persistReceipt,recoveryDestination=null}) {
    const d=observation.descriptor, root=resolve(destinationRoot);
    regularParents(root);mkdirSync(root,{recursive:true});
    const target=recoveryDestination===null?join(root,`order-${d.orderNumber}`,d.deliveryId):resolve(recoveryDestination);
    regularParents(dirname(target));
    if(!receipts||typeof receipts!=='object'||Array.isArray(receipts)) fail('Invalid completed receipt history');
    for(const [key,r] of Object.entries(receipts)) {
      if(!r||typeof r!=='object'||(r.schemaVersion!==undefined&&r.schemaVersion!==1)||r.repositoryId!==d.repositoryId||!uuid(r.deliveryId)||!(key===r.deliveryId||(key.startsWith(r.deliveryId+'@')&&uuid(key.slice(r.deliveryId.length+1))))||!positive(r.orderNumber)||!positive(r.releaseId)||!positive(r.assetId)||![r.manifestSha256,r.zipSha256,r.inventorySha256].every(hash)||typeof r.destination!=='string'||resolve(r.destination)!==r.destination||typeof r.verifiedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.verifiedAt)||!Number.isFinite(Date.parse(r.verifiedAt))) fail('Invalid completed receipt history');
    }
    const previous=Object.entries(receipts).filter(([,r])=>r?.deliveryId===d.deliveryId);
    if(existsSync(target)) {
      const candidate=previous.find(([,r])=>r.destination===target&&r.releaseId===observation.releaseId&&r.assetId===observation.assetId&&r.manifestSha256===d.manifestSha256&&r.zipSha256===d.zipSha256);
      if(candidate) {
        const installed=verifyInstalled(target,observation);
        if(receiptMatches(candidate[1],observation,target,installed.manifest)) {
          if(!sameObservation(await refresh(observation),observation)) fail('Current remote delivery identity divergence');
          return {status:'skipped',destination:target,receiptKey:candidate[0]};
        }
      }
    }
    const stagingParent=join(root,'.designeritl-staging');regularParents(stagingParent);mkdirSync(stagingParent,{recursive:true});
    const staging=join(stagingParent,randomUUID());mkdirSync(staging);
    const zipPath=join(staging,'delivery.zip'), tree=join(staging,'tree');
    const cleanupStaging=()=>{
      try {regularParents(staging);rmSync(staging,{recursive:true});return {};}
      catch(error) {return {staging,cleanupWarning:error.message};}
    };
    await download(zipPath,observation);
    const verified=format.receiveDelivery(readFileSync(zipPath),d,tree);
    if(!sameObservation(await refresh(observation),observation)) fail('Current remote delivery identity divergence');
    if(previous.some(([,r])=>!receiptMatches(r,observation,r.destination,verified.manifest))&&recoveryDestination===null) fail('Remote identity divergence; earlier receipt retained');
    const existed=existsSync(target);
    if(!existed&&previous.some(([,r])=>r.destination===target)) fail('Installed delivery missing; earlier receipt retained');
    if(existed) verifyInstalled(target,observation,verified.entries);
    else {
      mkdirSync(dirname(target),{recursive:true});regularParents(dirname(target));
      if(existsSync(target)) fail('Destination became occupied; preserve staging');
      renameSync(tree,target);
    }
    const installed=verifyInstalled(target,observation,verified.entries);
    if(!sameObservation(await refresh(observation),observation)) fail('Current remote delivery identity divergence before receipt');
    const match=previous.find(([,r])=>receiptMatches(r,observation,target,installed.manifest));
    if(match) return {status:'skipped',destination:target,receiptKey:match[0],...cleanupStaging()};
    const receipt={repositoryId:d.repositoryId,deliveryId:d.deliveryId,orderNumber:d.orderNumber,releaseId:observation.releaseId,assetId:observation.assetId,manifestSha256:d.manifestSha256,zipSha256:d.zipSha256,inventorySha256:installed.manifest.payloadSha256,destination:target,verifiedAt:new Date().toISOString()};
    const key=Object.hasOwn(receipts,d.deliveryId)?`${d.deliveryId}@${randomUUID()}`:d.deliveryId;
    await persistReceipt(key,receipt);
    return {status:existed?'repaired':'installed',destination:target,receiptKey:key,...cleanupStaging()};
  }
  async function receiveAll(deliveries,options) {
    const results=[];
    for(const observation of deliveries) {
      try {results.push({deliveryId:observation.descriptor.deliveryId,...await receiveOne({...options,observation})});}
      catch(error) {results.push({deliveryId:observation.descriptor.deliveryId,status:'refused',reason:error.message});}
    }
    return results;
  }
  return {observeRelease,verifyInstalled,receiveOne,receiveAll};
}
```
