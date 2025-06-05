const fs = require('fs/promises');
const axios = require('axios');
const { parse } = require('json2csv');
const pLimit = require('p-limit');
const dotenv = require('dotenv');
dotenv.config();

const HOST_NAME = process.env.HOST_NAME || 'api.contentstack.io';
const CONTENTSTACK_TOKEN = process.env.CONTENTSTACK_TOKEN;
const BRANCH = process.env.BRANCH || 'main';
const OUTPUT_PATH = process.env.OUTPUT_PATH || './remote-unused-assets.csv';
const ENABLE_EMPTY_FOLDER_CHECK = process.env.ENABLE_EMPTY_FOLDER_CHECK || 'true';

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Usage: node scanRemote.js <apiKey>');
  process.exit(1);
}

async function listAllAssets(apiKey) {
  const allAssets = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const res = await axios.get(`https://${HOST_NAME}/v3/assets`, {
      headers: { api_key: apiKey, authtoken: CONTENTSTACK_TOKEN, branch: BRANCH },
      params: { skip, limit },
    });
    const assets = res.data.assets || [];
    allAssets.push(...assets);
    if (assets.length < limit) break;
    skip += limit;
  }

  return allAssets;
}

async function fetchReferences(apiKey, uid) {
  try {
    const res = await axios.get(
      `https://${HOST_NAME}/v3/assets/${uid}/references`,
      {
        headers: { api_key: apiKey, authtoken: CONTENTSTACK_TOKEN, branch: BRANCH },
      }
    );
    return res.data.references || [];
  } catch {
    return [];
  }
}

async function listAllFolders(apiKey) {
  const allFolders = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const res = await axios.get(`https://${HOST_NAME}/v3/assets`, {
      headers: { api_key: apiKey, authtoken: CONTENTSTACK_TOKEN, branch: BRANCH },
      params: { skip, limit,include_folders: true,is_dir: true },
    });
    const folders = res.data.assets || [];
    const isDir = folders.filter(f => f.is_dir);
    allFolders.push(...isDir);
    if (folders.length < limit) break;
    skip += limit;
  }

  return allFolders.map(f => f.uid);
}

async function folderHasAssets(apiKey, folderUid) {
  try {
    const res = await axios.get(`https://${HOST_NAME}/v3/assets`, {
      headers: { api_key: apiKey, authtoken: CONTENTSTACK_TOKEN, branch: BRANCH },
      params: { folder: folderUid },
    });
    return (res.data.assets?.length || 0) > 0;
  } catch {
    return true; // Assume it's not empty if there's an error
  }
}

async function main() {
  const assets = await listAllAssets(apiKey);
  const limit = pLimit(10);
  const unused = [];

  await Promise.all(
    assets.map((asset) =>
      limit(async () => {
        const refs = await fetchReferences(apiKey, asset.uid);
        if (refs.length === 0) {
          unused.push({
            uid: asset.uid,
            filename: asset.filename,
            parent_uid: asset.parent_uid || '',
          });
        }
      })
    )
  );

  // Optional: Check for empty folders
  if (ENABLE_EMPTY_FOLDER_CHECK) {
    console.log('🔍 Checking for empty folders...');
    const folderUids = await listAllFolders(apiKey);
    await Promise.all(
      folderUids.map((folderUid) =>
        limit(async () => {
          const hasAssets = await folderHasAssets(apiKey, folderUid);
          if (!hasAssets) {
            unused.push({ uid: '', filename: '', parent_uid: folderUid });
          }
        })
      )
    );
  }

  const csv = parse(unused, { fields: ['uid', 'filename', 'parent_uid'] });
  await fs.writeFile(OUTPUT_PATH, csv);
  console.log(`✅ Saved unused remote assets${ENABLE_EMPTY_FOLDER_CHECK ? ' and empty folders' : ''} to ${OUTPUT_PATH}`);
}

main().catch((err) => console.error('❌', err));
