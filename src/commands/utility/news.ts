import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { fetchIndonesianNews } from "../../services/newsScraper";

const CATEGORY_NAMES: Record<string, string> = {
  semua: "Semua Kategori (Terkini)",
  politik: "Politik & Pemerintahan",
  nasional: "Berita Nasional & General",
  ekonomi: "Ekonomi & Bisnis"
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("news")
    .setDescription("Tampilkan rangkuman berita terkini Indonesia seputar Politik, Nasional, dan Peristiwa")
    .addStringOption((opt) =>
      opt
        .setName("kategori")
        .setDescription("Pilih kategori berita")
        .setRequired(false)
        .addChoices(
          { name: "Semua Kategori (Terkini)", value: "semua" },
          { name: "Politik & Pemerintahan", value: "politik" },
          { name: "Berita Nasional & General", value: "nasional" },
          { name: "Ekonomi & Bisnis", value: "ekonomi" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const rawCategory = interaction.options.getString("kategori") || "semua";
    const categoryLabel = CATEGORY_NAMES[rawCategory] || "Berita Terkini";

    try {
      const newsItems = await fetchIndonesianNews(rawCategory);

      if (!newsItems || newsItems.length === 0) {
        await interaction.editReply({
          content: `Tidak ditemukan berita terkini untuk kategori **${categoryLabel}**. Silakan coba kategori lain.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Kilas Berita Terkini Indonesia • ${categoryLabel}`)
        .setDescription(`Berikut rangkuman informasi dan topik berita hangat hari ini dari media nasional terverifikasi:`)
        .setColor("#0284C7")
        .setFooter({
          text: `Maya News Digest • Sumber: CNN Indonesia, Antara News, Detik, Tempo`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      newsItems.forEach((item, index) => {
        const num = index + 1;

        embed.addFields({
          name: `${num}. ${item.title}`,
          value:
            `> *${item.summary}*\n` +
            `**Sumber**: ${item.source} • **Waktu**: ${item.publishedAt}`,
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
        content: "Terjadi kendala saat mengambil data berita. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
