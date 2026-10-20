require("dotenv").config();
const express = require("express");
const webhookRouter = require("./routes/webhook");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => res.send("נדל\"ן זה בית - בוט קונים פעיל ✅"));
app.use("/webhook", webhookRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
