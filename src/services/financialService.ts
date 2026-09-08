import axios from "axios";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger";

export interface CurrencyRate {
  code: string;
  name: string;
  symbol: string;
  rateToIdr: number;
}

export interface CurrencyReport {
  baseCurrency: string;
  lastUpdated: string;
  source: string;
  rates: CurrencyRate[];
}

// Fallback rates if external API is unreachable
const FALLBACK_RATES: CurrencyRate[] = [
  { code: "USD", name: "United States Dollar", symbol: "$", rateToIdr: 16250 },
  { code: "EUR", name: "Euro", symbol: "€", rateToIdr: 17620 },
  { code: "JPY", name: "Japanese Yen (100)", symbol: "¥", rateToIdr: 10450 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", rateToIdr: 12280 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", rateToIdr: 3680 },
  { code: "GBP", name: "British Pound Sterling", symbol: "£", rateToIdr: 21150 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", rateToIdr: 10620 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", rateToIdr: 2240 }
];

export async function fetchCurrencyRates(): Promise<CurrencyReport> {
  try {
    const response = await axios.get("https://open.er-api.com/v6/latest/USD", {
      timeout: 5000,
      headers: {
        "User-Agent": "MayaFinancialMonitor/1.0"
      }
    });

    if (response.data && response.data.rates && response.data.rates.IDR) {
      const usdToIdr = response.data.rates.IDR;
      const ratesData = response.data.rates;

      const currencyList: Array<{ code: string; name: string; symbol: string; multiplier?: number }> = [
        { code: "USD", name: "United States Dollar", symbol: "$" },
        { code: "EUR", name: "Euro", symbol: "€" },
        { code: "JPY", name: "Japanese Yen (100)", symbol: "¥", multiplier: 100 },
        { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
        { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
        { code: "GBP", name: "British Pound Sterling", symbol: "£" },
        { code: "AUD", name: "Australian Dollar", symbol: "A$" },
        { code: "CNY", name: "Chinese Yuan", symbol: "¥" }
      ];

      const rates: CurrencyRate[] = currencyList.map(curr => {
        let rateToIdr = 0;
        if (curr.code === "USD") {
          rateToIdr = usdToIdr;
        } else {
          const usdToCurr = ratesData[curr.code];
          if (usdToCurr && usdToCurr > 0) {
            rateToIdr = (usdToIdr / usdToCurr) * (curr.multiplier || 1);
          }
        }
        return {
          code: curr.code,
          name: curr.name,
          symbol: curr.symbol,
          rateToIdr: Math.round(rateToIdr)
        };
      });

      return {
        baseCurrency: "IDR (Rupiah)",
        lastUpdated: new Date().toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta"
        }) + " WIB",
        source: "Open Exchange Rate Network",
        rates
      };
    }
  } catch (error) {
    logger.warn("Gagal mengambil data kurs live, menggunakan data referensi terkini:", error);
  }

  return {
    baseCurrency: "IDR (Rupiah)",
    lastUpdated: new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }) + " (Estimasi Pasar)",
    source: "Bank Indonesia & Pasar Valuta Asing",
    rates: FALLBACK_RATES
  };
}

export function createCurrencyEmbed(
  report: CurrencyReport,
  avatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0x10b981) // Emerald Green
    .setTitle("Informasi Nilai Tukar Mata Uang (Kurs Valas)")
    .setDescription(
      `Pembaruan kurs valuta asing terhadap **${report.baseCurrency}**.\n` +
      `Sumber Referensi: [Bank Indonesia](https://www.bi.go.id) & [Exchange Market Data](https://www.google.com/finance).\n\n` +
      `**Waktu Pembaruan**: ${report.lastUpdated}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

  if (avatarUrl) {
    embed.setAuthor({ name: "Maya Financial Monitor", iconURL: avatarUrl });
  }

  for (const rate of report.rates) {
    const formattedVal = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(rate.rateToIdr);

    embed.addFields({
      name: `${rate.code} - ${rate.name}`,
      value: `**Nilai Tukar**: \`${formattedVal}\` per 1 ${rate.code.includes("(100)") ? "100 Unit" : rate.code}`,
      inline: true
    });
  }

  embed.setFooter({
    text: `Maya Financial Data • Transaksi valas mengikuti kurs bank penukaran`
  });
  embed.setTimestamp();

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Kurs Bank Indonesia")
      .setStyle(ButtonStyle.Link)
      .setURL("https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx"),
    new ButtonBuilder()
      .setLabel("Google Finance (IDR)")
      .setStyle(ButtonStyle.Link)
      .setURL("https://www.google.com/finance/quote/USD-IDR")
  );

  return { embed, components: [actionRow] };
}
