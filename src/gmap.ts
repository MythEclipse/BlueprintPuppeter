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
      "--window-size=1366,768", // Set window size early
      "--lang=en-US,en", // Force English
    ],
  };

  console.log("Launching browser...");
  const browser: Browser = await puppeteer.launch(launchConfig);
  const page: Page = await browser.newPage();
  console.log("Browser launched.");

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9", // Reinforce English preference
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  try {
    const mapUrl =
      "https://www.google.com/maps/place/InterContinental+Bali+Resort/@-8.7796436,115.1651043,1453m/data=!3m1!1e3!4m12!3m11!1s0x2dd2448c90392e65:0xfe84ecc9e6b29627!5m3!1s2025-05-26!4m1!1i2!8m2!3d-8.7796489!4d115.1676792!9m1!1b1!16s%2Fm%2F0c40xfm?entry=ttu&hl=en";
    console.log(`Navigating to: ${mapUrl}`);
    await page.goto(mapUrl, {
      waitUntil: "networkidle0",
      timeout: 120 * 1000,
    }); // 2 minutes
    console.log("Page loaded.");

    // Handle cookie consent (if it appears)
    // You mentioned "tidak ada cookie consent", so this might be skipped.
    // The current logic handles this well by trying selectors and moving on if none are found.
    try {
      const consentButtonSelectors = [
        'button[aria-label="Accept all"]',
        'button[aria-label="Reject all"]',
        'form[action*="consent.google.com"] button', // General form button
        'div[role="dialog"] button:is([aria-label*="Accept"], [aria-label*="Agree"])', // Dialog specific
        'div[role="dialog"] button', // Any button in a dialog as a last resort
      ];

      let consentClicked = false;
      console.log("Checking for cookie consent dialog...");
      for (const selector of consentButtonSelectors) {
        try {
          const button = await page.waitForSelector(selector, {
            timeout: 1000, // Shorter timeout for each individual selector try
            visible: true,
          });
          if (button) {
            console.log(
              `Attempting to click consent button with selector: ${selector}`
            );
            await button.click();
            console.log("Clicked consent button.");
            consentClicked = true;
            // Wait for potential navigation or page update after consent
            await page
              .waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 })
              .catch(() => {
                console.log(
                  "No navigation after consent click, or it timed out. Continuing."
                );
              });
            await button.dispose();
            break; // Exit loop once a button is clicked
          }
        } catch (e) {
          // console.log(`Consent selector "${selector}" not found or timed out.`);
        }
      }
      if (!consentClicked) {
        console.log(
          "No applicable cookie consent button found or clicked (possibly already accepted/not present, or using a new selector)."
        );
      }
    } catch (e) {
      console.warn(
        "Cookie consent handling encountered an issue or was skipped:",
        (e as Error).message
      );
    }

    // Wait a bit for the page to fully render reviews section if necessary
    // This might be needed if the reviews load asynchronously after the main page load
    // console.log("Waiting a few seconds for dynamic content to potentially load...");
    // await page.waitForTimeout(3000); // Use sparingly, prefer explicit waits

    // Find the sort button (initial state: "Most relevant")
    // Based on your HTML: 'button[aria-label="Most relevant"]' is the primary target
    const sortButtonSelectors = [
      'button[aria-label="Most relevant"]', // Primary target from your HTML
      'button[aria-label="Sort reviews"]',
      'button[aria-label*="Sort by"]',
      'button[data-value*="Sort"]',
      'button[jsaction*="sortReviews"]',
      'button[jsaction*="sort"]',
      // A more generic one if specific labels change
      'button[id*="sort-"], button[data-value*="Sort"]',
    ];

    let sortButton: ElementHandle<Element> | null = null;
    console.log("Attempting to find the sort button (e.g., 'Most relevant')...");
    for (const selector of sortButtonSelectors) {
      try {
        // It's good practice to ensure the element is not only present but also visible and interactable.
        // Sometimes an element can be in the DOM but obscured or disabled.
        // For this button, being visible should be enough.
        sortButton = await page.waitForSelector(selector, {
          timeout: 10000, // Max 10s for each selector
          visible: true,
        });
        if (sortButton) {
          console.log(`Sort button found with selector: ${selector}`);
          break;
        }
      } catch (err) {
        // console.log(`Sort button selector "${selector}" not found.`);
      }
    }

    if (sortButton) {
      console.log("Sort button found. Clicking to open sort options...");
      await sortButton.click();
      // No need to dispose here yet if we need to check its state later,
      // but since we're done with this specific handle for clicking, it's fine.
      await sortButton.dispose();

      // Wait for the dropdown menu items to appear
      // Based on your HTML: 'div[role="menuitemradio"]' is the container for options
      const menuItemSelector = 'div[role="menuitemradio"]';
      try {
        await page.waitForSelector(menuItemSelector, {
          visible: true,
          timeout: 10000,
        });
        console.log("Sort options dropdown menu items are now visible.");
      } catch (e) {
        console.error(
          "Sort options dropdown menu items did not become visible in time."
        );
        throw e; // Re-throw to be caught by the main try-catch
      }

      const newestOptionText = "Newest";
      console.log(`Attempting to find and click the '${newestOptionText}' option...`);

      // Using page.evaluateHandle to find the element by text content.
      // This is robust as class names can change.
      const newestOptionHandle = await page.evaluateHandle(
        (text, itemSelector) => {
          const menuItems = document.querySelectorAll(itemSelector);
          for (const item of Array.from(menuItems)) {
            // Check text content, including children, and trim whitespace
            if (item.textContent?.trim() === text) {
              return item; // Return the DOM element
            }
          }
          return null; // Return null if not found
        },
        newestOptionText,
        menuItemSelector
      );

      const newestElement = newestOptionHandle
        ? await newestOptionHandle.asElement()
        : null;

      if (newestElement) {
        console.log(`Found '${newestOptionText}' option. Clicking...`);
        // Before clicking, ensure it's clickable (e.g., not disabled, visible)
        // await newestElement.waitForSelector('&:not([disabled])', { visible: true }); // More advanced check
        await (newestElement as ElementHandle<HTMLElement>).click(); // Cast to HTMLElement for click
        console.log(
          `Clicked on '${newestOptionText}'. Waiting for reviews to update...`
        );

        // Wait for some indication that the reviews have re-sorted.
        // This could be waiting for a spinner to disappear, or for a known element
        // in the first review to change or appear.
        // The selector '.jftiEf' is for review items. Waiting for it to be present
        // might not be enough if it was already present.
        // A more robust way would be to:
        // 1. Get the text of the first review *before* sorting.
        // 2. Wait for the text of the first review to *change* after sorting.
        // For simplicity, we'll use your existing wait, assuming new content loads.
        // It's better to wait for a specific change or a loading indicator to disappear.
        try {
          // Example: Wait for a network idle state after click, indicating data has loaded
          await page.waitForNetworkIdle({ timeout: 20000, idleTime: 500 });
          console.log("Network is idle, reviews likely updated.");
        } catch(networkIdleError) {
            console.warn("Network did not become idle after sorting, might still be loading or sort failed to trigger significant network activity. Will proceed with selector wait.");
        }
        
        // Then, ensure the review list is still visible/re-rendered.
        const reviewContentSelector = ".jftiEf"; // A class often associated with review entries
        try {
            await page.waitForSelector(reviewContentSelector, { visible: true, timeout: 30000 });
            console.log("Review content area is visible after sorting by Newest.");
        } catch (reviewWaitError) {
            console.warn(`Could not find selector '${reviewContentSelector}' after sorting. Review list might not have updated as expected.`);
            await page.screenshot({ path: `debug_reviews_not_updated_${Date.now()}.png` });
        }

        await newestElement.dispose();
      } else {
        console.warn(
          `Couldn't find '${newestOptionText}' option in dropdown.`
        );
        await page.screenshot({
          path: `debug_newest_option_not_found_${Date.now()}.png`,
        });
      }
      await newestOptionHandle.dispose(); // Dispose handle in either case
    } else {
      console.warn(
        "Sort button (e.g., 'Most relevant') not found after trying all selectors."
      );
      await page.screenshot({
        path: `debug_sort_button_not_found_${Date.now()}.png`,
      });
    }

    console.log("Script operations completed successfully.");

  } catch (error) {
    console.error("An error occurred in the main script:", error);
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
    if (!launchConfig.headless && browser && browser.isConnected()) {
      console.log(
        "Script finished or error occurred. Browser will remain open for 20 seconds for inspection..."
      );
      await new Promise((resolve) => setTimeout(resolve, 20000)); // Increased for inspection
    }
    if (browser && browser.isConnected()) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed.");
    } else {
      console.log("Browser was not connected or already closed.");
    }
  }
})();