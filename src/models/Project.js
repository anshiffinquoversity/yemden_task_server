const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      default: '#4A72B7',
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

projectSchema.index({ createdAt: -1, _id: -1 });
projectSchema.index({ owner: 1, createdAt: -1, _id: -1 });
projectSchema.index({ members: 1, createdAt: -1, _id: -1 });
projectSchema.index({ status: 1, createdAt: -1, _id: -1 });

projectSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
