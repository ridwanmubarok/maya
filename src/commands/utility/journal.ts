import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from "discord.js";
import { Command } from "../../types";
import { academicSearchService, AcademicPaper } from "../../services/academicSearchService";
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

      // Format year range header string
      let yearBadge = "Semua Tahun (All-Time)";
      if (searchFromYear && searchToYear) {
        yearBadge = searchFromYear === searchToYear ? `Tahun ${searchFromYear}` : `Rentang Tahun: ${searchFromYear} – ${searchToYear}`;
      } else if (searchFromYear) {
        yearBadge = `Tahun >= ${searchFromYear}`;
      } else if (searchToYear) {
        yearBadge = `Tahun <= ${searchToYear}`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3B82F6) // Scholar Blue
        .setTitle(`📚 Hasil Pencarian Jurnal & Paper Ilmiah`)
        .setDescription(`🔍 **Topik:** "${topic}"\n📅 **Filter:** ${yearBadge}\n📊 **Ditemukan:** ${papers.length} artikel ilmiah terverifikasi\n───────────────────────────────`)
        .setFooter({
          text: `Maya Academic Research Engine • OpenAlex & Crossref Verified`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      const components: ActionRowBuilder<ButtonBuilder>[] = [];
      const primaryButtons: ButtonBuilder[] = [];

      papers.forEach((paper, idx) => {
        const num = idx + 1;
        const authorList = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
        const yearStr = paper.year ? `(${paper.year})` : "(Tahun n/a)";
        const citationBadge = paper.citationCount > 0 ? ` • 🌟 **${paper.citationCount}** Sitasi` : "";
        const oaBadge = paper.isOpenAccess ? " • 🔓 **Open Access**" : "";

        let fieldContent = `👤 *${authorList}* ${yearStr}\n🏛️ *${paper.journalOrVenue}*${citationBadge}${oaBadge}\n`;

        if (paper.abstractSnippet) {
          fieldContent += `📝 *${paper.abstractSnippet}*\n`;
        }

        const linkParts: string[] = [];
        if (paper.doi) {
          linkParts.push(`[🌐 DOI / Publikasi](${paper.doi})`);
        } else if (paper.url) {
          linkParts.push(`[🌐 Baca Artikel](${paper.url})`);
        }

        if (paper.pdfUrl) {
          linkParts.push(`[📥 Download PDF](${paper.pdfUrl})`);
        }

        fieldContent += `🔗 ${linkParts.join("  |  ")}`;

        embed.addFields({
          name: `${num}. ${paper.title.substring(0, 200)}`,
          value: fieldContent,
          inline: false,
        });

        // Add direct button for the top 2 papers if DOI or PDF exists
        if (idx < 2 && (paper.doi || paper.pdfUrl || paper.url)) {
          const btnUrl = paper.pdfUrl || paper.doi || paper.url;
          if (btnUrl && btnUrl.startsWith("http")) {
            primaryButtons.push(
              new ButtonBuilder()
                .setLabel(`Paper #${num} ${paper.pdfUrl ? "(PDF)" : "(Baca)"}`)
                .setStyle(ButtonStyle.Link)
                .setURL(btnUrl)
            );
          }
        }
      });

      if (primaryButtons.length > 0) {
        components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(primaryButtons));
      }

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
