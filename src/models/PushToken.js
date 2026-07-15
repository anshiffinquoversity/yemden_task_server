const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ['web', 'android', 'ios', 'macos', 'windows', 'linux', 'fuchsia'],
      default: 'web',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

pushTokenSchema.index({ user: 1, isActive: 1 });

pushTokenSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const PushToken = mongoose.model('PushToken', pushTokenSchema);

module.exports = PushToken;
