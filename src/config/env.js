const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

const cleanEnvValue = (value) => {
  if (!value) return value;
  return String(value).replace(/^['"]|['"]$/g, '').trim();
};

const env = {
  NODE_ENV: cleanEnvValue(process.env.NODE_ENV) || 'development',
  PORT: cleanEnvValue(process.env.PORT) || '5001',
  MONGO_URI:
    cleanEnvValue(process.env.MONGO_URI) ||
    'mongodb://127.0.0.1:27017/yemden_task_management',
  JWT_SECRET:
    cleanEnvValue(process.env.JWT_SECRET) ||
    'replace_with_a_long_random_secret_before_production',
  JWT_EXPIRES_IN: cleanEnvValue(process.env.JWT_EXPIRES_IN) || '7d',
  ADMIN_NAME: cleanEnvValue(process.env.ADMIN_NAME) || 'Admin',
  ADMIN_EMAIL: cleanEnvValue(process.env.ADMIN_EMAIL) || 'admin@example.com',
  ADMIN_PASSWORD: cleanEnvValue(process.env.ADMIN_PASSWORD) || 'Admin@12345',
  APP_URL: cleanEnvValue(process.env.APP_URL) || 'http://localhost:8080',
  SMTP_HOST: cleanEnvValue(process.env.SMTP_HOST),
  SMTP_PORT: cleanEnvValue(process.env.SMTP_PORT),
  SMTP_SECURE: cleanEnvValue(process.env.SMTP_SECURE) || 'false',
  SMTP_USER: cleanEnvValue(process.env.SMTP_USER),
  SMTP_PASS: cleanEnvValue(process.env.SMTP_PASS),
  MAIL_FROM: cleanEnvValue(process.env.MAIL_FROM),
  FIREBASE_PROJECT_ID: cleanEnvValue(process.env.FIREBASE_PROJECT_ID),
  FIREBASE_CLIENT_EMAIL: cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
  FIREBASE_PRIVATE_KEY: cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY),
};

if (
  env.NODE_ENV !== 'test' &&
  env.JWT_SECRET === 'replace_with_a_long_random_secret_before_production'
) {
  console.warn('Warning: JWT_SECRET is using the development placeholder value.');
}

module.exports = { env };
