const { Router } = require('express');
const {
  deletePushToken,
  listNotifications,
  markNotificationRead,
  registerPushToken,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.use(protect);

router.get('/', listNotifications);
router.post('/register-token', registerPushToken);
router.delete('/register-token', deletePushToken);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
