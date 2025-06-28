const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");

module.exports = {  
  // Slash command definition
  data: new SlashCommandBuilder()
    .setName("vanity")
    .setDescription("Manage global vanity URL and keyword tracking")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a term to track for all users")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Type of term to track")
            .setRequired(true)
            .addChoices(
              { name: "Vanity URL", value: "vanity" },
              { name: "Keyword", value: "keyword" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("term")
            .setDescription("The vanity URL or keyword to track")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to assign for this term")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a tracked term")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Type of term to remove")
            .setRequired(true)
            .addChoices(
              { name: "Vanity URL", value: "vanity" },
              { name: "Keyword", value: "keyword" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("term")
            .setDescription("The term to stop tracking")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all tracked terms")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Filter list by term type")
            .setRequired(false)
            .addChoices(
              { name: "Vanity URLs", value: "vanity" },
              { name: "Keywords", value: "keyword" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("scan")
        .setDescription(
          "Scan all users and update roles based on tracked terms"
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  // Prefix command properties
  name: "vanity",
  description: "Manage global vanity URL and keyword tracking",
  prefix: true,

  // Slash command handler
  async execute(interaction, client) {
    const { guild } = interaction;
    const subcommand = interaction.options.getSubcommand();

    // Import VanityUrl schema and handle subcommand
    const VanityUrl = require("../../schema/vanityUrl.js");
    const config = require("../../config.js");
    const logger = require("../../utils/logger.js");

    const guildSettings = config.guilds?.[guild.id] || {};

    if (!guildSettings.vanityTracking?.enabled) {
      return interaction.reply({
        content: "Vanity tracking is not enabled on this server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    switch (subcommand) {
      case "add":
        await handleTermAdd(interaction, VanityUrl, logger);
        break;
      case "remove":
        await handleTermRemove(interaction, VanityUrl, logger);
        break;
      case "list":
        await handleTermList(interaction, VanityUrl, logger);
        break;
      case "scan":
        await handleScanUsers(interaction, VanityUrl, logger);
        break;
    }
  },

  // Prefix command handler
  async run(message, args, client) {
    const { guild } = message;

    // Import required modules
    const VanityUrl = require("../../schema/vanityUrl.js");
    const config = require("../../config.js");
    const logger = require("../../utils/logger.js");

    // Check permissions
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply(
        "You need the `Manage Roles` permission to use this command."
      );
    }

    const guildSettings = config.guilds?.[guild.id] || {};

    if (!guildSettings.vanityTracking?.enabled) {
      return message.reply("Vanity tracking is not enabled on this server.");
    }

    // Parse subcommand from args
    const subcommand = args[0]?.toLowerCase();

    // Handle invalid or missing subcommand
    if (
      !subcommand ||
      !["add", "remove", "list", "scan"].includes(subcommand)
    ) {
      const helpEmbed = new EmbedBuilder()
        .setTitle("Vanity Command Usage")
        .setDescription("Manage vanity URL and keyword tracking")
        .setColor(config.embedColors.main)
        .addFields(
          {
            name: "`vanity add <type> <term> <role>`",
            value: "Add a term to track for all users",
          },
          {
            name: "`vanity remove <type> <term>`",
            value: "Remove a tracked term",
          },
          { name: "`vanity list [type]`", value: "List all tracked terms" },
          { name: "`vanity scan`", value: "Scan all users and update roles" }
        )
        .setFooter({ text: "Parameters: <required> [optional]" });

      return message.reply({ embeds: [helpEmbed] });
    }

    // Create a message-based "interaction" object to reuse the same handlers
    const msgInteraction = {
      guild,
      client,
      user: message.author,
      member: message.member,
      options: {
        getSubcommand: () => subcommand,
        getString: (name) => {
          if (
            name === "type" &&
            ["vanity", "keyword"].includes(args[1]?.toLowerCase())
          ) {
            return args[1].toLowerCase();
          }
          if (name === "term" && args[2]) {
            return args[2].toLowerCase();
          }
          return null;
        },
        getRole: () => {
          if (subcommand === "add" && args[3]) {
            // Try to find role by mention, ID, or name
            return (
              message.mentions.roles.first() ||
              message.guild.roles.cache.get(args[3]) ||
              message.guild.roles.cache.find(
                (r) => r.name.toLowerCase() === args[3].toLowerCase()
              )
            );
          }
          return null;
        },
        getUser: () => null, // Not used in vanity command
      },
      reply: async (options) => {
        // Convert interaction.reply to message.reply
        if (options.ephemeral) {
          return message.reply({
            content: options.content,
            embeds: options.embeds,
          });
        }
        return message.reply({
          content: options.content,
          embeds: options.embeds,
          components: options.components,
        });
      },
      deferReply: async () => {
        return message.channel.sendTyping();
      },
      editReply: async (options) => {
        // Since we can't edit a typing indicator, we'll send a new message
        return message.channel.send({
          content: options.content,
          embeds: options.embeds,
          components: options.components,
        });
      },
    };

    // Use the same handlers as slash commands
    try {
      switch (subcommand) {
        case "add":
          if (args.length < 4) {
            return message.reply(
              'Usage: `vanity add <type> <term> <role>` - where type is either "vanity" or "keyword"'
            );
          }
          await handleTermAdd(msgInteraction, VanityUrl, logger);
          break;
        case "remove":
          if (args.length < 3) {
            return message.reply(
              'Usage: `vanity remove <type> <term>` - where type is either "vanity" or "keyword"'
            );
          }
          await handleTermRemove(msgInteraction, VanityUrl, logger);
          break;
        case "list":
          await handleTermList(msgInteraction, VanityUrl, logger);
          break;
        case "scan":
          await handleScanUsers(msgInteraction, VanityUrl, logger);
          break;
      }
    } catch (error) {
      logger.error(`Error in vanity prefix command: ${error}`);
      message.reply(`An error occurred: ${error.message}`);
    }
  },
};

// Handler functions
async function handleTermAdd(interaction, VanityUrl, logger) {
  const type = interaction.options.getString("type");
  let term = interaction.options.getString("term").trim().toLowerCase();
  const role = interaction.options.getRole("role");

  if (!role) {
    return interaction.reply({
      content: "You must specify a role to assign for this term.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if bot can manage this role
  if (role.position >= interaction.guild.members.me.roles.highest.position) {
    return interaction.reply({
      content:
        "I cannot assign this role as it is positioned higher than or equal to my highest role.",
      flags: MessageFlags.Ephemeral,
    });
  }

  /* For vanity type, remove discord.gg/ prefix if included
  if (type === "vanity" && term.includes("discord.gg/")) {
    term = term.split("discord.gg/")[1];
  }

  // Validate term format based on type
  if (type === "vanity" && !/^[a-z0-9-]+$/.test(term)) {
    return interaction.reply({
      content:
        "Invalid vanity URL. Only letters, numbers, and hyphens are allowed.",
      flags: MessageFlags.Ephemeral,
    });
  }*/

  try {
    // Check if this term is already registered
    const existingTerm = await VanityUrl.findOne({
      guildId: interaction.guild.id,
      type: type,
      term: term,
      isActive: true,
    });

    if (existingTerm) {
      return interaction.reply({
        content: `This ${type} \`${term}\` is already registered with the role <@&${existingTerm.roleId}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Create new term record
    const newTerm = new VanityUrl({
      guildId: interaction.guild.id,
      type: type,
      term: term,
      roleId: role.id,
      addedBy: interaction.user.id,
      dateAdded: new Date(),
      isActive: true,
      activeUsers: [], // Will be populated during scans
    });

    await newTerm.save();

    const termTypeLabel = type === "vanity" ? "Vanity URL" : "Keyword";

    const embed = new EmbedBuilder()
      .setTitle(`\`\`✅\`\` Global ${termTypeLabel} Added`)
      .setDescription(
        `Successfully registered ${type} \`${term}\` with role <@&${role.id}>`
      )
      .setColor(config.embedColors.main)
      .addFields(
        { name: termTypeLabel, value: `\`${term}\``, inline: true },
        { name: "Role", value: `<@&${role.id}>`, inline: true },
        { name: "Added by", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setFooter({
        text: "This term will be checked for all users in the server",
      })
      .setTimestamp();

    // Start an initial scan for this term if desired
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`scan_term_${newTerm._id}`)
        .setLabel("Scan All Users Now")
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    logger.error(`Error adding global term: ${error}`);
    return interaction.reply({
      content: `An error occurred while adding the term: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleTermRemove(interaction, VanityUrl, logger) {
  const type = interaction.options.getString("type");
  let term = interaction.options.getString("term").trim().toLowerCase();

  // For vanity type, remove discord.gg/ prefix if included
  if (type === "vanity" && term.includes("discord.gg/")) {
    term = term.split("discord.gg/")[1];
  }

  try {
    // Find the term record
    const termRecord = await VanityUrl.findOne({
      guildId: interaction.guild.id,
      type: type,
      term: term,
      isActive: true,
    });

    if (!termRecord) {
      return interaction.reply({
        content: `No active ${type} \`${term}\` found in this server.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Confirm removal
    const confirmEmbed = new EmbedBuilder()
      .setTitle(`\`⚠️\`Confirm Term Removal`)
      .setDescription(
        `Are you sure you want to remove the ${type} \`${term}\`? This will remove the role <@&${termRecord.roleId}> from all users who have it.`
      )
      .setColor("#FF9FF3")
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_remove_${termRecord._id}`)
        .setLabel("Remove Term")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel_remove_${termRecord._id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error(`Error removing term: ${error}`);
    return interaction.reply({
      content: `An error occurred while removing the term: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleTermList(interaction, VanityUrl, logger) {
  const type = interaction.options.getString("type");

  try {
    let query = {
      guildId: interaction.guild.id,
      isActive: true,
    };

    // Filter by type if specified
    if (type) {
      query.type = type;
    }

    const terms = await VanityUrl.find(query).sort({ type: 1, dateAdded: -1 });

    if (terms.length === 0) {
      let message = "No active terms found";
      if (type) message += ` of type '${type}'`;
      message += " in this server.";

      return interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Group terms by type
    const groupedTerms = {
      vanity: [],
      keyword: [],
    };

    for (const term of terms) {
      groupedTerms[term.type].push(term);
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Globally Tracked Terms")
      .setDescription(
        `Showing ${type ? type + " " : ""}terms in ${interaction.guild.name}`
      )
      .setColor(config.embedColors.main)
      .setTimestamp();

    // Add vanity URLs if present and not filtered out
    if (!type || type === "vanity") {
      const vanityList = groupedTerms.vanity;
      if (vanityList.length > 0) {
        let vanityText = "";
        for (const v of vanityList) {
          const role = interaction.guild.roles.cache.get(v.roleId);
          const roleName = role ? role.name : "Unknown Role";
          const activeUsers = v.activeUsers?.length || 0;

          vanityText += `• \`${v.term}\` → <@&${v.roleId}> (${roleName})\n`;
          vanityText += `  Added by <@${v.addedBy}> <t:${Math.floor(
            v.dateAdded.getTime() / 1000
          )}:R>\n`;
          vanityText += `  Currently active on ${activeUsers} users\n\n`;
        }

        if (vanityText) {
          embed.addFields({
            name: `🔗 Vanity URLs (${vanityList.length})`,
            value: vanityText || "None found",
          });
        }
      }
    }

    // Add keywords if present and not filtered out
    if (!type || type === "keyword") {
      const keywordList = groupedTerms.keyword;
      if (keywordList.length > 0) {
        let keywordText = "";
        for (const k of keywordList) {
          const role = interaction.guild.roles.cache.get(k.roleId);
          const roleName = role ? role.name : "Unknown Role";
          const activeUsers = k.activeUsers?.length || 0;

          keywordText += `• \`${k.term}\` → <@&${k.roleId}> (${roleName})\n`;
          keywordText += `  Added by <@${k.addedBy}> <t:${Math.floor(
            k.dateAdded.getTime() / 1000
          )}:R>\n`;
          keywordText += `  Currently active on ${activeUsers} users\n\n`;
        }

        if (keywordText) {
          embed.addFields({
            name: `🔤 Keywords (${keywordList.length})`,
            value: keywordText || "None found",
          });
        }
      }
    }

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error listing terms: ${error}`);
    return interaction.reply({
      content: `An error occurred while listing terms: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleScanUsers(interaction, VanityUrl, logger) {
  try {
    await interaction.deferReply();

    // Get all active terms
    const allTerms = await VanityUrl.find({
      guildId: interaction.guild.id,
      isActive: true,
    });

    if (allTerms.length === 0) {
      return interaction.editReply({
        content: "No active terms found to scan for.",
      });
    }

    let scannedCount = 0;
    let roleChanges = 0;
    const termMatches = new Map(); // Maps termId -> array of user IDs

    // Initialize the term matches
    for (const term of allTerms) {
      termMatches.set(term._id.toString(), []);
    }

    // Create a progress message
    const embed = new EmbedBuilder()
      .setTitle("🔍 Scanning All Users")
      .setDescription("Starting scan of all users in the server...")
      .setColor(config.embedColors.main)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Get all guild members
    await interaction.guild.members.fetch();
    const allMembers = interaction.guild.members.cache.values();
    const totalMembers = interaction.guild.members.cache.size;

    // Process members in chunks to avoid rate limits
    const memberChunks = [];
    let tempChunk = [];

    // Split members into chunks of 100
    for (const member of allMembers) {
      tempChunk.push(member);
      if (tempChunk.length >= 100) {
        memberChunks.push([...tempChunk]);
        tempChunk = [];
      }
    }

    if (tempChunk.length > 0) {
      memberChunks.push(tempChunk);
    }

    for (let i = 0; i < memberChunks.length; i++) {
      const chunk = memberChunks[i];

      // Process each member in the chunk
      const promises = chunk.map(async (member) => {
        try {
          if (member.user.bot) return; // Skip bots

          scannedCount++;

          // Skip if no presence data
          if (!member.presence) return;

          const activities = member.presence.activities || [];
          const userStatus = activities
            .filter((activity) => activity.type === 4) // Custom Status
            .map((activity) => activity.state || "")
            .join(" ");

          const allUserText =
            activities
              .map((activity) => {
                return [
                  activity.state || "",
                  activity.details || "",
                  activity.name || "",
                ].join(" ");
              })
              .join(" ") +
            " " +
            userStatus;

          const allUserTextLower = allUserText.toLowerCase();

          // Check for matches
          for (const term of allTerms) {
            if (allUserTextLower.includes(term.term.toLowerCase())) {
              // Add to matches
              termMatches.get(term._id.toString()).push({
                userId: member.id,
                username: member.user.tag,
              });

              // Add role if they don't have it
              if (!member.roles.cache.has(term.roleId)) {
                await member.roles.add(
                  term.roleId,
                  `Global term match: ${term.term}`
                );
                roleChanges++;
              }
            } else if (member.roles.cache.has(term.roleId)) {
              // Remove role if they have it but don't match
              const isTermMatch = allTerms.some(
                (otherTerm) =>
                  otherTerm.roleId === term.roleId &&
                  allUserTextLower.includes(otherTerm.term.toLowerCase())
              );

              // Only remove if no other term with the same role matches
              if (!isTermMatch) {
                await member.roles.remove(
                  term.roleId,
                  `No global term match: ${term.term}`
                );
                roleChanges++;
              }
            }
          }
        } catch (error) {
          logger.error(
            `Error processing member ${member.id} during scan: ${error}`
          );
        }
      });

      // Wait for this chunk to complete
      await Promise.all(promises);

      // Update progress every chunk
      const progressEmbed = new EmbedBuilder()
        .setTitle("🔍 Scanning Users")
        .setDescription(
          `Scanning progress: ${scannedCount}/${totalMembers} users processed`
        )
        .setColor(config.embedColors.main)
        .addFields({
          name: "Role Changes",
          value: roleChanges.toString(),
          inline: true,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [progressEmbed] });

      // Add a small delay between chunks to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Update the term documents with active users
    for (const [termId, users] of termMatches.entries()) {
      await VanityUrl.updateOne(
        { _id: termId },
        {
          $set: {
            activeUsers: users.map((u) => ({
              userId: u.userId,
              lastSeen: new Date(),
            })),
          },
        }
      );
    }

    // Build results by term
    let resultsText = "";
    for (const term of allTerms) {
      const matches = termMatches.get(term._id.toString());
      const roleName =
        interaction.guild.roles.cache.get(term.roleId)?.name || "Unknown Role";

      resultsText += `**${term.type === "vanity" ? "Vanity" : "Keyword"}: \`${
        term.term
      }\`**\n`;
      resultsText += `Role: <@&${term.roleId}> (${roleName})\n`;
      resultsText += `Matches: ${matches.length} users\n\n`;
    }

    // Complete the scan with results
    const resultEmbed = new EmbedBuilder()
      .setTitle("\`\`✅\`\` Scan Complete")
      .setDescription(
        `Scanned ${scannedCount} users in ${interaction.guild.name}`
      )
      .setColor(config.embedColors.main)
      .addFields(
        { name: "Role Changes", value: roleChanges.toString(), inline: true },
        { name: "Results by Term", value: resultsText || "No matches found" }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [resultEmbed] });
  } catch (error) {
    logger.error(`Error during user scan: ${error}`);
    return interaction.editReply({
      content: `An error occurred during the scan: ${error.message}`,
    });
  }
}
