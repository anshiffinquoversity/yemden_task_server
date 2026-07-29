const User = require('../models/User');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const PushToken = require('../models/PushToken');
const Task = require('../models/Task');
const TaskActivity = require('../models/TaskActivity');
const TaskComment = require('../models/TaskComment');
const TaskDocument = require('../models/TaskDocument');
const TaskStatus = require('../models/TaskStatus');
const { sendUserInvitationEmail } = require('../services/emailService');
const { ApiError, assertObjectId } = require('../utils/http');
const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require('../utils/pagination');

const validRoles = ['admin', 'manager', 'employee', 'social_media_handler'];
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

const listUsers = async (req, res) => {
  const filters = {};
  if (req.query.role) {
    if (!validRoles.includes(req.query.role)) {
      throw new ApiError(400, 'Invalid user role filter');
    }
    filters.role = req.query.role;
  }
  if (req.query.status) {
    if (!validStatuses.includes(req.query.status)) {
      throw new ApiError(400, 'Invalid user status filter');
    }
    filters.status = req.query.status;
  }

  const limit = parsePageSize(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const cursorFilter = descendingCursorFilter(cursor);
  const query = Object.keys(cursorFilter).length
    ? { $and: [filters, cursorFilter] }
    : filters;
  const results = await User.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);
  const page = pageFromResults(results, limit);

  res.json({ users: page.items, pageInfo: page.pageInfo });
};

const listUserOptions = async (_req, res) => {
  const users = await User.find()
    .select('name email role status priorityAccess')
    .sort({ name: 1, _id: 1 });

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

const permanentlyDeleteUser = async (req, res) => {
  assertObjectId(req.params.id, 'user id');

  if (req.user._id.toString() === req.params.id) {
    throw new ApiError(400, 'You cannot permanently delete your own account');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const ownedProject = await Project.findOne({ owner: user._id }).select('title');
  if (ownedProject) {
    throw new ApiError(
      409,
      `Reassign projects owned by ${user.name} before permanently deleting this user`
    );
  }

  await Promise.all([
    Project.updateMany({ members: user._id }, { $pull: { members: user._id } }),
    Project.updateMany({ createdBy: user._id }, { $set: { createdBy: null } }),
    Task.updateMany({ assignedTo: user._id }, { $pull: { assignedTo: user._id } }),
    Task.updateMany({ createdBy: user._id }, { $set: { createdBy: null } }),
    TaskStatus.updateMany({ createdBy: user._id }, { $set: { createdBy: null } }),
    TaskComment.updateMany({ mentions: user._id }, { $pull: { mentions: user._id } }),
    TaskComment.updateMany({ author: user._id }, { $set: { author: null } }),
    TaskDocument.updateMany({ uploadedBy: user._id }, { $set: { uploadedBy: null } }),
    TaskActivity.updateMany({ actor: user._id }, { $set: { actor: null } }),
    Notification.deleteMany({ recipient: user._id }),
    Notification.updateMany({ actor: user._id }, { $set: { actor: null } }),
    PushToken.deleteMany({ user: user._id }),
  ]);

  await User.deleteOne({ _id: user._id });

  res.json({ message: 'User permanently deleted' });
};

module.exports = {
  createUser,
  listUsers,
  listUserOptions,
  getUserById,
  updateUser,
  deactivateUser,
  permanentlyDeleteUser,
};
