// deleteAssets.js
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const csvPath = process.argv[2];
const apiKey = process.argv[3];

if (!csvPath || !apiKey) {
  console.error('Usage: node deleteAssets.js <csvFile> <apiKey>');
  process.exit(1);
}

const TOKEN = process.env.CONTENTSTACK_TOKEN;
const HOST_NAME = process.env.HOST_NAME || 'api.contentstack.io';
const BRANCH = process.env.BRANCH || 'main';

function clean(value) {
  return value.replace(/^"+|"+$/g, '').trim();
}

function parseCSV(content) {
  const lines = content.trim().split('\n').slice(1); // skip header
  return lines.map((line) => {
    const [uid, filename, parent_uid] = line.split(',');
    return {
      uid: clean(uid || ''),
      filename: clean(filename || ''),
      parent_uid: clean(parent_uid || ''),
    };
  });
}


async function deleteAsset(uid) {
  try {
    await axios.delete(`https://${HOST_NAME}/v3/assets/${uid}`, {
      headers: {
        api_key: apiKey,
        authtoken: TOKEN,
        branch: BRANCH,
      },
    });
    console.log(`✅ Deleted asset: ${uid}`);
  } catch (err) {
    console.warn(`❌ Failed to delete asset ${uid}: ${err.response?.status || ''} ${err.message}`);
  }
}

async function folderHasAssets(folderUid) {
  try {
    const res = await axios.get(`https://${HOST_NAME}/v3/assets`, {
      headers: {
        api_key: apiKey,
        authtoken: TOKEN,
        branch: BRANCH,
      },
      params: {
        folder: folderUid,
        include_count: true,
      },
    });

    const count = res.data.count || 0;
    return count > 0;
  } catch (err) {
    console.warn(`⚠️ Could not check folder ${folderUid}: ${err.message}`);
    return true; // Assume not empty to avoid deleting incorrectly
  }
}

async function deleteFolder(folderUid) {
  try {
    await axios.delete(`https://${HOST_NAME}/v3/assets/folders/${folderUid}`, {
      headers: {
        api_key: apiKey,
        authtoken: TOKEN,
        branch: BRANCH,
      },
    });
    console.log(`🗑️ Deleted empty folder: ${folderUid}`);
  } catch (err) {
    console.warn(`❌ Failed to delete folder ${folderUid}: ${err.message}`);
  }
}

async function main() {
  const content = await fs.readFile(csvPath, 'utf-8');
  const entries = parseCSV(content);

  const folderSet = new Set();

  // Step 1: Delete assets and collect folders
  await Promise.all(
    entries.map(async ({ uid, parent_uid }) => {
      const hasAsset = uid && uid.trim() !== '';
      const hasFolder = parent_uid && parent_uid !== 'root';

      if (hasAsset) {
        await deleteAsset(uid);
      }

      if (hasFolder) {
        folderSet.add(parent_uid);
      }
    })
  );

  // Step 2: Check folders and delete if empty
  for (const folderUid of folderSet) {
    const hasAssets = await folderHasAssets(folderUid);
    if (!hasAssets) {
      await deleteFolder(folderUid);
    } else {
      console.log(`📁 Folder ${folderUid} is not empty — skipping delete.`);
    }
  }

  console.log('✅ Cleanup complete.');
}


main().catch((err) => console.error('🔥 Error:', err));
