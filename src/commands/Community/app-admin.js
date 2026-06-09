import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationSettings, 
    saveApplicationSettings, 
    getApplication, 
    getApplications, 
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplication
} from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'In Progress' :
        normalized === 'approved' ? 'Accepted' :
        normalized === 'denied' ? 'Denied' :
        'Unknown';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("Manage staff applications")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setup")
            .setDescription("Crea una candidatura")
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("review")
            .setDescription("Approva o rifiuta la candidatura")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("The application ID")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("Lista di tutte le candidature")
            .addStringOption((option) =>
                option
                    .setName("status")
                    .setDescription("Filtrate dallo stato della candidatura")
                    .addChoices(
                        { name: "Pending", value: "in corso..." },
                        { name: "Approved", value: "approvata" },
                        { name: "Denied", value: "rifiutata" },
                    ),
            )
            .addStringOption((option) =>
                option.setName("role").setDescription("Filtrade dall'ID del ruolo"),
            )
            .addUserOption((option) =>
                option.setName("user").setDescription("Filtrata dall'utente"),
            )
            .addNumberOption((option) =>
                option
                    .setName("limit")
                    .setDescription(
                        "Massime candidature mostrate (default: 10)",
                    )
                    .setMinValue(1)
                    .setMaxValue(25),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("dashboard")
            .setDescription("Apri la dashboard delle candidature")
            .addStringOption((option) =>
                option
                    .setName("application")
                    .setDescription("Scegli una candidatura")
                    .setRequired(false)
                    .setAutocomplete(true),
            ),
    ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("Questo comando può essere usato solo in un server.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        // ✓ Permission check: User must have ManageGuild permission or a configured manager role
        // This prevents unauthorized users from accessing admin functions
        await ApplicationService.checkManagerPermission(interaction.client, guild.id, member);

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "review") {
            await handleReview(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        } else if (subcommand === "dashboard") {
            const selectedAppName = interaction.options.getString("application");
            await appDashboard.execute(interaction, null, interaction.client, selectedAppName);
        }
    }, { type: 'command', commandName: 'app-admin' })
};

async function handleSetup(interaction) {
    // Ensure interaction hasn't been deferred/replied yet (safety check)
    if (interaction.deferred || interaction.replied) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed("Questa interazione è gia stata fatta. Perfavore riprova a fare il comando.")],
            flags: ["Ephemeral"],
        });
    }

    // Build modal using LabelBuilder API with a native role select dropdown
    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('Crea una nuova candidatura');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('Scegli il ruolo di cui ti vuoi candidare.')
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Application Role')
        .setDescription('The role that users will be applying for')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Chat Mod, Helper, Owner')
        .setMaxLength(50)
        .setMinLength(1)
        .setRequired(true);

    const appNameLabel = new LabelBuilder()
        .setLabel('Application Name')
        .setTextInputComponent(appNameInput);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Perchè vuoi questo ruolo?')
        .setMaxLength(100)
        .setMinLength(1)
        .setRequired(true);

    const q1Label = new LabelBuilder()
        .setLabel('Question 1 (required)')
        .setTextInputComponent(q1Input);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Che esperienze hai?')
        .setMaxLength(100)
        .setRequired(false);

    const q2Label = new LabelBuilder()
        .setLabel('Question 2 (optional)')
        .setTextInputComponent(q2Input);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const q3Label = new LabelBuilder()
        .setLabel('Question 3 (optional)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: 15 * 60 * 1000, // 15 minutes
        filter: (i) =>
            i.customId === 'app_setup_modal' &&
            i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) {
        logger.info('Il setup del modal non è andato a buon fine oppure è andato in time out.', { guildId: interaction.guild.id, userId: interaction.user.id });
        return;
    }

    const appName = submitted.fields.getTextInputValue('app_name').trim();
    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        await submitted.reply({
            embeds: [errorEmbed('Non hai selezionato un ruolo', 'Devi selezionare un ruolo per candidarti!')],
            flags: ['Ephemeral'],
        });
        return;
    }

    const questions = [
        submitted.fields.getTextInputValue('app_question_1').trim(),
        submitted.fields.getTextInputValue('app_question_2').trim(),
        submitted.fields.getTextInputValue('app_question_3').trim(),
    ].filter(q => q.length > 0);

    // Get the role to verify it exists
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        await submitted.reply({
            embeds: [errorEmbed('Ruolo invalido', 'Il ruolo selezionato non può essere trovato.')],
            flags: ['Ephemeral'],
        });
        return;
    }

    // Check if this role is already an application
    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    if (existingRoles.some(r => r.roleId === roleId)) {
        await submitted.reply({
            embeds: [errorEmbed('Già configurato', `Il ruolo ${role} è già stato configurato per una candidatura.`)],
            flags: ['Ephemeral'],
        });
        return;
    }

    // Add the role to applications with enabled status
    existingRoles.push({
        roleId: roleId,
        name: appName,
        enabled: true,  // New applications start enabled
    });

    await saveApplicationRoles(interaction.client, interaction.guild.id, existingRoles);

    // Enable the system
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    if (!settings.enabled) {
        await ApplicationService.updateSettings(interaction.client, interaction.guild.id, { enabled: true });
    }

    // Save the questions for this specific role
    await saveApplicationRoleSettings(interaction.client, interaction.guild.id, roleId, { questions });

    await submitted.reply({
        embeds: [successEmbed(
            '✅ Candidatura creata',
            `**${appName}** candidatura creata per il ruolo ${role}.\n\nYou can customize the log channel, manager roles, questions, and retention period in the dashboard.`,
        )],
        flags: ['Ephemeral'],
    });

    // Auto-open dashboard with this app selected
    setTimeout(() => {
        appDashboard.execute(submitted, null, interaction.client, appName);
    }, 500);
}


async function handleReview(interaction) {
    const appId = interaction.options.getString("id");

    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId,
    );
    if (!application) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Candidatura non trovata.")],
            flags: ["Ephemeral"],
        });
    }

    if (application.status !== "pending") {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed("Errore."),
            ],
            flags: ["Ephemeral"],
        });
    }

    // Show application details with approve/deny buttons
    const appEmbed = createEmbed({
        title: `📋 Ricontrolla la candidatura`,
        description: `**User:** <@${application.userId}>\n**Application:** ${application.roleName}\n**Application ID:** \`${appId}\``,
        color: 'info',
    });

    // Add application answers to the embed
    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `Q${index + 1}: ${item.question}`,
                value: item.answer || '*No answer provided*',
                inline: false
            });
        });
    }

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger),
    );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ["Ephemeral"],
    });

    // Setup button collector
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId.startsWith(`app_review_approve_${appId}`) ||
             i.customId.startsWith(`app_review_deny_${appId}`)),
        time: 300_000, // 5 minutes
        max: 1,
    });

    collector.on('collect', async buttonInteraction => {
        const isApprove = buttonInteraction.customId.includes('approve');
        
        // Show modal for reason
        const reasonModal = new ModalBuilder()
            .setCustomId(`app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}`)
            .setTitle(`${isApprove ? 'Approve' : 'Deny'} Application - Reason`);

        reasonModal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('review_reason')
                    .setLabel('Reason (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Provide a reason for this decision...')
                    .setMaxLength(500)
                    .setRequired(false),
            ),
        );

        await buttonInteraction.showModal(reasonModal);

        try {
            const reasonSubmit = await buttonInteraction.awaitModalSubmit({
                time: 5 * 60 * 1000, // 5 minutes
                filter: i =>
                    i.customId === `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}` &&
                    i.user.id === buttonInteraction.user.id,
            }).catch(() => null);

            if (!reasonSubmit) return;

            const reason = reasonSubmit.fields.getTextInputValue('review_reason').trim() || "No reason provided.";
            const action = isApprove ? 'approve' : 'deny';
            const status = isApprove ? 'approved' : 'denied';

            const updatedApplication = await ApplicationService.reviewApplication(
                reasonSubmit.client,
                interaction.guild.id,
                appId,
                {
                    action,
                    reason,
                    reviewerId: reasonSubmit.user.id
                }
            );

            // Send DM to user
            try {
                const user = await reasonSubmit.client.users.fetch(application.userId);
                const statusColor = status === "approved" ? getColor('success') : getColor('error');
                const reviewStatus = getApplicationStatusPresentation(status);
                const dmEmbed = createEmbed(
                    `${reviewStatus.statusEmoji} Application ${reviewStatus.statusLabel}`,
                    `Your application for **${application.roleName}** has been **${status}**\n` +
                        `**Note:** ${reason}\n\n` +
                        `Use \`/apply status id:${appId}\` to view details.`
                ).setColor(statusColor);

                await user.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.warn('Failed to send DM to user for application review', {
                    error: error.message,
                    userId: application.userId,
                    applicationId: appId
                });
            }

            // Update log message
            if (application.logMessageId && application.logChannelId) {
                try {
                    const statusColor = status === "approved" ? getColor('success') : getColor('error');
                    const logChannel = interaction.guild.channels.cache.get(
                        application.logChannelId,
                    );
                    if (logChannel) {
                        const logMessage = await logChannel.messages.fetch(
                            application.logMessageId,
                        );
                        if (logMessage) {
                            const embed = logMessage.embeds[0];
                            if (embed) {
                                const reviewStatus = getApplicationStatusPresentation(status);
                                const newEmbed = EmbedBuilder.from(embed)
                                    .setColor(statusColor)
                                    .spliceFields(0, 1, {
                                        name: "Status",
                                        value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`,
                                    });

                                await logMessage.edit({
                                    embeds: [newEmbed],
                                    components: [],
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Impossibile caricare il log della candidatura.', {
                        error: error.message,
                        applicationId: appId,
                        logMessageId: application.logMessageId
                    });
                }
            }

            // Assign role if approved
            if (isApprove) {
                try {
                    const member = await interaction.guild.members.fetch(
                        application.userId,
                    );
                    await member.roles.add(application.roleId);
                } catch (error) {
                    logger.error('Impossibile assegnare il ruolo.', {
                        error: error.message,
                        userId: application.userId,
                        roleId: application.roleId,
                        applicationId: appId
                    });
                }
            }

            // Respond to modal submission
            await reasonSubmit.reply({
                embeds: [
                    successEmbed(
                        `Application ${status}`,
                        `La candidatura è  **${status}**.`,
                    ),
                ],
                flags: ["Ephemeral"],
            });

        } catch (error) {
            logger.error('Errore durante la ricontrollazione della candidatura:', error);
            await buttonInteraction.reply({
                embeds: [errorEmbed('Error', 'Un errore è accaduto durante il ricontrollo.')],
                flags: ["Ephemeral"],
            });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = createEmbed({
                title: '⏱️ Review Timeout',
                description: 'Il bottone "Ricontrolla" non ha funzionato.',
                color: 'warning',
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

async function handleList(interaction) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = {};
    // Default to showing only pending applications if no status specified
    if (status) {
        filters.status = status;
    } else {
        filters.status = 'pending';
    }

    let applications = await getApplications(
        interaction.client,
        interaction.guild.id,
        filters,
    );
    
    // Filter out applications from users who are no longer in the guild (except if filtering by specific user)
    if (!user) {
        applications = await Promise.all(
            applications.map(async (app) => {
                try {
                    await interaction.guild.members.fetch(app.userId);
                    return app; // User still in guild
                } catch {
                    // User no longer in guild, delete the application
                    await deleteApplication(interaction.client, interaction.guild.id, app.id, app.userId);
                    return null; // Mark for removal
                }
            })
        ).then(results => results.filter(Boolean)); // Remove nulls
    }

    if (user) {
        applications = applications.filter((app) => app.userId === user.id);
    }

    if (applications.length === 0) {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length > 0) {
            const embed = createEmbed({ 
                title: "No Applications Found", 
                description: "Nessuna candidatura contiene questo criterio.\n\nHowever, la candidatura per questo ruolo è già stata configurate:" 
            });

            applicationRoles.forEach((appRole, index) => {
                const role = interaction.guild.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**Role:** ${role ? `<@&${appRole.roleId}>` : 'Ruolo non trovato'}\n**Available for applications:** Yes`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "Gli utenti possono candidarsi con /apply submit oppure vedere i ruoli possibili per candidarsi con :  **/apply list"
            });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Candidatura non trovata o non configurata.\n" +
                        "Usa `/app-admin roles add` per configurare le candidature."
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }
    }

    applications = applications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    const embed = createEmbed({ title: "Candidature mandate", description: `Showing ${applications.length} applications.`, });

    applications.forEach((app) => {
        const statusView = getApplicationStatusPresentation(app?.status);
        const roleName = app?.roleName || 'Unknown Role';
        const username = app?.username || 'Unknown User';
        const createdAt = app?.createdAt ? new Date(app.createdAt) : null;
        const createdAtDisplay = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleString()
            : 'Data sconosciuta';

        embed.addFields({
            name: `${statusView.statusEmoji} ${roleName} - ${username}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**Stato:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Data:** ${createdAtDisplay}`,
            inline: true,
        });
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

export async function handleApplicationReviewModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_review_')) return;
    
    const [, appId, action] = customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
    const isApprove = action === 'approve';
    
    try {
        const application = await getApplication(interaction.client, interaction.guild.id, appId);
        if (!application) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Application not found.')],
                flags: ["Ephemeral"]
            });
        }
        
        const status = isApprove ? 'approved' : 'denied';
        await updateApplication(interaction.client, interaction.guild.id, appId, {
            status,
            reviewer: interaction.user.id,
            reviewMessage: reason,
            reviewedAt: new Date().toISOString()
        });
        
        try {
            const user = await interaction.client.users.fetch(application.userId);
            const reviewStatus = getApplicationStatusPresentation(status);
            const dmEmbed = createEmbed(
                `${reviewStatus.statusEmoji} Application ${reviewStatus.statusLabel}`,
                `Your application for **${application.roleName}** has been **${status}**.\n` +
                `**Note:** ${reason}\n\n` +
                `Use \`/apply status id:${appId}\` to view details.`,
                isApprove ? '#00FF00' : '#FF0000'
            );
            
            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            logger.error('Errore a mandare il dm al membro / utente :', error);
        }
        
        if (application.logMessageId && application.logChannelId) {
            try {
                const logChannel = interaction.guild.channels.cache.get(application.logChannelId);
                if (logChannel) {
                    const logMessage = await logChannel.messages.fetch(application.logMessageId);
                    if (logMessage) {
                        const embed = logMessage.embeds[0];
                        if (embed) {
                            const reviewStatus = getApplicationStatusPresentation(status);
                            const newEmbed = EmbedBuilder.from(embed)
                                .setColor(isApprove ? '#00FF00' : '#FF0000')
                                .spliceFields(0, 1, {
                                    name: 'Status',
                                    value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`
                                });
                            
                            await logMessage.edit({
                                embeds: [newEmbed],
                                components: []
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error('Errore ricaricando i messaggi dei log :', error);
            }
        }
        
        if (isApprove) {
            try {
                const member = await interaction.guild.members.fetch(application.userId);
                await member.roles.add(application.role);
            } catch (error) {
                logger.error('Error assigning role:', error);
            }
        }
        
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `${getApplicationStatusPresentation(status).statusEmoji} Application ${getApplicationStatusPresentation(status).statusLabel}`,
                    `L'applicazione è stata segnata ${getApplicationStatusPresentation(status).statusLabel}.`
                )
            ],
            flags: ["Ephemeral"]
        });
        
    } catch (error) {
        logger.error('Errore durante la revisione della candidatura :', error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Errore durante il ricontrollo della candidatura.')],
            flags: ["Ephemeral"]
        });
    }
}



