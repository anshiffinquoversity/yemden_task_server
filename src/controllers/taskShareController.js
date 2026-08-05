const Task = require('../models/Task');
const { getTaskQueryForUser, combineQuery } = require('../utils/accessControl');
const { ApiError, assertObjectId } = require('../utils/http');
const {
  absoluteHttpUrl,
  findTaskBanner,
  isValidTaskShareSignature,
  renderTaskSharePage,
  requestOrigin,
  taskShareUrl,
} = require('../services/taskShareService');

const createTaskShareLink = async (req, res) => {
  assertObjectId(req.params.id, 'task id');

  const visibilityQuery = await getTaskQueryForUser(req.user);
  const task = await Task.findOne(
    combineQuery(visibilityQuery, { _id: req.params.id }),
  ).select('title description thumbnailUrl updatedAt');

  if (!task) throw new ApiError(404, 'Task not found');

  const origin = requestOrigin(req);
  const banner = await findTaskBanner(task);

  res.json({
    shareUrl: taskShareUrl({
      taskId: task._id,
      origin,
      version: banner.version,
    }),
    bannerUrl: absoluteHttpUrl(banner.url, origin),
    bannerSource: banner.source,
  });
};

const showTaskSharePage = async (req, res) => {
  assertObjectId(req.params.id, 'task id');

  if (!isValidTaskShareSignature(req.params.id, req.query.signature)) {
    throw new ApiError(404, 'Shared task not found');
  }

  const task = await Task.findById(req.params.id).select(
    'title description thumbnailUrl updatedAt',
  );
  if (!task) throw new ApiError(404, 'Shared task not found');

  const origin = requestOrigin(req);
  const banner = await findTaskBanner(task);
  const bannerUrl = absoluteHttpUrl(banner.url, origin);
  const canonicalUrl = taskShareUrl({
    taskId: task._id,
    origin,
    version: req.query.v || banner.version,
  });

  res
    .status(200)
    .set({
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    })
    .send(renderTaskSharePage({ task, bannerUrl, canonicalUrl }));
};

module.exports = { createTaskShareLink, showTaskSharePage };
