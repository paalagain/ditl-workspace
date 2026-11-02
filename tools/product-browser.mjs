import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Maintainer capability for the declared product fixture, not a shipped workspace engine.
const [rootArg,outputArg,formatReference]=process.argv.slice(2),root=resolve(rootArg),output=resolve(outputArg);
const blocks=[...readFileSync(formatReference,'utf8').matchAll(/```javascript integrity-v1\r?\n([\s\S]*?)\r?\n```/g)];
if(blocks.length!==1)throw Error('Exactly one installed canonical integrity block required');
const f=await import('data:text/javascript;base64,'+Buffer.from(blocks[0][1]).toString('base64'));
const {chromium}=await import(pathToFileURL(resolve(process.env.DITL_PLAYWRIGHT_MODULE)).href);
const before=f.inventory(root),browser=await chromium.launch({channel:process.env.DITL_BROWSER_CHANNEL||'msedge',headless:true});
const report={schemaVersion:1,payloadSha256:before.payloadSha256,finalPayloadSha256:null,directFile:true,networkObservation:true,browser:{name:'Edge/Chromium',version:browser.version()},observationEvidence:output,requestedStates:['initial','details','invalid','confirmation'],exercisedStates:[],requests:[],failures:[],errors:[],checksNotRun:[],unresolvedDependencies:[],dynamicResolutions:[],layouts:[],limitations:['Viewport emulation on Windows Edge; no physical mobile device or other browser engine measured.']};
try {
  const context=await browser.newContext({serviceWorkers:'block'});
  context.on('request',request=>{const url=request.url();report.requests.push(url);if(url.startsWith('file:')){const rel=relative(root,fileURLToPath(url));if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\'))report.failures.push('Outside-file request '+url);}});
  context.on('requestfailed',request=>report.failures.push({url:request.url(),reason:request.failure()}));
  context.on('page',page=>{page.on('pageerror',error=>report.errors.push(error.message));page.on('websocket',socket=>report.requests.push(socket.url()));});
  await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();
  await page.goto(pathToFileURL(join(root,'index.html')).href);
  if(await page.locator('h1').textContent()!=='Ready for design')throw Error('Expected project heading absent');
  await page.evaluate(()=>document.fonts.ready);
  report.fontLoaded=await page.evaluate(()=>document.fonts.check('16px TrialLocal'));
  report.fontFaces=await page.evaluate(()=>[...document.fonts].map(face=>({family:face.family,status:face.status})));
  report.fontFaceLoaded=report.fontFaces.some(face=>face.family.replaceAll('"','').replaceAll("'",'')==='TrialLocal'&&face.status==='loaded');
  report.localFontRequested=report.requests.some(url=>url.startsWith('file:')&&fileURLToPath(url).replaceAll('\\','/').endsWith('/assets/local.ttf'));
  report.imageLoaded=await page.locator('img').first().evaluate(image=>image.complete&&image.naturalWidth>0);
  await page.waitForFunction(()=>document.querySelector('audio').readyState>=1,{},{timeout:5000});
  report.audioMetadataLoaded=true;
  if(!report.fontLoaded||!report.fontFaceLoaded||!report.localFontRequested||!report.imageLoaded)throw Error('Actual local font face/request or image did not load');
  report.exercisedStates.push('initial');
  await page.getByRole('button',{name:'Show details',exact:true}).click();
  if(await page.locator('[data-trial="details"]').textContent()!=='Details opened')throw Error('Details state absent');
  report.exercisedStates.push('details');
  await page.getByRole('button',{name:'Confirm request',exact:true}).click();
  if(await page.locator('[data-trial="status"]').textContent()!=='Enter your name')throw Error('Invalid state absent');
  report.exercisedStates.push('invalid');
  await page.locator('[data-trial="name"]').fill('Ava');
  await page.getByRole('button',{name:'Confirm request',exact:true}).click();
  if(await page.locator('[data-trial="status"]').textContent()!=='Confirmed for Ava')throw Error('Confirmation absent');
  report.exercisedStates.push('confirmation');
  await page.locator('[data-trial="name"]').focus();report.keyboardFocus=await page.locator('[data-trial="name"]').evaluate(input=>document.activeElement===input);
  report.audioPlaybackStarted=await page.locator('audio').evaluate(async audio=>{await audio.play();audio.pause();return !audio.error;});
  for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});await page.waitForTimeout(60);
    const layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttonRects:[...document.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))}));
    const screenshot=output+'.'+width+'.png';await page.screenshot({path:screenshot,fullPage:true});report.layouts.push({...layout,screenshot});
  }
}catch(error){report.errors.push(error.message);}finally{report.finalPayloadSha256=f.inventory(root).payloadSha256;writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
process.stdout.write(JSON.stringify(report)+'\n');
if(report.errors.length||report.failures.length)process.exitCode=1;
