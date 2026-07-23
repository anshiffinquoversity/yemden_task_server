const { Router } = require('express');
const {
  createTaskStatus,
  deleteTaskStatus,
  getTaskStatuses,
  reorderTaskStatuses,
  updateTaskStatus,
} = require('../controllers/taskStatusController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = Router();

router.use(protect);

router.get('/', getTaskStatuses);
router.post('/', requireRole('admin', 'manager'), createTaskStatus);
router.put('/reorder', requireRole('admin', 'manager'), reorderTaskStatuses);
router.put('/:id', requireRole('admin', 'manager'), updateTaskStatus);
router.delete('/:id', requireRole('admin', 'manager'), deleteTaskStatus);

module.exports = router;
