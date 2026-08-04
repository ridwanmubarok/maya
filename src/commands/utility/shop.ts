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

    // Embed Katalog Visual Bergambar
    const embed = new EmbedBuilder()
      .setTitle(`🛒 Toko Server & Katalog Hadiah RTK • ${interaction.guild?.name || "Server"}`)
      .setDescription(
        `Selamat datang di Toko Server! Gunakan **Rogatekno Koin (RTK)** yang kamu kumpulkan dari game & voice channel untuk menukarkan item menarik di bawah ini.\n\n` +
        `**📋 Daftar Produk Aktif Saat Ini:**\n\n` +
        items.map((item, idx) => 
          `**${idx + 1}. ${item.title}**\n` +
          `> 💰 Harga: **${item.priceRtk} RTK**\n` +
          `> 📝 *${item.description}*\n`
        ).join("\n") +
        `\n👇 *Pilih produk yang ingin kamu beli dari menu dropdown di bawah ini:*`
      )
      .setColor("#F59E0B")
      .setFooter({ text: "Rogatekno Shop Engine • Pilih item dari dropdown untuk membeli" })
      .setTimestamp();

    // Set banner image jika produk pertama memiliki imageUrl
    const featuredItem = items.find(i => i.imageUrl && i.imageUrl.trim().startsWith("http"));
    if (featuredItem && featuredItem.imageUrl) {
      embed.setImage(featuredItem.imageUrl);
    }

    // Dropdown Select Menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_select_item")
      .setPlaceholder("🛒 Pilih Produk yang Ingin Dibeli...");

    items.slice(0, 25).forEach(item => {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${item.title.substring(0, 50)}`)
          .setValue(`${item.id}`)
          .setDescription(`Harga: ${item.priceRtk} RTK`)
          .setEmoji(item.category === "ROLE" ? "👑" : item.category === "VOUCHER" ? "🍔" : "💎")
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
