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
    headless: false,
    args: [
      "--disable-infobars",
      "--lang=en-US,en" // Attempt to force English
    ]
  };

  console.log("Launching browser...");
  const browser: Browser = await puppeteer.launch(launchConfig);
  const page: Page = await browser.newPage();
  console.log("Browser launched.");

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9' // Further attempt for English
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  try {
    console.log("Navigating to Google Maps...");
    await page.goto(
      "https://www.google.com/maps/place/InterContinental+Bali+Resort/@-8.7796436,115.1651043,1453m/data=!3m1!1e3!4m12!3m11!1s0x2dd2448c90392e65:0xfe84ecc9e6b29627!5m3!1s2025-05-26!4m1!1i2!8m2!3d-8.7796489!4d115.1676792!9m1!1b1!16s%2Fm%2F0c40xfm?entry=ttu&hl=en",
      { waitUntil: "networkidle0", timeout: 2 * 60 * 1000 }
    );
    console.log("Page loaded.");

    // Simplified cookie consent (often a large button at the bottom or a dialog)
    // This is a common pattern for Google's consent forms.
    // Note: The exact selector can change. Check with DevTools if it fails.
    try {
      const consentButtonSelectors = [
        'button[aria-label="Accept all"]', // English
        'button[aria-label="Setuju semua"]', // Indonesian
        'button div[role="presentation"]', // Sometimes a generic button
        'form[action*="consent.google.com"] button', // General form button
        // A more generic selector for a button within a dialog that might contain "Accept" or "Agree"
        'div[role="dialog"] button:is([aria-label*="Accept"], [aria-label*="Agree"], [aria-label*="Setuju"])',
        // Or a button whose text content matches
        'div[role="dialog"] button'
      ];
      
      let consentClicked = false;
      for (const selector of consentButtonSelectors) {
        const button = await page.waitForSelector(selector, { timeout: 5000, visible: true }).catch(() => null);
        if (button) {
          // For the last generic selector, check text content if needed
          if (selector === 'div[role="dialog"] button') {
            const text = await button.evaluate(el => el.textContent?.trim().toLowerCase());
            if (text && (text.includes('accept') || text.includes('agree') || text.includes('setuju'))) {
                // continue
            } else {
                console.log(`Skipping generic button with text: "${text}"`);
                continue; // Not the right button
            }
          }
          await button.click();
          console.log(`Clicked consent button with selector: ${selector}`);
          consentClicked = true;
          await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => console.log("No navigation after consent, or timeout."));
          break;
        }
      }
      if (!consentClicked) {
        console.log("No consent button found or clicked (might be already accepted or not present).");
      }
    } catch (e) {
      console.log("Cookie consent clicking failed or not needed:", (e as Error).message);
    }


    // Find the sort button
    const sortButtonSelectors = [
      'button[aria-label="Sort reviews"]', // More specific for reviews
      'button[aria-label*="Sort by"]', // Catches "Sort by" and "Sort by Relevance" etc.
      'button[aria-label="Most relevant"]',
      'button[aria-label="Urutkan ulasan"]', // Indonesian
      // A more generic approach if specific labels fail
      'button[data-value*="Sort"]', // Often there's a data-value
      'button[jsaction*="sort"]'   // Or a jsaction
    ];

    let sortButton: ElementHandle<Element> | null = null;
    console.log("Attempting to find sort button...");
    for (const selector of sortButtonSelectors) {
      try {
        // Wait a bit longer, make sure it's visible and interactable
        sortButton = await page.waitForSelector(selector, {
          timeout: 15000, // Increased timeout
          visible: true
        });
        if (sortButton) {
          console.log(`Sort button found with selector: ${selector}`);
          break;
        }
      } catch {
        console.log(`Sort button not found with selector: ${selector}`);
      }
    }

    if (sortButton) {
      console.log("Sort button found. Clicking...");
      await sortButton.click();

      // IMPORTANT: Wait for the dropdown menu to appear and items to be ready
      // The selector for menu items is 'div[role="menuitemradio"]'
      try {
        await page.waitForSelector('div[role="menuitemradio"]', { visible: true, timeout: 10000 });
        console.log("Dropdown menu items are now visible.");
      } catch (e) {
        console.error("Dropdown menu items did not become visible in time.");
        throw e; // Rethrow or handle as critical failure
      }
      
      // Look for "Newest" option
      // The URL has hl=en, so "Newest" should be reliable. If not, add other languages.
      const newestOptionTexts = ["Newest", "Terbaru"]; // English, Indonesian

      const newestOptionHandle = await page.evaluateHandle((textsToFind) => {
        const menuItems = document.querySelectorAll('div[role="menuitemradio"]');
        for (const item of Array.from(menuItems)) {
          const text = item.textContent?.trim();
          if (text && textsToFind.includes(text)) {
            return item; // Return the DOM element
          }
        }
        return null; // Explicitly return null if not found
      }, newestOptionTexts); // Pass textsToFind as an argument

      // Check if the handle actually points to an element
      if (await newestOptionHandle.asElement()) {
        console.log("Found 'Newest' (or equivalent) option. Clicking...");
        // We can click the ElementHandle directly
        await (newestOptionHandle as ElementHandle<Element>).click();
        console.log("Clicked on 'Newest'. Waiting for page to update...");
        // Wait for network activity to cease, indicating content has likely loaded
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });
        console.log("Page updated after sorting by Newest.");
      } else {
        console.warn("Couldn't find 'Newest' (or equivalent) option in dropdown. Dumping available options:");
        // For debugging: log available options
        const availableOptions = await page.evaluate(() => {
            const menuItems = document.querySelectorAll('div[role="menuitemradio"]');
            return Array.from(menuItems).map(item => item.textContent?.trim());
        });
        console.log("Available sort options:", availableOptions);
      }
      await newestOptionHandle.dispose(); // Clean up the handle

    } else {
      console.warn("Sort button not found after trying all selectors.");
      // For debugging: Take a screenshot if the sort button isn't found
      const screenshotPath = `debug_sort_button_not_found_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved to ${screenshotPath}`);
    }

  } catch (error) {
    console.error("Main try block error:", error);
    const errorScreenshotPath = `debug_error_${Date.now()}.png`;
    try {
      await page.screenshot({ path: errorScreenshotPath, fullPage: true });
      console.log(`Error screenshot saved to ${errorScreenshotPath}`);
    } catch (screenshotError) {
      console.error("Failed to take error screenshot:", screenshotError);
    }
  } finally {
    if (!launchConfig.headless && browser.isConnected()) {
      console.log(
        "Script finished or error occurred. Browser will remain open for 10 seconds for inspection..."
      );
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Longer for manual inspection
    }
    if (browser.isConnected()) {
      // console.log("Closing browser...");
      // await browser.close();
      // console.log("Browser closed.");
    } else {
      console.log("Browser was not connected or already closed.");
    }
  }
})();