import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types";
import { executeCode } from "../../services/codeRunner";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("run")
    .setDescription("Jalankan potongan kode program online (JavaScript, Python, C++, Go, Java, TS, Rust)")
    .addStringOption((opt) =>
      opt
        .setName("bahasa")
        .setDescription("Bahasa pemrograman")
        .setRequired(true)
        .addChoices(
          { name: "JavaScript (Node.js)", value: "javascript" },
          { name: "Python 3", value: "python" },
          { name: "C++", value: "cpp" },
          { name: "Go (Golang)", value: "go" },
          { name: "Java", value: "java" },
          { name: "TypeScript", value: "typescript" },
          { name: "Rust", value: "rust" },
          { name: "PHP", value: "php" },
          { name: "C#", value: "csharp" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("kode")
        .setDescription("Potongan kode sumber yang ingin dieksekusi")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const language = interaction.options.getString("bahasa", true);
    const code = interaction.options.getString("kode", true);

    try {
      const result = await executeCode(language, code);

      const isSuccess = result.exitCode === 0;
      const embedColor = isSuccess ? "#10B981" : "#EF4444"; // Green for success, Red for error

      const truncatedCode = code.length > 800 ? `${code.substring(0, 797)}...` : code;
      let truncatedOutput = result.output;
      if (truncatedOutput.length > 1000) {
        truncatedOutput = `${truncatedOutput.substring(0, 997)}...`;
      }

      const langCodeHighlight = getLangHighlight(result.language);

      const embed = new EmbedBuilder()
        .setTitle(`Hasil Eksekusi Kode: ${result.language.toUpperCase()} (v${result.version})`)
        .setColor(embedColor)
        .addFields(
          {
            name: "Kode Sumber",
            value: `\`\`\`${langCodeHighlight}\n${truncatedCode}\n\`\`\``,
            inline: false,
          },
          {
            name: "Output Konsol",
            value: `\`\`\`text\n${truncatedOutput}\n\`\`\``,
            inline: false,
          },
          {
            name: "Status Eksekusi",
            value: isSuccess ? "Berhasil (Exit Code 0)" : `Error (Exit Code ${result.exitCode})`,
            inline: true,
          },
          {
            name: "Waktu Proses",
            value: `${result.executionTimeMs} ms`,
            inline: true,
          }
        )
        .setFooter({
          text: `Maya Code Engine • Sandbox Runtime`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error executing /run command:", error);
      await interaction.editReply({
        content: "Terjadi kesalahan sistem saat mengeksekusi kode program. Silakan coba beberapa saat lagi.",
      });
    }
  },
};

function getLangHighlight(lang: string): string {
  const l = lang.toLowerCase();
  if (l.includes("javascript") || l === "js") return "js";
  if (l.includes("typescript") || l === "ts") return "ts";
  if (l.includes("python") || l === "py") return "py";
  if (l.includes("cpp") || l.includes("c++")) return "cpp";
  if (l.includes("go")) return "go";
  if (l.includes("java")) return "java";
  if (l.includes("rust") || l === "rs") return "rs";
  if (l.includes("php")) return "php";
  if (l.includes("csharp") || l === "cs") return "cs";
  return "text";
}

export default command;
