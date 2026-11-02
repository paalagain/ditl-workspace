import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { integrity } from '../tools/protocol.mjs';
import { portability } from '../tools/portability.mjs';

test('captured portability inspects nested local dependencies but needs actual runtime evidence', async()=> {
  const root=mkdtempSync(join(tmpdir(),'ditl-portability-'));
  mkdirSync(join(root,'assets'));
  writeFileSync(join(root,'index.html'),'<!doctype html><link rel="stylesheet" href="assets/style.css"><img src="assets/local.svg"><button>Show details</button>');
  writeFileSync(join(root,'assets','style.css'),'@font-face {font-family:local;src:url("local.woff2")} body {background:url(local.svg)}');
  writeFileSync(join(root,'assets','local.woff2'),'fixture font placeholder for static checks only');
  writeFileSync(join(root,'assets','local.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  const f=await integrity(), p=await portability(), report=p.inspectPortability(root,f);
  assert.deepEqual(report.violations,[]);
  assert.equal(report.dependencies.length,4);
  assert.equal(p.decidePortability(report,null).status,'blocked');
  writeFileSync(join(root,'assets','style.css'),'@import "missing.css";');
  const bad=p.inspectPortability(root,f);
  assert.match(bad.violations.join('\n'),/missing\.css/);
});

test('runtime evidence cannot authorize outside-file reads, omitted states or changed captures', async()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-runtime-binding-'));mkdirSync(join(root,'assets'));writeFileSync(join(root,'index.html'),'<!doctype html><h1>local</h1>');
  const f=await integrity(),p=await portability(),report=p.inspectPortability(root,f);
  const evidence={schemaVersion:1,payloadSha256:report.payloadSha256,finalPayloadSha256:report.payloadSha256,directFile:true,networkObservation:true,browser:{name:'contract fixture',version:'1'},observationEvidence:'synthetic boundary-validation input only',requestedStates:['initial'],exercisedStates:['initial'],reviewedFiles:report.inspectedFiles,dynamicResolutions:[],requests:[pathToFileURL(join(root,'..','outside.html')).href],failures:[],errors:[],checksNotRun:[],unresolvedDependencies:[]};
  assert.equal(p.decidePortability(report,evidence).status,'blocked');
  assert.equal(p.decidePortability(report,{...evidence,requests:[],exercisedStates:[]}).status,'blocked');
  assert.equal(p.decidePortability(report,{...evidence,requests:[],finalPayloadSha256:'00'.repeat(32)}).status,'blocked');
});

test('captured dependency audit refuses escaped and network loads and retains unresolved dynamics',async()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-load-boundary-'));mkdirSync(join(root,'assets'));
  writeFileSync(join(root,'index.html'),'<!doctype html><img src="&#46;&#46;/outside.svg"><script>fetch("https://example.invalid/reference");button.addEventListener("click",()=>fetch(window.unresolvedAsset))</script>');
  const f=await integrity(),p=await portability(),report=p.inspectPortability(root,f);
  assert.ok(report.violations.some(reason=>reason.includes('escaped or unsafe')));
  assert.ok(report.violations.some(reason=>reason.includes('https://example.invalid/reference')));
  assert.ok(report.dynamicCandidates.some(candidate=>candidate.description.includes('unresolvedAsset')));
  writeFileSync(join(root,'index.html'),'<!doctype html>');
  const fresh=p.inspectPortability(root,f);assert.notEqual(fresh.payloadSha256,report.payloadSha256);assert.deepEqual(fresh.violations,[]);
});
