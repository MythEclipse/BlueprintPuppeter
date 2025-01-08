"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const path_1 = __importDefault(require("path"));
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Starting the test function");
        const browser = yield puppeteer_1.default.launch({
            headless: false,
            args: []
        });
        const page = yield browser.newPage();
        yield page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36");
        yield page.setExtraHTTPHeaders({
            "accept-language": "en-US,en;q=0.9"
        });
        console.log("Connected to the browser");
        yield page.goto("https://www.freeconvert.com/video-compressor", {
            waitUntil: "load"
        });
        console.log("Navigated to the video compressor page");
        const filePath = path_1.default.resolve("./video.mp4");
        console.log(`File path resolved: ${filePath}`);
        const inputUploadHandle = yield page.$("#file");
        if (inputUploadHandle) {
            yield inputUploadHandle.uploadFile(filePath);
            console.log("File uploaded");
        }
        else {
            console.error("File input element not found");
            yield browser.close();
            return;
        }
        yield page.waitForSelector('select[name="compress_video"]');
        console.log("Dropdown for compress video is available");
        yield page.select('select[name="compress_video"]', "602a9f6c86eb7a0023f187be");
        console.log("Selected 'Target a file size (MB)' option");
        yield page.waitForSelector('select[name="video_codec_compress"]');
        console.log("Dropdown for video codec is available");
        yield page.select('select[name="video_codec_compress"]', "602a9df886eb7a0023f187b9");
        console.log("Selected 'H265' option");
        yield page.waitForSelector('input[name="video_compress_max_filesize"]');
        console.log("Input field for max file size is available");
        yield page.type('input[name="video_compress_max_filesize"]', "10");
        console.log("Set max file size to 10");
        yield page.waitForSelector("button.download-action__button");
        console.log("Apply to All Files button is available");
        yield page.click("button.download-action__button");
        console.log("Clicked 'Apply to All Files' button");
        yield browser.close();
        console.log("Browser closed");
    });
}
test().catch((error) => {
    console.error("Error in test function:", error);
});
//# sourceMappingURL=index.js.map