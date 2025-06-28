const cron = require('node-cron');
const { resetPeriodicXP } = require('../utils/xpUtils.js');
const { sendLiveLeaderboard } = require('../utils/liveLeaderboard.js');
const logger = require('../utils/logger.js');

let client = null;

// Initialize scheduler with client
function initializeScheduler(botClient) {
  client = botClient;
  
  // Reset weekly XP every Monday at 00:00
  cron.schedule('0 0 * * 1', async () => {
    try {
      logger.info('Starting weekly XP reset...');
      await resetPeriodicXP('weekly');
      logger.info('Weekly XP reset completed successfully');
      
      // Update leaderboard after reset
      if (client) {
        await sendLiveLeaderboard(client);
      }
    } catch (error) {
      logger.error('Error during weekly XP reset:', error);
    }
  });

  // Reset monthly XP on the 1st of every month at 00:00
  cron.schedule('0 0 1 * *', async () => {
    try {
      logger.info('Starting monthly XP reset...');
      await resetPeriodicXP('monthly');
      logger.info('Monthly XP reset completed successfully');
      
      // Update leaderboard after reset
      if (client) {
        await sendLiveLeaderboard(client);
      }
    } catch (error) {
      logger.error('Error during monthly XP reset:', error);
    }
  });

  // Update live leaderboard every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      if (client) {
        await sendLiveLeaderboard(client);
        logger.info('Live leaderboard updated');
      }
    } catch (error) {
      logger.error('Error updating live leaderboard:', error);
    }
  });

  logger.info('XP reset scheduler and live leaderboard initialized');
}

module.exports = {
  initializeScheduler,
  // Export scheduler functions for manual testing if needed
  resetWeekly: () => resetPeriodicXP('weekly'),
  resetMonthly: () => resetPeriodicXP('monthly'),
  updateLeaderboard: () => client ? sendLiveLeaderboard(client) : null
};