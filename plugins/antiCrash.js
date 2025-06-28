const logger = require('../utils/logger');

module.exports = {
    name: 'AntiCrash Plugin',
    author: 'CharlesNaig',
    description: 'Handles process crashes and ensures a clean bot shutdown.',
    initialize: (client) => {
        const handleExit = async () => {
            if (client) {
                logger.warn('Disconnecting from Discord...');
                await client.destroy();
                logger.success('Successfully disconnected from Discord!');
                process.exit(0);
            }
        };

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection:', { promise, reason: reason.stack || reason });
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error.stack || error);
        });

        process.on('SIGINT', handleExit);
        process.on('SIGTERM', handleExit);
        process.on('SIGQUIT', handleExit);
        logger.info('AntiCrash Plugin initialized.');
    },
};
