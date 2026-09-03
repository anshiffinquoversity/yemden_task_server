const mongoose = require('mongoose');

const mediaLibraryItemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    type: {
      type: String,
      enum: ['image', 'video', 'link'],
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    originalFileName: {
      type: String,
      trim: true,
      default: '',
    },
    sizeBytes: {
      type: Number,
      min: 0,
      default: 0,
    },
    isLocalUpload: {
      type: Boolean,
      default: false,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

mediaLibraryItemSchema.index({ createdAt: -1, _id: -1 });
mediaLibraryItemSchema.index({ type: 1, createdAt: -1, _id: -1 });

mediaLibraryItemSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const MediaLibraryItem = mongoose.model(
  'MediaLibraryItem',
  mediaLibraryItemSchema
);

module.exports = MediaLibraryItem;
