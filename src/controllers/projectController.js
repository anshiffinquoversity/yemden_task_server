const fs = require('fs/promises');
const path = require('path');

const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const {
  ApiError,
  assertObjectId,
  sameId,
  normalizeIdArray,
  parseOptionalDate,
  sendCreated,
} = require('../utils/http');
const {
  isAdmin,
  getProjectQueryForUser,
  canViewProject,
  canManageProjectWork,
} = require('../utils/accessControl');
const { deleteTaskCollaboration } = require('../services/taskCollaborationService');

const populateProject = (query) =>
  query.populate('owner', 'name email role status').populate('members', 'name email role status');

const defaultProjectColor = '#3B82F6';
const hexColorPattern = /^#?[0-9A-Fa-f]{6}$/;
const projectLogoUploadDir = path.resolve(__dirname, '../../uploads/project-logos');

const normalizeProjectColor = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultProjectColor;
  }

  const raw = String(value).trim();
  if (!hexColorPattern.test(raw)) {
    throw new ApiError(400, 'Project color must be a valid hex color like #3B82F6');
  }

  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  return `#${hex.toUpperCase()}`;
};

const projectLogoUrlForFile = (file) =>
  file ? `/uploads/project-logos/${file.filename}` : '';

const parseIdArrayField = (value, label) => {
  if (value === undefined) return undefined;

  const values = Array.isArray(value) ? value : [value];
  const ids = [];

  for (const item of values) {
    if (item === undefined || item === null) continue;

    if (typeof item === 'string') {
      const raw = item.trim();
      if (!raw) continue;

      if (raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            throw new Error('Expected array');
          }
          ids.push(...parsed);
          continue;
        } catch (_error) {
          throw new ApiError(400, `Invalid ${label} payload`);
        }
      }

      ids.push(raw);
      continue;
    }

    ids.push(item);
  }

  return normalizeIdArray(ids);
};

const truthyField = (value) => value === true || value === 'true' || value === '1' || value === 1;

const deleteProjectLogoFile = async (logoUrl) => {
  const raw = String(logoUrl || '').trim();
  if (!raw.startsWith('/uploads/project-logos/')) return;

  const filename = path.basename(raw);
  if (!filename || filename === '.' || filename === '..') return;

  const targetPath = path.resolve(projectLogoUploadDir, filename);
  if (!targetPath.startsWith(`${projectLogoUploadDir}${path.sep}`)) return;

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Unable to delete project logo ${targetPath}:`, error.message);
    }
  }
};

const ensureUsersExist = async (ids) => {
  if (ids.length === 0) return;

  ids.forEach((id) => assertObjectId(id, 'user id'));

  const count = await User.countDocuments({ _id: { $in: ids } });

  if (count !== ids.length) {
    throw new ApiError(400, 'One or more selected users do not exist');
  }
};

const createProject = async (req, res) => {
  const { title, description, status } = req.body;

  if (!title || !String(title).trim()) {
    throw new ApiError(400, 'Project title is required');
  }

  const ownerId = isAdmin(req.user) && req.body.owner ? req.body.owner : req.user._id.toString();
  assertObjectId(ownerId, 'owner id');

  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new ApiError(400, 'Project owner does not exist');
  }

  const requestedMemberIds = parseIdArrayField(req.body.members, 'project members') || [];
  const memberIds = normalizeIdArray([ownerId, ...requestedMemberIds]);
  await ensureUsersExist(memberIds);

  const project = await Project.create({
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    color: normalizeProjectColor(req.body.color),
    logoUrl: projectLogoUrlForFile(req.file),
    owner: ownerId,
    members: memberIds,
    startDate: parseOptionalDate(req.body.startDate),
    endDate: parseOptionalDate(req.body.endDate),
    status: status || 'active',
    createdBy: req.user._id,
  });

  const createdProject = await populateProject(Project.findById(project._id));
  sendCreated(res, 'project', createdProject);
};

const listProjects = async (req, res) => {
  const query = getProjectQueryForUser(req.user);
  const projects = await populateProject(Project.find(query)).sort({ createdAt: -1 });

  res.json({ projects });
};

const getProjectById = async (req, res) => {
  assertObjectId(req.params.id, 'project id');

  const project = await populateProject(Project.findById(req.params.id));

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  if (!canViewProject(req.user, project)) {
    throw new ApiError(403, 'You do not have access to this project');
  }

  res.json({ project });
};

const updateProject = async (req, res) => {
  assertObjectId(req.params.id, 'project id');

  const project = await Project.findById(req.params.id);

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  if (!canManageProjectWork(req.user, project)) {
    throw new ApiError(403, 'You cannot edit this project');
  }

  const previousLogoUrl = project.logoUrl;
  let shouldDeletePreviousLogo = false;

  if (req.body.title !== undefined) {
    if (!String(req.body.title).trim()) {
      throw new ApiError(400, 'Project title cannot be empty');
    }
    project.title = String(req.body.title).trim();
  }

  if (req.body.description !== undefined) {
    project.description = String(req.body.description || '').trim();
  }

  if (req.body.color !== undefined) {
    project.color = normalizeProjectColor(req.body.color);
  }

  if (req.body.owner !== undefined) {
    const requestedOwnerId = req.body.owner;
    assertObjectId(requestedOwnerId, 'owner id');

    if (!isAdmin(req.user) && !sameId(project.owner, requestedOwnerId)) {
      throw new ApiError(403, 'Only admin can change project owner');
    }

    if (!sameId(project.owner, requestedOwnerId)) {
      const owner = await User.findById(requestedOwnerId);
      if (!owner) {
        throw new ApiError(400, 'Project owner does not exist');
      }

      project.owner = requestedOwnerId;
    }
  }

  if (req.body.members !== undefined) {
    const requestedMemberIds = parseIdArrayField(req.body.members, 'project members') || [];
    const memberIds = normalizeIdArray([project.owner.toString(), ...requestedMemberIds]);
    await ensureUsersExist(memberIds);
    project.members = memberIds;
  }

  if (req.file) {
    project.logoUrl = projectLogoUrlForFile(req.file);
    shouldDeletePreviousLogo = Boolean(previousLogoUrl);
  } else if (req.body.removeLogo !== undefined && truthyField(req.body.removeLogo)) {
    project.logoUrl = '';
    shouldDeletePreviousLogo = Boolean(previousLogoUrl);
  }

  if (req.body.startDate !== undefined) project.startDate = parseOptionalDate(req.body.startDate);
  if (req.body.endDate !== undefined) project.endDate = parseOptionalDate(req.body.endDate);
  if (req.body.status !== undefined) project.status = req.body.status;

  await project.save();
  if (shouldDeletePreviousLogo) await deleteProjectLogoFile(previousLogoUrl);

  const updatedProject = await populateProject(Project.findById(project._id));
  res.json({ project: updatedProject });
};

const deleteProject = async (req, res) => {
  assertObjectId(req.params.id, 'project id');

  const project = await Project.findById(req.params.id);

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const taskIds = await Task.find({ project: project._id }).distinct('_id');
  await deleteTaskCollaboration(taskIds);
  await Task.deleteMany({ project: project._id });
  await deleteProjectLogoFile(project.logoUrl);
  await project.deleteOne();

  res.json({ message: 'Project deleted' });
};

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
