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
        .setDescription("Posisi atau bidang pekerjaan (e.g. Frontend Developer, Designer, Admin, Finance)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("lokasi")
        .setDescription("Lokasi pekerjaan (e.g. Jakarta, Bandung, Remote, Surabaya, Indonesia)")
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
          content: `❌ Tidak ditemukan lowongan kerja untuk posisi **${posisi}** di lokasi **${lokasi}**. Coba kata kunci posisi yang lebih umum.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`💼 Lowongan Kerja: ${posisi}`)
        .setDescription(
          `Hasil pencarian lowongan pekerjaan terbaru untuk bidang **${posisi}** (Lokasi: **${lokasi}**):\n\n` +
          `Klik tombol di bawah pesan ini untuk langsung membuka dan melamar pekerjaan di situs resminya!`
        )
        .setColor("#0066FF")
        .setThumbnail("https://cdn-icons-png.flaticon.com/512/3858/3858596.png")
        .setFooter({
          text: `Maya Job Finder • Ditemukan ${jobs.length} lowongan`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      jobs.forEach((job, index) => {
        const itemNumber = index + 1;

        embed.addFields({
          name: `${itemNumber}. ${job.title} — ${job.company}`,
          value:
            `📍 **Lokasi**: ${job.location}\n` +
            `💼 **Tipe**: ${job.type} | 💰 **Gaji**: ${job.salary}\n` +
            `🌐 **Sumber**: ${job.source}\n`,
          inline: false,
        });

        // Add Direct Apply Link Button for each job (Max 5 buttons in an ActionRow)
        if (buttons.length < 5) {
          const buttonLabel = `💼 Lamar #${itemNumber} (${job.company.substring(0, 15)})`;
          buttons.push(
            new ButtonBuilder()
              .setLabel(buttonLabel)
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
      console.error("Error fetching jobs in /loker command:", error);
      await interaction.editReply({
        content: "❌ Terjadi kesalahan saat mencari data lowongan kerja. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
