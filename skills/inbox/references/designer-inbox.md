# Designer Inbox work entry

Revision: 5

Read [Project](project.md), [Orders](orders.md), [Versions](versions.md), and [Format](format.md). This is the designer branch of explicitly invoked Inbox. Ordinary invocation discovers work and continues into starting or resuming it. Explicit check/show/review-only requests and setup connectivity checks perform observations only, apart from the shared cancellation policy.

Fetch all issues, including closed issues, and published finals with complete repository-targeted pagination. Apply observed cancellation through the shared Inbox cancellation policy before offering assignments, then refresh changed remote observations. Cancellation requests and known closed orders are never startable. Malformed metadata is retained and reported as data, never executed or silently accepted as an order.

Follow [Observed cancellation](cancellation.md) first: inspect and disclose malformed issue numbers/reasons, resume its saved application records with that owner's per-order isolation policy, apply current complete observations through that owner, disclose every result and crossing delivery, then acknowledge its report. Refresh issue/release observations after remote effects before preparing ordinary designer Inbox reports. A report already saved by this module is still replayed/disclosed; cancellation never discards earlier notification material or local progress. Inbox reports work orders and preserves their local progress. A malformed active order stops its continuation; explicitly selecting another valid order remains possible. An order whose relation targets a malformed issue is excluded from selection until resolved. Never modify a malformed issue.

Execute this exact module with `createDesignerInbox(formatModule, ordersModule)`, where Orders supplies `createOrders(formatModule)` from its installed exact block. It persists report material separately from observation fingerprints. On invocation, first replay every `pending` report to the participant and `acknowledge` it only after user-facing disclosure; then collect a fresh complete listing and `prepare` a new report. Show new/changed observations separately from existing scope divergence. Always show malformed records. Unrelated timestamp changes do not count as changed scope.

After disclosing and acknowledging the fresh report, call `beginWork(root, {issues, releases, orderNumber, checkOnly})` with the current complete bound observations after cancellation reconciliation. Include complete asset identities for releases. Failed or incomplete pages stop the action; saved report choices are never fresh activation authority. Translate the participant's intent to `checkOnly: true` for an observational or connectivity-only request, including a named order in such a request. Otherwise bare designer Inbox authorizes entering work and freezing the selected agreement. `orderNumber` is supplied only for an explicit order selection. The helper prefers an eligible active assignment, then the sole eligible order, excluding published finals and open cancellation targets. `choose-order` asks once with the returned goals/numbers; continue this Inbox after the answer with fresh observations. `no-work` reports why work is unavailable. An explicitly named ineligible order is refused without silently selecting another.

For `started` or `resumed`, show the selected order's agreed goal/tasks, saved progress/context and any scope divergence, then continue the requested design work. Repeated continuation of the same active assignment retains its activation UUID; switching uses Orders activation and preserves the prior checklist/context and accumulated design. Keep ticks and task context current through Orders `updateProgress` as work proceeds. Existing versions and working markers are preserved. With no versions the helper creates the first empty working prototype through Versions; a from-scratch request needs no existing design or import choice. If `versionCreationPending` is true, follow Versions recovery before edits; `requiresVersionChoice` requests only the actual working-version choice. Neither condition requires selecting the order again. Creation and work entry never establish delivery eligibility.

```javascript designer-inbox-v1
import { randomUUID } from 'node:crypto';
import { existsSync,readdirSync } from 'node:fs';
import { join } from 'node:path';

export function createDesignerInbox(format,orders) {
  const fail=message=>{throw Error(message);};
  const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
  const pathFor=(id,receipt=false)=>`.designeritl/reports/designer-${id}${receipt?'.receipt':''}.json`;
  function context(root) {
    let project=format.readProject(root,'designer');format.reconcileRecordReplacement(project);
    return format.readProject(project.root,'designer');
  }
  function persist(project,path,bytes,kind,expectedPreviousSha256) {
    format.prepareRecordReplacement(project,path,bytes,{owner:'inbox',kind,expectedPreviousSha256});
    format.reconcileRecordReplacement(format.readProject(project.root,'designer'));
    return format.readProject(project.root,'designer');
  }
  function reportFor(project,id) {
    const bytes=format.readProjectRecord(project.root,pathFor(id));
    return {bytes,record:format.validateDesignerInboxRecord(bytes,project,id)};
  }
  function receiptFor(project,id,report) {
    const bytes=format.readProjectRecord(project.root,pathFor(id,true),false);
    if(bytes===null)return null;
    const receipt=format.validateDesignerInboxRecord(bytes,project,id,true);
    if(receipt.reportSha256!==format.sha256(report.bytes)||receipt.appliedFingerprintsSha256!==format.designerFingerprintDigest(report.record.nextFingerprints)) fail('Conflicting report-disclosure receipt; retain evidence');
    return receipt;
  }
  function pending(root) {
    const project=context(root),directory=join(project.root,'.designeritl','reports');
    if(!existsSync(directory))return [];
    format.ensureProjectDirectory(project.root,'.designeritl/reports');
    const reports=[],names=readdirSync(directory).sort();
    for(const name of names) {
      const receipt=/^designer-([a-f0-9-]+)\.receipt\.json$/.exec(name);
      if(receipt)receiptFor(project,receipt[1],reportFor(project,receipt[1]));
    }
    for(const name of names) {
      const match=/^designer-([a-f0-9-]+)\.json$/.exec(name);
      if(!match)continue;
      const report=reportFor(project,match[1]);
      if(!receiptFor(project,match[1],report))reports.push(report.record);
    }
    return reports;
  }
  function prepare(root,issues,{now=new Date().toISOString()}={}) {
    let project=context(root);
    if(pending(project.root).length)fail('Replay and disclose saved designer inbox reports before fresh observations');
    const baseFingerprints=project.state.seenOrderFingerprints;
    format.designerFingerprintDigest(baseFingerprints);
    const nextFingerprints={...baseFingerprints},observations=[];
    for(const row of format.observedOrderIssues(issues)) {
      const checkpoint=project.state.startedOrders[row.issueNumber];
      if(!row.parsed&&!row.error&&!checkpoint&&!baseFingerprints[row.issueNumber])continue;
      let agreedScopeSha256=null;
      if(checkpoint) {
        const path=`orders/${row.issueNumber}.md`;
        if(checkpoint.path!==path)fail('Conflicting local order checkpoint');
        const saved=format.parseLocalChecklist(format.readProjectRecord(project.root,path),{repositoryId:project.config.repository.repositoryId,issueNumber:row.issueNumber});
        if((checkpoint.scopeSha256&&checkpoint.scopeSha256!==saved.scope.originalBodySha256)||(checkpoint.scopeBlockSha256&&checkpoint.scopeBlockSha256!==saved.scopeBlockSha256))fail('Agreed local scope changed; retain evidence');
        agreedScopeSha256=saved.scope.originalBodySha256;
      }
      const prior=baseFingerprints[row.issueNumber],change=!prior?'new':prior.bodySha256!==row.bodySha256?'body-changed':prior.state!==row.state?'status-changed':null;
      observations.push({issueNumber:row.issueNumber,state:row.state,body:row.body,bodySha256:row.bodySha256,kind:row.parsed?.kind||'invalid',error:row.error||(row.parsed?null:'Previously known order metadata is missing'),change,agreedScopeSha256,scopeDiverged:agreedScopeSha256!==null&&agreedScopeSha256!==row.bodySha256});
      nextFingerprints[row.issueNumber]={bodySha256:row.bodySha256,state:row.state};
    }
    const cancellationRequestNumbers=observations.filter(row=>row.kind==='cancellation').map(row=>row.issueNumber),cancelTargets=new Set(observations.filter(row=>row.kind==='cancellation'&&row.state==='open').map(row=>format.parseWorkOrderBody(row.body).metadata.cancelsOrderNumber));
    const observed=format.observedOrderIssues(issues);
    const startableOrderNumbers=observations.filter(row=>row.kind==='order'&&row.state==='open'&&!cancelTargets.has(row.issueNumber)&&!format.orderIssueProblem(observed,row.issueNumber)).map(row=>row.issueNumber);
    const record={schemaVersion:1,reportId:randomUUID(),projectRoot:project.root,repositoryId:project.config.repository.repositoryId,createdAt:now,baseFingerprints,nextFingerprints,observations,startableOrderNumbers,cancellationRequestNumbers};
    const bytes=encode(record);format.validateDesignerInboxRecord(bytes,project,record.reportId);
    format.ensureProjectDirectory(project.root,'.designeritl/reports');
    persist(project,pathFor(record.reportId),bytes,'owner',null);
    return record;
  }
  function acknowledge(root,id,{disclosed=false,now=new Date().toISOString()}={}) {
    let project=context(root);const report=reportFor(project,id);
    if(receiptFor(project,id,report))return {outcome:'already-disclosed',reportId:id};
    if(!disclosed)fail('Disclose saved report to the participant before advancing observations');
    const current=format.designerFingerprintDigest(project.state.seenOrderFingerprints),base=format.designerFingerprintDigest(report.record.baseFingerprints),next=format.designerFingerprintDigest(report.record.nextFingerprints);
    if(current!==base&&current!==next)fail('Conflicting observation history; preserve the saved report');
    if(current!==next)project=persist(project,'.designeritl/state.json',encode({...project.state,seenOrderFingerprints:report.record.nextFingerprints}),'state');
    const receipt={schemaVersion:1,reportId:id,projectRoot:project.root,repositoryId:project.config.repository.repositoryId,reportSha256:format.sha256(report.bytes),appliedFingerprintsSha256:next,disclosedAt:now};
    format.validateDesignerInboxRecord(encode(receipt),project,id,true);
    persist(project,pathFor(id,true),encode(receipt),'owner',null);
    return {outcome:'disclosed',reportId:id};
  }
  function beginWork(root,{issues,releases,orderNumber,checkOnly=false,now=new Date().toISOString()}={}) {
    let project=context(root);
    const observed=format.observedOrderIssues(issues),publications=format.cancellationPublications(releases,project.config.repository.repositoryId);
    if(pending(project.root).length)fail('Disclose saved Inbox reports before entering work');
    if(checkOnly)return {status:'checked'};
    const excluded=new Set(publications.filter(row=>row.descriptor.kind==='final').map(row=>row.descriptor.orderNumber));
    for(const row of observed)if(row.state==='open'&&row.parsed?.kind==='cancellation')excluded.add(row.parsed.metadata.cancelsOrderNumber);
    const available=observed.filter(row=>!format.orderIssueProblem(observed,row.issueNumber)&&row.state==='open'&&row.parsed?.kind==='order'&&!excluded.has(row.issueNumber));
    const active=project.state.assignment;
    const problem=format.orderIssueProblem(observed,orderNumber??active?.orderId.issueNumber);if(problem)fail(problem);
    const activeNumber=available.find(row=>row.issueNumber===active?.orderId.issueNumber)?.issueNumber;
    const number=orderNumber??activeNumber??(available.length===1?available[0].issueNumber:null);
    const chosen=available.find(row=>row.issueNumber===number);
    if(!chosen) {
      if(orderNumber!==undefined)fail('Selected work order is not open and available');
      return {status:available.length?'choose-order':'no-work',orders:available.map(row=>({number:row.issueNumber,goal:row.parsed.goal}))};
    }
    const resuming=active?.orderId.issueNumber===number;
    const result=resuming?{assignment:active,checklist:orders.readChecklist(project.root,number)}:orders.activate(project.root,number,issues,{now});
    project=context(project.root);
    let versions=format.inspectVersions(project);
    if(!versions.versions.length&&!project.state.versionCreationIntent) {
      format.reserveVersion(project,{mode:'empty',label:'design'});
      format.stageVersion(context(project.root));
      format.finishVersion(context(project.root));
      versions=format.inspectVersions(context(project.root));
    }
    return {status:resuming?'resumed':'started',...result,scopeDiverged:chosen.bodySha256!==result.checklist.scope.originalBodySha256,workingVersion:versions.working,requiresVersionChoice:versions.requiresChoice,versionCreationPending:context(project.root).state.versionCreationIntent!==null};
  }
  return {prepare,pending,acknowledge,beginWork};
}
```

`prepare` saves the immutable exact remote bodies, change classification, original-scope comparisons, available order numbers and next fingerprints before changing observation state. Display that report to the participant, including existing divergence and invalid metadata, then call `acknowledge` with `disclosed: true`. Saved reports from before relation isolation remain replayable with their original startable list; fresh observations and `beginWork` decide current eligibility. The receipt is an observation/disclosure record, never developer acceptance or designer completion.

A crash before fingerprint advancement replays the saved report. A crash after advancement but before its receipt also replays it; matching next fingerprints finish the same disclosure without rewriting history. Conflicting observation history or report/receipt identity stops and retains evidence. Starting orders, ticking local tasks and unrelated remote timestamps never update these body hashes. Reports do not select an assignment or edit a prototype.
