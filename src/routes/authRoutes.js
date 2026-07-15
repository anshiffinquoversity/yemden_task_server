const { Router } = require('express');
const { login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/change-password', protect, changePassword);

module.exports = router;
