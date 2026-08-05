const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]+$/,
      default: 'employee',
    },
    priorityAccess: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ role: 1, createdAt: -1, _id: -1 });
userSchema.index({ status: 1, createdAt: -1, _id: -1 });

// Keep the original built-in values discoverable for older integrations while
// allowing any validated role key backed by the Role collection.
userSchema
  .path('role')
  .enumValues.push('admin', 'manager', 'employee', 'social_media_handler');

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
