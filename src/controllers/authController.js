const User = require('../models/User');
const { generateToken } = require('../utils/generateToken');
const { ApiError } = require('../utils/http');

const formatUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  priorityAccess: user.priorityAccess || 'medium',
  status: user.status,
  mustChangePassword: user.mustChangePassword === true,
});

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+password'
  );

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new ApiError(403, 'Your account is inactive. Please contact the admin.');
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password');
  }

  res.json({
    token: generateToken(user),
    user: formatUser(user),
  });
};

const getMe = async (req, res) => {
  res.json({ user: formatUser(req.user) });
};

const changePassword = async (req, res) => {
  const currentPasswordValue = String(req.body.currentPassword || '');
  const newPasswordValue = String(req.body.newPassword || '');

  if (!currentPasswordValue || !newPasswordValue) {
    throw new ApiError(400, 'Current password and new password are required');
  }

  if (newPasswordValue.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  const passwordMatches = await user.comparePassword(currentPasswordValue);

  if (!passwordMatches) {
    throw new ApiError(400, 'Current password is incorrect');
  }

  const samePassword = await user.comparePassword(newPasswordValue);

  if (samePassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  user.password = newPasswordValue;
  user.mustChangePassword = false;
  await user.save();

  res.json({
    message: 'Password changed successfully',
    user: formatUser(user),
  });
};

module.exports = {
  login,
  getMe,
  changePassword,
};
