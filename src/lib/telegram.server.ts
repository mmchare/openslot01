// Telegram admin alerts (server-only).
// Required env (added via secrets later): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Alert skipped (missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID):", message);
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("[Telegram] sendMessage failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[Telegram] request error:", err);
  }
}

export function buildStockAlertMessage(appName: string): string {
  return `⚠️ <b>ALERTE OPENSLOT</b> ⚠️\n\nLe produit <b>${appName}</b> est en rupture complète de stock.\n\nVeuillez recharger la base de données de toute urgence pour ne pas bloquer les ventes.`;
}
