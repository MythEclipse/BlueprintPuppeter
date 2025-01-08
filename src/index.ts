import puppeteer, { ElementHandle } from "puppeteer";
import path from "path";

async function test(): Promise<void> {
  console.log("Starting the test function");

  const browser = await puppeteer.launch({
    headless: false,
    args: []
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
    timeout: 60000 // Tambahkan timeout eksplisit
  });
  console.log("Navigated to the video compressor page");

  const filePath = path.resolve("./video.mp4");
  console.log(`File path resolved: ${filePath}`);

  const inputUploadHandle = await page.$("#file");
  if (inputUploadHandle) {
    await (inputUploadHandle as ElementHandle<HTMLInputElement>).uploadFile(
      filePath
    );
    console.log("File uploaded");
  } else {
    console.error("File input element not found");
    await browser.close();
    return;
  }

  await page.waitForSelector('select[name="compress_video"]');
  console.log("Dropdown for compress video is available");

  await page.select(
    'select[name="compress_video"]',
    "602a9f6c86eb7a0023f187be"
  );
  console.log("Selected 'Target a file size (MB)' option");

  await page.waitForSelector('select[name="video_codec_compress"]');
  console.log("Dropdown for video codec is available");

  await page.select(
    'select[name="video_codec_compress"]',
    "602a9df886eb7a0023f187b9"
  );
  console.log("Selected 'H265' option");

  await page.waitForSelector('input[name="video_compress_max_filesize"]');
  console.log("Input field for max file size is available");

  await page.type('input[name="video_compress_max_filesize"]', "10");
  console.log("Set max file size to 10");

  await page.waitForSelector("button.download-action__button");
  console.log("Apply to All Files button is available");

  await page.click("button.download-action__button");
  console.log("Clicked 'Apply to All Files' button");

  await browser.close();
  console.log("Browser closed");
}

test().catch((error) => {
  console.error("Error in test function:", error);
});
