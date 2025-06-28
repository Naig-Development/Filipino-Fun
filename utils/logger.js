const { Signale } = require('signale');

const options = {
    types: {
        main: {
            badge: '🍥',
            color: 'cyan',
            label: 'Main'
        },
        success: {
            badge: '✅',
            color: 'green',
            label: 'Success'
        },
        error: {
            badge: '❌',
            color: 'red',
            label: 'Error'
        },
        warn: {
            badge: '⚠️',
            color: 'yellow',
            label: 'Warning'
        },
        info: {
            badge: 'ℹ️',
            color: 'blue',
            label: 'Info'
        },
        debug: {
            badge: '🐞',
            color: 'magenta',
            label: 'Debug'
        },
        critical: {
            badge: '❗',
            color: 'redBright',
            label: 'Critical'
        }
    }
};

const logger = new Signale(options);

module.exports = logger;
