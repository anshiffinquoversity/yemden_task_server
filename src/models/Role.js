const mongoose = require('mongoose');

const permissionKeys = [
  'manageUsers',
  'manageProjects',
  'deleteProjects',
  'manageTasks',
  'manageTaskStatuses',
  'deleteTasks',
  'changeTaskStatus',
];

const statusAccessSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ['all', 'selected'],
      default: 'all',
    },
    statusKeys: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

const roleSchema = new mongoose.Schema(
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
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 1000,
    },
    taskScope: {
      type: String,
      enum: ['assigned', 'projects', 'all'],
      default: 'assigned',
    },
    permissions: {
      type: [{ type: String, enum: permissionKeys }],
      default: [],
    },
    statusVisibility: {
      type: statusAccessSchema,
      default: () => ({ mode: 'all', statusKeys: [] }),
    },
    statusChange: {
      type: statusAccessSchema,
      default: () => ({ mode: 'selected', statusKeys: [] }),
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

roleSchema.index({ priority: -1, name: 1 });

roleSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Role = mongoose.model('Role', roleSchema);

module.exports = { Role, permissionKeys };
