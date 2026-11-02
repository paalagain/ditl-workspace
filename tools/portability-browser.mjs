import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [rootArg,staticFile,outputFile,integrityFile]=process.argv.slice(2), root=resolve(rootArg);
if(!process.env.DITL_PLAYWRIGHT_MODULE) throw Error('Set DITL_PLAYWRIGHT_MODULE to an installed Playwright module');
const {chromium}=await import(pathToFileURL(resolve(process.env.DITL_PLAYWRIGHT_MODULE)).href);
const f=await import(pathToFileURL(resolve(integrityFile)).href), before=f.inventory(root), report=JSON.parse(readFileSync(staticFile,'utf8'));
if(report.payloadSha256!==before.payloadSha256) throw Error('Static report does not match the prototype being exercised');
const browser=await chromium.launch({channel:process.env.DITL_BROWSER_CHANNEL||'msedge',headless:true});
const runtime={schemaVersion:1,payloadSha256:before.payloadSha256,finalPayloadSha256:null,directFile:true,networkObservation:true,browser:{name:'Edge/Chromium',version:browser.version()},observationEvidence:resolve(outputFile),requestedStates:['initial','details'],exercisedStates:[],requests:[],failures:[],errors:[],checksNotRun:[],unresolvedDependencies:[],dynamicResolutions:[]};
try {
  const context=await browser.newContext({serviceWorkers:'block'});
  context.on('request',request=> {
    const url=request.url();runtime.requests.push(url);
    if(url.startsWith('file:')) {
      try {const rel=relative(root,fileURLToPath(url));if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||resolve(fileURLToPath(url))===root) runtime.failures.push(`File request outside captured prototype: ${url}`);} catch {runtime.failures.push(`Invalid file URL: ${url}`);}
    }
  });
  context.on('requestfailed',request=>runtime.failures.push({url:request.url(),reason:request.failure()}));
  context.on('page',page=>{page.on('pageerror',error=>runtime.errors.push(error.message));page.on('websocket',socket=>runtime.requests.push(socket.url()));});
  await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();
  await page.goto(pathToFileURL(join(root,'index.html')).href);
  if(await page.locator('h1').textContent()!=='Ready for design') throw Error('Heading not visible');
  if(!await page.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)) throw Error('Local image not loaded');
  await page.evaluate(()=>document.fonts.ready);
  if(!await page.evaluate(()=>document.fonts.check('16px FixtureLocal'))) throw Error('Local font not loaded');
  await page.waitForFunction(()=>document.querySelector('audio').readyState>=1,{},{timeout:5000});
  runtime.exercisedStates.push('initial');
  await page.getByRole('button',{name:'Show details'}).click();
  if(await page.locator('output').textContent()!=='Details opened') throw Error('Requested detail state not reached');
  if(!await page.locator('audio').evaluate(async audio=>{await audio.play();audio.pause();return !audio.error;})) throw Error('Local audio playback failed');
  runtime.exercisedStates.push('details');
  await page.waitForTimeout(100);
  runtime.fontLoaded=true;runtime.imageLoaded=true;runtime.audioMetadataLoaded=true;runtime.audioPlaybackStarted=true;
} catch(error) {runtime.errors.push(error.message);} finally {
  runtime.finalPayloadSha256=f.inventory(root).payloadSha256;
  writeFileSync(outputFile,JSON.stringify(runtime,null,2)+'\n');
  await browser.close();
}
process.stdout.write(JSON.stringify(runtime)+'\n');
