# Phase 2b: Download MP4 + Upload to Azure Blob

### Objective
Extend the Phase 2a n8n workflow. Download the MP4 from SharePoint via Graph API, upload it to Azure Blob Storage, and create the initial SOP and pipeline_runs records in Supabase.

### Prerequisites
- Phase 2a complete — n8n workflow detects new MP4 files in SharePoint
- Azure Blob container `sop-media` created in `cnavinfsop` storage account
- SAS token with write permissions confirmed

### Manual Setup (before building)

**Step 1: Create Azure Blob container**
- Azure Portal → Storage accounts → cnavinfsop → Containers → + Container
- Name: `sop-media`
- Access level: Private
- Click Create

**Step 2: Verify SAS token has write permissions**
Test with curl — upload a small test file:
```bash
curl -X PUT \
  "https://cnavinfsop.blob.core.windows.net/sop-media/test.txt?{YOUR_SAS_TOKEN}" \
  -H "x-ms-blob-type: BlockBlob" \
  -H "Content-Type: text/plain" \
  -d "test upload"
```
- 201 Created = write works. Delete the test file after.
- 403 Forbidden = SAS token doesn't have write permissions. Generate a new one with `w` (write) and `c` (create) permissions.

**Step 3: Add Azure Blob credentials to n8n**
Store as n8n workflow variables:
- `AZURE_BLOB_ACCOUNT`: `cnavinfsop`
- `AZURE_BLOB_CONTAINER`: `sop-media`
- `AZURE_BLOB_SAS_TOKEN`: your full SAS token string

### What to Build (add to existing 2a workflow)

These nodes connect after the Split In Batches node from Phase 2a.

**Node 7: HTTP Request — Download MP4 from SharePoint**
- Method: GET
- URL: `https://graph.microsoft.com/v1.0/sites/{{GRAPH_SITE_ID}}/drives/{{GRAPH_DRIVE_ID}}/items/{{$json.file_id}}/content`
- Headers: `Authorization: Bearer {{access_token}}`
- Response Format: File (binary download)
- Timeout: 300 seconds (large files take time)
- This downloads the full MP4 into n8n's binary buffer

**Node 8: Code Node — Generate SOP ID + metadata**
- Generate a UUID for the new SOP
- Extract metadata from filename if possible
- Build the Azure Blob path
```javascript
const crypto = require('crypto');
const sopId = crypto.randomUUID();
const fileName = $input.first().json.file_name;
const fileSize = $input.first().json.file_size;

// Try to extract client/process from filename
// e.g., "Aged_Debtor_Report_KT_2025-12-31.mp4"
const cleanName = fileName.replace('.mp4', '').replace(/_/g, ' ');

return [{
  json: {
    sop_id: sopId,
    file_name: fileName,
    file_size: fileSize,
    blob_path: `sop-media/${sopId}/original.mp4`,
    blob_url: `https://cnavinfsop.blob.core.windows.net/sop-media/${sopId}/original.mp4`,
    title: `${cleanName} — Knowledge Transfer`,
    file_id: $input.first().json.file_id
  }
}];
```

**Node 9: HTTP Request — Upload to Azure Blob**
- Method: PUT
- URL: `https://cnavinfsop.blob.core.windows.net/sop-media/{{$json.sop_id}}/original.mp4?{{AZURE_BLOB_SAS_TOKEN}}`
- Headers:
  - `x-ms-blob-type`: `BlockBlob`
  - `Content-Type`: `video/mp4`
- Body: binary data from the Download node
- Timeout: 300 seconds

**Node 10: HTTP Request — Create SOP record in Supabase**
- Method: POST
- URL: `https://{{SUPABASE_URL}}/rest/v1/sops`
- Headers:
  - `apikey`: `{{SUPABASE_ANON_KEY}}`
  - `Authorization`: `Bearer {{SUPABASE_SERVICE_KEY}}`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=representation`
- Body:
```json
{
  "id": "{{$json.sop_id}}",
  "title": "{{$json.title}}",
  "status": "processing",
  "video_url": "{{$json.blob_url}}",
  "video_file_size_bytes": {{$json.file_size}},
  "meeting_date": "{{today's date}}",
  "created_at": "{{now}}"
}
```

**Node 11: HTTP Request — Create pipeline_runs record**
- Method: POST
- URL: `https://{{SUPABASE_URL}}/rest/v1/pipeline_runs`
- Headers: same as Node 10
- Body:
```json
{
  "sop_id": "{{$json.sop_id}}",
  "status": "transcribing",
  "current_stage": "transcribing",
  "started_at": "{{now}}",
  "stage_results": {}
}
```

### Validation
- [ ] MP4 downloaded from SharePoint (binary data in n8n)
- [ ] SOP ID generated correctly (valid UUID)
- [ ] MP4 uploaded to Azure Blob at `sop-media/{sop-id}/original.mp4`
- [ ] Blob URL accessible with SAS token (test in browser)
- [ ] SOP record created in Supabase with status "processing"
- [ ] pipeline_runs record created with status "transcribing"
- [ ] video_url in SOP points to correct Azure Blob URL

### Checklist
```
Manual:
- [ ] Azure Blob container 'sop-media' created
- [ ] SAS token write permissions verified (curl test)
- [ ] Azure Blob credentials added to n8n workflow variables

Build:
- [ ] Node 7: Download MP4 from SharePoint (binary)
- [ ] Node 8: Generate SOP ID + metadata (code node)
- [ ] Node 9: Upload to Azure Blob (PUT with SAS)
- [ ] Node 10: Create SOP record in Supabase
- [ ] Node 11: Create pipeline_runs record
- [ ] Connect nodes after Split In Batches from 2a
- [ ] Test: MP4 in Azure Blob + SOP in Supabase
```

### Status: ⬜ Pending
