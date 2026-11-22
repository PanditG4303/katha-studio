import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const baseDir = path.join(root, ".testdata", "e2e");
const dataDir = path.join(baseDir, "data");
const workspaceDir = path.join(baseDir, "workspace");
const screensDir = path.join(root, "test-results", "screens");

const ffmpeg = path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const ffprobe = path.join(root, "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");
const sampleVideo = path.join(root, "test-results", "fixtures", "sample.mp4");

let app: ElectronApplication;
let page: Page;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];

test.describe.configure({ mode: "serial" });

async function waitForMainWindow(application: ElectronApplication): Promise<Page> {
  for (let index = 0; index < 120; index += 1) {
    const windows = application.windows();
    const main = windows.find((window) => {
      const url = window.url();
      return url.startsWith("file:") || url.startsWith("http://localhost");
    });
    if (main) return main;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The main window did not appear. Open windows: ${application.windows().map((w) => w.url()).join(", ")}`);
}

async function screenshot(target: Page, name: string) {
  fs.mkdirSync(screensDir, { recursive: true });
  await target.screenshot({ path: path.join(screensDir, `${name}.png`), fullPage: false });
}

async function navigate(target: Page, linkName: string, heading: string) {
  await target.getByRole("link", { name: linkName, exact: true }).click();
  await expect(target.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(path.dirname(sampleVideo), { recursive: true });
  if (!fs.existsSync(sampleVideo)) {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    execFileSync(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=640x360:rate=24:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      sampleVideo,
    ]);
  }

  app = await electron.launch({
    args: [root],
    cwd: root,
    env: {
      ...process.env,
      KATHA_DATA_DIR: dataDir,
      KATHA_WORKSPACE_DIR: workspaceDir,
      KATHA_TESTING: "1",
      KATHA_DISABLE_WATCHER: "1",
      KATHA_FFMPEG_PATH: ffmpeg,
      KATHA_FFPROBE_PATH: ffprobe,
    },
  });
  await app.firstWindow();
  page = await waitForMainWindow(app);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await expect(page.getByRole("heading", { name: "Your stories, taking shape." })).toBeVisible({ timeout: 60_000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test("creates a channel and prepares its permanent animation project", async () => {
  await navigate(page, "My Channels", "My Channels");
  await page.getByRole("button", { name: "New channel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a channel" })).toBeVisible();

  await page.getByPlaceholder("e.g. The Lantern Library").fill("E2E Story Channel");
  await page
    .getByPlaceholder("A warm, cinematic channel retelling Indian folk tales for young adults.")
    .fill("A warm channel about small folk tales, tested end to end.");
  await page
    .getByPlaceholder("Painterly 2D animation, muted earth palette, soft paper texture, slow cinematic camera moves.")
    .fill("Warm gouache animation, paper texture, slow camera moves.");
  await page.getByRole("button", { name: "Create channel", exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "E2E Story Channel" })).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByText("ANIMATION_PROJECT").first()).toBeVisible();
  await screenshot(page, "02-channel-drawer");
  await drawer.locator('button[aria-label="Close"]').click();
});

test("generates demo ideas and writes the script", async () => {
  await navigate(page, "Create Content", "Create Content");
  await page
    .getByPlaceholder(/A cinematic retelling of a little-known Indian folk tale/)
    .fill("A lantern keeper guides lost travellers through a foggy mountain pass.");
  await page.getByRole("switch", { name: "Demo mode" }).click();
  await page.getByRole("button", { name: "Develop content ideas", exact: true }).click();

  await expect(page.getByText("Demo content", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Choose what to develop")).toBeVisible({ timeout: 90_000 });
  await screenshot(page, "03-ideas");

  await page.getByRole("button", { name: "Write scripts", exact: true }).click();
  await page.waitForURL(/\/scripts\?project=\d+/, { timeout: 150_000 });
  await expect(page.getByRole("heading", { name: "Story & Script Studio", exact: true })).toBeVisible();
  await expect(page.getByText(/SCENE 01|Scene 1|Part 1/i).first()).toBeVisible({ timeout: 60_000 });
  await screenshot(page, "04-script-studio");
});

test("opens every studio section without a render error", async () => {
  await navigate(page, "Overview", "Your stories, taking shape.");
  await screenshot(page, "05-overview");

  await navigate(page, "Voice & Music Lab", "Voice & Music Lab");
  await screenshot(page, "06-voice");

  await navigate(page, "Claude Animation", "Claude Animation Studio");
  await screenshot(page, "07-animation");

  await navigate(page, "Video Library", "Video Library");
  await screenshot(page, "08-video-library");

  await navigate(page, "Publishing Manager", "Publishing Manager");
  await screenshot(page, "09-publishing");

  await navigate(page, "Content Calendar", "Content Calendar");
  await screenshot(page, "10-calendar");

  await navigate(page, "Connections & Settings", "Connections & Settings");
  await screenshot(page, "11-settings");
});

test("imports a validated film from the channel output folder", async () => {
  // The channel output folder follows the documented workspace layout.
  const outputDir = path.join(workspaceDir, "Outputs", "e2e-story-channel");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sampleVideo, path.join(outputDir, "e2e-finished-film.mp4"));

  await navigate(page, "Video Library", "Video Library");
  // The watcher only imports files that have stopped changing, and needs to
  // observe a file in two consecutive scans. This mirrors real behaviour.
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Scan folders", exact: true }).click();
  await page.waitForTimeout(9000);
  await page.getByRole("button", { name: "Scan folders", exact: true }).click();
  await expect(page.getByText("e2e finished film", { exact: false }).first()).toBeVisible({ timeout: 90_000 });
  await screenshot(page, "12-video-imported");

  await page.getByRole("button", { name: "Open video", exact: true }).first().click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("File size", { exact: true })).toBeVisible();
  await screenshot(page, "13-video-detail");
  await detail.locator('button[aria-label="Close"]').click();
});

test("plans an Instagram post and shows it on the calendar", async () => {
  await navigate(page, "Publishing Manager", "Publishing Manager");
  await page.getByRole("button", { name: /^Instagram/ }).click();
  await page.getByRole("button", { name: "Prepare post", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Prepare an Instagram post" })).toBeVisible();
  await dialog.locator("select").first().selectOption({ index: 1 });
  await dialog.locator("textarea").fill("A quiet story for the evening.");
  const planned = new Date(Date.now() + 2 * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const plannedLocal = `${planned.getFullYear()}-${pad(planned.getMonth() + 1)}-${pad(planned.getDate())}T18:00`;
  await dialog.locator('input[type="datetime-local"]').fill(plannedLocal);
  await dialog.getByRole("button", { name: "Prepare post", exact: true }).click();
  await expect(page.getByText("A quiet story for the evening.", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await screenshot(page, "14-instagram");

  await navigate(page, "Content Calendar", "Content Calendar");
  await expect(page.getByText("Instagram manual").first()).toBeVisible();
  await expect(page.getByText("e2e finished film", { exact: false }).first()).toBeVisible();
  await screenshot(page, "15-calendar-filled");
});

test("renders settings diagnostics and keeps the console clean", async () => {
  await navigate(page, "Connections & Settings", "Connections & Settings");
  await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
  await expect(page.getByText("Health checks", { exact: true })).toBeVisible();
  await screenshot(page, "16-diagnostics");

  expect(pageErrors, `Page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
