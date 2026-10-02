import { createReferenceEngine } from '../../spikes/transactions/reference-evaluator.js';
import { createCowEngine } from '../../spikes/transactions/cow-engine.js';
import { createStagedEngine } from '../../spikes/transactions/staged-engine.js';

export const ENGINES = { reference: createReferenceEngine, cow: createCowEngine, staged: createStagedEngine };
