import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { searchScholarships } from "../../services/eduScraper";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("beasiswa")
    .setDescription("Cari informasi program beasiswa resmi (LPDP, IDCamp, Kominfo DTS, Kampus Merdeka)")
    .addStringOption((opt) =>
      opt
        .setName("jenjang")
        .setDescription("Tingkat pendidikan (Opsional)")
        .setRequired(false)
        .addChoices(
          { name: "Semua Jenjang", value: "Semua" },
          { name: "SMA / SMK / sederajat", value: "SMA/SMK" },
          { name: "D3 / S1 / Sarjana", value: "D3/S1" },
          { name: "S2 / S3 / Pascasarjana", value: "S2/S3" },
          { name: "Bootcamp / Non-Gelar", value: "Bootcamp" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("kategori")
        .setDescription("Kategori beasiswa (e.g. Teknologi/IT, Umum, Luar Negeri)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const jenjang = interaction.options.getString("jenjang") || "Semua";
    const kategori = interaction.options.getString("kategori") || "Semua Kategori";

    try {
      const items = await searchScholarships(jenjang, kategori);

      if (!items || items.length === 0) {
        await interaction.editReply({
          content: `❌ Tidak ditemukan informasi beasiswa untuk jenjang **${jenjang}** & kategori **${kategori}**. Silakan coba kombinasi lain.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎓 Informasi Beasiswa Terbaru`)
        .setDescription(
          `Berikut daftar rekomendasi program beasiswa resmi yang sedang aktif (Jenjang: **${jenjang}** | Kategori: **${kategori}**):\n\n` +
          `Klik tombol di bawah pesan ini untuk melihat rincian persyaratan & mendaftar di situs resminya!`
        )
        .setColor("#00CC99")
        .setThumbnail("https://cdn-icons-png.flaticon.com/512/2997/2997295.png")
        .setFooter({
          text: `Maya Edu Finder • Ditemukan ${items.length} program beasiswa`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const buttons: ButtonBuilder[] = [];

      items.forEach((item, index) => {
        const num = index + 1;

        embed.addFields({
          name: `${num}. ${item.title}`,
          value:
            `🏛️ **Penyelenggara**: ${item.organizer}\n` +
            `🎓 **Jenjang**: ${item.level} | 💰 **Cakupan**: ${item.coverage}\n` +
            `📅 **Status/Deadline**: ${item.deadline} | 🌐 **Sumber**: ${item.source}\n`,
          inline: false,
        });

        if (buttons.length < 5) {
          const label = `🎓 Daftar #${num} (${item.source.substring(0, 15)})`;
          buttons.push(
            new ButtonBuilder()
              .setLabel(label)
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
      console.error("Error in /beasiswa command:", error);
      await interaction.editReply({
        content: "❌ Terjadi kesalahan saat mengambil info beasiswa. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

export default command;
