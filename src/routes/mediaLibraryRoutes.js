const { Router } = require('express');

const {
  listMediaLibraryItems,
  createMediaLibraryItem,
  updateMediaLibraryItem,
  deleteMediaLibraryItem,
} = require('../controllers/mediaLibraryController');
const { protect } = require('../middleware/authMiddleware');
const { mediaLibraryUpload } = require('../middleware/uploadMiddleware');

const router = Router();

router.use(protect);
router.get('/', listMediaLibraryItems);
router.post('/', mediaLibraryUpload.single('file'), createMediaLibraryItem);
router.put('/:id', updateMediaLibraryItem);
router.delete('/:id', deleteMediaLibraryItem);

module.exports = router;
