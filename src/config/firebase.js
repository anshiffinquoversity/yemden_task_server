const {
  applicationDefault,
  cert,
  initializeApp,
} = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { env } = require('./env');

let firebaseApp = null;
let firebaseInitAttempted = false;
let missingConfigWarned = false;

const hasFirebaseConfig = () =>
  Boolean(
    env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_CLIENT_EMAIL &&
      env.FIREBASE_PRIVATE_KEY
  );

const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;

  if (firebaseInitAttempted) return null;
  firebaseInitAttempted = true;

  try {
    const credential = hasFirebaseConfig()
      ? cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      : applicationDefault();

    if (!hasFirebaseConfig() && !missingConfigWarned) {
      console.warn(
        'Firebase Admin service account env vars are not set. Using Application Default Credentials.'
      );
      missingConfigWarned = true;
    }

    firebaseApp = initializeApp({
      credential,
      projectId: env.FIREBASE_PROJECT_ID || undefined,
    });
    return firebaseApp;
  } catch (error) {
    console.warn(`Firebase Admin initialization failed: ${error.message}`);
    return null;
  }
};

const getFirebaseMessaging = () => {
  const app = getFirebaseApp();
  return app ? getMessaging(app) : null;
};

module.exports = {
  getFirebaseMessaging,
};
