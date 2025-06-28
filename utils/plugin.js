const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const client = require('../index.js');

/**
 * Loads plugins dynamically and initializes them with the client instance.
 * @param {Object} client - The main bot client instance.
 */
async function loadPlugins(client) {
    try {
        const pluginsFolder = path.join(__dirname, '../plugins'); // Ensure the path is correct
        if (!fs.existsSync(pluginsFolder)) {
            logger.warn(`Plugins folder not found at ${pluginsFolder}. Skipping plugin loading.`);
            return;
        }

        const pluginFiles = fs.readdirSync(pluginsFolder).filter(file => file.endsWith('.js'));

        if (pluginFiles.length === 0) {
            logger.warn('No plugin files found in the plugins folder. Skipping.');
            return;
        }

        for (const file of pluginFiles) {
            const pluginPath = path.join(pluginsFolder, file);
            try {
                const plugin = require(pluginPath);

                if (plugin.initialize && typeof plugin.initialize === 'function') {
                    plugin.initialize(client);
                    logger.success(`Loaded plugin: ${plugin.name || file}`);
                } else {
                    logger.warn(`Plugin ${plugin.name || file} does not have an initialize function. Skipping.`);
                }
            } catch (err) {
                logger.error(`Failed to load plugin at ${pluginPath}:`, err);
            }
        }
    } catch (error) {
        logger.error('Error loading plugins:', error);
    }
}

module.exports = {
    loadPlugins,
};
