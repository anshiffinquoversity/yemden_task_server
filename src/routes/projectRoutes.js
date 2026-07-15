const { Router } = require('express');
const {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject,
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { projectLogoUpload } = require('../middleware/uploadMiddleware');

const router = Router();

router.use(protect);

router.post('/', requireRole('admin', 'manager'), projectLogoUpload.single('logo'), createProject);
router.get('/', listProjects);
router.get('/:id', getProjectById);
router.put('/:id', requireRole('admin', 'manager'), projectLogoUpload.single('logo'), updateProject);
router.delete('/:id', requireRole('admin'), deleteProject);

module.exports = router;
