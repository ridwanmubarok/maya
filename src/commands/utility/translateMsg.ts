import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types";

// Memory cache to temporarily store message text for translation buttons (key: msgId)
export const translationCache = new Map<string, string>();

const command: Command = {
  data: new ContextMenuCommandBuilder()
    .setName("🌐 Terjemahkan Teks")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const targetMsg = interaction.targetMessage;
    const content = targetMsg.content;

    if (!content || content.trim().length === 0) {
      await interaction.reply({
        content: "Pesan yang dipilih tidak berisi teks untuk diterjemahkan.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store in cache for button interaction lookup
    translationCache.set(targetMsg.id, content);

    // Clean up cache after 15 minutes
    setTimeout(() => {
      translationCache.delete(targetMsg.id);
    }, 15 * 60 * 1000);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`trans_lang:EN:${targetMsg.id}`)
        .setLabel("🇬🇧 English")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`trans_lang:JA:${targetMsg.id}`)
        .setLabel("🇯🇵 Japanese")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`trans_lang:ZH:${targetMsg.id}`)
        .setLabel("🇨🇳 Chinese")
        .setStyle(ButtonStyle.Success)
    );

    const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;

    await interaction.reply({
      content: `Pilih bahasa tujuan untuk menerjemahkan pesan dari **${targetMsg.author.displayName || targetMsg.author.username}**:\n> *"${preview}"*`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
