import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runFinalDeliveryTrial} from './support/delivery.mjs';

test('both role copies transfer a captured final version through the private transport',{skip:process.env.DITL_PRODUCT_TRIAL!=='1',timeout:1800000},async()=>{
  const result=await runFinalDeliveryTrial({unchecked:true});
  assert.equal(result.installations.length,14);
  assert.deepEqual(result.manifest.deliveredUncheckedOrdinals,[1]);
});
