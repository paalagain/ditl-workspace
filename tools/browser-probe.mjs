import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Maintainer-only probe for the narrow portable fixture, never installed in bundles.
const modulePath=process.env.DITL_PLAYWRIGHT_MODULE;
if(!modulePath) throw Error('Set DITL_PLAYWRIGHT_MODULE to the installed Playwright entry module');
const {chromium}=await import(pathToFileURL(resolve(modulePath)).href);
const browser=await chromium.launch({channel:process.env.DITL_BROWSER_CHANNEL||'msedge',headless:true});
try {
  const context=await browser.newContext(), page=await context.newPage(), requests=[], failures=[], errors=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('requestfailed',request=>failures.push({url:request.url(),failure:request.failure()}));
  page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:/,route=>route.abort());
  await page.goto(pathToFileURL(join(resolve(process.argv[2]),'index.html')).href);
  assert.equal(await page.locator('h1').textContent(),'Ready for design');
  await page.getByRole('button',{name:'Show details'}).click();
  assert.equal(await page.locator('output').textContent(),'Details opened');
  assert.ok(await page.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0));
  assert.deepEqual(requests.filter(url=>/^https?:|^wss?:/.test(url)),[]);
  assert.deepEqual(failures,[]); assert.deepEqual(errors,[]);
  const evidence={browserVersion:browser.version(),entryFile:join(resolve(process.argv[2]),'index.html'),heading:'Ready for design',interaction:'Details opened',localImageLoaded:true,requests,failures,errors};
  if(process.argv[3]) writeFileSync(process.argv[3],JSON.stringify(evidence,null,2)+'\n');
  process.stdout.write(JSON.stringify(evidence)+'\n');
} finally {await browser.close();}
