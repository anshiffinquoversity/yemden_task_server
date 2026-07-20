const normalizeOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return '';
  }
};

const isLocalDevelopmentOrigin = (origin, nodeEnv) => {
  if (nodeEnv === 'production') return false;

  try {
    const { hostname, protocol } = new URL(origin);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1')
    );
  } catch (_error) {
    return false;
  }
};

const createCorsOriginHandler = ({ nodeEnv, allowedOrigins }) => {
  const normalizedAllowedOrigins = new Set(
    (allowedOrigins || []).map(normalizeOrigin).filter(Boolean)
  );

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const canonicalInput = String(origin).trim().replace(/\/$/, '');
    const allowed =
      (canonicalInput === normalizedOrigin &&
        normalizedAllowedOrigins.has(normalizedOrigin)) ||
      isLocalDevelopmentOrigin(origin, nodeEnv);

    callback(null, allowed);
  };
};

module.exports = {
  createCorsOriginHandler,
  isLocalDevelopmentOrigin,
  normalizeOrigin,
};
