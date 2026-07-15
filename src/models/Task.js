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
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    startDate: Date,
    dueDate: Date,
    reminderAt: Date,
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
