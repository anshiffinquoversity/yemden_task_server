const mongoose = require('mongoose');

const taskStatusSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]+$/,
    },
    category: {
      type: String,
      enum: ['open', 'closed', 'canceled'],
      default: 'open',
    },
    color: {
      type: String,
      default: '#38BDF8',
      trim: true,
    },
    position: {
      type: Number,
      default: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

taskStatusSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const TaskStatus = mongoose.model('TaskStatus', taskStatusSchema);

module.exports = TaskStatus;
