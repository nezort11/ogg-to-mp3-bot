import { fileURLToPath } from "url";
import process from "process";
import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import * as dotenv from "dotenv";
import axios from "axios";
import { load } from "cheerio";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import { sendAdminNotification } from "./notification";
import { telegrafThrottler } from "telegraf-throttler";
import Bottleneck from "bottleneck";
// import FormData from "form-data";
// import { join, dirname } from "path";

dotenv.config({ path: "./.env" });

// type UploadResponse = {
//   chat_id: string;
//   message_id: number;
// };

const throttler = telegrafThrottler({
  // Config credit: https://github.com/KnightNiwrem/telegraf-throttler/blob/master/src/index.ts#L37
  group: {
    maxConcurrent: 1,
    minTime: 333,
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 60000,
  },
  in: {
    highWater: 16,
    strategy: Bottleneck.strategy.LEAK,
    // TODO: fix why it still does 2 concurrently
    maxConcurrent: 1,
    minTime: 333,
  },
  out: {
    // https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this
    maxConcurrent: 1,
    minTime: 25,
    reservoir: 30,
    reservoirRefreshAmount: 30,
    reservoirRefreshInterval: 1000,
  },
});

const BOT_TOKEN = process.env.BOT_TOKEN as string;
// const UPLOADER_URL = process.env.UPLOADER_URL as string;

export const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 1800_000 });

bot.use(throttler);

bot.use(Telegraf.log());

bot.start(async (context) => {
  await context.reply(
    "Привет, пришли мне свой аудиофайл (или голосовое сообщение) в формате OGG и я конвертирую его в MP3"
  );
});

const ffmpeg = createFFmpeg({
  log: true,
  // corePath: FFmpegCoreLocation,
  // wasmPath: FFmpegWasmLocation,
});

bot.on(message("voice"), async (context) => {
  console.log("context:", context);
  let intervalTyping: NodeJS.Timer | undefined;
  try {
    // context.message.voice.file_id;
    await context.sendChatAction("typing");
    intervalTyping = setInterval(
      async () => await context.sendChatAction("typing"),
      5000
    );
    // await context.replyWithDocument(context.message.voice.file_id);

    const fileLink = await bot.telegram.getFileLink(
      context.message.voice.file_id
    );
    const fileResponse = await axios.get<ArrayBuffer>(fileLink.href, {
      responseType: "arraybuffer",
    });
    let audioBuffer = Buffer.from(fileResponse.data);

    // const FFmpegCoreLocation = join(
    //   dirname(import.meta.url),
    //   "../node_modules/@ffmpeg/core/dist/ffmpeg-core.js"
    // ).replace("file:", "");

    // const FFmpegWasmLocation = join(
    //   dirname(import.meta.url),
    //   "../node_modules/@ffmpeg/core/dist/ffmpeg-core.wasm"
    // ).replace("file:", "");

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // const inputFile = await fs.readFile("./src/input.ogg");

    ffmpeg.FS("writeFile", "input.ogg", audioBuffer);

    (audioBuffer as typeof audioBuffer | null) = null;

    await ffmpeg.run("-i", "input.ogg", "output.mp3");

    const outputFile = await ffmpeg.FS("readFile", "output.mp3");

    // Exit ffmpeg to free up RAM
    // ffmpeg.exit();

    let outputBuffer = Buffer.from(outputFile);

    await context.replyWithAudio({ source: outputBuffer });

    (outputBuffer as typeof outputBuffer | null) = null;
  } finally {
    clearInterval(intervalTyping);
  }
});

const renderError = async (error: unknown, context: Context) => {
  const errorMessage =
    "⚠️ Ошибка! Попробуй еще раз 🔁, или сообщи об этом @nezort11 (буду рад помочь 😅)";

  console.error(error);
  await Promise.allSettled([
    context.callbackQuery
      ? context.editMessageText(errorMessage)
      : context.reply(errorMessage),
    sendAdminNotification(
      `${(error as Error)?.stack || error}\n\nMessage: ${JSON.stringify(
        context.message
      )}`
    ),
  ]);
};

bot.catch(async (error, context) => {
  await renderError(error, context);
});

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
//   bot.launch();
//   console.log("Started bot server");
// }

if (require.main === module) {
  bot.launch();
  console.log("Started bot server");
}
