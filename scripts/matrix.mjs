import { platforms } from '../lib/config.mjs';
console.log(JSON.stringify({ include: Object.entries(platforms).map(([key, data]) => ({ key, ...data })) }));
