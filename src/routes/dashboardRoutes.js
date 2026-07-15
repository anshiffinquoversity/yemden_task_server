const { Router } = require('express');
const { getDashboardSummary } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.get('/summary', protect, getDashboardSummary);

module.exports = router;

