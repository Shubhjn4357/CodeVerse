import { chromium, Browser, BrowserContext, Page } from "playwright";

class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 800 },
                userAgent:
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CodeVerseAgent/1.0",
            });
            this.page = await this.context.newPage();
        }
    }

    async navigate(url: string) {
        await this.init();
        await this.page!.goto(url, { waitUntil: "domcontentloaded" });
        return this.page!.url();
    }

    async click(selector: string) {
        await this.page!.click(selector);
    }

    async type(selector: string, text: string) {
        await this.page!.fill(selector, text);
    }

    async getSnapshot() {
        await this.init();

        // Use aria snapshot (Playwright v1.47+) instead of deprecated accessibility API
        const ariaSnapshot = await this.page!.locator("body").ariaSnapshot();
        const screenshot = await this.page!.screenshot({
            type: "jpeg",
            quality: 60,
        });

        return {
            url: this.page!.url(),
            title: await this.page!.title(),
            domSnapshot: ariaSnapshot,
            screenshotBase64: screenshot.toString("base64"),
        };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}

export const browserManager = new BrowserManager();
