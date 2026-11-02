import {test} from 'node:test';
import {runFinalDeliveryTrial} from './support/delivery.mjs';

test('installed final delivery preserves explicitly acknowledged unchecked task progress',{skip:process.env.DITL_FINAL_EVIDENCE_TRIAL!=='1',timeout:1800000},()=>runFinalDeliveryTrial({unchecked:true}));
