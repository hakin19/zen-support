import { Redis } from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 1
});

const hash = 'b102ebe2a2ea53f730a23da03e9062c7239c1008150aa16a1e6d8b9cc3592343';

await redis.set('device:secret:sha256:test-device-integration', hash);
console.log('Secret hash set in Redis');

const stored = await redis.get('device:secret:sha256:test-device-integration');
console.log('Verified:', stored === hash);

await redis.quit();