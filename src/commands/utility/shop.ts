import { 
  ActionRowBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  MessageFlags, 
  SlashCommandBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder 
} from "discord.js";
import { Command } from "../../types";
import { getGuildShopItems } from "../../services/shopService";
import { prisma } from "../../services/database";
import { getWibDateInfo } from "../../services/monthlySeasonManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Buka Toko Server & Katalog Penukaran Rogatekno Koin (RTK) Bergambar"),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Perintah ini hanya dapat dijalankan di dalam server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply();

    const items = await getGuildShopItems(guildId);

    if (!items || items.length === 0) {
      await interaction.editReply({
        content: "Toko server saat ini sedang kosong. Silakan cek kembali nanti!"
      });
      return;
    }

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const dateInfo = getWibDateInfo();
    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}
    const quotaMax = config?.monthlyRedeemQuota || 2;
    const remainingSlots = Math.max(0, quotaMax - currentRedeemed.length);

    let statusText = "";
    if (dateInfo.isRedeemPeriod) {
      statusText = `🟢 **PERIODE REDEEM RESMI DIBUKA (TGL 3–5)**\n` +
        `🎟️ **Kuota Pemenang**: **${currentRedeemed.length}/${quotaMax} Pemenang** (Sisa **${remainingSlots} Slot**!)\n` +
        `⏳ **Batas Akhir Penukaran**: **5 ${dateInfo.monthName} pukul 23:59 WIB**\n` +
        `⚠️ *Poin akan hangus & direset ke 0 tepat tgl 5 jam 23:59 WIB jika tidak ditukarkan!*`;
    } else if (dateInfo.day < 3) {
      statusText = `⏳ **PERIODE REDEEM BELUM DIBUKA**\n` +
        `Penukaran hadiah di /shop baru dibuka pada **Tanggal 3 s.d. 5 ${dateInfo.monthName}** untuk 2 Golden Candidates terpilih.\n` +
        `Kumpulkan poinmu sebanyak-banyaknya sekarang!`;
    } else {
      statusText = `🔒 **PERIODE REDEEM BULAN INI TELAH DITUTUP**\n` +
        `Penukaran hadiah telah berakhir pada tanggal 5 pukul 23:59 WIB. Periode penukaran berikutnya dibuka tanggal 3 bulan depan!`;
    }

    // Embed Katalog Minimalis & Elegan
    const embed = new EmbedBuilder()
      .setTitle(`🛒 Toko Server & Penukaran Hadiah • Season ${dateInfo.monthName}`)
      .setDescription(
        `Penukaran hadiah menggunakan **Rogatekno Koin (RTK)**.\n\n` +
        `${statusText}\n\n` +
        `**Katalog Produk:**\n` +
        items.map((item, idx) => 
          `**${idx + 1}. ${item.title}** — **${item.priceRtk.toLocaleString("id-ID")} RTK**\n` +
          `${item.description ? `${item.description}\n` : ""}`
        ).join("\n") +
        `\nPilih produk dari menu di bawah untuk melakukan penukaran.`
      )
      .setColor(dateInfo.isRedeemPeriod ? "#10B981" : "#3B82F6")
      .setFooter({ text: `${interaction.guild?.name || "Server"} • Economy Shop • Maks 2 Pemenang (Tgl 3-5)` })
      .setTimestamp();

    // Set banner image jika ada produk yang memiliki imageUrl
    const featuredItem = items.find(i => i.imageUrl && i.imageUrl.trim().startsWith("http"));
    if (featuredItem && featuredItem.imageUrl) {
      embed.setImage(featuredItem.imageUrl);
    }

    // Dropdown Select Menu Clean
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_select_item")
      .setPlaceholder("Pilih produk yang ingin ditukarkan...");

    items.slice(0, 25).forEach(item => {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${item.title.substring(0, 50)}`)
          .setValue(`${item.id}`)
          .setDescription(`Harga: ${item.priceRtk.toLocaleString("id-ID")} RTK`)
      );
    });

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};

export default command;
