import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types";
import { translateWithNvidia } from "../../services/translationService";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Terjemahkan teks ke Bahasa Inggris, Jepang, atau Mandarin menggunakan NVIDIA LLM AI")
    .addStringOption((opt) =>
      opt
        .setName("teks")
        .setDescription("Teks yang ingin diterjemahkan")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((opt) =>
      opt
        .setName("bahasa")
        .setDescription("Pilih bahasa tujuan terjemahan")
        .setRequired(true)
        .addChoices(
          { name: "🇬🇧 Bahasa Inggris (EN)", value: "EN" },
          { name: "🇯🇵 Bahasa Jepang (JA)", value: "JA" },
          { name: "🇨🇳 Bahasa Mandarin (ZH)", value: "ZH" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("gaya")
        .setDescription("Pilih gaya penulisan terjemahan (Opsional)")
        .setRequired(false)
        .addChoices(
          { name: "💬 Santai / Gaul / Natural", value: "Santai" },
          { name: "💼 Formal / Resmi / Enterprise", value: "Formal" },
          { name: "⛩️ Anime / Manga Nuance", value: "Anime" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const text = interaction.options.getString("teks", true);
    const targetLang = interaction.options.getString("bahasa", true) as "EN" | "JA" | "ZH";
    const style = interaction.options.getString("gaya") || "Santai";

    const result = await translateWithNvidia(text, targetLang, style);

    if (!result) {
      await interaction.editReply({
        content: "Gagal menerjemahkan teks menggunakan NVIDIA AI Engine. Silakan coba lagi beberapa saat lagi.",
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
  },
};

export default command;
