const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');

const passwordChangeAllowedPaths = new Set([
  '/api/auth/me',
  '/api/auth/change-password',
]);

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Missing authorization header. Use: Authorization: Bearer <token>',
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ message: 'Token is required' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        message: 'Your account is inactive. Please contact the admin.',
      });
    }

    const requestPath = req.originalUrl.split('?')[0];
    if (user.mustChangePassword && !passwordChangeAllowedPaths.has(requestPath)) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before continuing.',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please login again.' });
    }

    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { protect };
