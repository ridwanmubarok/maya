import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { searchJobs } from "../../services/jobScraper";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("loker")
    .setDescription("Cari lowongan kerja terbaru berdasarkan bidang/posisi dan lokasi")
    .addStringOption((opt) =>
      opt
        .setName("posisi")
        .setDescription("Posisi atau bidang pekerjaan (misal: Frontend Developer, Designer, Admin)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("lokasi")
        .setDescription("Lokasi pekerjaan (misal: Jakarta, Bandung, Remote)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const posisi = interaction.options.getString("posisi", true);
    const lokasi = interaction.options.getString("lokasi") || "Semua Lokasi / Remote";

    try {
      const jobs = await searchJobs(posisi, lokasi);

      if (!jobs || jobs.length === 0) {
        await interaction.editReply({
          content: `Tidak ditemukan lowongan kerja untuk posisi **${posisi}** di lokasi **${lokasi}**. Silakan coba kata kunci posisi yang lebih umum.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Peluang Karir: ${posisi}`)
        .setDescription(`Berikut daftar lowongan pekerjaan aktif untuk posisi **${posisi}** (Lokasi: **${lokasi}**).`)
        .setColor("#2563EB") // Corporate Professional Blue
        .setFooter({
          text: `Maya Career Directory • Total ${jobs.length} hasil ditemukan`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      jobs.forEach((job, index) => {
        const itemNumber = index + 1;

        embed.addFields({
          name: `${itemNumber}. ${job.title}`,
          value:
            `**Perusahaan**: ${job.company}\n` +
            `**Lokasi**: ${job.location} | **Tipe**: ${job.type}\n` +
            `**Estimasi Kompensasi**: ${job.salary}\n` +
            `**Portal Resmi**: ${job.source}`,
          inline: false,
        });

        if (buttons.length < 5) {
          const compName = job.company.length > 18 ? `${job.company.substring(0, 15)}...` : job.company;
          buttons.push(
            new ButtonBuilder()
              .setLabel(`Lamar #${itemNumber} (${compName})`)
              .setStyle(ButtonStyle.Link)
              .setURL(job.url)
          );
        }
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (error) {
      console.error("Error in /loker command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat memproses pencarian lowongan kerja. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
