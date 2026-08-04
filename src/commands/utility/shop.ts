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

    // Embed Katalog Minimalis & Elegan
    const embed = new EmbedBuilder()
      .setTitle(`Toko Server & Penukaran Hadiah`)
      .setDescription(
        `Penukaran item menggunakan **Rogatekno Koin (RTK)**.\n\n` +
        `**Katalog Produk:**\n` +
        items.map((item, idx) => 
          `**${idx + 1}. ${item.title}** — **${item.priceRtk.toLocaleString("id-ID")} RTK**\n` +
          `${item.description ? `${item.description}\n` : ""}`
        ).join("\n") +
        `\nPilih produk dari menu di bawah untuk melakukan penukaran.`
      )
      .setColor("#3B82F6")
      .setFooter({ text: `${interaction.guild?.name || "Server"} • Economy Shop` })
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
