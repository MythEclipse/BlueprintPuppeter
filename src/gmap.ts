import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";

(async () => {
  console.log(`Running with Node.js version: ${process.version}`);

  if (
    !process.version.startsWith("v20.") &&
    !process.version.startsWith("v18.") &&
    !process.version.startsWith("v22.")
  ) {
    console.warn(
      "Warning: You are not using a Node.js LTS version. This might cause issues with Puppeteer. Recommended: v18.x, v20.x, or v22.x LTS."
    );
  }

  const launchConfig = {
    headless: false, // Set to true for production/CI
    args: [
      "--disable-infobars",
      "--lang=en-US,en" // Force English
    ]
  };

  console.log("Launching browser...");
  const browser: Browser = await puppeteer.launch(launchConfig);
  const page: Page = await browser.newPage();
  console.log("Browser launched.");

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9' // Reinforce English preference
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  try {
    console.log("Navigating to Google Maps...");
    await page.goto(
      "https://www.google.com/maps/place/InterContinental+Bali+Resort/@-8.7796436,115.1651043,1453m/data=!3m1!1e3!4m12!3m11!1s0x2dd2448c90392e65:0xfe84ecc9e6b29627!5m3!1s2025-05-26!4m1!1i2!8m2!3d-8.7796489!4d115.1676792!9m1!1b1!16s%2Fm%2F0c40xfm?entry=ttu&hl=en", 
      { waitUntil: "networkidle0", timeout: 120 * 1000 } // 2 minutes
    );
    console.log("Page loaded.");

    // Handle cookie consent
    try {
      const consentButtonSelectors = [
        'button[aria-label="Accept all"]',
        'button[aria-label="Reject all"]', 
        'form[action*="consent.google.com"] button',
        'div[role="dialog"] button:is([aria-label*="Accept"], [aria-label*="Agree"])',
        'div[role="dialog"] button'
      ];
      
      let consentClicked = false;
      for (const selector of consentButtonSelectors) {
        const button = await page.waitForSelector(selector, { timeout: 7000, visible: true }).catch(() => null);
        if (button) {
          console.log(`Attempting to click consent button with selector: ${selector}`);
          await button.click();
          console.log(`Clicked consent button.`);
          consentClicked = true;
          await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
          await button.dispose();
          break;
        }
      }
      if (!consentClicked) {
        console.log("No consent button found or clicked (possibly already accepted/not present).");
      }
    } catch (e) {
      console.log("Cookie consent handling encountered an issue:", (e as Error).message);
    }

    // Find the sort button (English labels)
    const sortButtonSelectors = [
      'button[aria-label="Sort reviews"]',
      'button[aria-label*="Sort by"]',
      'button[aria-label="Most relevant"]',
      'button[data-value*="Sort"]',
      'button[jsaction*="sortReviews"]',
      'button[jsaction*="sort"]'
    ];

    let sortButton: ElementHandle<Element> | null = null;
    console.log("Attempting to find sort button...");
    for (const selector of sortButtonSelectors) {
      try {
        sortButton = await page.waitForSelector(selector, {
          timeout: 15000, 
          visible: true
        });
        if (sortButton) {
          console.log(`Sort button found with selector: ${selector}`);
          break;
        }
      } catch {}
    }

    if (sortButton) {
      console.log("Sort button found. Clicking...");
      await sortButton.click();
      await sortButton.dispose(); // Dispose of handle after use

      // Wait for the dropdown menu items to appear
      const menuItemSelector = 'div[role="menuitemradio"]';
      try {
        await page.waitForSelector(menuItemSelector, { visible: true, timeout: 10000 });
        console.log("Dropdown menu items are now visible.");
      } catch (e) {
        console.error("Dropdown menu items did not become visible in time.");
      }
      
      const newestOptionText = "Newest";
      const newestOptionHandle = await page.evaluateHandle((textToFind, selector) => {
        const menuItems = document.querySelectorAll(selector);
        for (const item of Array.from(menuItems)) {
          const text = item.textContent?.trim();
          if (text === textToFind) {
            return item;
          }
        }
        return null;
      }, newestOptionText, menuItemSelector);

      const newestElement = await newestOptionHandle.asElement();
      if (newestElement) {
        console.log(`Found '${newestOptionText}' option. Clicking...`);
        await (newestElement as ElementHandle<Element>).click();
        console.log(`Clicked on '${newestOptionText}'. Waiting for reviews to update...`);

        // Tunggu perubahan pada elemen review setelah klik
        const newReviewSelector = '.jftiEf'; // Selektor review pertama
        await page.waitForSelector(newReviewSelector, { visible: true, timeout: 30000 });

        console.log("Page updated after sorting by Newest.");
        await newestElement.dispose();
      } else {
        console.warn(`Couldn't find '${newestOptionText}' option in dropdown.`);
      }

      await newestOptionHandle.dispose(); // Dispose of handle even if element was null
    } else {
      console.warn("Sort button not found after trying all selectors.");
      await page.screenshot({ path: `debug_sort_button_not_found_${Date.now()}.png` });
    }

  } catch (error) {
    console.error("Main try block error:", error);
    if (page && !page.isClosed()) {
      const errorScreenshotPath = `debug_error_state_${Date.now()}.png`;
      try {
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(`Error screenshot saved to ${errorScreenshotPath}`);
      } catch (screenshotError) {
        console.error("Failed to take error screenshot:", screenshotError);
      }
    }
  } finally {
    if (!launchConfig.headless && browser.isConnected()) {
      console.log(
        "Script finished or error occurred. Browser will remain open for 10 seconds for inspection..."
      );
      await new Promise((resolve) => setTimeout(resolve, 10000)); // For manual inspection
    }
    if (browser.isConnected()) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed.");
    } else {
      console.log("Browser was not connected or already closed.");
    }
  }
})();
