import puppeteer, { ElementHandle, Page } from "puppeteer"; // Use puppeteer here unless you have a specific reason to use puppeteer-real-browser
import path from "path";
import fs from "fs";
import axios from "axios";

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function uploadFile(page: Page, filePath: string): Promise<void> {
  const inputUploadHandle = await page.$('input[type="file"]');
  if (inputUploadHandle) {
    await (inputUploadHandle as ElementHandle<HTMLInputElement>).uploadFile(filePath);
  } else {
    throw new Error("File input element not found");
  }
}

async function test(): Promise<void> {
  console.log("Starting the test function");

  const videoUrl = "https://raw.githubusercontent.com/MythEclipse/BlueprintPuppeter/refs/heads/main/video.mp4";
  const filePath = path.resolve("./video.mp4");

  console.log(`Downloading video from ${videoUrl}`);
  await downloadVideo(videoUrl, filePath);
  console.log(`Video downloaded to ${filePath}`);

  // Launch a new browser instance
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9"
  });

  console.log("Connected to the browser");

  await page.goto("https://www.freeconvert.com/video-compressor", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  console.log("Navigated to the video compressor page");

  console.log(`File path resolved: ${filePath}`);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    // Use the file input to upload the video
    await uploadFile(page, filePath);
    console.log("File uploaded via file input");
  } else {
    console.error("File input element not found");
    await browser.close();
    return;
  }

  await delay(200);
  await page.waitForSelector('select[name="compress_video"]');
  console.log("Dropdown for compress video is available");

  await delay(200);
  await page.select(
    'select[name="compress_video"]',
    "602a9f6c86eb7a0023f187be"
  );
  console.log("Selected 'Target a file size (MB)' option");

  await delay(200);
  await page.waitForSelector('select[name="video_codec_compress"]');
  console.log("Dropdown for video codec is available");

  await delay(200);
  await page.select(
    'select[name="video_codec_compress"]',
    "602a9df886eb7a0023f187b9"
  );
  console.log("Selected 'H265' option");

  await delay(200);
  await page.select(
    'select[name="compress_video"]',
    "602a9f6c86eb7a0023f187be"
  );
  console.log("Selected 'Target a file size MB' option");

  await delay(200);
  await page.waitForSelector('input[name="video_compress_max_filesize"]');
  console.log("Input field for max file size is available");

  await delay(200);
  await page.type('input[name="video_compress_max_filesize"]', "10");
  console.log("Set max file size to 10");

  await delay(200);
  await browser.close();
  console.log("Browser closed");
}

test().catch((error) => {
  console.error("Error in test function:", error);
});
