const normalizeHttpOrigin = (value, label) => {
  let parsed;

  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    throw new Error(`${label} must be a valid absolute URL origin`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }

  const normalizedInput = String(value || '').trim().replace(/\/$/, '');
  if (normalizedInput !== parsed.origin) {
    throw new Error(`${label} must not include a path, query, or fragment`);
  }

  return parsed.origin;
};

const rewriteUploadUrl = (value, legacyOrigins, publicOrigin) => {
  if (typeof value !== 'string' || value.trim() === '') return value;

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    return value;
  }

  if (!legacyOrigins.includes(parsed.origin)) return value;
  if (!parsed.pathname.startsWith('/uploads/')) return value;

  return `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
};

module.exports = { normalizeHttpOrigin, rewriteUploadUrl };
