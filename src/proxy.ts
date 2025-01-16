import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await Promise.all([
    await page.goto('https://www.croxyproxy.com/'),
    await page.waitForNetworkIdle() // Tunggu jaringan stabil
    ]);
    // Ketik URL dan kirimkan form
    await page.type('#url', 'https://otakudesu.cloud');
    await Promise.all([
        page.click('#requestSubmit'), // Klik tombol kirim
        page.waitForNavigation({ waitUntil: 'networkidle2' }), // Tunggu navigasi selesai
        // page.waitForFrame('#__cpsHeader')
    ]);
    // Tunggu sampai elemen dengan judul "Proxy is launching..." hilang
    // await page.waitForFunction(
    //     () => !document.querySelector('title')?.innerText.includes('Proxy is launching...')
    // );
    // Tunggu sampai semua elemen gambar telah berhasil terload
    await page.waitForSelector('img', { visible: true, timeout: 60000 });
    await page.evaluate(() => {
        const images = Array.from(document.images);
        return Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = img.onerror = resolve;
            });
        }));
    });
    // Ambil screenshot
    await page.screenshot({ path: 'screenshot.png' });

    // Ambil konten halaman
    const html = await page.content();
    console.log(html);

    // Tutup browser
    await browser.close();
})();
