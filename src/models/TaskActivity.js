const mongoose = require('mongoose');

const taskActivitySchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: [
        'task_created',
        'task_updated',
        'status_changed',
        'assignee_changed',
        'comment_added',
        'document_added',
        'recording_added',
        'cancellation_requested',
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    from: {
      type: String,
      trim: true,
      default: '',
    },
    to: {
      type: String,
      trim: true,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

taskActivitySchema.index({ task: 1, createdAt: -1 });

taskActivitySchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const TaskActivity = mongoose.model('TaskActivity', taskActivitySchema);

module.exports = TaskActivity;
