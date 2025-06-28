const { awardVoiceXP, updateVoiceChannelTracking } = require("../../utils/xpUtils.js");
const logger = require("../../utils/logger.js");

// Store intervals for voice XP tracking
const voiceXPIntervals = new Map();

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    try {
      const userId = newState.id || oldState.id;
      const member = newState.member || oldState.member;
      
      // User joined a voice channel
      if (!oldState.channel && newState.channel) {
        await updateVoiceChannelTracking(userId, true);
        
        // Start XP interval for this user
        const interval = setInterval(async () => {
          // Check if user is still in voice channel and not muted/deafened
          const currentVoiceState = member.voice;
          if (currentVoiceState.channel && !currentVoiceState.selfMute && !currentVoiceState.selfDeaf) {
            await awardVoiceXP(client, currentVoiceState);
          }
        }, 20000); // 20 seconds
        
        voiceXPIntervals.set(userId, interval);
      }
      
      // User left a voice channel
      if (oldState.channel && !newState.channel) {
        await updateVoiceChannelTracking(userId, false);
        
        // Clear XP interval for this user
        const interval = voiceXPIntervals.get(userId);
        if (interval) {
          clearInterval(interval);
          voiceXPIntervals.delete(userId);
        }
      }
      
      // User switched channels (clear and restart interval)
      if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        const interval = voiceXPIntervals.get(userId);
        if (interval) {
          clearInterval(interval);
        }
        
        // Start new interval
        const newInterval = setInterval(async () => {
          const currentVoiceState = member.voice;
          if (currentVoiceState.channel && !currentVoiceState.selfMute && !currentVoiceState.selfDeaf) {
            await awardVoiceXP(client, currentVoiceState);
          }
        }, 20000);
        
        voiceXPIntervals.set(userId, newInterval);
      }
      
    } catch (error) {
      logger.error("Error in voiceStateUpdate XP handler:", error);
    }
  },
};