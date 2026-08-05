const { Router } = require('express');
const {
  createProject,
  deleteProject,
  getProjectById,
  listPublishedProjectAssets,
  listProjectOptions,
  listProjects,
  updateProject,
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { projectLogoUpload } = require('../middleware/uploadMiddleware');

const router = Router();

router.use(protect);

router.post('/', requirePermission('manageProjects'), projectLogoUpload.single('logo'), createProject);
router.get('/options', listProjectOptions);
router.get('/', listProjects);
router.get('/:id/published-assets', listPublishedProjectAssets);
router.get('/:id', getProjectById);
router.put('/:id', requirePermission('manageProjects'), projectLogoUpload.single('logo'), updateProject);
router.delete('/:id', requirePermission('deleteProjects'), deleteProject);

module.exports = router;
