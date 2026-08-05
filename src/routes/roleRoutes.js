const { Router } = require('express');
const {
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} = require('../controllers/roleController');
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = Router();

router.use(protect);
router.get('/', requirePermission('manageUsers'), listRoles);
router.post('/', requireRole('admin'), createRole);
router.put('/:id', requireRole('admin'), updateRole);
router.delete('/:id', requireRole('admin'), deleteRole);

module.exports = router;
