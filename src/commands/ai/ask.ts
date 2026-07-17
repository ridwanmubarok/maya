import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { askNvidia } from "../../services/aiClient";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Tanya apa saja kepada NVIDIA AI")
    .addStringOption(opt =>
      opt
        .setName("pertanyaan")
        .setDescription("Pertanyaan yang ingin diajukan")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("pertanyaan", true);
    const guildId = interaction.guildId;

    // Defer reply because AI takes some time to generate response
    await interaction.deferReply();

    try {
      let personality: string | undefined;
      if (guildId) {
        const config = await prisma.guildConfig.findUnique({
          where: { guildId }
        });
        if (config?.aiPersonality) {
          personality = config.aiPersonality;
        }
      }

      const response = await askNvidia(question, personality);
      const embed = createEmbed.ai(question, response);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        embeds: [createEmbed.error("Gagal Memproses", "Gagal mendapatkan respon dari AI.")]
      });
    }
  }
};

export default command;
