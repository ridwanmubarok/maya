import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, Interaction, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, GuildMember } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";
import { createEmbed } from "../utils/embeds";
import { handleMabarJoin, handleMabarLeave } from "../services/mabarManager";
import { tebakManager } from "../services/tebakManager";
import { submitMenfess } from "../services/menfessService";
import { trackAnalyticsEvent } from "../services/analyticsTracker";
import { processShopPurchase } from "../services/shopService";
import { translateWithNvidia } from "../services/translationService";
import { translationCache } from "../commands/utility/translateMsg";
import { generateFreeImage } from "../services/imageGenService";
import { imaginePromptCache } from "../commands/utility/imagine";
import { handlePollVoteInteraction } from "../services/dailyPollManager";
import { musicManager, createMusicControlButtons, createNowPlayingEmbed } from "../services/musicManager";
import { todManager } from "../services/todManager";

const event: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    // Handle Button Interactions
    if (interaction.isButton()) {
      const { customId } = interaction;

      if (customId.startsWith("tod_btn:")) {
        const action = customId.split(":")[1];
        const guildId = interaction.guildId;
        const member = interaction.member as GuildMember;

        if (!guildId || !member) {
          await interaction.reply({ content: "Tombol ini hanya dapat digunakan di server!", flags: MessageFlags.Ephemeral });
          return;
        }

        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
          await interaction.reply({ content: "Kamu harus berada di Voice Channel untuk bermain Truth or Dare!", flags: MessageFlags.Ephemeral });
          return;
        }

        const session = todManager.getSession(guildId);
        if (!session) {
          await interaction.reply({ content: "Sesi Truth or Dare telah berakhir atau tidak ditemukan!", flags: MessageFlags.Ephemeral });
          return;
        }

        if (action === "spin") {
          await interaction.deferUpdate();
          const res = await todManager.spinBottle(guildId, interaction.user);
          if (res.success && res.embed) {
            await interaction.editReply({ embeds: [res.embed], components: res.components || [] });
          } else {
            await interaction.followUp({ content: `❌ ${res.message}`, flags: MessageFlags.Ephemeral });
          }
          return;
        }

        if (action === "choice_truth" || action === "choice_dare") {
          const type = action === "choice_truth" ? "truth" : "dare";

          if (session.targetUserId && interaction.user.id !== session.targetUserId) {
            await interaction.reply({
              content: `⚠️ Hanya <@${session.targetUserId}> yang dapat memilih Truth atau Dare di gilirannya!`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferUpdate();
          const res = await todManager.chooseType(guildId, type, interaction.user);
          if (res.success && res.embed) {
            await interaction.editReply({ embeds: [res.embed], components: res.components || [] });
          } else {
            await interaction.followUp({ content: `❌ ${res.message}`, flags: MessageFlags.Ephemeral });
          }
          return;
        }

        if (action === "reroll") {
          if (!session.currentPromptType) {
            await interaction.reply({ content: "Belum ada jenis tantangan yang dipilih!", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferUpdate();
          const res = await todManager.chooseType(guildId, session.currentPromptType, interaction.user);
          if (res.success && res.embed) {
            await interaction.editReply({ embeds: [res.embed], components: res.components || [] });
          }
          return;
        }

        if (action === "done") {
          await interaction.deferUpdate();
          const res = await todManager.completeTurn(guildId, interaction.user);
          if (res.success && res.embed) {
            await interaction.editReply({ embeds: [res.embed], components: res.components || [] });
          }
          return;
        }

        if (action === "end") {
          todManager.endSession(guildId);
          await interaction.update({
            content: `🛑 Permainan Truth or Dare telah diakhiri oleh **${member.displayName || interaction.user.username}**.`,
            embeds: [],
            components: []
          });
          return;
        }
      }

      if (customId.startsWith("music_ctrl:")) {
        const action = customId.split(":")[1];
        const guildId = interaction.guildId;
        const member = interaction.member as GuildMember;

        if (!guildId || !member) {
          await interaction.reply({ content: "Tombol ini hanya dapat digunakan di server!", flags: MessageFlags.Ephemeral });
          return;
        }

        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
          await interaction.reply({ content: "Kamu harus berada di Voice Channel untuk menggunakan tombol kontroler musik!", flags: MessageFlags.Ephemeral });
          return;
        }

        const queue = musicManager.getQueue(guildId);
        if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
          await interaction.reply({ content: "Tidak ada musik yang sedang diputar di server ini!", flags: MessageFlags.Ephemeral });
          return;
        }

        if (action === "pause_resume") {
          if (queue.isPaused) {
            musicManager.resume(guildId);
          } else {
            musicManager.pause(guildId);
          }
        } else if (action === "skip") {
          await musicManager.skip(guildId);
        } else if (action === "loop") {
          musicManager.setLoop(guildId);
        } else if (action === "shuffle") {
          if (queue.tracks.length <= 1) {
            await interaction.reply({ content: "Antrean butuh minimal 2 lagu untuk diacak!", flags: MessageFlags.Ephemeral });
            return;
          }
          musicManager.shuffle(guildId);
        } else if (action === "vol_down") {
          musicManager.changeVolume(guildId, -10);
        } else if (action === "vol_up") {
          musicManager.changeVolume(guildId, 10);
        } else if (action === "stop") {
          musicManager.stop(guildId);
          await interaction.update({
            content: `⏹️ Musik dihentikan dan antrean dibersihkan oleh **${member.displayName || interaction.user.username}**.`,
            embeds: [],
            components: []
          });
          return;
        } else if (action === "queue") {
          const loopLabel = queue.loopMode === "track" ? "🔂 Track" : queue.loopMode === "queue" ? "🔁 Queue" : "❌ Off";
          const qEmbed = new EmbedBuilder()
            .setColor(0xF472B6)
            .setTitle("📜 Antrean Musik Maya")
            .setDescription(`🔊 **Volume**: \`${queue.volume}%\` | 🔁 **Loop**: \`${loopLabel}\``)
            .setFooter({ text: "Maya Music Companion • YouTube HQ Audio", iconURL: interaction.client.user?.displayAvatarURL() })
            .setTimestamp();

          if (queue.currentTrack) {
            qEmbed.addFields({
              name: "▶️ Sedang Diputar",
              value: `[**${queue.currentTrack.title}**](${queue.currentTrack.url}) | \`${queue.currentTrack.duration}\` (Oleh: ${queue.currentTrack.requestedBy})`
            });
          }

          if (queue.tracks.length > 0) {
            const nextTracks = queue.tracks
              .slice(0, 10)
              .map((t, idx) => `**#${idx + 1}.** [${t.title}](${t.url}) | \`${t.duration}\` - ${t.requestedBy}`)
              .join("\n");

            qEmbed.addFields({
              name: `📋 Antrean Berikutnya (${queue.tracks.length} lagu)`,
              value: nextTracks + (queue.tracks.length > 10 ? `\n*...dan ${queue.tracks.length - 10} lagu lainnya.*` : "")
            });
          }

          await interaction.reply({ embeds: [qEmbed], flags: MessageFlags.Ephemeral });
          return;
        }

        const updatedQueue = musicManager.getQueue(guildId);
        if (!updatedQueue || (!updatedQueue.currentTrack && updatedQueue.tracks.length === 0)) {
          await interaction.update({
            content: "⏹️ Pemutaran musik telah selesai!",
            embeds: [],
            components: []
          });
          return;
        }

        const updatedEmbed = createNowPlayingEmbed(updatedQueue);
        const updatedComponents = createMusicControlButtons(updatedQueue);

        await interaction.update({
          embeds: [updatedEmbed],
          components: updatedComponents
        });
        return;
      }

      if (customId.startsWith("menfess_reply:")) {
        const replyToCode = customId.split(":")[1];
        const modal = new ModalBuilder()
          .setCustomId(`modal_menfess:${replyToCode}`)
          .setTitle(`💬 Balas Anonim #${replyToCode}`);

        const contentInput = new TextInputBuilder()
          .setCustomId("input_menfess_content")
          .setLabel(`Balasan Anonim untuk #${replyToCode}`)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Tuliskan balasan anonim kamu di sini...")
          .setMinLength(5)
          .setMaxLength(1000)
          .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("poll_vote:")) {
        const parts = customId.split(":");
        const pollId = parts[1];
        const optionKey = parts[2];
        await handlePollVoteInteraction(interaction, pollId, optionKey);
        return;
      }

      if (customId.startsWith("tebak_answer:")) {
        const sessionId = customId.split(":")[1];
        await tebakManager.handleButton(interaction, sessionId);
        return;
      }

      if (customId.startsWith("mabar_join:")) {
        const sessionId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });
        const res = await handleMabarJoin(sessionId, interaction.user.id, interaction.client);
        await interaction.editReply({ content: res.message });
        return;
      }

      if (customId.startsWith("mabar_leave:")) {
        const sessionId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });
        const res = await handleMabarLeave(sessionId, interaction.user.id, interaction.client);
        await interaction.editReply({ content: res.message });
        return;
      }

      if (customId.startsWith("rr:")) {
        const roleId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member && "roles" in interaction.member ? (interaction.member as any) : null;
        if (!member || !interaction.guild) {
          await interaction.editReply({ content: "Perintah hanya dapat dijalankan di dalam server." });
          return;
        }

        const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          await interaction.editReply({ content: "Role tidak ditemukan di server." });
          return;
        }

        const hasRole = member.roles.cache.has(role.id);
        try {
          if (hasRole) {
            await member.roles.remove(role);
            await interaction.editReply({ content: `Role **${role.name}** berhasil dilepaskan.` });
          } else {
            await member.roles.add(role);
            await interaction.editReply({ content: `Role **${role.name}** berhasil ditambahkan.` });
          }
        } catch (err: any) {
          logger.error(`Error toggling reaction role ${role.name}:`, err);
          await interaction.editReply({ content: `Bot tidak memiliki izin untuk mengelola role **${role.name}**.` });
        }
        return;
      }

      if (customId.startsWith("trans_lang:")) {
        const parts = customId.split(":");
        const targetLang = parts[1] as "EN" | "JA" | "ZH";
        const msgId = parts[2];

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const cachedContent = translationCache.get(msgId);
        if (!cachedContent) {
          await interaction.editReply({
            content: "Teks pesan telah kadaluwarsa dari memori. Silakan coba klik kanan pesan kembali.",
          });
          return;
        }

        const result = await translateWithNvidia(cachedContent, targetLang, "Santai");
        if (!result) {
          await interaction.editReply({
            content: "Gagal menerjemahkan teks menggunakan NVIDIA AI Engine. Silakan coba lagi.",
          });
          return;
        }

        const colorMap = {
          EN: "#3B82F6",
          JA: "#EF4444",
          ZH: "#F59E0B",
        };

        const embed = new EmbedBuilder()
          .setTitle(`Maya Translator • ${result.flag} ${result.langName}`)
          .setColor(colorMap[targetLang] as any)
          .setDescription(
            `**Teks Asli**:\n> ${result.originalText}\n\n` +
            `**Terjemahan**:\n\`\`\`\n${result.translatedText}\n\`\`\``
          )
          .setFooter({ text: `Maya Universal Translator • Gaya: ${result.style}` })
          .setTimestamp();

        if (result.pronunciation) {
          embed.addFields({
            name: targetLang === "JA" ? "Cara Baca (Romaji)" : "Cara Baca (Pinyin)",
            value: `\`${result.pronunciation}\``,
            inline: false,
          });
        }

        if (result.notes) {
          embed.addFields({
            name: "Catatan Bahasa",
            value: result.notes,
            inline: false,
          });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (customId.startsWith("imagine_regen:")) {
        const cacheKey = customId.split(":")[1];
        const cached = imaginePromptCache.get(cacheKey);

        if (!cached) {
          await interaction.reply({
            content: "Sesi regenerasi gambar telah kadaluwarsa. Silakan ketik perintah /imagine kembali.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferUpdate();

        const result = await generateFreeImage(cached.prompt, cached.style);
        if (!result) return;

        const embed = new EmbedBuilder()
          .setTitle(`Maya Image Generator • ${cached.style}`)
          .setColor("#3B82F6")
          .setDescription(
            `**Prompt**:\n> ${cached.prompt}\n\n` +
            `**AI Enhanced Prompt**:\n\`\`\`\n${result.enhancedPrompt}\n\`\`\``
          )
          .setImage(result.imageUrl)
          .setFooter({ text: `Engine: FLUX.1 HD • Seed: ${result.seed}` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`imagine_regen:${cacheKey}`)
            .setLabel("🔄 Buat Ulang")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setURL(result.imageUrl)
            .setLabel("🔍 Buka Gambar HD (Full Res)")
            .setStyle(ButtonStyle.Link)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
      }
    }

    // Handle String Select Menu Interactions
    if (interaction.isStringSelectMenu() && interaction.customId === "shop_select_item") {
      const itemId = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`modal_shop_checkout:${itemId}`)
        .setTitle("🛒 Form Pembelian Toko Server");

      const input = new TextInputBuilder()
        .setCustomId("shop_target_input")
        .setLabel("Data Target / ID Game / Contact")
        .setPlaceholder("Contoh: ID Game (Zone ID) / Nickname Role / No HP DANA")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      if (customId.startsWith("modal_shop_checkout:")) {
        const itemId = parseInt(customId.split(":")[1], 10);
        const targetInput = interaction.fields.getTextInputValue("shop_target_input").trim();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!interaction.guildId) {
          await interaction.editReply({ content: "Perintah ini hanya dapat dijalankan di server." });
          return;
        }

        const res = await processShopPurchase(
          interaction.guildId,
          interaction.user.id,
          interaction.user.displayName || interaction.user.username,
          itemId,
          targetInput
        );

        if (!res.success) {
          const errEmbed = createEmbed.error("Pembelian Gagal", res.reason || "Terjadi kesalahan.");
          await interaction.editReply({ embeds: [errEmbed] });
          return;
        }

        const orderEmbed = createEmbed.success(
          "🎉 Pembelian Toko Berhasil Dipesan!",
          `Pesanan kamu telah diterima dan terpotong otomatis dari dompet RTK kamu!\n\n` +
          `📦 **Produk**: ${res.itemTitle}\n` +
          `💰 **Harga**: **${res.priceRtk} RTK**\n` +
          `🏷️ **Kode TRX**: \`${res.orderId}\`\n` +
          `📝 **Data Target**: \`${targetInput}\`\n` +
          `👛 **Sisa Saldo Kamu**: **${res.remainingBalance} RTK**\n\n` +
          `*Admin akan segera memproses pesanan kamu dan notifikasi akan dikirim via DM!*`
        );

        await interaction.editReply({ embeds: [orderEmbed] });
        return;
      }

      if (customId.startsWith("modal_tebak:")) {
        const sessionId = customId.split(":")[1];
        await tebakManager.handleModalSubmit(interaction, sessionId);
        return;
      }

      if (customId.startsWith("modal_menfess:")) {
        const replyToParam = customId.split(":")[1];
        const replyToCode = replyToParam && replyToParam !== "none" ? replyToParam : undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const content = interaction.fields.getTextInputValue("input_menfess_content");
        let overrideReplyTo: string | undefined = replyToCode;
        try {
          const manualReply = interaction.fields.getTextInputValue("input_menfess_reply_to")?.trim().toUpperCase();
          if (manualReply) overrideReplyTo = manualReply;
        } catch (_) {}

        if (!interaction.guildId) {
          await interaction.editReply({ content: "Perintah ini hanya dapat dijalankan di server." });
          return;
        }

        const result = await submitMenfess(
          interaction.client,
          interaction.guildId,
          interaction.user.id,
          content,
          overrideReplyTo
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
        return;
      }
    }

    // Handle Autocomplete
    if (interaction.isAutocomplete()) {
      const client = interaction.client as MayaClient;
      const command = client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === "function") {
        try {
          await command.autocomplete(interaction);
        } catch (error: any) {
          if (error?.code !== 10062) {
            logger.error(`Error saat autocomplete command /${interaction.commandName}:`, error);
          }
        }
      }
      return;
    }

    // Handle Chat Input Commands
    if (!interaction.isChatInputCommand()) return;

    const client = interaction.client as MayaClient;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Command tidak dikenal: ${interaction.commandName}`);
      return;
    }

    try {
      logger.debug(`Menjalankan command: ${interaction.commandName} oleh ${interaction.user.tag}`);
      if (interaction.guildId) {
        trackAnalyticsEvent(interaction.guildId, "COMMAND_EXEC", interaction.commandName).catch(() => {});
      }
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error saat menjalankan command /${interaction.commandName}:`, error);

      const embedError = createEmbed.error(
        "Terjadi Kesalahan",
        "Maaf, terjadi kesalahan saat menjalankan perintah ini. Silakan coba lagi nanti."
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embedError], ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [embedError], ephemeral: true }).catch(() => {});
      }
    }
  },
};

export default event;
