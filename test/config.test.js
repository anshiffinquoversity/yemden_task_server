const test = require('node:test');
const assert = require('node:assert/strict');

const { createCorsOriginHandler } = require('../src/config/cors');
const { createEnv } = require('../src/config/env');
const {
  normalizeHttpOrigin,
  rewriteUploadUrl,
} = require('../src/utils/uploadOriginMigration');

const validProductionEnv = () => ({
  NODE_ENV: 'production',
  PORT: '5001',
  MONGO_URI: 'mongodb+srv://user:password@example.mongodb.net/yemden_task_management',
  JWT_SECRET: 'a-production-secret-with-more-than-32-characters',
  JWT_EXPIRES_IN: '7d',
  ADMIN_NAME: 'Admin',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'a-strong-admin-password',
  APP_URL: 'https://app.example.com/#/login',
  CORS_ORIGINS: 'https://app.example.com',
});

const checkOrigin = (handler, origin) =>
  new Promise((resolve, reject) => {
    handler(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(allowed);
    });
  });

test('production environment accepts complete secure configuration', () => {
  const env = createEnv(validProductionEnv());

  assert.equal(env.NODE_ENV, 'production');
  assert.deepEqual(env.CORS_ORIGINS, ['https://app.example.com']);
});

test('production environment reports all missing required values', () => {
  assert.throws(
    () => createEnv({ NODE_ENV: 'production' }),
    /MONGO_URI, JWT_SECRET, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, APP_URL, CORS_ORIGINS/
  );
});

test('production environment rejects insecure URLs and weak JWT secrets', () => {
  assert.throws(
    () => createEnv({ ...validProductionEnv(), JWT_SECRET: 'short' }),
    /at least 32 characters/
  );
  assert.throws(
    () => createEnv({ ...validProductionEnv(), APP_URL: 'http://app.example.com' }),
    /APP_URL must use https/
  );
  assert.throws(
    () => createEnv({ ...validProductionEnv(), CORS_ORIGINS: 'https://app.example.com/path' }),
    /must contain only an origin/
  );
  assert.throws(
    () => createEnv({ ...validProductionEnv(), ADMIN_PASSWORD: 'Admin@12345' }),
    /at least 12 characters/
  );
  assert.throws(
    () => createEnv({ ...validProductionEnv(), PORT: '70000' }),
    /PORT must be an integer/
  );
});

test('production CORS permits only exact configured origins', async () => {
  const handler = createCorsOriginHandler({
    nodeEnv: 'production',
    allowedOrigins: ['https://app.example.com'],
  });

  assert.equal(await checkOrigin(handler, undefined), true);
  assert.equal(await checkOrigin(handler, 'https://app.example.com'), true);
  assert.equal(await checkOrigin(handler, 'https://app.example.com/path'), false);
  assert.equal(await checkOrigin(handler, 'https://app.example.com.evil.test'), false);
  assert.equal(await checkOrigin(handler, 'http://localhost:8080'), false);
});

test('development CORS permits exact localhost hostnames only', async () => {
  const handler = createCorsOriginHandler({
    nodeEnv: 'development',
    allowedOrigins: [],
  });

  assert.equal(await checkOrigin(handler, 'http://localhost:8080'), true);
  assert.equal(await checkOrigin(handler, 'http://127.0.0.1:5000'), true);
  assert.equal(await checkOrigin(handler, 'https://localhost.evil.test'), false);
});

test('upload migration rewrites only legacy uploaded-file origins', () => {
  const legacyOrigins = [
    normalizeHttpOrigin('http://localhost:5001', 'legacy origin'),
    normalizeHttpOrigin('https://old-tunnel.example', 'legacy origin'),
  ];
  const publicOrigin = normalizeHttpOrigin(
    'https://api.example.com',
    'public origin'
  );

  assert.equal(
    rewriteUploadUrl(
      'http://localhost:5001/uploads/task-comments/file.png?download=1',
      legacyOrigins,
      publicOrigin
    ),
    'https://api.example.com/uploads/task-comments/file.png?download=1'
  );
  assert.equal(
    rewriteUploadUrl(
      'https://drive.google.com/document/1',
      legacyOrigins,
      publicOrigin
    ),
    'https://drive.google.com/document/1'
  );
  assert.equal(
    rewriteUploadUrl(
      'http://localhost:5001/api/tasks',
      legacyOrigins,
      publicOrigin
    ),
    'http://localhost:5001/api/tasks'
  );
});
