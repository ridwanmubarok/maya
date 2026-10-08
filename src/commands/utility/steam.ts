import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../../types";
import { fetchSteamDeals, createSteamDealsEmbed } from "../../services/steamService";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("steam")
    .setDescription("Cari diskon game Steam, game murah, dan cek riwayat harga via SteamDB")
    .addStringOption((opt) =>
      opt
        .setName("cari")
        .setDescription("Judul game yang ingin dicari di Steam (contoh: Elden Ring, Cyberpunk)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("genre")
        .setDescription("Filter genre game")
        .setRequired(false)
        .addChoices(
          { name: "Co-op / Mabar", value: "co-op" },
          { name: "Horror", value: "horror" },
          { name: "RPG / JRPG", value: "rpg" },
          { name: "Action", value: "action" },
          { name: "Survival", value: "survival" },
          { name: "Santai / Casual", value: "casual" },
          { name: "FPS / Shooter", value: "fps" },
          { name: "Strategi", value: "strategy" },
          { name: "Anime", value: "anime" }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("budget")
        .setDescription("Filter batas harga maksimal (IDR)")
        .setRequired(false)
        .addChoices(
          { name: "Gratis (Free to Play)", value: 0 },
          { name: "Dibawah Rp 50.000", value: 50000 },
          { name: "Dibawah Rp 100.000", value: 100000 },
          { name: "Dibawah Rp 200.000", value: 200000 }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("jumlah")
        .setDescription("Jumlah game yang ditampilkan (default: 4, maksimal: 6)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(6)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const query = interaction.options.getString("cari") || undefined;
    const genre = interaction.options.getString("genre") || undefined;
    const maxPrice = interaction.options.getInteger("budget") ?? undefined;
    const limit = interaction.options.getInteger("jumlah") || 4;

    await interaction.deferReply();

    try {
      const deals = await fetchSteamDeals({
        query,
        genre,
        maxPrice,
        limit,
      });

      if (!deals || deals.length === 0) {
        const notFoundEmbed = createEmbed.error(
          "Game Tidak Ditemukan",
          `Tidak ditemukan game Steam yang sesuai dengan kriteria:\n` +
          `${query ? `• Judul: "${query}"\n` : ""}` +
          `${genre ? `• Genre: ${genre}\n` : ""}` +
          `${maxPrice !== undefined ? `• Budget Maksimal: Rp ${maxPrice.toLocaleString("id-ID")}\n` : ""}\n` +
          `Tips: Coba ganti kata kunci judul atau perlonggar filter budget.`
        );

        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }

      const { embed, components } = createSteamDealsEmbed(
        deals,
        { query, genre, maxPrice },
        interaction.client.user?.displayAvatarURL()
      );

      await interaction.editReply({
        embeds: [embed],
        components,
      });
    } catch (err: any) {
      const errEmbed = createEmbed.error(
        "Gagal Memuat Data Steam",
        `Terjadi kendala saat menghubungi server Steam & SteamDB: ${err.message || "Unknown error"}`
      );
      await interaction.editReply({ embeds: [errEmbed] });
    }
  },
};

export default command;
