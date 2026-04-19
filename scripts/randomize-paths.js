const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const appDir = path.join(projectRoot, "app");
const envPath = path.join(projectRoot, ".env.local");
const envExamplePath = path.join(projectRoot, ".env.local.example");

const ENV_KEYS = {
  admin: "NEXT_PUBLIC_ADMIN_PATH",
  superAdmin: "NEXT_PUBLIC_SUPER_ADMIN_PATH",
  api: "NEXT_PUBLIC_API_PATH",
};

function randomHex() {
  return crypto.randomBytes(12).toString("hex");
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { lines: [], values: {} };
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2];
    }
  }

  return { lines, values };
}

function upsertEnv(filePath, updates) {
  const { lines } = readEnvFile(filePath);
  const nextLines = [...lines];

  for (const [key, value] of Object.entries(updates)) {
    const newLine = `${key}=${value}`;
    const index = nextLines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      nextLines[index] = newLine;
    } else {
      nextLines.push(newLine);
    }
  }

  const normalized = nextLines.filter((line, index, arr) => {
    if (index === arr.length - 1 && line === "") {
      return false;
    }
    return true;
  });

  fs.writeFileSync(filePath, `${normalized.join("\n")}\n`, "utf8");
}

function ensureUniqueName(existingNames, preferredValue) {
  let value = preferredValue || randomHex();
  while (existingNames.has(value)) {
    value = randomHex();
  }
  existingNames.add(value);
  return value;
}

function listDirectoryNames(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return new Set();
  }

  return new Set(
    fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

function renameIfPresent(fromPath, toPath, summary) {
  if (!fs.existsSync(fromPath)) {
    return;
  }

  if (fs.existsSync(toPath)) {
    summary.skipped.push({
      from: path.relative(projectRoot, fromPath),
      to: path.relative(projectRoot, toPath),
      reason: "target-exists",
    });
    return;
  }

  fs.renameSync(fromPath, toPath);
  summary.renamed.push({
    from: path.relative(projectRoot, fromPath),
    to: path.relative(projectRoot, toPath),
  });
}

function replaceInSourceFiles(replacements) {
  const files = [];

  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!/\.(js|jsx|ts|tsx|mjs|cjs|json|md|env|txt)$/i.test(entry.name)) {
        continue;
      }

      files.push(fullPath);
    }
  }

  walk(projectRoot);

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, "utf8");
    let next = original;

    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }

    if (next !== original) {
      fs.writeFileSync(filePath, next, "utf8");
    }
  }
}

function main() {
  const adminParent = path.join(appDir, "(admin)");
  const currentEnv = readEnvFile(envPath).values;
  const currentExampleEnv = readEnvFile(envExamplePath).values;
  const knownDirNames = new Set([
    ...listDirectoryNames(adminParent),
    ...listDirectoryNames(appDir),
  ]);

  const adminDir = ensureUniqueName(
    knownDirNames,
    (currentEnv[ENV_KEYS.admin] || currentExampleEnv[ENV_KEYS.admin] || "").replace(/^\//, ""),
  );
  const superAdminDir = ensureUniqueName(
    knownDirNames,
    (currentEnv[ENV_KEYS.superAdmin] || currentExampleEnv[ENV_KEYS.superAdmin] || "").replace(/^\//, ""),
  );
  const apiDir = ensureUniqueName(
    knownDirNames,
    (currentEnv[ENV_KEYS.api] || currentExampleEnv[ENV_KEYS.api] || "").replace(/^\//, ""),
  );

  const summary = { renamed: [], skipped: [] };

  renameIfPresent(
    path.join(adminParent, "02fec873a5d7a8960ed880f9"),
    path.join(adminParent, adminDir),
    summary,
  );
  renameIfPresent(
    path.join(adminParent, "d3f1ca9b741ec069d8b4a5a1"),
    path.join(adminParent, superAdminDir),
    summary,
  );
  renameIfPresent(path.join(appDir, "61661349955feb4ef394a123"), path.join(appDir, apiDir), summary);

  const envUpdates = {
    [ENV_KEYS.admin]: `/${adminDir}`,
    [ENV_KEYS.superAdmin]: `/${superAdminDir}`,
    [ENV_KEYS.api]: `/${apiDir}`,
  };

  upsertEnv(envPath, envUpdates);
  upsertEnv(envExamplePath, envUpdates);

  replaceInSourceFiles([
    ["/02fec873a5d7a8960ed880f9", `/${adminDir}`],
    ["/d3f1ca9b741ec069d8b4a5a1", `/${superAdminDir}`],
    ["/61661349955feb4ef394a123/", `/${apiDir}/`],
    ['"02fec873a5d7a8960ed880f9"', `"${adminDir}"`],
    ['"d3f1ca9b741ec069d8b4a5a1"', `"${superAdminDir}"`],
    ['"61661349955feb4ef394a123"', `"${apiDir}"`],
    ["'02fec873a5d7a8960ed880f9'", `'${adminDir}'`],
    ["'d3f1ca9b741ec069d8b4a5a1'", `'${superAdminDir}'`],
    ["'61661349955feb4ef394a123'", `'${apiDir}'`],
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        adminPath: envUpdates[ENV_KEYS.admin],
        superAdminPath: envUpdates[ENV_KEYS.superAdmin],
        apiPath: envUpdates[ENV_KEYS.api],
        renamed: summary.renamed,
        skipped: summary.skipped,
      },
      null,
      2,
    )}\n`,
  );
}

main();
