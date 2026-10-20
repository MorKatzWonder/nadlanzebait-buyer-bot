const express = require("express");
const router = express.Router();
const { getSession, updateSession } = require("../lib/sessionStore");
const { handleIncomingMessage } = require("../lib/flow");

// Twilio שולח application/x-www-form-urlencoded עם From ו-Body
router.post("/", async (req, res) => {
  try {
    const from = req.body.From; // לדוגמה: whatsapp:+972501234567
    const body = req.body.Body || "";

    if (!from) {
      return res.status(400).send("Missing From");
    }

    const session = getSession(from);
    await handleIncomingMessage(from, body, session, { updateSession });

    // Twilio מצפה לתשובת 200 ריקה (אנחנו כבר שלחנו הודעה יזומה דרך ה-API ב-flow.js)
    res.set("Content-Type", "text/xml");
    res.send("<Response></Response>");
  } catch (err) {
    console.error("Webhook error:", err);
    res.set("Content-Type", "text/xml");
    res.send("<Response></Response>");
  }
});

module.exports = router;
