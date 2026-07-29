const { Router } = require('express');
const {
  createTask,
  deleteTask,
  getTaskById,
  listCalendarTasks,
  listMyTasks,
  listTasks,
  listTasksByProject,
  requestTaskCancellation,
  updateTask,
  updateTaskStatus,
} = require('../controllers/taskController');
const {
  createTaskComment,
  createTaskDocument,
  deleteTaskComment,
  listTaskCollaboration,
  listTaskPublicationAssets,
  updateTaskPublicationAssets,
} = require('../controllers/taskCollaborationController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const {
  commentUpload,
  taskThumbnailUpload,
} = require('../middleware/uploadMiddleware');

const router = Router();

router.use(protect);

router.get('/calendar', listCalendarTasks);
router.get('/my-tasks', listMyTasks);
router.get('/project/:projectId', listTasksByProject);
router.post('/', taskThumbnailUpload.single('thumbnail'), createTask);
router.get('/', listTasks);
router.get('/:id/collaboration', listTaskCollaboration);
router.get('/:id/publication-assets', listTaskPublicationAssets);
router.put('/:id/publication-assets', updateTaskPublicationAssets);
router.post('/:id/comments', commentUpload.array('files', 8), createTaskComment);
router.delete('/:id/comments/:commentId', deleteTaskComment);
router.post('/:id/documents', createTaskDocument);
router.post('/:id/cancellation-request', requestTaskCancellation);
router.get('/:id', getTaskById);
router.put('/:id', taskThumbnailUpload.single('thumbnail'), updateTask);
router.patch('/:id/status', updateTaskStatus);
router.delete('/:id', requireRole('admin', 'manager'), deleteTask);

module.exports = router;
