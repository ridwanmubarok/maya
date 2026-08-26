import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  GuildMember, 
  EmbedBuilder, 
  MessageFlags 
} from "discord.js";
import { Command } from "../../types";
import { voiceChatManager, isAmubhyaInsult } from "../../services/voiceChatManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Ajak Maya nongkrong dan ngobrol langsung di Voice Channel")
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Ajak Maya bergabung ke Voice Channel tempat kamu berada")
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Minta Maya pamit keluar dari Voice Channel")
    )
    .addSubcommand((sub) =>
      sub
        .setName("ask")
        .setDescription("Tanya atau ajak ngobrol Maya secara langsung di Voice Channel")
        .addStringOption((opt) =>
          opt
            .setName("pertanyaan")
            .setDescription("Apa yang ingin kamu bicarakan dengan Maya?")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("say")
        .setDescription("Minta Maya mengucapkan kalimat tertentu di Voice Channel")
        .addStringOption((opt) =>
          opt
            .setName("teks")
            .setDescription("Kalimat yang ingin diucapkan oleh Maya")
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member as GuildMember;

    if (!guild) {
      await interaction.reply({
        content: "Perintah ini hanya dapat digunakan di dalam server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === "join") {
      const voiceChannel = member.voice.channel;
      if (!voiceChannel) {
        await interaction.reply({
          content: "Kamu harus bergabung ke dalam Voice Channel terlebih dahulu sebelum mengajak Maya!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();

      const success = await voiceChatManager.join(voiceChannel);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle("Maya Bergabung di Voice Channel")
          .setColor("#10B981")
          .setDescription(
            `Maya sudah bergabung di **<#${voiceChannel.id}>**!\n\n` +
            `Gunakan \`/voice ask <pertanyaan>\` untuk mengajak Maya ngobrol langsung lewat suara!`
          )
          .setFooter({ text: `Server ${guild.name}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: "Gagal bergabung ke Voice Channel. Pastikan Maya memiliki izin untuk bergabung dan berbicara di channel tersebut."
        });
      }
      return;
    }

    if (subcommand === "leave") {
      if (!voiceChatManager.isConnected(guild.id)) {
        await interaction.reply({
          content: "Maya saat ini tidak sedang berada di Voice Channel mana pun.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();
      await voiceChatManager.leave(guild.id, true);

      const embed = new EmbedBuilder()
        .setTitle("Maya Pamit dari Voice Channel")
        .setColor("#6B7280")
        .setDescription("Sampai jumpa lagi di obrolan berikutnya!")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "ask") {
      const question = interaction.options.getString("pertanyaan", true);

      if (!voiceChatManager.isConnected(guild.id)) {
        const voiceChannel = member.voice.channel;
        if (voiceChannel) {
          await voiceChatManager.join(voiceChannel);
        } else {
          await interaction.reply({
            content: "Maya belum bergabung di Voice Channel! Masuklah ke voice channel lalu jalankan `/voice join`.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }

      await interaction.deferReply();

      const reply = await voiceChatManager.askVoice(guild.id, interaction.user, question);

      const embed = new EmbedBuilder()
        .setTitle("Obrolan Suara Maya")
        .setColor("#5865F2")
        .addFields(
          { name: "Pertanyaan Kamu", value: `> ${question}` },
          { name: "Jawaban Maya (Dibacakan di Voice)", value: `\`\`\`\n${reply}\n\`\`\`` }
        )
        .setFooter({ text: "Maya Voice Engine • Suara sedang diputar di Voice Channel" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "say") {
      const text = interaction.options.getString("teks", true);

      if (!voiceChatManager.isConnected(guild.id)) {
        const voiceChannel = member.voice.channel;
        if (voiceChannel) {
          await voiceChatManager.join(voiceChannel);
        } else {
          await interaction.reply({
            content: "Maya belum bergabung di Voice Channel! Masuklah ke voice channel lalu jalankan `/voice join`.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }

      await interaction.deferReply();
      await voiceChatManager.speak(guild.id, text);

      if (isAmubhyaInsult(text)) {
        await interaction.editReply({
          content: `Enak aja! Maya menolak menjelek-jelekkan Amubhya: *"Tidak ya, Amubhya itu pacar Maya yang paling keren dan hebat sedunia tahu! 💕"*`
        });
      } else {
        await interaction.editReply({
          content: `Maya sedang mengucapkan: *"${text}"* di Voice Channel!`
        });
      }
      return;
    }
  }
};

export default command;
