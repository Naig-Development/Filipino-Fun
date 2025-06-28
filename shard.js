const { ShardingManager } = require("discord.js");
const config = require("./config");
const logger = require("./utils/logger");

const manager = new ShardingManager("./index.js", {
    token: config.token,
    totalShards: "auto",
});

console.clear();

manager.on("shardCreate", (shard) => {
    logger.success(`[SHARD] Launched shard ${shard.id}`);

    shard.on("error", (error) => {
        logger.error(`[SHARD] Shard ${shard.id} encountered an error: ${error.message}`);
    });
});

manager.on("error", (error) => {
    logger.error(`[SHARD MANAGER] An error occurred: ${error.message}`);
});

manager.spawn();
