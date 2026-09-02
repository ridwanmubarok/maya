import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from "discord.js";
import { Command } from "../../types";
import { academicSearchService, AcademicPaper, createJournalEmbed } from "../../services/academicSearchService";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("journal")
    .setDescription("Cari jurnal ilmiah, research paper, dan artikel akademis lengkap dengan link & filter tahun")
    .addStringOption((opt) =>
      opt
        .setName("topik")
        .setDescription("Topik, kata kunci riset, atau judul jurnal yang ingin dicari")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("dari_tahun")
        .setDescription("Tahun rilis paling awal (opsional, contoh: 2020)")
        .setRequired(false)
        .setMinValue(1900)
        .setMaxValue(new Date().getFullYear())
    )
    .addIntegerOption((opt) =>
      opt
        .setName("sampai_tahun")
        .setDescription("Tahun rilis paling akhir (opsional, contoh: 2025)")
        .setRequired(false)
        .setMinValue(1900)
        .setMaxValue(new Date().getFullYear() + 1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("jumlah")
        .setDescription("Jumlah hasil jurnal yang ditampilkan (default: 5, maksimal: 10)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const topic = interaction.options.getString("topik", true);
    const fromYear = interaction.options.getInteger("dari_tahun") || undefined;
    const toYear = interaction.options.getInteger("sampai_tahun") || undefined;
    const limit = interaction.options.getInteger("jumlah") || 5;

    await interaction.deferReply();

    try {
      // Validate year range logic if both supplied
      let searchFromYear = fromYear;
      let searchToYear = toYear;
      if (fromYear && toYear && fromYear > toYear) {
        searchFromYear = toYear;
        searchToYear = fromYear;
      }

      const papers = await academicSearchService.search(topic, {
        fromYear: searchFromYear,
        toYear: searchToYear,
        limit,
      });

      if (papers.length === 0) {
        let notFoundMsg = `Tidak ditemukan jurnal atau paper ilmiah untuk topik **"${topic}"**.`;
        if (searchFromYear || searchToYear) {
          const yearFilterStr = searchFromYear && searchToYear
            ? `${searchFromYear} – ${searchToYear}`
            : searchFromYear
            ? `>= ${searchFromYear}`
            : `<= ${searchToYear}`;
          notFoundMsg += `\n*Filter Tahun: ${yearFilterStr}*`;
        }
        notFoundMsg += "\n\n💡 *Tips: Coba gunakan kata kunci bahasa Inggris yang lebih umum atau perlebar rentang tahun pencarian.*";

        const notFoundEmbed = createEmbed.error("Jurnal Tidak Ditemukan", notFoundMsg);
        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }

      const { embed, components } = createJournalEmbed(
        papers,
        topic,
        { fromYear: searchFromYear, toYear: searchToYear, limit },
        interaction.client.user?.displayAvatarURL()
      );

      await interaction.editReply({
        embeds: [embed],
        components,
      });
    } catch (err: any) {
      const errorEmbed = createEmbed.error(
        "Gagal Mencari Jurnal",
        `Terjadi kesalahan saat memproses pencarian jurnal ilmiah: ${err.message || "Error tidak diketahui"}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

export default command;
