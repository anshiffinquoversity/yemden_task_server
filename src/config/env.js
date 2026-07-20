const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

const cleanEnvValue = (value) => {
  if (!value) return value;
  return String(value).replace(/^['"]|['"]$/g, '').trim();
};

const commaSeparatedValues = (value) =>
  String(value || '')
    .split(',')
    .map(cleanEnvValue)
    .filter(Boolean);

const productionRequiredKeys = [
  'MONGO_URI',
  'JWT_SECRET',
  'ADMIN_NAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'APP_URL',
  'CORS_ORIGINS',
];

const validateUrl = (value, label, { httpsOnly = false } = {}) => {
  let parsed;

  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error(`${label} must be a valid absolute URL`);
  }

  if (httpsOnly && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https in production`);
  }

  return parsed;
};

const validateProductionEnv = (source, values) => {
  if (values.NODE_ENV !== 'production') return;

  const missing = productionRequiredKeys.filter(
    (key) => !cleanEnvValue(source[key])
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`
    );
  }

  if (
    values.JWT_SECRET === 'replace_with_a_long_random_secret_before_production' ||
    /^(replace|generate)_/i.test(values.JWT_SECRET) ||
    values.JWT_SECRET.length < 32
  ) {
    throw new Error(
      'JWT_SECRET must be replaced and contain at least 32 characters in production'
    );
  }

  if (
    !/^mongodb(?:\+srv)?:\/\//.test(values.MONGO_URI) ||
    /DATABASE_USER|DATABASE_PASSWORD|@CLUSTER/i.test(values.MONGO_URI)
  ) {
    throw new Error('MONGO_URI must be a valid MongoDB connection string');
  }

  if (
    values.ADMIN_PASSWORD === 'Admin@12345' ||
    /^(replace|generate)_/i.test(values.ADMIN_PASSWORD) ||
    values.ADMIN_PASSWORD.length < 12
  ) {
    throw new Error(
      'ADMIN_PASSWORD must be replaced and contain at least 12 characters in production'
    );
  }

  const port = Number(values.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  validateUrl(values.APP_URL, 'APP_URL', { httpsOnly: true });

  for (const origin of values.CORS_ORIGINS) {
    const parsed = validateUrl(origin, 'Each CORS_ORIGINS entry', {
      httpsOnly: true,
    });

    if (origin.replace(/\/$/, '') !== parsed.origin) {
      throw new Error(
        'Each CORS_ORIGINS entry must contain only an origin, without a path, query, or fragment'
      );
    }
  }

  const firebaseValues = [
    values.FIREBASE_PROJECT_ID,
    values.FIREBASE_CLIENT_EMAIL,
    values.FIREBASE_PRIVATE_KEY,
  ];
  const configuredFirebaseValues = firebaseValues.filter(Boolean).length;

  if (configuredFirebaseValues > 0 && configuredFirebaseValues < firebaseValues.length) {
    throw new Error(
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be configured together'
    );
  }
};

const createEnv = (source = process.env) => {
  const values = {
    NODE_ENV: cleanEnvValue(source.NODE_ENV) || 'development',
    PORT: cleanEnvValue(source.PORT) || '5001',
    MONGO_URI:
      cleanEnvValue(source.MONGO_URI) ||
      'mongodb://127.0.0.1:27017/yemden_task_management',
    JWT_SECRET:
      cleanEnvValue(source.JWT_SECRET) ||
      'replace_with_a_long_random_secret_before_production',
    JWT_EXPIRES_IN: cleanEnvValue(source.JWT_EXPIRES_IN) || '7d',
    ADMIN_NAME: cleanEnvValue(source.ADMIN_NAME) || 'Admin',
    ADMIN_EMAIL: cleanEnvValue(source.ADMIN_EMAIL) || 'admin@example.com',
    ADMIN_PASSWORD: cleanEnvValue(source.ADMIN_PASSWORD) || 'Admin@12345',
    APP_URL: cleanEnvValue(source.APP_URL) || 'http://localhost:8080',
    CORS_ORIGINS: commaSeparatedValues(source.CORS_ORIGINS),
    SMTP_HOST: cleanEnvValue(source.SMTP_HOST),
    SMTP_PORT: cleanEnvValue(source.SMTP_PORT),
    SMTP_SECURE: cleanEnvValue(source.SMTP_SECURE) || 'false',
    SMTP_USER: cleanEnvValue(source.SMTP_USER),
    SMTP_PASS: cleanEnvValue(source.SMTP_PASS),
    MAIL_FROM: cleanEnvValue(source.MAIL_FROM),
    FIREBASE_PROJECT_ID: cleanEnvValue(source.FIREBASE_PROJECT_ID),
    FIREBASE_CLIENT_EMAIL: cleanEnvValue(source.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: cleanEnvValue(source.FIREBASE_PRIVATE_KEY),
  };

  validateProductionEnv(source, values);
  return values;
};

const env = createEnv();

if (
  env.NODE_ENV !== 'test' &&
  env.JWT_SECRET === 'replace_with_a_long_random_secret_before_production'
) {
  console.warn('Warning: JWT_SECRET is using the development placeholder value.');
}

module.exports = { createEnv, env };
