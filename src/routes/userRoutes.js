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
const { requireRole } = require('../middleware/roleMiddleware');

const router = Router();

router.use(protect);

router.post('/', requireRole('admin'), createUser);
router.get('/options', requireRole('admin', 'manager'), listUserOptions);
router.get('/', requireRole('admin', 'manager'), listUsers);
router.get('/:id', requireRole('admin', 'manager'), getUserById);
router.put('/:id', requireRole('admin'), updateUser);
router.delete('/:id/permanent', requireRole('admin'), permanentlyDeleteUser);
router.delete('/:id', requireRole('admin'), deactivateUser);

module.exports = router;
