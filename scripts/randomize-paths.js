const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const appDir = path.join(projectRoot, "app");
const adminGroupDir = path.join(appDir, "(admin)");
const envFiles = [
  path.join(projectRoot, ".env.local"),
  path.join(projectRoot, ".env.local.example"),
];

const canonicalPaths = {
  admin: "x7k9_2q",
  superAdmin: "ops-root",
  api: "api",
};

const envKeys = {
  admin: "NEXT_PUBLIC_ADMIN_PATH",
  superAdmin: "NEXT_PUBLIC_SUPER_ADMIN_PATH",
  api: "NEXT_PUBLIC_API_PATH",
};

function randomHex() {
  return crypto.randomBytes(12).toString("hex");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { lines: [], values: {} };
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2];
    }
  }

  return { lines, values };
}

function writeEnvUpdates(filePath, updates) {
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

  fs.writeFileSync(
    filePath,
    `${nextLines.filter((line, index, arr) => !(index === arr.length - 1 && line === "")).join("\n")}\n`,
    "utf8",
  );
}

function replaceInFiles(replacements) {
  const selfPath = path.join(projectRoot, "scripts", "randomize-paths.js");

  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git", ".vercel"].includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (fullPath === selfPath) {
        continue;
      }

      if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|env)$/i.test(entry.name)) {
        continue;
      }

      const original = fs.readFileSync(fullPath, "utf8");
      let next = original;

      for (const [from, to] of replacements) {
        next = next.split(from).join(to);
      }

      if (next !== original) {
        fs.writeFileSync(fullPath, next, "utf8");
      }
    }
  }

  walk(projectRoot);
}

function ensureUniqueTarget(preferredValue, taken) {
  let value = preferredValue || randomHex();
  while (taken.has(value) || Object.values(canonicalPaths).includes(value)) {
    value = randomHex();
  }
  taken.add(value);
  return value;
}

function movePathIfNeeded(sourcePath, targetPath, renamed) {
  if (!fs.existsSync(sourcePath) || sourcePath === targetPath || fs.existsSync(targetPath)) {
    return;
  }

  fs.renameSync(sourcePath, targetPath);
  renamed.push({
    from: path.relative(projectRoot, sourcePath),
    to: path.relative(projectRoot, targetPath),
  });
}

function ensureCanonicalScaffolds(existingTargets) {
  ensureDir(adminGroupDir);

  const adminCanonicalDir = path.join(adminGroupDir, canonicalPaths.admin);
  const superAdminCanonicalDir = path.join(adminGroupDir, canonicalPaths.superAdmin);
  const apiCanonicalDir = path.join(appDir, canonicalPaths.api);

  if (!fs.existsSync(adminCanonicalDir) && !fs.existsSync(path.join(adminGroupDir, existingTargets.admin))) {
    ensureDir(adminCanonicalDir);
  }

  if (
    !fs.existsSync(superAdminCanonicalDir) &&
    !fs.existsSync(path.join(adminGroupDir, existingTargets.superAdmin))
  ) {
    ensureDir(superAdminCanonicalDir);
  }

  if (!fs.existsSync(apiCanonicalDir) && !fs.existsSync(path.join(appDir, existingTargets.api))) {
    ensureDir(apiCanonicalDir);
  }
}

function main() {
  const currentEnv = envFiles.map(readEnvFile).reduce(
    (accumulator, entry) => ({ ...accumulator, ...entry.values }),
    {},
  );

  const taken = new Set();
  const targets = {
    admin: ensureUniqueTarget(currentEnv[envKeys.admin]?.replace(/^\//, ""), taken),
    superAdmin: ensureUniqueTarget(currentEnv[envKeys.superAdmin]?.replace(/^\//, ""), taken),
    api: ensureUniqueTarget(currentEnv[envKeys.api]?.replace(/^\//, ""), taken),
  };

  ensureCanonicalScaffolds(targets);

  const renamed = [];

  movePathIfNeeded(
    path.join(adminGroupDir, canonicalPaths.admin),
    path.join(adminGroupDir, targets.admin),
    renamed,
  );
  movePathIfNeeded(
    path.join(adminGroupDir, canonicalPaths.superAdmin),
    path.join(adminGroupDir, targets.superAdmin),
    renamed,
  );
  movePathIfNeeded(path.join(appDir, canonicalPaths.api), path.join(appDir, targets.api), renamed);

  const envUpdates = {
    [envKeys.admin]: `/${targets.admin}`,
    [envKeys.superAdmin]: `/${targets.superAdmin}`,
    [envKeys.api]: `/${targets.api}`,
  };

  for (const envFile of envFiles) {
    writeEnvUpdates(envFile, envUpdates);
  }

  replaceInFiles([
    ["/x7k9_2q", envUpdates[envKeys.admin]],
    ["/ops-root", envUpdates[envKeys.superAdmin]],
    ["/api/", `${envUpdates[envKeys.api]}/`],
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        adminPath: envUpdates[envKeys.admin],
        superAdminPath: envUpdates[envKeys.superAdmin],
        apiPath: envUpdates[envKeys.api],
        renamed,
      },
      null,
      2,
    )}\n`,
  );
}

main();
