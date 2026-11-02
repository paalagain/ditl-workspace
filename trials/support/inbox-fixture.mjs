import {randomUUID} from 'node:crypto';

// Maintainer-only synthetic transport artifact. This is not designer trial evidence.
export function createInboxFixtureManifest(format,{repositoryId,prototypeRoot,number,orderNumber=7,deliveryId=randomUUID(),capturedAt=new Date().toISOString()}) {
  const inventory=format.inventory(prototypeRoot),kind=number===3?'final':'send';
  const originalBody=`# Goal\nShow the retained Inbox iteration.\n\n- [ ] 1. Show the retained iteration heading\n\n\`\`\`designeritl-order\n${JSON.stringify({schemaVersion:1,requestId:'4ecbd5e0-a285-4a5b-9787-fb48ffdbb56a',followsOrderNumber:null,cancelsOrderNumber:null})}\n\`\`\`\n`;
  const agreedScope=format.parseLocalChecklist(format.createLocalChecklist({repositoryId,issueNumber:orderNumber},originalBody,capturedAt)).scope;
  const scopeSha256=agreedScope.originalBodySha256;
  const manifest={schemaVersion:2,repositoryId,orderNumber,deliveryId,tag:kind==='final'?`order-${orderNumber}/final`:`order-${orderNumber}/send-${number}`,kind,versionNumber:number,capturedFolder:`design.v${number}`,capturedAt,inventory:inventory.files,directories:inventory.directories,payloadSha256:inventory.payloadSha256,scopeSha256,localProgress:{checkedOrdinals:[1],taskContext:'Retained fixture'},deliveryNote:{summary:`Iteration ${number}`,outsideOrder:'None',workInProgress:'None'},evidence:null,deliveredUncheckedOrdinals:null};
  if(kind==='final') {
    const frozen=record=>{const json=JSON.stringify(record);return {json,sha256:format.sha256(Buffer.from(json))};};
    manifest.deliveredUncheckedOrdinals=[];
    manifest.evidence={
      reassessment:frozen({payloadSha256:inventory.payloadSha256,scopeSha256,agreedScope,tasks:[{ordinal:1,result:'fulfilled',evidenceOrReason:'Maintainer-seeded fixture heading bytes'}]}),
      decision:null
    };
    manifest.evidence.decision=frozen({schemaVersion:2,payloadSha256:inventory.payloadSha256,scopeSha256,reassessmentSha256:manifest.evidence.reassessment.sha256,acknowledgedUnfinishedOrdinals:[],explicitDesignerStatement:'Controlled maintainer transport fixture authorizes delivery of the disclosed seeded artifact as-is; this is not product designer trial evidence.',recordedAt:capturedAt});
  }
  return manifest;
}
