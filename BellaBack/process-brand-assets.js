const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const LOGO_SRC = path.join(ROOT, "BellaFLogo.png");
const ICON_SRC = path.join(ROOT, "favi.ico"); // actually a PNG, rounded dark square + rose BM monogram

const OUT_LOGO_DIR = path.join(ROOT, "BellaFront", "public", "brand");
const OUT_ICON_DIR = path.join(ROOT, "BellaFront", "public");

async function main() {
  fs.mkdirSync(OUT_LOGO_DIR, { recursive: true });
  fs.mkdirSync(OUT_ICON_DIR, { recursive: true });

  // --- Logo: remove the near-white background so it can sit on any surface ---
  // BellaFLogo.png is black+rose ink on a flat white background. Convert
  // near-white pixels to transparent via raw pixel manipulation (sharp has
  // no built-in chroma-key), keeping the black/rose ink opaque.
  const { data, info } = await sharp(LOGO_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Distance from pure white; fade alpha smoothly near the threshold so
    // anti-aliased edges don't get a hard cutout ring.
    const whiteness = Math.min(r, g, b);
    if (whiteness > 245) {
      data[i + 3] = 0;
    } else if (whiteness > 225) {
      const t = (whiteness - 225) / (245 - 225);
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }
  }
  const transparentLogo = sharp(data, { raw: { width, height, channels } });

  // Full lockup (monogram + wordmark), transparent bg, trimmed to content.
  await transparentLogo
    .clone()
    .png()
    .trim()
    .toFile(path.join(OUT_LOGO_DIR, "logo-full.png"));

  // A couple of practical raster sizes of the full lockup for <img> usage
  // at typical UI scales (retina-friendly @2x built in via the base size).
  for (const w of [240, 480, 960]) {
    await sharp(path.join(OUT_LOGO_DIR, "logo-full.png"))
      .resize({ width: w, withoutEnlargement: true })
      .png()
      .toFile(path.join(OUT_LOGO_DIR, `logo-full-${w}.png`));
  }

  console.log("Logo (transparent, trimmed) written to", OUT_LOGO_DIR);

  // --- Icon / favicon set, from the square rounded BM monogram ---
  const iconSizes = [16, 32, 48, 96, 180, 192, 512];
  for (const size of iconSizes) {
    await sharp(ICON_SRC)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(path.join(OUT_ICON_DIR, `icon-${size}.png`));
  }
  // Conventional filenames some tooling/browsers look for by name.
  fs.copyFileSync(path.join(OUT_ICON_DIR, "icon-32.png"), path.join(OUT_ICON_DIR, "favicon-32x32.png"));
  fs.copyFileSync(path.join(OUT_ICON_DIR, "icon-16.png"), path.join(OUT_ICON_DIR, "favicon-16x16.png"));
  fs.copyFileSync(path.join(OUT_ICON_DIR, "icon-180.png"), path.join(OUT_ICON_DIR, "apple-touch-icon.png"));
  fs.copyFileSync(path.join(OUT_ICON_DIR, "icon-192.png"), path.join(OUT_ICON_DIR, "icon-192-maskable.png"));

  // Also drop the app-icon crop (just the monogram, no rounded-square
  // backing) for use as a small in-app brand mark that should inherit the
  // sidebar's own already-dark background instead of carrying its own box.
  const iconMeta = await sharp(ICON_SRC).metadata();
  await sharp(ICON_SRC)
    .extract({
      left: Math.round(iconMeta.width * 0.08),
      top: Math.round(iconMeta.height * 0.08),
      width: Math.round(iconMeta.width * 0.84),
      height: Math.round(iconMeta.height * 0.84),
    })
    .png()
    .toFile(path.join(OUT_LOGO_DIR, "monogram-on-dark.png"));

  console.log("Icon/favicon set written to", OUT_ICON_DIR);

  // --- Monogram, fully background-free (no white AND no black backing) ---
  // For placement on any color surface (dark sidebar rail, light cards,
  // the blue accent, etc.) — same raw-pixel alpha technique as the logo
  // above, but keying out near-black instead of near-white.
  const monoRaw = await sharp(ICON_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: monoData, info: monoInfo } = monoRaw;
  const { width: mw, height: mh, channels: mc } = monoInfo;
  for (let i = 0; i < monoData.length; i += mc) {
    const r = monoData[i], g = monoData[i + 1], b = monoData[i + 2];
    const darkness = Math.max(r, g, b);
    if (darkness < 35) {
      monoData[i + 3] = 0;
    } else if (darkness < 60) {
      const t = (60 - darkness) / (60 - 35);
      monoData[i + 3] = Math.round(monoData[i + 3] * (1 - t));
    }
  }
  await sharp(monoData, { raw: { width: mw, height: mh, channels: mc } })
    .png()
    .trim()
    .toFile(path.join(OUT_LOGO_DIR, "monogram-transparent.png"));

  console.log("Fully transparent monogram written to", OUT_LOGO_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
