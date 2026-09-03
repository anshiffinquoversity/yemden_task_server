const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: "",
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      trim: true,
      lowercase: true,
      default: "open",
    },
    metaAdStatus: {
      type: String,
      enum: [
        "none",
        "ad_posted",
        "ad_started",
        "ad_paused",
        "ad_stopped",
      ],
      default: "none",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    startDate: Date,
    dueDate: Date,
    reminderAt: Date,
    approvedAt: Date,
    reminderLeadSentAt: Date,
    reminderSentAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

taskSchema.index({ status: 1, startDate: 1 });
taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ createdAt: -1, _id: -1 });
taskSchema.index({ project: 1, createdAt: -1, _id: -1 });
taskSchema.index({ assignedTo: 1, createdAt: -1, _id: -1 });
taskSchema.index({ status: 1, createdAt: -1, _id: -1 });
taskSchema.index({ metaAdStatus: 1, createdAt: -1, _id: -1 });
taskSchema.index({ startDate: 1 });
taskSchema.index({ reminderAt: 1, reminderLeadSentAt: 1 });
taskSchema.index({ reminderAt: 1, reminderSentAt: 1 });

taskSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Task = mongoose.model("Task", taskSchema);

module.exports = Task;
