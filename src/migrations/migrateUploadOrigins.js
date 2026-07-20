const mongoose = require('mongoose');

const { connectDatabase } = require('../config/db');
const TaskComment = require('../models/TaskComment');
const TaskDocument = require('../models/TaskDocument');
const {
  normalizeHttpOrigin,
  rewriteUploadUrl,
} = require('../utils/uploadOriginMigration');

const applyChanges = process.argv.includes('--apply');

const configuredOrigins = () => {
  const publicOrigin = normalizeHttpOrigin(
    process.env.UPLOAD_PUBLIC_ORIGIN,
    'UPLOAD_PUBLIC_ORIGIN'
  );
  const legacyOrigins = String(process.env.LEGACY_UPLOAD_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) =>
      normalizeHttpOrigin(value, `LEGACY_UPLOAD_ORIGINS entry ${index + 1}`)
    );

  if (legacyOrigins.length === 0) {
    throw new Error('LEGACY_UPLOAD_ORIGINS must include at least one origin');
  }
  if (legacyOrigins.includes(publicOrigin)) {
    throw new Error('UPLOAD_PUBLIC_ORIGIN must differ from legacy origins');
  }

  return { legacyOrigins, publicOrigin };
};

const commentMigrationOperations = async (legacyOrigins, publicOrigin) => {
  const comments = await TaskComment.find({
    'attachments.url': { $exists: true },
  })
    .select('_id attachments')
    .lean();

  const operations = [];
  let changedUrls = 0;

  for (const comment of comments) {
    let changed = false;
    const attachments = (comment.attachments || []).map((attachment) => {
      const nextUrl = rewriteUploadUrl(
        attachment.url,
        legacyOrigins,
        publicOrigin
      );
      if (nextUrl === attachment.url) return attachment;

      changed = true;
      changedUrls += 1;
      return { ...attachment, url: nextUrl };
    });

    if (changed) {
      operations.push({
        updateOne: {
          filter: { _id: comment._id },
          update: { $set: { attachments } },
        },
      });
    }
  }

  return { changedUrls, operations };
};

const documentMigrationOperations = async (legacyOrigins, publicOrigin) => {
  const documents = await TaskDocument.find({ url: { $exists: true } })
    .select('_id url')
    .lean();

  const operations = [];

  for (const document of documents) {
    const nextUrl = rewriteUploadUrl(
      document.url,
      legacyOrigins,
      publicOrigin
    );
    if (nextUrl === document.url) continue;

    operations.push({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: { url: nextUrl } },
      },
    });
  }

  return operations;
};

const run = async () => {
  const { legacyOrigins, publicOrigin } = configuredOrigins();
  await connectDatabase();

  const comments = await commentMigrationOperations(
    legacyOrigins,
    publicOrigin
  );
  const documentOperations = await documentMigrationOperations(
    legacyOrigins,
    publicOrigin
  );

  console.log(`Target upload origin: ${publicOrigin}`);
  console.log(
    `Matched ${comments.changedUrls} comment attachment URL(s) in ${comments.operations.length} comment(s).`
  );
  console.log(`Matched ${documentOperations.length} task document URL(s).`);

  if (!applyChanges) {
    console.log('Dry run only. No database values were changed.');
    console.log('Run the same command with --apply after verifying the backup and counts.');
    return;
  }

  if (comments.operations.length > 0) {
    await TaskComment.bulkWrite(comments.operations);
  }
  if (documentOperations.length > 0) {
    await TaskDocument.bulkWrite(documentOperations);
  }

  console.log('Upload origin migration applied successfully.');
};

run()
  .catch((error) => {
    console.error(`Upload origin migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
