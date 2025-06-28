// Guild Invitation Database Schema (MongoDB/Mongoose)
const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema(
  {
    inviteId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    guildName: {
      type: String,
      required: true,
    },
    guildId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guild",
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    invitedUserId: {
      type: String,
      required: true,
    },
    roleId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "guild_invitations",
  }
);

invitationSchema.index({ guildId: 1, invitedUserId: 1, status: 1 });
invitationSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("guildInvite", invitationSchema);
