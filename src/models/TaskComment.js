const mongoose = require('mongoose');

const commentAttachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image', 'video', 'document', 'audio', 'link'],
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    url: {
      type: String,
      trim: true,
      required: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    isLocalUpload: {
      type: Boolean,
      default: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: false }
);

const commentPublicationLinkSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: false, timestamps: false }
);

const taskCommentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      trim: true,
      default: '',
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    attachments: [commentAttachmentSchema],
    publicationLinks: [commentPublicationLinkSchema],
  },
  { timestamps: true }
);

taskCommentSchema.index({ task: 1, createdAt: -1 });

taskCommentSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const TaskComment = mongoose.model('TaskComment', taskCommentSchema);

module.exports = TaskComment;
