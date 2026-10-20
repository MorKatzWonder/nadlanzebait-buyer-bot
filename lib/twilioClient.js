const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_WHATSAPP_NUMBER;

/**
 * שולח הודעת טקסט רגילה בוואטסאפ.
 * to חייב להיות בפורמט whatsapp:+972501234567
 */
async function sendText(to, body) {
  return client.messages.create({ from: FROM, to, body });
}

module.exports = { sendText, client, FROM };
