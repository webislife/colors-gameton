import path from "path";
import { createCanvas, loadImage } from "canvas";
import { parentPort } from "worker_threads";
import { PrismaClient } from "@prisma/client";
import config from "../config";
const prisma = new PrismaClient();

if (parentPort) {
  parentPort.on("message", async (shot: { level: number; userId: number }) => {
    console.log("message", shot);
    try {
      parentPort?.postMessage({
        success: true,
        score: await clacRate(shot.level, shot.userId),
      });
    } catch (error: any) {
      parentPort?.postMessage({
        success: false,
        error: error.message,
      });
    }
  });
}

async function clacRate(level: number, userId: number) {
  console.time("score");
  const width = config.canvasWidth,
    height = config.canvasHeight;
  let score = 0;
  const levelImage = `${userId}-${level}.png`;
  console.log("start calculate", level, userId, levelImage);
  console.log('sourceImage', path.join(__dirname, "../../levels", `${level}.png`));
  console.log('path', path.join(__dirname, "/api/images", levelImage));
  //Prepare source image
  const sourceImage = await loadImage(
    path.join(__dirname, "../../levels", `${level}.png`)
  );
  const sourceCanvas = createCanvas(width, height);
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.drawImage(sourceImage, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, width, height);

  //Prepare level image
  const levelImg = await loadImage(
    path.join(__dirname, "/api/images", levelImage)
  );
  const levelCanvas = createCanvas(width, height);
  const levelCtx = levelCanvas.getContext("2d");
  levelCtx.drawImage(levelImg, 0, 0);
  const levelData = levelCtx.getImageData(0, 0, width, height);

  // Проверяем каждый пиксель построчно
  for (let i = 0; i < sourceData.data.length; i += 4) {
    const r = sourceData.data[i]; // Red
    const g = sourceData.data[i + 1]; // Green
    const b = sourceData.data[i + 2]; // Blue
    const a = sourceData.data[i + 3]; // Alpha
    //Пропускаем прозрачные пиксели
    if (a === 0) {
      continue;
    }
    const lr = levelData.data[i]; // Red
    const lg = levelData.data[i + 1]; // Green
    const lb = levelData.data[i + 2]; // Blue
    const la = levelData.data[i + 3]; // Alpha

    //Skip white and transparent pixels
    if (
      a > 0 &&
      r < 255 &&
      g < 255 &&
      b < 255 &&
      la > 0 &&
      lr < 255 &&
      lg < 255 &&
      lb < 255
    ) {
      //Debug info
      // Calculate x and y position
      // const x = (i / 4) % width;
      // const y = Math.floor((i / 4) / width);
      // console.log(`Pixel source [${x} ${y}] - R: ${r}, G: ${g}, B: ${b}, A: ${a}`);
      // console.log(`Pixel level [${x} ${y}] - R: ${lr}, G: ${lg}, B: ${lb}, A: ${la}`);
      score += 765 - (r - lr + (g - lg) + (b - lb));
    }
  }
  console.log("score", Math.round(score));
  score = Number(score / 1000);
  console.timeEnd("score");
  //Обновляем информацию в БД
  const currentLevel = await prisma.level.findFirst({
    where: {
      userId,
      level,
    },
  });

  if (currentLevel) {
    await prisma.level.update({
      where: {
        id: currentLevel.id,
      },
      data: {
        score: score
      }
    });
  }
  return score;
}
