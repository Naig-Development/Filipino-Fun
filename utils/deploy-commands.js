const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../config.js");
const logger = require("./logger");

// Function to load all command data
function loadCommands() {
  const commands = [];
  const commandFolders = fs.readdirSync(path.join(__dirname, "../commands"));

  for (const folder of commandFolders) {
    const commandFiles = fs
      .readdirSync(path.join(__dirname, `../commands/${folder}`))
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = require(path.join(
        __dirname,
        `../commands/${folder}/${file}`
      ));
      if (command.data) {
        commands.push(command.data.toJSON());
      }
    }
  }
  return commands;
}

// Register commands with Discord
(async () => {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const commands = loadCommands();

  try {
    logger.debug("Started refreshing application commands.");

    // Use this for global commands
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });

    logger.success("Successfully reloaded application commands.");
  } catch (error) {
    logger.error(`Error while refreshing application commands: ${error}`);
  }
})();
