# Captured prototype portability

Revision: 4

A numbered prototype delivery executes this gate through Versions. Use [Format](format.md) for every inventory, safe-path and digest operation. Portability applies to the actual captured bytes. A designer acknowledgment never permits a blocked or unperformed portability check.

## Inspect, exercise, decide

1. Run the verbatim snippet below against the captured prototype with the verbatim Format module as its `integrity` argument. Retain its exact JSON report under pending evidence. It requires index.html/assets through canonical inventory and inspects every HTML/CSS/JavaScript/SVG text file, including nested imports, styles, fonts, media, navigation and common load sinks. Broken/escaped/network dependencies are violations. An `href` on an `<a>` or `<area>` element with a `mailto:`, `tel:`, `http:` or `https:` URL is user-initiated navigation. The report records these destinations in `navigationLinks` entries containing `source`, `element` and `reference`. These URLs remain violations in every other dependency sink. Other schemes and protocol-relative navigation remain violations. Scanner limitations remain explicit: comments, unusual syntax, generated code, obfuscated loaders and unexercised code cannot be proved safe by regular expressions.
2. Read every inspected file in full. Resolve computed references, import maps, srcdoc, source/srcset selections, data/blob contents, form/navigation destinations, CSS escapes and script-generated code. Record navigation links without following them. Trace all dynamic-load candidates; record the source/candidate ID and concrete evidence resolving its dependencies, or leave it unresolved and blocked. Review all files capable of execution even if an extension is unusual. Unresolved runtime dependencies block publication.
3. Open the captured `index.html` directly with `file:` execution. In a fresh browser context observe attempted requests across pages, popups, frames and workers; observe WebSocket attempts separately where the browser API does so. Disable service workers/previous cache state. Exercise each requested state, breakpoint/state-dependent source selection and interaction that can load content or navigate. Do not follow the recorded navigation links; clicking them is not required for the portability exercise. Any attempted runtime network request still blocks delivery, including requests triggered without following a link. Resolve local fonts/media and verify they actually load. Record browser/version, exact test invocation or retained raw observation path, requested/exercised states, request URLs (including blocked attempts), failures, page errors and omitted necessary checks. A screenshot or static scan alone is insufficient. If the required browser/network capability is unavailable, block.
4. Re-inventory the capture after inspection and browser execution. Any change invalidates its evidence and decision. Call `decidePortability` on static report and actual runtime evidence. Preserve both and its payload-bound outcome. Only `status: eligible` with no violations, unresolved dependencies, failed necessary checks or network attempts permits either send. Every newly captured/fixed payload needs fresh evidence. Retry of an already packaged transaction uses the retained exact matching evidence and rechecks its hash binding.

A user-repaired version requires a fresh coherent capture and complete portability evidence. Preserve earlier observations and execute every required direct-file, state/dependency and network check.

```javascript portability-v1
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const list=value=>Array.isArray(value);
const entities=value=>value.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|[0-9]+));/gi,entity=> {
  const names={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  if(names[entity.toLowerCase()]) return names[entity.toLowerCase()];
  const n=entity.slice(2,-1); const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):'\uFFFD';
});
export function inspectPortability(root,integrity) {
  const captured=integrity.inventory(root), files=new Set(captured.files.map(e=>e.path)), report={schemaVersion:1,payloadSha256:captured.payloadSha256,captureRoot:resolve(root),inspectedFiles:[],dependencies:[],navigationLinks:[],violations:[],dynamicCandidates:[]};
  const candidate=(source,index,description)=>report.dynamicCandidates.push({id:`${source}:${index}:${report.dynamicCandidates.length+1}`,source,description});
  function dependency(source,value,kind) {
    const reference=entities(value).trim();
    if(!reference||reference[0]==='#') return;
    if(/^data:/i.test(reference)) { candidate(source,0,'Review embedded data content and its nested dependencies'); return; }
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(reference)) {report.violations.push(`${source}: ${kind} is not a contained relative dependency: ${reference}`);return;}
    let decoded;
    try {decoded=decodeURIComponent(reference.split(/[?#]/)[0]);} catch {report.violations.push(`${source}: malformed dependency URL ${reference}`);return;}
    if(/[\\\x00-\x1f\x7f]/.test(decoded)) {report.violations.push(`${source}: unsafe dependency ${reference}`);return;}
    const target=resolve(root,dirname(source),decoded), path=relative(resolve(root),target).split('\\').join('/');
    try {integrity.safePath(path);} catch {report.violations.push(`${source}: escaped or unsafe dependency ${reference}`);return;}
    report.dependencies.push({source,reference,target:path,kind});
    if(!files.has(path)) report.violations.push(`${source}: missing or case-mismatched dependency ${reference}`);
  }
  for(const entry of captured.files) {
    if(!/\.(?:html?|css|[cm]?js|svg)$/i.test(entry.path)) continue;
    const source=entry.path, code=readFileSync(join(root,...source.split('/')),'utf8'); report.inspectedFiles.push(source);
    if(/<base\b/i.test(code)) report.violations.push(`${source}: base URL changes direct-file dependency resolution`);
    const navigationAttributes=new Map();
    for(const tag of code.matchAll(/<([a-z][a-z0-9:-]*)(?=[\s/>])((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
      const element=tag[1].toLowerCase();
      if(element!=='a'&&element!=='area') continue;
      for(const attribute of tag[2].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g)) {
        if(attribute[1].toLowerCase()!=='href') continue;
        const reference=entities(attribute[2]??attribute[3]??attribute[4]??'').trim();
        if(/^(?:mailto|tel|https?):/i.test(reference)) navigationAttributes.set(tag.index+1+tag[1].length+attribute.index,{source,element,reference});
      }
    }
    for(const match of code.matchAll(/\b(?:src|href|poster|data|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/gi)) {
      const navigation=navigationAttributes.get(match.index);
      if(navigation) report.navigationLinks.push(navigation);
      else dependency(source,match[1]??match[2]??match[3],'HTML reference');
    }
    for(const match of code.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const value=match[1]??match[2];
      if(/data:/i.test(value)) candidate(source,match.index,'Review srcset with embedded data');
      else for(const item of value.split(',')) dependency(source,item.trim().split(/\s+/)[0],'srcset');
    }
    for(const match of code.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi)) dependency(source,match[1]??match[2]??match[3]??match[4]??match[5],'CSS reference');
    for(const match of code.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g)) dependency(source,match[1],'module reference');
    for(const match of code.matchAll(/(?:\b(?:fetch|import|Worker|SharedWorker|WebSocket|EventSource)|navigator\.sendBeacon)\s*\(\s*([^\n;]*?)(?:\)|$)|\.(?:src|href)\s*=\s*([^;\n]+)/g)) {
      const value=(match[1]??match[2]??'').trim(), literal=value.match(/^["']([^"']*)["']\s*(?:,.*)?$/s);
      if(literal) dependency(source,literal[1],'script load');
      else candidate(source,match.index,`Resolve computed script load: ${match[0].slice(0,160)}`);
    }
    if(/\b(?:eval|Function)\s*\(|XMLHttpRequest|srcdoc\s*=|importmap|\\(?:[0-9a-f]{1,6}\s?)/i.test(code)) candidate(source,0,'Review generated code, XHR, import map, inline frame, or escaped dependency syntax');
  }
  return report;
}
export function decidePortability(report,runtime) {
  const reasons=[...report.violations];
  const block=reason=>reasons.push(reason);
  if(report.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(report.payloadSha256)) block('Unsupported portability report');
  if(!runtime||runtime.schemaVersion!==1) block('Actual direct-file runtime evidence was not supplied');
  else {
    if(runtime.payloadSha256!==report.payloadSha256||runtime.finalPayloadSha256!==report.payloadSha256) block('Runtime evidence does not bind unchanged captured bytes');
    if(runtime.directFile!==true||runtime.networkObservation!==true||!nonempty(runtime.browser?.name)||!nonempty(runtime.browser?.version)||!nonempty(runtime.observationEvidence)) block('Necessary direct-file or network observation did not run');
    if(!list(runtime.requestedStates)||!runtime.requestedStates.length||runtime.requestedStates.some(state=>!nonempty(state))||!list(runtime.exercisedStates)||runtime.requestedStates.some(state=>!runtime.exercisedStates.includes(state))) block('Requested runtime states were not completely exercised');
    if(!list(runtime.reviewedFiles)||report.inspectedFiles.some(path=>!runtime.reviewedFiles.includes(path))) block('Dependency source review is incomplete');
    if(!list(runtime.dynamicResolutions)||report.dynamicCandidates.some(item=>!runtime.dynamicResolutions.some(r=>r.id===item.id&&nonempty(r.evidence)&&r.resolved===true))) block('Computed or generated dependencies remain unresolved');
    for(const field of ['requests','failures','errors','checksNotRun','unresolvedDependencies']) if(!list(runtime[field])) block(`Missing runtime ${field} evidence`);
    if(list(runtime.requests)&&runtime.requests.some(url=>typeof url!=='string'||!/^(?:file:|data:|blob:)/i.test(url))) block('Runtime network request or unsupported scheme was attempted');
    if(list(runtime.requests)) for(const url of runtime.requests.filter(url=>typeof url==='string'&&/^file:/i.test(url))) {
      try {const path=relative(report.captureRoot,fileURLToPath(url));if(isAbsolute(path)||path==='..'||path.startsWith('../')||path.startsWith('..\\')) block('Runtime file request escaped the captured prototype');} catch {block('Invalid runtime file request');}
    }
    for(const field of ['failures','errors','checksNotRun','unresolvedDependencies']) if(list(runtime[field])&&runtime[field].length) block(`Runtime ${field} prevents portability`);
  }
  return {schemaVersion:1,status:reasons.length?'blocked':'eligible',payloadSha256:report.payloadSha256,reasons};
}
```

Execute the block verbatim in a disposable module. `inspectPortability(capturedRoot, integrityModule)` supplies static evidence and explicit dynamic review candidates. `decidePortability(staticReport, runtimeEvidence)` returns a payload-bound gate result. Keep JSON records and exact observation evidence; the gate validates evidence structure and binding, not truthfulness of a fabricated observation. Actual host/browser execution is required.
