const mongoose = require("mongoose");

const guildBoardSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  messageId: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("GuildBoard", guildBoardSchema);