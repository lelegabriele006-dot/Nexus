import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderazione: "🛡️",
    Economia: "💰",
    Divertimento: "🎮",
    Leveling: "📊",
    Utilità: "🔧",
    Ticket: "🎫",
    Benvenuto: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Cerca: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Compleanni: "🎂",
    Config: "⚙️",
};





export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Tutti i comandi",
            description: "Vedi tutti i comandi tramite una lista",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Vedi i comandi nella ${categoryName} categoria`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({ 
        title: `🤖 ${botName} Help Center`,
        description: "Il tuo bot Discord all-in-one per moderazione, economia, divertimento e gestione del server.",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **Moderazione**",
            value: "Moderazione del server, moderazione utenti, e strumenti dell'applicazione",
            inline: true
        },
        {
            name: "💰 **Economia**",
            value: "Sistema corrente,  shop, e una economia virtuale!",
            inline: true
        },
        {
            name: "🎮 **Fun**",
            value: "Giochi, intrattenimento, e comandi interattivi!",
            inline: true
        },
        {
            name: "📊 **Leveling**",
            value: "Users level, sistema di XP, e tracking della progressione!",
            inline: true
        },
        {
            name: "🎫 **Ticket**",
            value: "Sistema di ticket per la gestione dei server.",
            inline: true
        },
        {
            name: "🎉 **Giveaways**",
            value: "Gestione e distribuzione automatizzate dei Giveaway.",
            inline: true
        },
        {
            name: "👋 **Welcome**",
            value: "Messaggi di benvenuto e procedura di onboarding per i nuovi membri.",
            inline: true
        },
        {
            name: "🎂 **Compleanni**",
            value: "Funzioni per tenere traccia dei compleanni e per festeggiarli",
            inline: true
        },
        {
            name: "👥 **Community**",
            value: "Attrezzi community, candidature, e coinvolgimento dei membri",
            inline: true
        },
        {
            name: "⚙️ **Config**",
            value: "Server and bot configuration management commands",
            inline: true
        },
        {
            name: "🔢 **Counter**",
            value: "Configurazione del canale del contatore in tempo reale e controlli del contatore",
            inline: true
        },
        {
            name: "🎙️ **Join to Create**",
            value: "Creazione e gestione dinamica dei canali vocali",
            inline: true
        },
        {
            name: "🎭 **Reaction Roles**",
            value: "Ruoli autoassegnabili tramite sistemi di ruoli reattivi",
            inline: true
        },
        {
            name: "✅ **Verification**",
            value: "Verificazione membri e gestione dei canali visualizzabili",
            inline: true
        },
        {
            name: "🔧 **Utilities**",
            value: "Tools utili per il server",
            inline: true
        }
    );

    embed.setFooter({ 
        text: "Creato con il ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Supporta il server")
        .setURL("https://dcd.gg/nexusgng")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("Imparato da Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Selezione per vedere i comandi",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Mostra tutti i comandi del server in un messaggio"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Menu /help chiuso",
                    description: "Il menu /help è stato chiuso. Riscrivi /help per riaprilo.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};


