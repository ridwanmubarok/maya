import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { searchFreeCourses } from "../../services/eduScraper";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("kursus")
    .setDescription("Cari kursus online & pelatihan bersertifikat gratis (Google, AWS, Dicoding, Coursera)")
    .addStringOption((opt) =>
      opt
        .setName("topik")
        .setDescription("Topik/materi yang ingin dipelajari (misal: Web Dev, Python, AI, Data Science)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("platform")
        .setDescription("Platform penyedia kursus (Opsional)")
        .setRequired(false)
        .addChoices(
          { name: "Semua Platform", value: "Semua" },
          { name: "Google Skillshop", value: "Google" },
          { name: "AWS Educate", value: "AWS" },
          { name: "Dicoding Indonesia", value: "Dicoding" },
          { name: "Coursera Free", value: "Coursera" },
          { name: "Microsoft Learn", value: "Microsoft" },
          { name: "Cisco Networking Academy", value: "Cisco" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const topik = interaction.options.getString("topik") || "Semua Topik";
    const platform = interaction.options.getString("platform") || "Semua";

    try {
      const items = await searchFreeCourses(topik, platform);

      if (!items || items.length === 0) {
        await interaction.editReply({
          content: `Tidak ditemukan kursus gratis untuk topik **${topik}** & platform **${platform}**. Silakan coba topik lain.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Katalog Pelatihan & Kursus Bersertifikat`)
        .setDescription(`Daftar program sertifikasi dan pelatihan online gratis (Topik: **${topik}** | Platform: **${platform}**).`)
        .setColor("#4F46E5") // Enterprise Indigo / Tech Blue
        .setFooter({
          text: `Maya Training Catalog • Total ${items.length} program ditemukan`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      items.forEach((item, index) => {
        const num = index + 1;

        embed.addFields({
          name: `${num}. ${item.title}`,
          value:
            `**Penyedia**: ${item.provider}\n` +
            `**Topik**: ${item.topic} | **Sertifikasi**: ${item.certificate}\n` +
            `**Est. Durasi**: ${item.duration}\n` +
            `**Portal Resmi**: ${item.source}`,
          inline: false,
        });

        if (buttons.length < 5) {
          const provName = item.provider.length > 18 ? `${item.provider.substring(0, 15)}...` : item.provider;
          buttons.push(
            new ButtonBuilder()
              .setLabel(`Mulai #${num} (${provName})`)
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
      console.error("Error in /kursus command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat memproses katalog kursus. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
