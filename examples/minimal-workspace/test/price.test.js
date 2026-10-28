import { toCents } from '../src/price.js';
if (toCents(12.34) !== 1234) { console.error('FAIL'); process.exit(1); }
console.log('PASS price');
