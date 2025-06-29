const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { parse } = require('json2csv');
const pLimit = require('p-limit');
const dotenv = require('dotenv');
dotenv.config();

const localFolder = process.argv[2]; // path to assets folder
const apiKey = process.argv[3];

if (!localFolder || !apiKey) {
  console.error('Usage: node scanLocalWithReferences.js <localFolder> <apiKey>');
  process.exit(1);
}

const HOST_NAME = process.env.HOST_NAME || 'api.contentstack.io';
const CONTENTSTACK_TOKEN = process.env.CONTENTSTACK_TOKEN;
const BRANCH = process.env.BRANCH || 'main';
const METADATA_FILE = path.join(localFolder, 'metadata.json');
const FOLDER_FILE = path.join(localFolder, 'folders.json');
const OUTPUT_FILE = process.env.OUTPUT_FILE || './local-unused-assets.csv';
const ENABLE_EMPTY_FOLDER_CHECK = process.env.ENABLE_EMPTY_FOLDER_CHECK || 'true';

async function fetchReferences(uid) {
  try {
    const res = await axios.get(
      `https://${HOST_NAME}/v3/assets/${uid}/references`,
      {
        headers: {
          api_key: apiKey,
          authtoken: CONTENTSTACK_TOKEN,
          branch: BRANCH,
        },
      }
    );
    return res.data.references || [];
  } catch (err) {
    console.warn(`Failed to fetch references for ${uid}: ${err.message}`);
    return [];
  }
}

async function main() {
  const [rawMeta, rawFolders] = await Promise.all([
    fs.readFile(METADATA_FILE, 'utf-8'),
    fs.readFile(FOLDER_FILE, 'utf-8'),
  ]);

  const metadata = JSON.parse(rawMeta);
  const folders = JSON.parse(rawFolders);

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    console.error('Expected metadata.json to contain an object of folder -> asset[]');
    process.exit(1);
  }

  const limit = pLimit(10);
  const unusedAssets = [];
  const allAssets = [];

  // Flatten all assets with folder info
  for (const [folderUid, assets] of Object.entries(metadata)) {
    if (!Array.isArray(assets)) continue;

    for (const asset of assets) {
      if (!asset.uid) continue;
      allAssets.push({ ...asset });
    }
  }

  await Promise.all(
    allAssets.map((asset) =>
      limit(async () => {
        const references = await fetchReferences(asset.uid);
        if (references.length === 0) {
          unusedAssets.push({
            uid: asset.uid,
            filename: asset.filename || '',
            parent_uid: asset.parent_uid || '',
          });
        }
      })
    )
  );

  // 🔍 Check for empty folders (optional)
  if (ENABLE_EMPTY_FOLDER_CHECK === 'true') {
    const folderUids = Array.isArray(folders) ? folders.map(f => f.uid) : [];

    for (const folderUid of folderUids) {
      const hasAssets = Array.isArray(metadata[folderUid]) && metadata[folderUid].length > 0;
      if (!hasAssets) {
        unusedAssets.push({
          uid: '',
          filename: '',
          parent_uid: folderUid,
        });
      }
    }
  }

  if (unusedAssets.length === 0) {
    console.log('No unused local assets or empty folders found.');
    return;
  }

  const csv = parse(unusedAssets, { fields: ['uid', 'filename', 'parent_uid'] });
  await fs.writeFile(OUTPUT_FILE, csv);
  console.log(`✅ Saved unused local assets${ENABLE_EMPTY_FOLDER_CHECK === 'true' ? ' and empty folders' : ''} to ${OUTPUT_FILE}`);
}

main().catch((err) => console.error('❌ Scan failed:', err));
