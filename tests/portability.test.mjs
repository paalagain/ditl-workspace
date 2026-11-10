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

test('user-initiated anchor and area navigation is recorded without a dependency violation',async()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-navigation-'));mkdirSync(join(root,'assets'));
  writeFileSync(join(root,'index.html'),'<!doctype html><a href="mailto:person@example.invalid">Email</a><a href="tel:+4712345678">Phone</a><A title="a > b" HREF="https://example.invalid/?a=1&amp;b=2">Website</A><area href=http://example.invalid/map><a href="#details">Details</a>');
  const f=await integrity(),p=await portability(),report=p.inspectPortability(root,f);
  assert.deepEqual(report.violations,[]);
  assert.deepEqual(report.dependencies,[]);
  assert.deepEqual(report.navigationLinks,[
    {source:'index.html',element:'a',reference:'mailto:person@example.invalid'},
    {source:'index.html',element:'a',reference:'tel:+4712345678'},
    {source:'index.html',element:'a',reference:'https://example.invalid/?a=1&b=2'},
    {source:'index.html',element:'area',reference:'http://example.invalid/map'}
  ]);
  const runtime={schemaVersion:1,payloadSha256:report.payloadSha256,finalPayloadSha256:report.payloadSha256,directFile:true,networkObservation:true,browser:{name:'contract fixture',version:'1'},observationEvidence:'synthetic boundary-validation input only',requestedStates:['initial'],exercisedStates:['initial'],reviewedFiles:report.inspectedFiles,dynamicResolutions:[],requests:[],failures:[],errors:[],checksNotRun:[],unresolvedDependencies:[]};
  assert.equal(p.decidePortability(report,runtime).status,'eligible');
  assert.equal(p.decidePortability(report,{...runtime,requests:['https://example.invalid/']}).status,'blocked');
});

test('navigation schemes remain blocked in load sinks and other anchor attributes',async()=>{
  const root=mkdtempSync(join(tmpdir(),'ditl-navigation-sinks-'));mkdirSync(join(root,'assets'));
  const references=[
    '<img src="https://example.invalid/image">',
    '<link href="https://example.invalid/style">',
    '<style>body {background:url(https://example.invalid/background)}</style>',
    '<form action="https://example.invalid/form"></form>',
    '<iframe src="https://example.invalid/frame"></iframe>',
    '<a src="mailto:person@example.invalid">Email</a>',
    '<a formaction="tel:+4712345678">Phone</a>',
    '<a data-href="https://example.invalid/data">Data</a>',
    '<a xlink:href="https://example.invalid/xlink">Xlink</a>',
    '<a title=\'fake href="https://example.invalid/fake"\'>Quoted</a>',
    '<a href="javascript:alert(1)">Script</a>',
    '<a href="//example.invalid/path">Relative protocol</a>',
    '<a href="ftp://example.invalid/file">FTP</a>',
    '<video poster="https://example.invalid/poster"></video>',
    '<object data="https://example.invalid/object"></object>',
    '<img srcset="https://example.invalid/source 2x">',
    '<style>@import "https://example.invalid/import";</style>',
    '<script src="https://example.invalid/script"></script>',
    '<base href="https://example.invalid/base">',
    '<script>fetch("https://example.invalid/fetch")</script>'
  ];
  const f=await integrity(),p=await portability();
  for(const html of references) {
    writeFileSync(join(root,'index.html'),`<!doctype html>${html}`);
    const report=p.inspectPortability(root,f);
    assert.ok(report.violations.length,html);
    assert.deepEqual(report.navigationLinks,[],html);
  }
});
