const { hasPermission } = require('../utils/roleCatalog');

const requirePermission = (...permissions) => (req, res, next) => {
  if (
    !req.user ||
    !permissions.some((permission) => hasPermission(req.user, permission))
  ) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  return next();
};

module.exports = { requirePermission };
