/** Montant en toutes lettres pour le contrat : 2 799 500 → « deux millions sept cent quatre-vingt-dix-neuf mille cinq cents ». */
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize",
  "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    return u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${UNITS[n - 60]}`;
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${UNITS[n - 80]}`;
}

function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (h === 1) out = "cent";
  else if (h > 1) out = `${UNITS[h]} cent${rest === 0 && final ? "s" : ""}`;
  if (rest) {
    // « quatre-vingts » perd son « s » quand il n'est pas en fin de nombre.
    const words = !final && rest === 80 ? "quatre-vingt" : below100(rest);
    out = out ? `${out} ${words}` : words;
  }
  return out;
}

export function amountInWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "zéro";
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (billions) parts.push(`${below1000(billions, true)} milliard${billions > 1 ? "s" : ""}`);
  if (millions) parts.push(`${below1000(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
  if (rest) parts.push(below1000(rest, true));
  return parts.join(" ");
}
