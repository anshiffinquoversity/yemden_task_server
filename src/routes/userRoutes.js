const { Router } = require('express');
const {
  createUser,
  getUserById,
  listUserOptions,
  listUsers,
  updateUser,
  deactivateUser,
  permanentlyDeleteUser,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = Router();

router.use(protect);

router.post('/', requirePermission('manageUsers'), createUser);
router.get(
  '/options',
  requirePermission('manageUsers', 'manageTasks', 'manageProjects'),
  listUserOptions,
);
router.get('/', requirePermission('manageUsers'), listUsers);
router.get('/:id', requirePermission('manageUsers'), getUserById);
router.put('/:id', requirePermission('manageUsers'), updateUser);
router.delete(
  '/:id/permanent',
  requirePermission('manageUsers'),
  permanentlyDeleteUser,
);
router.delete('/:id', requirePermission('manageUsers'), deactivateUser);

module.exports = router;
