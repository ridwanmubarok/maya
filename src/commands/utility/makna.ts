import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types";
import { analyzeSongMeaning } from "../../services/songMeaningService";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("makna")
    .setDescription("Bedah makna mendalam, kisah latar belakang, dan pesan tersembunyi dari lagu")
    .addStringOption((opt) =>
      opt
        .setName("judul")
        .setDescription("Judul lagu atau kata kunci (misal: Hati-Hati di Jalan, Bohemian Rhapsody)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("artis")
        .setDescription("Nama penyanyi atau band (Opsional, misal: Tulus, Queen)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const judul = interaction.options.getString("judul", true);
    const artis = interaction.options.getString("artis") || undefined;

    try {
      const result = await analyzeSongMeaning(judul, artis);

      const embed = new EmbedBuilder()
        .setTitle(`Bedah & Makna Lagu: ${result.title} — ${result.artist}`)
        .setDescription(`Berikut hasil analisis dan bedah makna mendalam untuk lagu **${result.title}** oleh **${result.artist}**.`)
        .setColor("#9333EA") // Purple Indigo
        .addFields(
          {
            name: "Pesan Utama & Tema Inti",
            value: result.coreMessage,
            inline: false,
          },
          {
            name: "Kisah di Balik Pembuatan Lagu",
            value: result.storyBehind,
            inline: false,
          },
          {
            name: "Bedah Makna Lirik Pilihan",
            value: result.stanzaAnalysis,
            inline: false,
          },
          {
            name: "Nuansa Emosional & Refleksi",
            value: result.emotionalVibe,
            inline: false,
          }
        )
        .setFooter({
          text: `Maya Music Directory • AI Song Interpretation Engine`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /makna command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat memproses bedah makna lagu. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
