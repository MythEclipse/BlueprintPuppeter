import puppeteer, { ElementHandle } from "puppeteer";
import path from "path";
import fs from "fs";

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test(): Promise<void> {
  console.log("Starting the test function");

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const pages = await browser.pages();
  if (pages.length === 0) {
    console.error("No pages found");
    await browser.close();
    return;
  }
  const page = pages[0];

  if (!page) {
    console.error("Page is undefined");
    await browser.close();
    return;
  }

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

  const filePath = path.resolve("./video.mp4");
  console.log(`File path resolved: ${filePath}`);

  const fileInput = await page.$("#file");
  if (fileInput) {
    const file = fs.readFileSync(filePath);
    const dataTransfer = await page.evaluateHandle((file) => {
      const dataTransfer = new DataTransfer();
      const fileBlob = new Blob([file], { type: 'video/mp4' });
      const fileObj = new File([fileBlob], 'video.mp4', { type: 'video/mp4' });
      dataTransfer.items.add(fileObj);
      return dataTransfer;
    }, file);

    const dropZone = await page.$("#fc__app > div:nth-child(2) > div.tool-template > div.file-input > div");
    if (dropZone) {
      await page.evaluate((dropZone, dataTransfer) => {
        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer
        });
        dropZone.dispatchEvent(event);
      }, dropZone, dataTransfer);
      console.log("File uploaded via drag and drop");
    } else {
      console.error("Drop zone element not found");
      await browser.close();
      return;
    }
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

  // await delay(200);
  // await page.waitForSelector("#Dropdown > a > button");
  // console.log("Apply to All Files button is available");

  // await delay(200);
  // await page.click("#Dropdown > a > button");
  // console.log("Clicked 'Apply to All Files' button");

  // await delay(200);
  // await browser.close();
  // console.log("Browser closed");
}

test().catch((error) => {
  console.error("Error in test function:", error);
});
