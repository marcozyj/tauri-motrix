// @ts-check
import { uni_constants } from "@tauri-motrix/unified-base";
import process from "process";

import { isWin, SIDECAR_HOST, TARGET_KEY } from "./environment.mjs";
import { createFetchOptionsFactory, log_error, log_info } from "./utils.mjs";

const { APP_RELEASE_DOWNLOAD, APP_REPOSITORY } = uni_constants;
// There is no windows arm64 version in official repository at latest.
// The official aria2 release version also is unsupported 128 threads.
// It's recommended to switch to the community repo.

const ARIA2_URL_PREFIX = APP_RELEASE_DOWNLOAD;

const ARIA2_REPO_VERSION_URL = `${APP_RELEASE_DOWNLOAD}/build-engine/aria2c_latest_version.txt`;
const ARIA2_REPO_API = APP_REPOSITORY.replace(
  "https://github.com/",
  "https://api.github.com/repos/",
);
const ARIA2_REPO_RELEASE_TAG_API_URL = `${ARIA2_REPO_API}/releases/tags`;

const ARIA2_ASSET_EXTS = [".zip", ".tgz", ".tar.gz", ".gz"];

// Try to keep it consistent with the official repository release
const ARIA2_MAP = {
  "win32-x64": "win-64bit-build1",
  "win32-arm64": "win-arm64bit-build1",
  "darwin-arm64": "osx-darwin",
  "darwin-x64": "osx-darwin",
  // TODO
  // "aarch64-unknown-linux-gnu": "aarch64-linux-android-build1",
};

// ensure aria2 task
if (!ARIA2_MAP[TARGET_KEY]) {
  throw new Error(`Unsupported platform or architecture: ${TARGET_KEY}`);
}

/**
 *  Get the latest tag by GitHub api
 */
export async function getLatestAria2Tag() {
  const options = createFetchOptionsFactory();

  try {
    // const tagListRes = await fetch(ARIA2_REPO_TAG_API_URL, {
    //   ...options,
    //   method: "GET",
    //   headers: {
    //     Accept: "application/vnd.github+json",
    //   },
    // }).then((res) => res.json());

    const latestTag = await fetch(ARIA2_REPO_VERSION_URL, {
      ...options,
      method: "GET",
    }).then((res) => res.text());
    const tag = latestTag.trim();

    log_info(`Latest release tag: ${tag}`);

    return tag;
  } catch (err) {
    log_error("Error fetching latest tag:", err.message);
    process.exit(1);
  }
}

async function getReleaseAssetsByTag(tag) {
  const options = createFetchOptionsFactory();
  const response = await fetch(`${ARIA2_REPO_RELEASE_TAG_API_URL}/${tag}`, {
    ...options,
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "tauri-motrix",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub release lookup failed (${response.status} ${response.statusText})`,
    );
  }

  const data = await response.json();
  return Array.isArray(data.assets) ? data.assets : [];
}

function pickReleaseAsset(assets, nameKey) {
  const archives = assets.filter(
    (asset) =>
      typeof asset?.name === "string" &&
      typeof asset?.browser_download_url === "string" &&
      ARIA2_ASSET_EXTS.some((ext) => asset.name.endsWith(ext)),
  );

  const candidates = archives.filter((asset) => asset.name.includes(nameKey));
  if (!candidates.length) return null;

  for (const ext of ARIA2_ASSET_EXTS) {
    const match = candidates.find((asset) => asset.name.endsWith(ext));
    if (match) return match;
  }

  return candidates[0] ?? null;
}

export async function getAria2BinInfo(latestTag) {
  const fallback = createAria2BinInfo(latestTag);
  const nameKey = ARIA2_MAP[TARGET_KEY];

  try {
    const assets = await getReleaseAssetsByTag(latestTag);
    const asset = pickReleaseAsset(assets, nameKey);
    if (!asset) {
      log_error(
        `No matching aria2 asset found for "${nameKey}". Available: ${assets
          .map((item) => item?.name)
          .filter(Boolean)
          .join(", ")}`,
      );
      return fallback;
    }

    return createAria2BinInfoFromAsset(asset);
  } catch (err) {
    log_error("Error fetching release assets:", err.message);
    return fallback;
  }
}

/**
 *
 * @param {string} latestTag
 * @returns
 */
export function createAria2BinInfo(latestTag) {
  const name = ARIA2_MAP[TARGET_KEY];

  const urlExt = "zip";
  const tagCompositions = latestTag.split("-");
  // assume the version is the last part of the tag
  // aria2c-release-1.xx.x
  const version = tagCompositions[tagCompositions.length - 1];

  const downloadName = `aria2-${version}-${name}`;

  const downloadURL = `${ARIA2_URL_PREFIX}/${latestTag}/${downloadName}.${urlExt}`;

  const exeFile = `aria2c${isWin ? ".exe" : ""}`;
  const zipFile = `${downloadName}.${urlExt}`;

  return {
    name: "aria2c",
    targetFile: `aria2c-${SIDECAR_HOST}${isWin ? ".exe" : ""}`,
    exeFile,
    zipFile,
    downloadURL,
  };
}

/**
 * @param {{ name: string, browser_download_url: string }} asset
 */
export function createAria2BinInfoFromAsset(asset) {
  const exeFile = `aria2c${isWin ? ".exe" : ""}`;

  return {
    name: "aria2c",
    targetFile: `aria2c-${SIDECAR_HOST}${isWin ? ".exe" : ""}`,
    exeFile,
    zipFile: asset.name,
    downloadURL: asset.browser_download_url,
  };
}
