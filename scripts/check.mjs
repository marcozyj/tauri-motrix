// @ts-check
import AdmZip from "adm-zip";
import { execSync } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { extract } from "tar";
import zlib from "zlib";

import { getAria2BinInfo, getLatestAria2Tag } from "./aria2_helper.mjs";
import { arch, cwd, isMac, isWin, TEMP_DIR } from "./environment.mjs";
import {
  baseExecutableMove,
  baseExecutableCopy,
  baseMove,
  downloadFile,
  log_debug,
  log_error,
  log_info,
  log_success,
  pullUpOnlySubDirectory,
} from "./utils.mjs";

async function readFileHeader(filePath, length = 4) {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

function isZipHeader(buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isGzipHeader(buffer) {
  return buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function isMacX64() {
  return isMac && arch === "x64";
}

function getFileInfo(filePath) {
  try {
    return execSync(`file "${filePath}"`).toString();
  } catch {
    return "";
  }
}

function findSystemAria2c() {
  try {
    const resolved = execSync("command -v aria2c").toString().trim();
    return resolved.length ? resolved : "";
  } catch {
    return "";
  }
}

async function ensureMacX64Binary(sidecarPath) {
  if (!isMacX64()) return;

  const info = getFileInfo(sidecarPath);
  if (info.includes("x86_64")) {
    return;
  }

  const systemAria2c = findSystemAria2c();
  if (!systemAria2c) {
    throw new Error(
      `Missing x86_64 aria2c on macOS. Install one (e.g. "brew install aria2") and re-run check.`,
    );
  }

  log_info(
    `macOS x64 detected. Replacing sidecar with system aria2c at ${systemAria2c}`,
  );
  await baseExecutableCopy(systemAria2c, sidecarPath);
}

async function assertArchiveHeader(filePath, zipFile, downloadURL) {
  const header = await readFileHeader(filePath, 4);
  if (zipFile.endsWith(".zip")) {
    if (!isZipHeader(header)) {
      throw new Error(
        `Downloaded file is not a zip: ${downloadURL} (header ${header.toString("hex")})`,
      );
    }
  } else if (zipFile.endsWith(".tgz") || zipFile.endsWith(".gz")) {
    if (!isGzipHeader(header)) {
      throw new Error(
        `Downloaded file is not a gzip archive: ${downloadURL} (header ${header.toString("hex")})`,
      );
    }
  }
}

async function resolveSidecar(binInfo) {
  const { name, targetFile, zipFile, exeFile, downloadURL } = binInfo;

  const sidecarDir = path.join(cwd, "src-tauri", "sidecar");
  const sidecarPath = path.join(sidecarDir, targetFile);

  await fsp.mkdir(sidecarDir, { recursive: true });

  const tempDir = path.join(TEMP_DIR, name);
  const tempZip = path.join(tempDir, zipFile);
  const tempExe = path.join(tempDir, exeFile);

  await fsp.mkdir(tempDir, { recursive: true });
  try {
    if (!fs.existsSync(tempZip)) {
      await downloadFile(downloadURL, tempZip);
    }
    await assertArchiveHeader(tempZip, zipFile, downloadURL);

    if (zipFile.endsWith(".zip")) {
      // sometimes occur type error in new AdmZip() or AdmZip();
      const zip = new AdmZip(tempZip);
      zip.getEntries().forEach((entry) => {
        log_debug(`"${name}" entry name`, entry.entryName);
      });
      zip.extractAllTo(tempDir, true);

      await fsp.rm(tempZip);
      await pullUpOnlySubDirectory(tempDir);

      if (isWin) {
        await baseMove(tempExe, sidecarPath);
      } else {
        await baseExecutableMove(tempExe, sidecarPath);
      }
      await ensureMacX64Binary(sidecarPath);

      log_success(`unzip finished: "${name}"`);
    } else if (zipFile.endsWith(".tgz")) {
      // tgz
      await fsp.mkdir(tempDir, { recursive: true });
      await extract({
        cwd: tempDir,
        file: tempZip,
      });
      const files = await fsp.readdir(tempDir);
      log_debug(`"${name}" files in tempDir:`, files);
      const extractedFile = files.find((item) => item.startsWith("aria2c"));
      if (extractedFile) {
        const extractedFilePath = path.join(tempDir, extractedFile);
        await baseExecutableMove(extractedFilePath, sidecarPath);
        await ensureMacX64Binary(sidecarPath);
      } else {
        throw new Error(`Expected file not found in ${tempDir}`);
      }
    } else {
      // gz
      const readStream = fs.createReadStream(tempZip);
      const writeStream = fs.createWriteStream(sidecarPath);
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          log_error(`"${name}" gz failed:`, error.message);
          reject(error);
        };
        readStream
          .pipe(zlib.createGunzip().on("error", onError))
          .pipe(writeStream)
          .on("finish", () => {
            execSync(`chmod 755 ${sidecarPath}`);
            log_success(`chmod binary finished: "${name}"`);
            resolve(1);
          })
          .on("error", onError);
      });
      await ensureMacX64Binary(sidecarPath);
    }
  } catch (err) {
    // Need to delete the file
    await fsp.rm(sidecarPath, { recursive: true, force: true });
    throw err;
  } finally {
    // delete temp dir
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}
/**
 * Download aria2 from Github Release page and save to sidecar
 */

async function resolveAria2() {
  const latestTag = await getLatestAria2Tag();

  const binInfo = await getAria2BinInfo(latestTag);

  await resolveSidecar(binInfo);
}

/**
 * Ensure locales file to Rust process using.
 */
async function resolveLocales() {
  const srcLocalesDir = path.join(cwd, "src/locales");
  const targetLocalesDir = path.join(cwd, "src-tauri/resources/locales");

  try {
    // ensure locales dir exists
    await fsp.mkdir(targetLocalesDir, { recursive: true });

    const files = await fsp.readdir(srcLocalesDir);

    // copy all locale files
    for (const file of files) {
      const srcPath = path.join(srcLocalesDir, file);
      const targetPath = path.join(targetLocalesDir, file);

      await fsp.copyFile(srcPath, targetPath);
      log_success(`Copied locale file: ${file}`);
    }

    log_success("All locale files copied successfully");
  } catch (err) {
    log_error("Error copying locale files:", err?.message ?? err);
    throw err;
  }
}

/**
 * @type { Array<{ name: string, func: Function, retry: number}> }
 */
const tasks = [
  {
    name: "aria2",
    func: resolveAria2,
    retry: 5,
  },
  {
    name: "locales",
    func: resolveLocales,
    retry: 2,
  },
];

async function runTask() {
  const task = tasks.shift();
  if (!task) return;

  for (let i = 0; i < task.retry; i++) {
    try {
      await task.func();
      break;
    } catch (err) {
      log_error(`task::${task.name} try ${i} ==`, err.message);
      if (i === task.retry - 1) throw err;
    }
  }
  return runTask();
}

runTask();
