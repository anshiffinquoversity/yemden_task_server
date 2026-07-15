const { Router } = require('express');
const {
  createTaskStatus,
  deleteTaskStatus,
  getTaskStatuses,
  updateTaskStatus,
} = require('../controllers/taskStatusController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = Router();

router.use(protect);

router.get('/', getTaskStatuses);
router.post('/', requireRole('admin', 'manager'), createTaskStatus);
router.put('/:id', requireRole('admin', 'manager'), updateTaskStatus);
router.delete('/:id', requireRole('admin', 'manager'), deleteTaskStatus);

module.exports = router;
