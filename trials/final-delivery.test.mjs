import {test} from 'node:test';
import {runFinalDeliveryTrial} from './support/delivery.mjs';

test('installed Codex final delivery publishes and developer inbox receives exact bytes',{skip:process.env.DITL_LIVE_TRIAL!=='1',timeout:1800000},()=>runFinalDeliveryTrial());
