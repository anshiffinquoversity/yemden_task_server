const { Router } = require('express');
const {
  createTaskStatus,
  deleteTaskStatus,
  getTaskStatuses,
  reorderTaskStatuses,
  updateTaskStatus,
} = require('../controllers/taskStatusController');
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = Router();

router.use(protect);

router.get('/', getTaskStatuses);
router.post('/', requirePermission('manageTaskStatuses'), createTaskStatus);
router.put('/reorder', requirePermission('manageTaskStatuses'), reorderTaskStatuses);
router.put('/:id', requirePermission('manageTaskStatuses'), updateTaskStatus);
router.delete('/:id', requirePermission('manageTaskStatuses'), deleteTaskStatus);

module.exports = router;
