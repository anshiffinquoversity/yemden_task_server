const fs = require("fs/promises");
const path = require("path");

const taskThumbnailUploadDir = path.resolve(
  __dirname,
  "../../uploads/task-thumbnails",
);

const taskThumbnailUrlForFile = (file) =>
  file ? `/uploads/task-thumbnails/${file.filename}` : "";

const deleteTaskThumbnailFile = async (thumbnailUrl) => {
  const raw = String(thumbnailUrl || "").trim();
  let uploadPath = raw;
  try {
    const parsed = new URL(raw);
    uploadPath = parsed.pathname;
  } catch (_error) {
    // Relative upload URLs are the normal stored format.
  }
  if (!uploadPath.startsWith("/uploads/task-thumbnails/")) return;

  const filename = path.basename(uploadPath);
  if (!filename || filename === "." || filename === "..") return;

  const targetPath = path.resolve(taskThumbnailUploadDir, filename);
  if (!targetPath.startsWith(`${taskThumbnailUploadDir}${path.sep}`)) return;

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Unable to delete task thumbnail ${targetPath}:`,
        error.message,
      );
    }
  }
};

module.exports = {
  deleteTaskThumbnailFile,
  taskThumbnailUrlForFile,
};
