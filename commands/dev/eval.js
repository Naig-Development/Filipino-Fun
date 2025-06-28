const {
  SlashCommandBuilder,
  EmbedBuilder,
  Client,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  version: discordJsVersion
} = require("discord.js");
const util = require("util");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const config = require("../../config.js");
const client = require("../../index.js");
//evaled variables
const os = require("os");
const { version: nodeJsVersion } = process;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("eval")
    .setDescription("Evaluates JavaScript code."),
  name: "eval",
  description: "Evaluates JavaScript code.",
  prefix: true,
  async execute(interaction) {
    // Ensure client is passed
    const Devs = [config.developerId];
    if (!Devs.includes(interaction.user.id)) {
      return await interaction.reply(
        "You do not have permission to use this command."
      );
    }

    const code = interaction.options.getString("code");
    try {
      let evaled = eval(code);
      if (evaled === client.config) evaled = "Nice try";
      if (typeof evaled !== "string") evaled = util.inspect(evaled);
      if (evaled.length > 2000) {
        const response = await fetch("https://hasteb.in/documents", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: evaled,
        });
        const json = await response.json();
        evaled = `https://hasteb.in/${json.key}`;
        return await interaction.reply({
          content: evaled,
        });
      }
      const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Danger)
        .setLabel("Delete")
        .setCustomId("eval-delete");
      const row = new ActionRowBuilder().addComponents(button);
      const msg = await interaction.reply({
        content: `\`\`\`js\n${evaled}\n\`\`\``,
        components: [row],
        fetchReply: true,
      });
      const filter = (i) =>
        i.customId === "eval-delete" && i.user.id === interaction.user.id;
      const collector = msg.createMessageComponentCollector({
        time: 60000,
        filter,
      });
      collector.on("collect", async (i) => {
        await i.deferUpdate();
        await msg.delete();
      });
    } catch (e) {
      interaction.reply(`\`\`\`js\n${e}\n\`\`\``);
    }
  },
  /**
   *
   * @param {import('discord.js').Message} message
   * @param {string[]} args
   * @param {import('discord.js').Client} client
   */
  async run(message, args) {
    // Ensure client is passed
    const Devs = [config.developerId];
    if (!Devs.includes(message.author.id)) {
      return await message.channel.send(
        "You do not have permission to use this command."
      );
    }

    const code = args.join(" ");
    try {
      let evaled = eval(code);
      if (evaled === client.config) evaled = "Nice try";
      if (typeof evaled !== "string") evaled = util.inspect(evaled);
      if (evaled.length > 2000) {
        const response = await fetch("https://hasteb.in/documents", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: evaled,
        });
        const json = await response.json();
        evaled = `https://hasteb.in/${json.key}`;
        return await message.channel.send({
          content: evaled,
        });
      }
      const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Danger)
        .setLabel("Delete")
        .setCustomId("eval-delete");
      const row = new ActionRowBuilder().addComponents(button);
      const msg = await message.channel.send({
        content: `\`\`\`js\n${evaled}\n\`\`\``,
        components: [row],
      });
      const filter = (i) =>
        i.customId === "eval-delete" && i.user.id === message.author.id;
      const collector = msg.createMessageComponentCollector({
        time: 60000,
        filter,
      });
      collector.on("collect", async (i) => {
        await i.deferUpdate();
        await msg.delete();
      });
    } catch (e) {
      message.channel.send(`\`\`\`js\n${e}\n\`\`\``);
    }
  },
};
