const mongoose = require('mongoose');

const taskDocumentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['document', 'image', 'video', 'audio', 'link'],
      default: 'document',
    },
    source: {
      type: String,
      enum: ['manual', 'comment', 'recording'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

taskDocumentSchema.index({ task: 1, createdAt: -1 });

taskDocumentSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const TaskDocument = mongoose.model('TaskDocument', taskDocumentSchema);

module.exports = TaskDocument;
