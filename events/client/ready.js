const {
  ActivityType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const logger = require("../../utils/logger.js");
const Guild = require("../../schema/guild.js");
const {
  sendManageGuildEmbed,
  sendCreateGuildEmbed,
  checkSuspensions,
  sendLogMessage,
  convertEmojiToUrl,
  userActions,
  checkUserPermissions,
  getPendingInvitations,
  cancelInvitation,
  cancelAllGuildInvitations,
  getInvitationStats,
  cleanupOldInvitations,
  notifyOwner,
} = require("../../utils/guildUtils.js");
const config = require("../../config.js");
const { initializeLiveLeaderboard } = require("../../utils/liveLeaderboard.js");
const { initializeScheduler } = require("../../utils/xpScheduler.js");
const { initializeGuildBoard } = require("../../utils/liveGuildBoard.js");

// Constants for better maintainability
const PRESENCE_INTERVAL = 30000; // 30 seconds
const SUSPENSION_CHECK_INTERVAL = 1000 * 60 * 60; // 1 hour

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    try {
      logger.success(`Logged in as ${client.user.tag}!`);

      // Initialize bot presence rotation
      await this.setupPresenceRotation(client);

      // Initialize guild management systems
      await this.initializeGuildSystems(client);

      // Initialize live systems (leaderboard, XP, guild board)
      await this.initializeLiveSystems(client);

      // Initialize external modules
      this.initializeExternalModules(client);

      logger.success("Bot initialization completed successfully");
    } catch (error) {
      logger.error("Critical error during bot initialization:", error);
      throw error; // Re-throw to ensure proper error handling
    }
  },

  async setupPresenceRotation(client) {
    const presences = [
      {
        status: "online",
        activities: [
          {
            name: "/Filipino Fun",
            type: ActivityType.Custom,
          },
        ],
      },
      {
        status: "online",
        activities: [
          {
            name: "discord.gg/filipino",
            type: ActivityType.Custom,
          },
        ],
      },
    ];

    let index = 0;
    
    // Set initial presence
    if (presences.length > 0) {
      client.user.setPresence(presences[0]);
    }

    // Rotate presence every 30 seconds
    setInterval(() => {
      if (client.user && presences.length > 0) {
        client.user.setPresence(presences[index]);
        index = (index + 1) % presences.length;
      }
    }, PRESENCE_INTERVAL);
  },

  async initializeGuildSystems(client) {
    try {
      const guilds = await Guild.find();
      const uniqueManageChannelIds = [
        ...new Set(guilds.map((g) => g.manageChannelId).filter((id) => id)),
      ];

      logger.info(`Found ${uniqueManageChannelIds.length} unique manage channels`);

      // Process manage channels if needed (currently empty loop was removed)
      // Add your channel processing logic here if required

      // Setup suspension checking interval
      setInterval(() => {
        checkSuspensions().catch(error => {
          logger.error("Error during suspension check:", error);
        });
      }, SUSPENSION_CHECK_INTERVAL);

      logger.info("Guild management systems initialized");
    } catch (error) {
      logger.error("Error initializing guild systems:", error);
      throw error;
    }
  },

  async initializeLiveSystems(client) {
    try {
      // Initialize live leaderboard
      await initializeLiveLeaderboard(client);
      logger.info("Live leaderboard initialized");

      // Initialize XP scheduler
      await initializeScheduler(client);
      logger.info("XP scheduler initialized");

      // Initialize live guild board
      await initializeGuildBoard(client);
      logger.info("Live guild board initialized");

      logger.success("All live systems initialized successfully");
    } catch (error) {
      logger.error("Error initializing live systems:", error);
      throw error;
    }
  },

  initializeExternalModules(client) {
    try {
      // Initialize server
      require("../../utils/server.js");
      
      // Deploy commands
      require("../../utils/deploy-commands.js");
      
      // Initialize voice state update handler
      const voiceStateUpdate = require("../client/voiceStateUpdate.js");
      if (voiceStateUpdate && typeof voiceStateUpdate.execute === 'function') {
        voiceStateUpdate.execute(client);
      }

      logger.info("External modules initialized");
    } catch (error) {
      logger.error("Error initializing external modules:", error);
      // Don't throw here as these might be optional modules
    }
  },
};
