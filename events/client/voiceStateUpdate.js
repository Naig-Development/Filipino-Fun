const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  getVoiceConnection
} = require("@discordjs/voice");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");

// Store connection reference to avoid creating multiple connections
let activeConnection = null;

module.exports = {
  name: "voiceStateUpdate",
  async execute(_oldState, _newState, client) {
    // Check if client is ready and has guilds cache
    if (!client || !client.guilds || !client.guilds.cache) {
      return;
    }
    
    const guild = client.guilds.cache.get(config.guildId);
    
    if (!guild) {
      logger.error("Guild not found!");
      return;
    }
    
    // Check if we already have an active connection for this guild
    const existingConnection = getVoiceConnection(guild.id);
    if (existingConnection && activeConnection) {
      // Connection already exists, no need to create a new one
      return;
    }
    
    const voiceChannel = guild.channels.cache.get(config.afkChannelId);

    if (!voiceChannel) {
      logger.error("Voice channel not found!");
      return;
    }

    if (!voiceChannel.isVoiceBased()) {
      logger.error("Channel is not a voice-based channel!");
      return;
    }

    try {
      if (!activeConnection) {
        activeConnection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
        });

        activeConnection.once(VoiceConnectionStatus.Ready, () => {
          logger.info(`Joined voice channel: ${voiceChannel.name}`);
        });

        activeConnection.on(VoiceConnectionStatus.Disconnected, () => {
          logger.warn("Disconnected from voice channel");
          activeConnection = null;
        });

        activeConnection.once(VoiceConnectionStatus.Failed, () => {
          logger.error("Failed to connect to voice channel");
          activeConnection = null;
        });

        activeConnection.once(VoiceConnectionStatus.Destroyed, () => {
          logger.info("Voice connection destroyed");
          activeConnection = null;
        });
      }

    } catch (error) {
      logger.error("Error joining voice channel:", error);
      activeConnection = null;
    }
  },

  disconnect() {
    if (activeConnection) {
      activeConnection.destroy();
      activeConnection = null;
      logger.info("Voice connection manually disconnected");
    }
  }
};