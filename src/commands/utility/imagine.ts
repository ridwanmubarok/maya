import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { generateFreeImage } from "../../services/imageGenService";

export const imaginePromptCache = new Map<string, { prompt: string; style: string }>();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("imagine")
    .setDescription("Hasilkan gambar AI HD 1024x1024 dari deskripsi teks (FLUX.1 Engine)")
    .addStringOption((opt) =>
      opt
        .setName("prompt")
        .setDescription("Deskripsi gambar yang ingin dibuat (misal: kucing kacamata di atap kota Tokyo)")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("gaya")
        .setDescription("Pilih gaya visual gambar (Opsional)")
        .setRequired(false)
        .addChoices(
          { name: "Anime / Manga Style", value: "Anime" },
          { name: "Photorealistic 8K", value: "Photorealistic" },
          { name: "Cyberpunk & Neon", value: "Cyberpunk" },
          { name: "3D Pixar Animation", value: "3D Pixar" },
          { name: "Fantasy Oil Painting", value: "Fantasy" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const userPrompt = interaction.options.getString("prompt", true);
    const style = interaction.options.getString("gaya") || "Anime";

    const result = await generateFreeImage(userPrompt, style);

    if (!result) {
      await interaction.editReply({
        content: "Gagal merender gambar AI. Silakan periksa koneksi dan coba lagi.",
      });
      return;
    }

    // Cache prompt data for button interactions
    const cacheKey = `img_${Date.now()}`;
    imaginePromptCache.set(cacheKey, { prompt: userPrompt, style });

    const embed = new EmbedBuilder()
      .setTitle(`Maya Image Generator • ${style}`)
      .setColor("#3B82F6")
      .setDescription(
        `**Prompt**:\n> ${userPrompt}\n\n` +
        `**AI Enhanced Prompt**:\n\`\`\`\n${result.enhancedPrompt}\n\`\`\``
      )
      .setImage(result.imageUrl)
      .setFooter({ text: `Engine: FLUX.1 HD • Seed: ${result.seed}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`imagine_regen:${cacheKey}`)
        .setLabel("🔄 Buat Ulang")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setURL(result.imageUrl)
        .setLabel("🔍 Buka Gambar HD (Full Res)")
        .setStyle(ButtonStyle.Link)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

export default command;
