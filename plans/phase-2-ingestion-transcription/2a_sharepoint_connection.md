# Phase 2a: SharePoint Connection (Graph API)

### Objective
Set up the Microsoft Graph API connection in n8n to watch a specific SharePoint folder for new KT recording MP4 files. Configure Azure AD app registration with the necessary permissions and build the n8n workflow trigger.

### Prerequisites
- Phase 1 + 1.5 complete
- n8n instance accessible at `https://awsn8n.cloudnavision.com/`
- Access to Azure Portal (CloudNavision tenant) for app registration
- SharePoint folder: `cloudnavision.sharepoint.com` → Documents → Infomate → SOP
- SharePoint folder link: `https://cloudnavision.sharepoint.com/:f:/s/Saara/IgDCQ6IA9LrUSYvlYXIHUbb4AedQmJDWRUGdUu0uyqcwDeo`

---

### Manual Setup (do these before building the n8n workflow)

**Step 1: Azure AD App Registration for Graph API**

This is a SEPARATE app registration from the SSO one (Phase 1.5). This one is for service-to-service access — no user login involved.

1. Go to Azure Portal → Azure Active Directory → App registrations → New registration
2. Name: `SOP Pipeline - Graph API`
3. Supported account types: "Accounts in this organizational directory only" (single tenant)
4. Redirect URI: leave blank (daemon/service app)
5. Click Register
6. Note down:
   - **Application (client) ID** — e.g., `abcd1234-...`
   - **Directory (tenant) ID** — e.g., `7729c609-...` (same tenant as your SSO app)

**Step 2: Create client secret**

1. In your new app registration → Certificates & secrets
2. Click "New client secret"
3. Description: `n8n pipeline`
4. Expiry: 12 months (or 24 months)
5. Click Add
6. **Copy the Value immediately** — it won't be shown again
7. This is your `client_secret`

**Step 3: Add Graph API permissions**

1. In your app registration → API permissions
2. Click "Add a permission" → "Microsoft Graph" → "Application permissions"
3. Search and add:
   - `Sites.Read.All` — read all SharePoint site content
   - `Files.Read.All` — read all files in document libraries
4. Click "Grant admin consent for CloudNavision"
5. Both permissions should show green checkmarks under "Status"

**Step 4: Get SharePoint Site ID**

You need the site ID for Graph API calls. Test this in browser or with curl:

```bash
# First, get an access token
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id={client-id}&client_secret={client-secret}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"

# Use the access_token to get the site ID
curl -H "Authorization: Bearer {access_token}" \
  "https://graph.microsoft.com/v1.0/sites/cloudnavision.sharepoint.com:/sites/Saara"
```

From the response, note down:
- `id` — this is the **site ID** (format: `hostname,site-collection-id,web-id`)

**Step 5: Get Drive ID (document library)**

```bash
curl -H "Authorization: Bearer {access_token}" \
  "https://graph.microsoft.com/v1.0/sites/{site-id}/drives"
```

From the response, find the drive named "Documents" and note its `id` — this is the **drive ID**.

**Step 6: Get folder item ID**

```bash
# Navigate to the SOP folder
curl -H "Authorization: Bearer {access_token}" \
  "https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/root:/Infomate/SOP:/children"
```

This should list the MP4 files in your SOP folder. If it works, the path is correct.

---

### What to Build (n8n Workflow)

The n8n workflow for Phase 2a has these nodes:

**Node 1: Schedule Trigger**
- Fires every 15 minutes (adjustable)
- This starts the pipeline check

**Node 2: HTTP Request — Get OAuth2 Token**
- Method: POST
- URL: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
- Body type: Form URL Encoded
- Parameters:
  - `client_id`: `{{GRAPH_CLIENT_ID}}`
  - `client_secret`: `{{GRAPH_CLIENT_SECRET}}`
  - `scope`: `https://graph.microsoft.com/.default`
  - `grant_type`: `client_credentials`
- Output: `access_token` (valid for ~1 hour)

**Node 3: HTTP Request — List files in SOP folder**
- Method: GET
- URL: `https://graph.microsoft.com/v1.0/sites/{{SITE_ID}}/drives/{{DRIVE_ID}}/root:/Infomate/SOP:/children`
- Headers: `Authorization: Bearer {{$node["Get Token"].json.access_token}}`
- Query: `$filter=file/mimeType eq 'video/mp4'`
- Returns: array of file objects with `id`, `name`, `size`, `lastModifiedDateTime`, `@microsoft.graph.downloadUrl`

**Node 4: HTTP Request — Check processed files in Supabase**
- Method: GET
- URL: `https://{supabase-project}.supabase.co/rest/v1/processed_sharepoint_files?select=file_id`
- Headers:
  - `apikey`: `{{SUPABASE_ANON_KEY}}`
  - `Authorization`: `Bearer {{SUPABASE_SERVICE_KEY}}`
- Returns: array of already-processed file IDs

**Node 5: Code Node — Filter new files only**
- Compare SharePoint file list with processed files list
- Output only files whose `id` is NOT in the processed list
```javascript
const sharePointFiles = $input.first().json.value || [];
const processedIds = $('Check Processed Files').first().json.map(r => r.file_id);

const newFiles = sharePointFiles.filter(f => !processedIds.includes(f.id));

if (newFiles.length === 0) {
  return []; // Nothing to process
}

return newFiles.map(f => ({
  json: {
    file_id: f.id,
    file_name: f.name,
    file_size: f.size,
    download_url: f['@microsoft.graph.downloadUrl'],
    last_modified: f.lastModifiedDateTime
  }
}));
```

**Node 6: Split In Batches**
- Batch size: 1 (process one video at a time)
- For each new file → continues to Phase 2b nodes (download + upload + transcribe)

---

### Credentials to Configure in n8n

Store these as n8n workflow variables or credentials:

| Variable | Value | Where from |
|----------|-------|-----------|
| `GRAPH_TENANT_ID` | Your Azure AD tenant ID | Azure Portal → AAD → Overview |
| `GRAPH_CLIENT_ID` | App registration client ID | Step 1 above |
| `GRAPH_CLIENT_SECRET` | App registration secret value | Step 2 above |
| `GRAPH_SITE_ID` | SharePoint site ID | Step 4 above |
| `GRAPH_DRIVE_ID` | Document library drive ID | Step 5 above |
| `SUPABASE_URL` | `https://{project}.supabase.co` | Supabase dashboard |
| `SUPABASE_ANON_KEY` | Supabase anon key | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key | Supabase dashboard → Settings → API |

---

### Validation
- [ ] Azure AD app registration created
- [ ] Graph API permissions granted with admin consent
- [ ] Client secret created and saved
- [ ] SharePoint site ID retrieved successfully
- [ ] Drive ID retrieved successfully
- [ ] n8n can obtain OAuth2 access token
- [ ] n8n can list MP4 files in the SOP folder
- [ ] New file filter works (doesn't re-process old files)
- [ ] Schedule trigger fires correctly

### Checklist
```
Manual:
- [ ] Azure AD app registration (SOP Pipeline - Graph API)
- [ ] Add Sites.Read.All + Files.Read.All (Application permissions)
- [ ] Grant admin consent
- [ ] Create client secret — copy Value
- [ ] Get SharePoint site ID (curl or browser test)
- [ ] Get drive ID
- [ ] Test listing files in SOP folder
- [ ] Create processed_sharepoint_files table in Supabase
- [ ] Add credentials to n8n

Build:
- [ ] n8n workflow with schedule trigger
- [ ] OAuth2 token request node
- [ ] List SharePoint files node
- [ ] Check processed files node (Supabase)
- [ ] Filter new files code node
- [ ] Split In Batches node
- [ ] Import and test workflow in n8n
```

### Supabase Table (run in SQL Editor)

```sql
CREATE TABLE processed_sharepoint_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id VARCHAR(500) NOT NULL UNIQUE,
  filename VARCHAR(500),
  sop_id UUID REFERENCES sops(id),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processed_files_file_id ON processed_sharepoint_files(file_id);
```

### Status: ⬜ Pending
