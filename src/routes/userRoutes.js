const { Router } = require('express');
const {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deactivateUser,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = Router();

router.use(protect);

router.post('/', requireRole('admin'), createUser);
router.get('/', requireRole('admin', 'manager'), listUsers);
router.get('/:id', requireRole('admin', 'manager'), getUserById);
router.put('/:id', requireRole('admin'), updateUser);
router.delete('/:id', requireRole('admin'), deactivateUser);

module.exports = router;
