import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { searchLyrics } from "../../services/lyricsService";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lirik")
    .setDescription("Cari & tampilkan 100% lirik lagu Indonesia dan Internasional secara lengkap")
    .addStringOption((opt) =>
      opt
        .setName("judul")
        .setDescription("Judul lagu atau kata kunci (misal: Hati-Hati di Jalan, Steal My Girl)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("artis")
        .setDescription("Nama penyanyi atau band (Opsional, misal: Tulus, One Direction)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const judul = interaction.options.getString("judul", true);
    const artis = interaction.options.getString("artis") || undefined;

    try {
      const result = await searchLyrics(judul, artis);

      if (!result || !result.lyrics) {
        await interaction.editReply({
          content: `Tidak ditemukan lirik lagu untuk **${judul}**${artis ? ` oleh **${artis}**` : ""}. Silakan periksa kembali ejaan judul lagu.`,
        });
        return;
      }

      // Chunk lyrics by stanza/lines so 100% is displayed without truncation
      const rawLyrics = result.lyrics;
      const chunks = chunkText(rawLyrics, 3800);

      const embeds: EmbedBuilder[] = [];

      chunks.forEach((chunkText, index) => {
        const isFirst = index === 0;
        const isLast = index === chunks.length - 1;

        const embed = new EmbedBuilder()
          .setTitle(isFirst ? `Lirik Lagu: ${result.title} — ${result.artist}` : `Lirik Lagu: ${result.title} (Lanjutan ${index + 1}/${chunks.length})`)
          .setDescription(chunkText)
          .setColor("#1DB954"); // Spotify Enterprise Green

        if (isFirst) {
          embed.addFields(
            { name: "Penyanyi", value: result.artist, inline: true },
            { name: "Sumber Database", value: result.source, inline: true }
          );
          if (result.album) {
            embed.addFields({ name: "Album", value: result.album, inline: true });
          }
          if (result.artworkUrl) {
            embed.setThumbnail(result.artworkUrl);
          }
        }

        if (isLast) {
          embed.setFooter({
            text: `Maya Music Directory • 100% Lirik Lengkap Tampil (${chunks.length} bagian)`,
            iconURL: interaction.client.user?.displayAvatarURL(),
          }).setTimestamp();
        }

        embeds.push(embed);
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Buka Sumber Lirik")
          .setStyle(ButtonStyle.Link)
          .setURL(result.url)
      );

      // Discord allows up to 10 embeds per message reply
      await interaction.editReply({
        embeds: embeds.slice(0, 10),
        components: [row],
      });
    } catch (error) {
      console.error("Error in /lirik command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat mencari lirik lagu. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

/**
 * Helper to chunk text safely by line breaks without cutting words
 */
function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    if ((currentChunk + "\n" + line).length > maxLength) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + line;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export default command;
