import { execSync } from "child_process";
import clc from "cli-color";
import fsp from "fs/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import path from "path";
import process from "process";

export const log_success = (msg, ...optionalParams) =>
  console.log(clc.green(msg), ...optionalParams);
export const log_error = (msg, ...optionalParams) =>
  console.log(clc.red(msg), ...optionalParams);
export const log_info = (msg, ...optionalParams) =>
  console.log(clc.bgBlue(msg), ...optionalParams);

const debugMsg = clc.xterm(245);
export const log_debug = (msg, ...optionalParams) =>
  console.log(debugMsg(msg), ...optionalParams);

export const createFetchOptionsFactory = () => {
  const options = {};

  const httpProxy =
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy;

  if (httpProxy) {
    options.agent = new HttpsProxyAgent(httpProxy);
  }

  return options;
};

/**
 * download file and save to `path`
 */
export async function downloadFile(url, path) {
  const options = createFetchOptionsFactory();
  const response = await fetch(url, {
    ...options,
    method: "GET",
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const detail = bodyText ? `: ${bodyText.slice(0, 200)}` : "";
    throw new Error(
      `Download failed (${response.status} ${response.statusText}) for ${url}${detail}`,
    );
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error(`Downloaded empty file from ${url}`);
  }

  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    buffer.byteLength !== Number(contentLength)
  ) {
    throw new Error(
      `Download truncated from ${url} (expected ${contentLength} bytes, got ${buffer.byteLength})`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("text/") || contentType.includes("html")) {
    const preview = new TextDecoder()
      .decode(buffer.slice(0, 200))
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url}${
        preview ? `: ${preview}` : ""
      }`,
    );
  }

  await fsp.writeFile(path, new Uint8Array(buffer));

  log_success(`download finished: ${url}`);
}

/**
 *
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function pullUpOnlySubDirectory(dir) {
  const files = await fsp.readdir(dir);

  if (files.length !== 1) {
    return;
  }

  const firstFile = files[0];
  const stats = await fsp.stat(path.join(dir, firstFile));

  if (!stats.isDirectory()) {
    return;
  }

  const innerFolder = path.join(dir, firstFile);
  const innerFiles = await fsp.readdir(innerFolder);
  await Promise.all(
    innerFiles.map(async (file) => {
      await fsp.rename(path.join(innerFolder, file), path.join(dir, file));
    }),
  );
  await fsp.rmdir(innerFolder);
}

/**
 * get the signature file content
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function getSignature(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/octet-stream" },
  });

  return response.text();
}

/**
 * @param {string} source
 * @param {string} target
 */
export async function baseMove(source, target) {
  await fsp.rename(source, target);
  log_success(`"${source}" file moved to "${target}"`);
}

/**
 *
 * @param {string} source
 * @param {string} target
 */
export async function baseExecutableMove(source, target) {
  await baseMove(source, target);
  execSync(`chmod 755 ${target}`);
  log_success(`chmod binary finished: "${target}"`);
}

/**
 *
 * @param {string} source
 * @param {string} target
 */
export async function baseExecutableCopy(source, target) {
  await fsp.copyFile(source, target);
  log_success(`"${source}" file copied to "${target}"`);
  execSync(`chmod 755 ${target}`);
  log_success(`chmod binary finished: "${target}"`);
}
