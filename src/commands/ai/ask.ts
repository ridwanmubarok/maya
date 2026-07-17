import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { askGemini } from "../../services/aiClient";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Tanya apa saja kepada Gemini AI")
    .addStringOption(opt =>
      opt
        .setName("pertanyaan")
        .setDescription("Pertanyaan yang ingin diajukan")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("pertanyaan", true);

    // Defer reply because AI takes some time to generate response
    await interaction.deferReply();

    try {
      const response = await askGemini(question);
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
