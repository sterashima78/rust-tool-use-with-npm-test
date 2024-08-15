import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';

const download = async (url, dest) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
};

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const version = packageJson.version;
const versionFile = join(process.cwd(), 'bin', '.version');

const baseUrl = `https://github.com/crate-ci/typos/releases/download/v${version}/`;

const getDownloadUrl = (platformArch) => {
  let fileName;

  switch (platformArch) {
    case 'win32-x64':
      fileName = `typos-v${version}-x86_64-pc-windows-msvc.zip`;
      break;
    case 'linux-x64':
      fileName = `typos-v${version}-x86_64-unknown-linux-musl.tar.gz`;
      break;
    case 'darwin-x64':
      fileName = `typos-v${version}-x86_64-apple-darwin.tar.gz`;
      break;
    case 'darwin-arm64':
      fileName = `typos-v${version}-aarch64-apple-darwin.tar.gz`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platformArch}`);
  }

  return `${baseUrl}${fileName}`;
};

const extractTarGz = (filePath, destinationDir) => {
  try {
    execSync(`tar -xzvf ${filePath} -C ${destinationDir}`);
  } catch (err) {
    throw new Error('Failed to extract tar.gz file. Please make sure `tar` is installed and available in your PATH.');
  }
};

/**
 * @param {string} filePath 
 * @param {string} destinationDir 
 */
const extractFile = async (filePath, destinationDir) => {
  if (filePath.endsWith('.zip')) {
    try {
      execSync(`unzip -o ${filePath} -d ${destinationDir}`);
    } catch (err) {
      throw new Error('Failed to extract zip file. Please make sure `unzip` is installed and available in your PATH.');
    }
  } else if (filePath.endsWith('.tar.gz')) {
    extractTarGz(filePath, destinationDir);
  } else {
    throw new Error(`Unsupported file extension: ${basename(filePath)}`);
  }
};

const makeExecutable = (filePath) => {
  try {
    execSync(`chmod +x ${filePath}`);
    console.log(`Made ${filePath} executable`);
  } catch (err) {
    console.error(`Failed to make ${filePath} executable:`, err);
    throw err;
  }
};

const binaryExistsAndUpToDate = (binDir) => {
  const binaryPath = join(binDir, 'typos');
  const currentVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : null;

  return existsSync(binaryPath) && currentVersion === version;
};

const main = async () => {
  const binDir = join(process.cwd(), 'bin');

  if (!existsSync(binDir)) {
    mkdirSync(binDir);
  }

  if (binaryExistsAndUpToDate(binDir)) {
    console.log(`typos binary version ${version} already exists and is up to date. Skipping download and extraction.`);
    return;
  }

  const platformArch = `${process.platform}-${process.arch}`;
  const url = getDownloadUrl(platformArch);
  const downloadPath = join(binDir, basename(url));

  try {
    console.log(`Downloading typos from ${url}`);
    await download(url, downloadPath);

    console.log(`Extracting ${downloadPath}`);
    await extractFile(downloadPath, binDir);

    unlinkSync(downloadPath);
    writeFileSync(versionFile, version);
    if (process.platform !== 'win32') {
      makeExecutable(join(binDir, 'typos'));
    }
    console.log(`typos version ${version} downloaded, extracted, and made executable`);
  } catch (err) {
    console.error('Failed to download and extract typos:', err);
    process.exit(1);
  }
};

main();
