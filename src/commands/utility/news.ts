import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { fetchTechNews } from "../../services/newsScraper";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("news")
    .setDescription("Tampilkan ringkasan berita terkini seputar Teknologi, AI, Startup, dan Gadget")
    .addStringOption((opt) =>
      opt
        .setName("kategori")
        .setDescription("Kategori berita (Opsional)")
        .setRequired(false)
        .addChoices(
          { name: "Semua Kategori", value: "Semua" },
          { name: "Teknologi & AI", value: "Teknologi" },
          { name: "Startup & Bisnis IT", value: "Startup" },
          { name: "Gadget & Hardware", value: "Gadget" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const kategori = interaction.options.getString("kategori") || "Semua Kategori";

    try {
      const newsItems = await fetchTechNews(kategori);

      if (!newsItems || newsItems.length === 0) {
        await interaction.editReply({
          content: `Tidak ditemukan berita terkini untuk kategori **${kategori}**. Silakan coba kategori lain.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Ringkasan Berita Teknologi & AI")
        .setDescription(`Berikut artikel dan ulasan berita teknologi terbaru (Kategori: **${kategori}**).`)
        .setColor("#2563EB") // Corporate Professional Blue
        .setFooter({
          text: `Maya News Digest • Total ${newsItems.length} artikel berita`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      newsItems.forEach((item, index) => {
        const num = index + 1;

        embed.addFields({
          name: `${num}. ${item.title}`,
          value:
            `**Ringkasan**: ${item.summary}\n` +
            `**Kategori**: ${item.category} | **Sumber**: ${item.source}`,
          inline: false,
        });

        if (buttons.length < 5) {
          const srcName = item.source.length > 18 ? `${item.source.substring(0, 15)}...` : item.source;
          buttons.push(
            new ButtonBuilder()
              .setLabel(`Baca #${num} (${srcName})`)
              .setStyle(ButtonStyle.Link)
              .setURL(item.url)
          );
        }
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (error) {
      console.error("Error in /news command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat mengambil data berita. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
