import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productFaultPoint} from '../trials/support/product.mjs';

test('product recovery faults only target successful effects for its exact saved delivery',()=>{
  const identity={repository:'owner/project',tag:'order-7/final',orderNumber:7};
  assert.equal(productFaultPoint(['release','upload','order-7/final','delivery.zip','--repo','owner/project'],identity),'upload');
  assert.equal(productFaultPoint(['release','edit','order-7/final','--repo','owner/project','--draft=false'],identity),'publication');
  assert.equal(productFaultPoint(['issue','close','7','--repo','owner/project','--reason','completed'],identity),'closure');
  for(const args of [['release','edit','order-7/final','--repo','owner/project','--draft=true'],['release','edit','order-7/final','--repo','owner/other','--draft=false'],['issue','close','8','--repo','owner/project','--reason','completed'],['issue','close','7','--repo','owner/project','--reason','not planned'],['api','repos/owner/project/releases']])assert.equal(productFaultPoint(args,identity),null);
});
