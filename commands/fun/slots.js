const { Slots } = require('discord-gamecord');
const logger = require('../../utils/logger.js');

module.exports = {
  name: 'slots',
  description: 'Play a slot machine game!',
  execute(message) {
    const Game = new Slots({
      message: message,
      isSlashGame: false,
      embed: {
        title: 'Slot Machine 🎰',
        color: '#e4d8c4',
        description: 'Watch the fruits spin!',
      },
      slots: ['🍇', '🍊', '🍋', '🍒', '🍉'],
      spinDuration: 4000, // 4 seconds for noticeable spin
      updateInterval: 50, // Update every 50ms for smooth fruit transitions
    });

    Game.startGame();
    Game.on('gameOver', (result) => {
      logger.info(result); // Logs the game result
    });
  },
  };