# cs-assets-cleaner-script
This project includes scripts to scan and delete unused assets (remote or local) and detect empty folders in Contentstack.

---

### 📁 Project Structure

| File              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `scanRemote.js`   | Scans remote Contentstack assets and finds unused ones and empty folders |
| `scanLocal.js`    | Scans local assets using `metadata.json` and Contentstack reference API  |
| `deleteAssets.js` | Deletes assets (remote or local) using a CSV from scanning               |

---

## 📦 Setup

### 1. Install Dependencies

```bash
npm install axios dotenv json2csv p-limit
```

### 2. Create `.env` File

```env
CONTENTSTACK_TOKEN=your-token
HOST_NAME=api.contentstack.io
BRANCH=main
OUTPUT_PATH=remote-unused-assets.csv
ENABLE_EMPTY_FOLDER_CHECK=true
```

---

## 🚀 Usage

### 1. Scan Remote Assets

Find unused assets and optionally empty folders in Contentstack.

```bash
node scanRemote.js <apiKey>
```

#### ✅ Output

* Creates `remote-unused-assets.csv`
* Format: `uid,filename,parent_uid`
* Empty folders appear as: `,,<folder_uid>`

---

### 2. Scan Local Assets

Scans assets from a `metadata.json` file and checks references via the Contentstack API.

```bash
node scanLocal.js <localFolderPath>
```

#### Notes:

* `metadata.json` must exist in the folder.
* Asset format:

  ```json
  {
    "file_uid1": [{ "uid": "abc123", "filename": "img1.jpg" }],
    "file_uid2": [{ "uid": "def456", "filename": "img2.jpg" }]
  }
  ```

#### ✅ Output

* Creates `local-unused-assets.csv`

---

### 3. Delete Assets (Remote or Local)

Deletes assets listed in the CSV file.

```bash
# Delete remote assets
node deleteAssets.js <csvFile> <apiKey>

# Delete local assets
node deleteAssets.js <csvFile> "" <localFolderPath>
```

#### 🔍 Behavior

* For **remote**:

  * Deletes all `uid` entries via Contentstack API
  * If any `parent_uid` is listed without a file, checks if folder is empty and deletes it
* For **local**:

  * Deletes files listed under the folder
  * Deletes folder if it's empty after deletion

---

## 📌 CSV Format (for input/output)

```csv
uid,filename,parent_uid
sdghsgf,image1.jpg,folderA
,,folderB  <-- this means folderB is empty
```

---

## 🛡️ Notes

* Make sure your API key has asset/folder delete permissions.
* Use caution when running `deleteAssets.js`. It deletes permanently.


