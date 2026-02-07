import fs from "fs";
import fsp from "fs/promises";
import path from "path";

import { cwd } from "./environment.mjs";

const UPDATE_LOG = "UPDATE_LOG.md";

/**
 * parse the UPDATE_LOG.md
 * @param {string} tag
 * @returns {Promise<string>}
 */
export async function resolveUpdateLog(tag) {
  const reTitle = /^## v[\d.]+/;
  const reEnd = /^---/;

  const file = path.join(cwd, "docs", UPDATE_LOG);

  if (!fs.existsSync(file)) {
    throw new Error("could not found UPDATELOG.md");
  }

  const data = await fsp.readFile(file, "utf-8");

  const map = {};
  let p = "";

  data.split("\n").forEach((line) => {
    if (reTitle.test(line)) {
      p = line.slice(3).trim();
      if (!map[p]) {
        map[p] = [];
      } else {
        throw new Error(`Tag ${p} dup`);
      }
    } else if (reEnd.test(line)) {
      p = "";
    } else if (p) {
      map[p].push(line);
    }
  });

  if (!map[tag]) {
    throw new Error(`could not found "${tag}" in UPDATELOG.md`);
  }

  return map[tag].join("\n").trim();
}
