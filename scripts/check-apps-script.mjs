import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "apps-script");
const files = readdirSync(directory).filter((name) => name.endsWith(".gs")).sort();
if (!files.length) throw new Error("No Apps Script .gs files found");

const owners = new Map();
let doPostCount = 0;
let combined = "";

for (const name of files) {
  const path = join(directory, name);
  const source = readFileSync(path, "utf8");
  execFileSync(process.execPath, ["--check"], { input: source, stdio: ["pipe", "pipe", "pipe"] });
  combined += `\n${source}`;
  for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const functionName = match[1];
    if (functionName === "doPost") doPostCount += 1;
    const previous = owners.get(functionName);
    if (previous) throw new Error(`Duplicate global function ${functionName} in ${previous} and ${name}`);
    owners.set(functionName, name);
  }
}

if (doPostCount !== 1) throw new Error(`Expected exactly one doPost, found ${doPostCount}`);
for (const action of ["createUploadTicket", "init", "chunk", "listRevisions", "restoreRevision", "telegramTest", "telegramNotify", "issue", "certificateCandidates", "requestCorrection", "checkSharing"]) {
  if (!combined.includes(`input.action === "${action}"`)) throw new Error(`Missing dispatcher action: ${action}`);
}
if (combined.includes("anuban-upload-2569")) throw new Error("Legacy reusable upload secret must not be deployed");

JSON.parse(readFileSync(join(directory, "appsscript.json"), "utf8"));
console.log(`Apps Script check passed: ${files.length} files, ${owners.size} global functions, one doPost`);
