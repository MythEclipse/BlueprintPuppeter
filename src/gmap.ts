import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";
import fs from 'fs/promises'; // For saving to JSON

// Helper function to parse Local Guide info string (to be used inside page.evaluate)
const parseLocalGuideInfoScript = `
  function parseLocalGuideInfo(infoString) {
    if (!infoString || typeof infoString !== 'string') return { isLocalGuide: false, reviewerReviewCount: null, reviewerPhotoCount: null };
    const isLocalGuide = infoString.includes('Local Guide');
    const reviewMatch = infoString.match(/(\\d+)\\s+reviews/);
    const photoMatch = infoString.match(/(\\d+)\\s+photos/);
    return {
      isLocalGuide,
      reviewerReviewCount: (reviewMatch && reviewMatch[1]) ? parseInt(reviewMatch[1], 10) : null,
      reviewerPhotoCount: (photoMatch && photoMatch[1]) ? parseInt(photoMatch[1], 10) : null,
    };
  }
`;

interface ReviewData {
  reviewId: string | null;
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
  reviewerProfileUrl: string | null;
  rating: number | null;
  ratingText: string | null;
  relativeDate: string | null;
  reviewSource: string | null;
  reviewText: string | null;
  isTruncated: boolean;
  isLocalGuide: boolean;
  reviewerReviewCount: number | null;
  reviewerPhotoCount: number | null;
  isNew: boolean;
}

interface ReviewSummary {
  averageRating: number | null;
  totalReviews: number;
  ratingBreakdown: { stars: number; count: number }[];
}

const BATCH_SAVE_SIZE = 10; // Save every 10 new reviews

(async () => {
  console.log(`Running with Node.js version: ${process.version}`);
  if (!/^v(18|20|22)\./.test(process.version)) {
    console.warn("⚠️ Recommended Node.js version is v18.x, v20.x, or v22.x LTS.");
  }

  const launchConfig = {
    headless: true, // Set to true for CI/production
    args: ["--disable-infobars", "--window-size=1366,768", "--lang=en-US,en"],
  };

  let browser: Browser | null = null;
  let page: Page | null = null;
  const allExtractedReviews: ReviewData[] = [];
  let reviewsInCurrentBatch = 0; // Counter for batch saving

  const SCROLLABLE_REVIEWS_PANEL_SELECTOR = 'div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde[tabindex="-1"]';
  const OUTPUT_FILE_PATH = 'reviews_output.json';

  try {
    console.log("🚀 Launching browser...");
    browser = await puppeteer.launch(launchConfig);
    page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.resourceType() === 'image' && !request.url().includes('gstatic.com/images/branding') && !request.url().includes('gstatic.com/travel-hotels/branding')) {
        request.abort();
      } else {
        request.continue();
      }
    });
    console.log("🖼️ Image request interception (selective) enabled.");

    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36");
    await page.setViewport({ width: 1366, height: 768 });

    const mapUrl = "https://www.google.com/maps/place/InterContinental+Bali+Resort/@-8.7796436,115.1651043,1453m/data=!3m1!1e3!4m12!3m11!1s0x2dd2448c90392e65:0xfe84ecc9e6b29627!5m3!1s2025-05-26!4m1!1i2!8m2!3d-8.7796489!4d115.1676792!9m1!1b1!16s%2Fm%2F0c40xfm?entry=ttu&hl=en";
    console.log(`🌍 Navigating to: ${mapUrl}`);
    await page.goto(mapUrl, { waitUntil: "networkidle0", timeout: 120000 });
    console.log("✅ Page loaded.");

    const consentSelectors = [
      'button[aria-label="Accept all"]', 'button[aria-label="Reject all"]',
      'form[action*="consent.google.com"] button',
      'div[role="dialog"] button:is([aria-label*="Accept"], [aria-label*="Agree"])',
      'div[role="dialog"] button',
    ];
    for (const selector of consentSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 1000, visible: true });
        if (button) {
          await button.click();
          console.log(`✅ Clicked cookie consent: ${selector}`);
          await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
          break;
        }
      } catch {}
    }

    console.log("📊 Attempting to extract review rating summary...");
    try {
      await page.waitForSelector('div.ExlQHd table tr.BHOKXe, div.jANrlb div.fontDisplayLarge', { visible: true, timeout: 15000 });
      const reviewSummaryData: ReviewSummary | null = await page.evaluate(() => {
        const summary: ReviewSummary = {
          averageRating: null,
          totalReviews: 0,
          ratingBreakdown: [],
        };
        const averageRatingEl = document.querySelector('div.PPCwl div.jANrlb div.fontDisplayLarge');
        if (averageRatingEl?.textContent) {
          summary.averageRating = parseFloat(averageRatingEl.textContent.trim());
        }
        let calculatedTotalFromBreakdown = 0;
        const ratingRows = Array.from(document.querySelectorAll('div.ExlQHd table tr.BHOKXe'));
        const ratingRegex = /(\d+)\s*stars,\s*([\d,]+)\s*reviews/i;
        for (const row of ratingRows) {
          const ariaLabel = row.getAttribute('aria-label');
          if (ariaLabel) {
            const match = ariaLabel.match(ratingRegex);
            if (match?.[1] && match?.[2]) {
              const stars = parseInt(match[1], 10);
              const count = parseInt(match[2].replace(/,/g, ''), 10);
              summary.ratingBreakdown.push({ stars, count });
              calculatedTotalFromBreakdown += count;
            }
          }
        }
        const totalReviewsTextEl = document.querySelector('div.PPCwl div.jANrlb div.fontBodySmall');
        if (totalReviewsTextEl?.textContent) {
          const totalMatch = totalReviewsTextEl.textContent.match(/([\d.,]+)\s*reviews/i);
          if (totalMatch?.[1]) {
            summary.totalReviews = parseInt(totalMatch[1].replace(/[.,]/g, ''), 10);
          }
        }
        if (summary.totalReviews === 0 && calculatedTotalFromBreakdown > 0) {
          summary.totalReviews = calculatedTotalFromBreakdown;
        } else if (summary.totalReviews === 0 && summary.ratingBreakdown.length === 0 && summary.averageRating === null) {
            return null; 
        }
        return summary;
      });

      if (reviewSummaryData) {
        console.log("📊 Review Summary Extracted:");
        console.log(JSON.stringify(reviewSummaryData, null, 2));
        const breakdownSum = reviewSummaryData.ratingBreakdown.reduce((sum, item) => sum + item.count, 0);
        if (reviewSummaryData.totalReviews > 0 && breakdownSum > 0 && reviewSummaryData.totalReviews !== breakdownSum) {
            console.warn(`⚠️ Mismatch in total reviews: text says ${reviewSummaryData.totalReviews}, breakdown sum is ${breakdownSum}.`);
        }
      } else {
        console.warn("⚠️ Review summary elements found, but no data extracted or all fields were null.");
      }
    } catch (summaryError) {
      console.warn("⚠️ Could not extract review rating summary.", summaryError instanceof Error ? summaryError.message : summaryError);
    }

    const sortSelectors = [
      'button[aria-label="Most relevant"]', 'button[aria-label="Sort reviews"]',
      'button[aria-label*="Sort by"]', 'button[jsaction*="sortReviews"]',
    ];
    let sortButton: ElementHandle<Element> | null = null;
    for (const selector of sortSelectors) {
      try {
        sortButton = await page.waitForSelector(selector, { timeout: 5000, visible: true });
        if (sortButton) {
          console.log(`✅ Found sort button: ${selector}`);
          break;
        }
      } catch {}
    }

    if (sortButton) {
      await sortButton.click();
      await sortButton.dispose();
      const menuItemSelector = 'div[role="menuitemradio"]';
      await page.waitForSelector(menuItemSelector, { visible: true, timeout: 10000 });
      const newestOptionHandle = await page.evaluateHandle(
        (text, selector) => Array.from(document.querySelectorAll(selector)).find(el => el.textContent?.trim() === text) || null,
        "Newest", menuItemSelector
      );
      const newestOption = newestOptionHandle.asElement();
      if (newestOption) {
        await (newestOption as ElementHandle<Element>).click();
        console.log("🔄 Sorted by 'Newest'. Waiting for reviews to refresh...");
        try {
          await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 });
        } catch (e){ console.warn("⚠️ Network idle timeout after sorting, proceeding."); }
        await page.waitForSelector(".jftiEf", { visible: true, timeout: 30000 }).catch(() => console.warn("Individual reviews (.jftiEf) not found after sort."));
        console.log("✅ Reviews list potentially updated after sort.");
      } else {
        console.warn("⚠️ Could not find 'Newest' option.");
      }
      if (newestOptionHandle) await newestOptionHandle.dispose();
    } else {
      console.warn("⚠️ Sort button not found. Proceeding with default sort.");
      await page.waitForSelector(".jftiEf", { visible: true, timeout: 30000 })
          .catch(() => console.warn("⚠️ Initial individual reviews (.jftiEf) not found."));
    }

    console.log(`📜 Starting to scroll and extract all reviews (saving every ${BATCH_SAVE_SIZE} new reviews)...`);
    const reviewSelector = "div.jftiEf.fontBodyMedium";
    let noNewReviewsCount = 0;
    const maxConsecutiveNoNewReviews = 3;
    const processedReviewIds = new Set<string>();
    let scrollAttempts = 0;
    const maxScrollAttempts = 100;

    await page.evaluate(parseLocalGuideInfoScript);

    while (scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;

      const newReviewsOnPage = await page.evaluate((reviewSel, helperScriptString) => {
        if (typeof (window as any).parseLocalGuideInfo !== 'function') {
            // eslint-disable-next-line no-eval
            eval(helperScriptString);
        }
        const reviewElements = Array.from(document.querySelectorAll(reviewSel));
        const extractedData: ReviewData[] = [];
        for (const el of reviewElements) {
          const reviewId = el.getAttribute('data-review-id');
          const reviewerName = el.querySelector('.d4r55')?.textContent?.trim() || null;
          const reviewerAvatarUrl = (el.querySelector('button.WEBjve img.NBa7we') as HTMLImageElement | null)?.src || null;
          const reviewerProfileUrl = (el.querySelector('button.WEBjve')?.getAttribute('data-href') || el.querySelector('button.al6Kxe')?.getAttribute('data-href')) || null;
          const ratingText = el.querySelector('.DU9Pgb span.fzvQIb')?.textContent?.trim() || null;
          let rating: number | null = null;
          if (ratingText) {
            const match = ratingText.match(/(\d+(\.\d+)?)/);
            if (match && match[1]) rating = parseFloat(match[1]);
          }
          const dateEl = el.querySelector('.DU9Pgb span.xRkPPb');
          let relativeDate: string | null = null;
          let reviewSource: string | null = 'Unknown';
          if (dateEl) {
            const sourceImgEl = dateEl.querySelector('span.qmhsmd img.ARRgmb') as HTMLImageElement | null;
            const sourceTextContainer = dateEl.querySelector('span.qmhsmd');
            if (sourceImgEl?.alt) {
                reviewSource = sourceImgEl.alt.trim();
            } else if (sourceTextContainer?.textContent) {
                reviewSource = sourceTextContainer.textContent.trim();
            }
            let fullDateText = dateEl.textContent || '';
            if (sourceTextContainer?.textContent) {
                fullDateText = fullDateText.replace(sourceTextContainer.textContent, '').trim();
            }
            relativeDate = fullDateText.replace(/\s*on\s*$/i, '').trim();
            if ((reviewSource === 'Unknown' || !reviewSource) && relativeDate && relativeDate.toLowerCase().includes(' on ')) {
                const parts = relativeDate.split(/\s+on\s+/i);
                if (parts.length > 1) {
                    relativeDate = parts[0] ? parts[0].trim() : null;
                    reviewSource = parts.slice(1).join(' on ').trim();
                }
            }
          }
          const reviewTextContentEl = el.querySelector('div.MyEned span.wiI7pd');
          const reviewText = reviewTextContentEl?.textContent?.trim() || null;
          const isTruncated = !!el.querySelector('div.MyEned button.w8nwRe, div.MyEned button.OV4Zld');
          const localGuideTextContent = el.querySelector('div.RfnDt')?.textContent?.trim();
          const lgInfo = (window as any).parseLocalGuideInfo ? 
                         (window as any).parseLocalGuideInfo(localGuideTextContent) : 
                         { isLocalGuide: false, reviewerReviewCount: null, reviewerPhotoCount: null };
          extractedData.push({
            reviewId, reviewerName, reviewerAvatarUrl, reviewerProfileUrl, rating, ratingText,
            relativeDate, reviewSource: reviewSource || 'Unknown', reviewText, isTruncated,
            isLocalGuide: lgInfo.isLocalGuide, reviewerReviewCount: lgInfo.reviewerReviewCount,
            reviewerPhotoCount: lgInfo.reviewerPhotoCount, isNew: !!el.querySelector('.DU9Pgb div.W8gobe'),
          });
        }
        return extractedData;
      }, reviewSelector, parseLocalGuideInfoScript);
      
      let actuallyAddedCount = 0;
      for (const review of newReviewsOnPage) {
        if (typeof review.reviewId === 'string' && !processedReviewIds.has(review.reviewId)) {
          allExtractedReviews.push(review);
          processedReviewIds.add(review.reviewId);
          actuallyAddedCount++;
          reviewsInCurrentBatch++; // Increment for batch saving
        }
      }

      console.log(`📜 Scroll attempt ${scrollAttempts}: Found ${newReviewsOnPage.length} on page, ${actuallyAddedCount} new. Total: ${processedReviewIds.size}. In batch: ${reviewsInCurrentBatch}`);

      // ***** BATCH SAVE LOGIC *****
      if (reviewsInCurrentBatch >= BATCH_SAVE_SIZE) {
        if (allExtractedReviews.length > 0) {
          await fs.writeFile(OUTPUT_FILE_PATH, JSON.stringify(allExtractedReviews, null, 2));
          console.log(`💾 Batch save: ${allExtractedReviews.length} total reviews saved to ${OUTPUT_FILE_PATH}. Last batch size: ${reviewsInCurrentBatch}`);
          reviewsInCurrentBatch = 0; // Reset batch counter
        }
      }

      if (actuallyAddedCount === 0) {
        noNewReviewsCount++;
        if (noNewReviewsCount >= maxConsecutiveNoNewReviews) {
          console.log(`🚫 No new reviews after ${maxConsecutiveNoNewReviews} scrolls. Assuming end of list.`);
          break;
        }
      } else {
        noNewReviewsCount = 0;
      }

      const scrollTargetExists = await page.$(SCROLLABLE_REVIEWS_PANEL_SELECTOR);
      if (scrollTargetExists) {
         await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) element.scrollTop = element.scrollHeight;
         }, SCROLLABLE_REVIEWS_PANEL_SELECTOR);
      } else {
          console.warn(`⚠️ Scroll target '${SCROLLABLE_REVIEWS_PANEL_SELECTOR}' not found. Attempting window scroll.`);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      }

      try {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      } catch (e) {
        console.warn("Timeout during scroll wait, continuing.", e);
      }
    }
    if (scrollAttempts >= maxScrollAttempts) {
        console.warn("⚠️ Reached max scroll attempts.");
    }
    
    console.log(`✅ Finished scrolling. Extracted ${allExtractedReviews.length} unique reviews in total.`);

    // ***** FINAL SAVE (for any remaining reviews not part of a full batch) *****
    if (allExtractedReviews.length > 0 && reviewsInCurrentBatch > 0) { // Only save if there are unsaved items
      await fs.writeFile(OUTPUT_FILE_PATH, JSON.stringify(allExtractedReviews, null, 2));
      console.log(`💾 Final save: ${allExtractedReviews.length} total reviews saved to ${OUTPUT_FILE_PATH}. Unsaved from last batch: ${reviewsInCurrentBatch}`);
    } else if (allExtractedReviews.length > 0 && reviewsInCurrentBatch === 0) {
        console.log(`💾 All reviews already saved in batches. Final count: ${allExtractedReviews.length}.`);
    } else if (allExtractedReviews.length === 0) {
      console.log("💾 No reviews extracted to save.");
    }


    console.log("🎉 Script completed successfully.");

  } catch (err) {
    console.error("❌ An error occurred:", err);
    if (page && !page.isClosed()) {
      const path = `error_screenshot_${Date.now()}.png`;
      try {
        await page.screenshot({ path, fullPage: true });
        console.log(`📷 Error screenshot saved: ${path}`);
      } catch (screenshotError) {
        console.error("⚠️ Failed to capture screenshot:", screenshotError);
      }
    }
  } finally {
    if (browser && browser.isConnected()) {
      if (!launchConfig.headless) {
        console.log("⏳ Leaving browser open for 10 seconds (adjust as needed)...");
        await new Promise(res => setTimeout(res, 10000));
      }
      await browser.close();
      console.log("🧹 Browser closed.");
    }
  }
})();