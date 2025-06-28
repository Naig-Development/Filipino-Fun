const mongoose = require("mongoose");

const guildSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: "No description provided" },
  owner: { type: String, required: true }, // userId
  members: [{ type: String }], // userIds
  maxMembers: { type: Number, default: 50, max: 50 },
  roleName: { type: String, default: null },
  roleId: { type: String, default: null }, // Store created role ID
  admins: [{ type: String }], // userIds (max 2)
  embedColor: { type: String, default: "#e4d8c4" },
  icon: { type: String, default: null },
  banner: { type: String, default: null },
  welcome: { type: Boolean, default: true },
  suspended: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  suspensionDate: { type: Date, default: null },
  createChannelId: { type: String, default: "1375179709381611631" }, // Fixed create guild channel
  manageChannelId: { type: String, default: "1375179645460152390" }, // Fixed manage guild channel
  manageMessageId: { type: String, default: null }, // Store manage guild embed message ID
  welcomeChannelId: { type: String, default: "1375179220304531526" }, // Fixed welcome channel
  logsChannelId: { type: String, default: "1378686966190702702" }, // Fixed logs channel
  // XP and Leveling System
  totalXP: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  xpToNextLevel: { type: Number, default: 1000 },
  lastMessageXP: { type: Map, of: Date, default: new Map() }, // Track message cooldowns per user
  voiceChannelMembers: { type: [String], default: [] }, // Members currently in VC
  boostMultiplier: { type: Number, default: 1.0 }, // XP boost from server boosters/donors
  weeklyXP: { type: Number, default: 0 }, // Weekly XP for competitions
  monthlyXP: { type: Number, default: 0 }, // Monthly XP for competitions
  lastXPReset: { type: Date, default: Date.now } // Last weekly/monthly reset
});

module.exports = mongoose.model("Guild", guildSchema);