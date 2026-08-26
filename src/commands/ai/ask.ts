import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { askNvidia } from "../../services/aiClient";
import { prisma } from "../../services/database";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Tanya apa saja kepada Maya (Asisten Pintar)")
    .addStringOption(opt =>
      opt
        .setName("pertanyaan")
        .setDescription("Pertanyaan atau pesan yang ingin diajukan")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("pertanyaan", true);
    const guildId = interaction.guildId;

    // Defer reply because AI takes some time to generate response
    await interaction.deferReply();

    try {
      let personality: string | undefined;
      let historyMessages: { role: string; content: string }[] = [];

      if (guildId) {
        const config = await prisma.guildConfig.findUnique({
          where: { guildId }
        });
        if (config?.aiPersonality) {
          personality = config.aiPersonality;
        }

        // Fetch recent conversation history (last 10 messages for context memory)
        const dbHistory = await prisma.aiChatMessage.findMany({
          where: { guildId, userId: interaction.user.id },
          orderBy: { createdAt: "desc" },
          take: 10
        });

        // Reverse to chronological order (oldest first)
        historyMessages = dbHistory.reverse().map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      }

      const promptWithUser = `[User: ${interaction.user.displayName || interaction.user.username}]: ${question}`;
      const response = await askNvidia(promptWithUser, personality, historyMessages);

      // Save user prompt & AI response to memory
      if (guildId) {
        try {
          await prisma.aiChatMessage.createMany({
            data: [
              {
                guildId,
                userId: interaction.user.id,
                username: interaction.user.username,
                role: "user",
                content: question
              },
              {
                guildId,
                userId: interaction.user.id,
                username: interaction.user.username,
                role: "assistant",
                content: response
              }
            ]
          });
        } catch (e) {
          // Ignore DB save error
        }
      }

      let replyText = `> **${question}**\n\n${response}`;
      if (replyText.length > 2000) {
        replyText = replyText.substring(0, 1997) + "...";
      }
      await interaction.editReply({ content: replyText, embeds: [] });
    } catch (error) {
      await interaction.editReply({
        content: "❌ Gagal mendapatkan respon dari AI.",
        embeds: []
      });
    }
  }
};

export default command;
