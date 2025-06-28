const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove roles from users')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a role to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add the role to')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a role from a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove the role from')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mention')
                .setDescription('Mention a role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to mention')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        if (subcommand === 'add') {
            const member = await interaction.guild.members.fetch(user.id);
            
            if (member.roles.cache.has(role.id)) {
                return interaction.reply({ content: `${user.tag} already has the ${role.name} role.`, flags: MessageFlags.Ephermeral });
            }

            try {
                await member.roles.add(role);
                return interaction.reply({ content: `Added ${role.name} role to ${user.tag}.`, flags: MessageFlags.Ephermeral });
            } catch (error) {
                return interaction.reply({ content: 'Failed to add role. Check my permissions.', flags: MessageFlags.Ephermeral });
            }
        }

        if (subcommand === 'remove') {
            const member = await interaction.guild.members.fetch(user.id);
            
            if (!member.roles.cache.has(role.id)) {
                return interaction.reply({ content: `${user.tag} doesn't have the ${role.name} role.`, flags: MessageFlags.Ephermeral });
            }

            try {
                await member.roles.remove(role);
                return interaction.reply({ content: `Removed ${role.name} role from ${user.tag}.`, flags: MessageFlags.Ephermeral });
            } catch (error) {
                return interaction.reply({ content: 'Failed to remove role. Check my permissions.', flags: MessageFlags.Ephermeral });
            }
        }

        if (subcommand === 'mention') {
            return interaction.reply({ content: `${role}`, allowedMentions: { roles: [role.id] } });
        }
    },
};