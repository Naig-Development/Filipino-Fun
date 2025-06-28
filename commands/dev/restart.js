const {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    Colors,
    MessageFlags
} = require("discord.js");
const { spawn } = require("child_process");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Restarts the bot")
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for restart (optional)")
                .setRequired(false)
        ),
    name: "restart",
    description: "Restarts the bot",
    prefix: true,
    
    async execute(interaction) {
        // Check permissions
        if (!this.hasPermission(interaction.user.id)) {
            return interaction.reply({
                content: "\`❌\` You don't have permission to use this command.",
                flags: MessageFlags.Ephermeral
            });
        }

        const reason = interaction.options?.getString("reason");
        return this.handleRestart(interaction, reason);
    },

    async run(message, args) {
        // Check permissions
        if (!this.hasPermission(message.author.id)) {
            return message.reply("\`❌\` You don't have permission to use this command.");
        }

        const reason = args.join(" ") || null;
        return this.handleRestart(message, reason);
    },

    hasPermission(userId) {
        const devs = Array.isArray(config.developerId) ? config.developerId : [config.developerId];
        return devs.includes(userId);
    },

    async handleRestart(context, reason = null) {
        const isSlash = context.isCommand?.();
        const user = isSlash ? context.user : context.author;
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle("🔄 Bot Restart Confirmation")
            .setDescription(`Are you sure you want to restart **${context.client.user.username}**?`)
            .addFields(
                { name: "Requested by", value: `<@${user.id}>`, inline: true },
                { name: "Reason", value: reason || "No reason provided", inline: true }
            )
            .setTimestamp()
            .setFooter({ text: "This action cannot be undone" });

        const confirmButton = new ButtonBuilder()
            .setCustomId("confirm-restart")
            .setLabel("🔄 Confirm Restart")
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId("cancel-restart")
            .setLabel("❌ Cancel")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const reply = isSlash 
            ? await context.reply({ embeds: [embed], components: [row], fetchReply: true })
            : await context.reply({ embeds: [embed], components: [row] });

        const filter = (i) => 
            ["confirm-restart", "cancel-restart"].includes(i.customId) && 
            i.user.id === user.id;

        const collector = reply.createMessageComponentCollector({ 
            filter, 
            time: 30000,
            max: 1
        });

        collector.on("collect", async (i) => {
            if (i.customId === "cancel-restart") {
                const cancelEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription("❌ Restart cancelled.")
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
                return;
            }

            if (i.customId === "confirm-restart") {
                const restartEmbed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setDescription("🔄 Restarting bot... Please wait.")
                    .setTimestamp();

                await i.update({ embeds: [restartEmbed], components: [] });

                logger.info(`Bot restart initiated by ${user.tag} (${user.id})${reason ? ` - Reason: ${reason}` : ""}`);

                // Perform restart
                this.performRestart(context.client);
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription("\`⏰\` Restart confirmation timed out.")
                    .setTimestamp();

                try {
                    await reply.edit({ embeds: [timeoutEmbed], components: [] });
                } catch (error) {
                    logger.error("Failed to edit timeout message:", error);
                }
            }
        });
    },

    async performRestart(client) {
        try {
            logger.info("Initiating bot restart...");
            
            // Gracefully destroy the client
            await client.destroy();
            logger.info("Client destroyed successfully");

            // Small delay to ensure cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Restart the process
            const args = process.argv.slice(1);
            const child = spawn(process.execPath, args, {
                detached: true,
                stdio: 'inherit'
            });

            child.unref();
            
            logger.info("Restart process spawned, exiting current process");
            process.exit(0);

        } catch (error) {
            logger.error("Error during restart:", error);
            process.exit(1);
        }
    }
};