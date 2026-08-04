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

    // Embed Katalog Visual Bergambar Premium
    const embed = new EmbedBuilder()
      .setTitle(`🛒 Toko Server & Penukaran Hadiah • ${interaction.guild?.name || "Server"}`)
      .setDescription(
        `Kumpulkan **Rogatekno Koin (RTK)** dari Tebak-Tebakan & Nongkrong di Voice Channel, lalu tukarkan dengan hadiah favoritmu di bawah ini! ✨\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        items.map((item, idx) => {
          const catEmoji = item.category === "ROLE" ? "👑" : item.category === "VOUCHER" ? "🍔" : "🎮";
          return (
            `${catEmoji} **${idx + 1}. ${item.title}**\n` +
            `> 💰 Harga: **${item.priceRtk.toLocaleString("id-ID")} RTK**\n` +
            `> 📝 *${item.description || "Tidak ada deskripsi."}*\n`
          );
        }).join("\n") +
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👇 *Pilih item yang ingin kamu beli melalui menu dropdown di bawah ini:*`
      )
      .setColor("#F59E0B")
      .setThumbnail(interaction.guild?.iconURL() || interaction.client.user?.displayAvatarURL() || null)
      .setFooter({ text: "Rogatekno Economy & Shop Engine • Transaksi aman & terverifikasi" })
      .setTimestamp();

    // Set banner image jika ada produk yang memiliki imageUrl
    const featuredItem = items.find(i => i.imageUrl && i.imageUrl.trim().startsWith("http"));
    if (featuredItem && featuredItem.imageUrl) {
      embed.setImage(featuredItem.imageUrl);
    }

    // Dropdown Select Menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_select_item")
      .setPlaceholder("🛒 Pilih Produk yang Ingin Dibeli...");

    items.slice(0, 25).forEach(item => {
      const emoji = item.category === "ROLE" ? "👑" : item.category === "VOUCHER" ? "🍔" : "🎮";
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${item.title.substring(0, 50)}`)
          .setValue(`${item.id}`)
          .setDescription(`Harga: ${item.priceRtk.toLocaleString("id-ID")} RTK`)
          .setEmoji(emoji)
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
