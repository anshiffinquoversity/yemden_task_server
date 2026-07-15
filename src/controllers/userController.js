const User = require('../models/User');
const { sendUserInvitationEmail } = require('../services/emailService');
const { ApiError, assertObjectId } = require('../utils/http');

const validRoles = ['admin', 'manager', 'employee'];
const validStatuses = ['active', 'inactive'];
const validPriorityAccess = ['low', 'medium', 'high'];

const sanitizeUserInput = (body, { requirePassword = false } = {}) => {
  const payload = {};

  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.email !== undefined) payload.email = String(body.email).toLowerCase().trim();
  if (body.password !== undefined) payload.password = String(body.password);
  if (body.role !== undefined) payload.role = body.role;
  if (body.priorityAccess !== undefined) payload.priorityAccess = body.priorityAccess;
  if (body.status !== undefined) payload.status = body.status;

  if (payload.name !== undefined && payload.name.length < 2) {
    throw new ApiError(400, 'Name must be at least 2 characters');
  }

  if (payload.email !== undefined && !payload.email.includes('@')) {
    throw new ApiError(400, 'Valid email is required');
  }

  if ((requirePassword || payload.password !== undefined) && (!payload.password || payload.password.length < 8)) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  if (payload.role !== undefined && !validRoles.includes(payload.role)) {
    throw new ApiError(400, `Role must be one of: ${validRoles.join(', ')}`);
  }

  if (payload.priorityAccess !== undefined && !validPriorityAccess.includes(payload.priorityAccess)) {
    throw new ApiError(400, `Access level must be one of: ${validPriorityAccess.join(', ')}`);
  }

  if (payload.status !== undefined && !validStatuses.includes(payload.status)) {
    throw new ApiError(400, `Status must be one of: ${validStatuses.join(', ')}`);
  }

  return payload;
};

const createUser = async (req, res) => {
  const payload = sanitizeUserInput(req.body, { requirePassword: true });
  const plainPassword = payload.password;

  if (!payload.name || !payload.email) {
    throw new ApiError(400, 'Name, email, and password are required');
  }

  const existingUser = await User.findOne({ email: payload.email });

  if (existingUser) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const user = await User.create({
    name: payload.name,
    email: payload.email,
    password: payload.password,
    role: payload.role || 'employee',
    priorityAccess: payload.priorityAccess || 'medium',
    status: payload.status || 'active',
    mustChangePassword: true,
  });

  const invitationEmail = await sendUserInvitationEmail({
    user,
    plainPassword,
  });

  res.status(201).json({ user, invitationEmail });
};

const listUsers = async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users });
};

const getUserById = async (req, res) => {
  assertObjectId(req.params.id, 'user id');

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.json({ user });
};

const updateUser = async (req, res) => {
  assertObjectId(req.params.id, 'user id');

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const payload = sanitizeUserInput(req.body);

  if (payload.email && payload.email !== user.email) {
    const existingUser = await User.findOne({ email: payload.email });
    if (existingUser) {
      throw new ApiError(409, 'A user with this email already exists');
    }
  }

  Object.assign(user, payload);
  if (payload.password !== undefined) {
    user.mustChangePassword = true;
  }
  await user.save();

  res.json({ user });
};

const deactivateUser = async (req, res) => {
  assertObjectId(req.params.id, 'user id');

  if (req.user._id.toString() === req.params.id) {
    throw new ApiError(400, 'You cannot deactivate your own account');
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'inactive' },
    { new: true }
  );

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.json({ message: 'User deactivated', user });
};

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deactivateUser,
};
