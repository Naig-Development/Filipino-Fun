const mongoose = require('mongoose');

const vanityUrlSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  type: { type: String, enum: ['vanity', 'keyword'], required: true },
  term: { type: String, required: true, lowercase: true },
  roleId: { type: String, required: true },
  addedBy: { type: String, required: true }, // User ID who added the term
  dateAdded: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  // Track which users currently have this term active
  activeUsers: [{ 
    userId: { type: String },
    lastSeen: { type: Date, default: Date.now }
  }]
});

// Make term unique per guild and type
vanityUrlSchema.index({ guildId: 1, type: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('VanityUrl', vanityUrlSchema);