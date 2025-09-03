import path from "path";
import { createCanvas, loadImage, ImageData } from "canvas";
import { parentPort } from "worker_threads";
import { PrismaClient } from "@prisma/client";
import config from "../config";
const prisma = new PrismaClient();

// Кэш для исходных изображений уровней
const sourceImageCache = new Map<number, ImageData>();

async function getSourceImageData(level: number): Promise<ImageData> {
  if (sourceImageCache.has(level)) {
    return sourceImageCache.get(level)!;
  }

  const sourceImage = await loadImage(
    path.join(__dirname, "../../levels", `${level}.png`)
  );
  
  const canvas = createCanvas(config.canvasWidth, config.canvasHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceImage, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, config.canvasWidth, config.canvasHeight);
  sourceImageCache.set(level, imageData);
  
  return imageData;
}

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
  
  const sourceData = await getSourceImageData(level);
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
    // Вычисляем разницу по каждому каналу и суммируем
    const diffR = Math.abs(r - lr);
    const diffG = Math.abs(g - lg);
    const diffB = Math.abs(b - lb);
  
    // Score = максимальная разница минус фактическая разница
    score += 765 - (diffR + diffG + diffB);
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
