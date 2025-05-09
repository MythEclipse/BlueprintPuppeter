import puppeteer from 'puppeteer';

async function fetchStreamUrl(pdrainUrl: string): Promise<string | Error> {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(pdrainUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('video');
    await page.waitForNetworkIdle();
    const streamUrl = await page.$eval('video', (video: HTMLVideoElement) => video.src);
    await browser.close();
    if (streamUrl) {
      return streamUrl;
    } else {
      throw new Error('Stream URL not found');
    }
  } catch (err) {
    return new Error('Failed to fetch stream url');
  }
}

(async () => {
  const response = await fetchStreamUrl('https://desustream.com/safelink/link/?id=eXRoOHNYVG9UdnVGOXpQU2dYWmpSYjJGYkxEUmxQeWQ4MzV4YkpheTYyY2g1a1dIc1drcHIzbC9IZXpnK3IyMHNvOXd1eGFhVVpQNFVKeFE5M0lzQm5VUzhJU3RGN1dYL3c9PQ==');
  console.log(response);
})();
