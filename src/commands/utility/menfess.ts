import { 
  ActionRowBuilder, 
  ChatInputCommandInteraction, 
  MessageFlags, 
  ModalBuilder, 
  SlashCommandBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from "discord.js";
import { Command } from "../../types";
import { submitMenfess } from "../../services/menfessService";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("menfess")
    .setDescription("Kirim pesan atau curhatan anonim ke channel Menfess (Disaring AI)")
    .addStringOption((option) =>
      option
        .setName("pesan")
        .setDescription("Isi pesan/curhatan anonim kamu (Jika dikosongkan, pop-up form akan muncul)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("reply_to")
        .setDescription("Kode Menfess yang ingin dibalas (contoh: MNF-4829)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: "Perintah ini hanya dapat dijalankan di dalam server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const pesan = interaction.options.getString("pesan");
    const replyTo = interaction.options.getString("reply_to")?.trim().toUpperCase();

    // Jika pesan tidak diisi, tampilkan Modal pop-up window
    if (!pesan) {
      const modal = new ModalBuilder()
        .setCustomId(`modal_menfess:${replyTo || "none"}`)
        .setTitle("🕊️ Kirim Menfess Anonim");

      const contentInput = new TextInputBuilder()
        .setCustomId("input_menfess_content")
        .setLabel("Isi Pesan Anonim / Curhat")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Tuliskan curhatan, salam, atau apresiasi anonim kamu di sini...")
        .setMinLength(5)
        .setMaxLength(1000)
        .setRequired(true);

      const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);

      // Jika ada replyTo, tambahkan input tambahan penjelas
      if (replyTo) {
        const replyInput = new TextInputBuilder()
          .setCustomId("input_menfess_reply_to")
          .setLabel("Membalas Kode Menfess")
          .setStyle(TextInputStyle.Short)
          .setValue(replyTo)
          .setRequired(false);
        const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(replyInput);
        modal.addComponents(firstRow, secondRow);
      } else {
        modal.addComponents(firstRow);
      }

      await interaction.showModal(modal);
      return;
    }

    // Jika pesan diisi langsung di opsi slash command
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await submitMenfess(
      interaction.client,
      guildId,
      interaction.user.id,
      pesan,
      replyTo
    );

    if (!result.success) {
      const errEmbed = createEmbed.error("Menfess Gagal Diposting", result.reason || "Pesan tidak dapat diposting.");
      await interaction.editReply({ embeds: [errEmbed] });
      return;
    }

    const successEmbed = createEmbed.success(
      "🕊️ Menfess Berhasil Diposting!",
      `Pesan anonim kamu telah lolos sensor AI dan berhasil diposting ke <#${result.channelId}> dengan kode **#${result.code}**.`
    );

    await interaction.editReply({ embeds: [successEmbed] });
  }
};

export default command;
