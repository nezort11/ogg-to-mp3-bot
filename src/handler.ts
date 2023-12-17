import express from "express";
import { bot } from "./main";

const app = express();

app.use(bot.webhookCallback());

app.listen(process.env.PORT, () =>
  console.log("Listening on port", process.env.PORT)
);
