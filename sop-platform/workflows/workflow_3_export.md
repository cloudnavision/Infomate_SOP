# n8n Workflow 3: Export Generation
# ==================================
# Triggered when user clicks Export DOCX/PDF/Markdown in React app
# Generates static document from SOP platform data

## Trigger
- **Node**: Webhook
- **Method**: POST
- **Path**: /webhook/export
- **Expected payload**:
  ```json
  {
    "sop_id": "uuid",
    "format": "docx",       // "docx" | "pdf" | "markdown"
    "requested_by": "uuid",  // user id
    "template_id": "default" // which DOCX template to use
  }
  ```

---

## Node 1: Postgres — Load full SOP data
- **Type**: n8n-nodes-base.postgres
- **Query**: Same comprehensive query as Workflow 2 Node 1,
  but also loads sop_sections, step_callouts, step_discussions, and property_watchlist
- **Returns**: Complete SOP data as a single JSON object

---

## Node 2: Code — Prepare annotated screenshots
- **Type**: n8n-nodes-base.code
- **Purpose**: For each step, check if annotated_screenshot_url exists.
  If not (or if callouts have been moved since last render), trigger re-render.
- **Code**:
  ```javascript
  const sop = $input.first().json;
  const stepsNeedingRender = [];
  
  for (const step of sop.steps) {
    // Check if any callouts were repositioned after the last render
    const calloutsModified = step.callouts.some(c =>
      new Date(c.updated_at) > new Date(step.annotated_screenshot_updated_at || 0)
    );
    
    if (!step.annotated_screenshot_url || calloutsModified) {
      stepsNeedingRender.push({
        step_id: step.id,
        screenshot_url: step.screenshot_url,
        callouts: step.callouts,
        screenshot_width: step.screenshot_width,
        screenshot_height: step.screenshot_height
      });
    }
  }
  
  return [{ json: { ...sop, steps_needing_render: stepsNeedingRender } }];
  ```

---

## Node 3: HTTP — Render callout annotations (if needed)
- **Type**: n8n-nodes-base.httpRequest (only runs if steps_needing_render is non-empty)
- **URL**: `http://sop-api:8000/api/internal/render-annotations`
- **Method**: POST
- **Body**:
  ```json
  {
    "sop_id": "{{sop_id}}",
    "steps": [
      {
        "step_id": "uuid",
        "screenshot_url": "https://blob.../frame_003.png",
        "callouts": [
          {"number": 1, "label": "Open folder", "x": 428, "y": 196},
          {"number": 2, "label": "Select week", "x": 441, "y": 220}
        ]
      }
    ]
  }
  ```
- **The FastAPI endpoint runs Pillow**:
  ```python
  from PIL import Image, ImageDraw, ImageFont
  import requests
  from io import BytesIO
  
  def render_annotations(screenshot_url, callouts, output_path):
      # Download screenshot from Azure Blob
      response = requests.get(screenshot_url)
      img = Image.open(BytesIO(response.content))
      draw = ImageDraw.Draw(img)
      
      try:
          font_num = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
          font_label = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
      except:
          font_num = ImageFont.load_default()
          font_label = ImageFont.load_default()
      
      for callout in callouts:
          x, y = callout['x'], callout['y']
          num = callout['number']
          
          # Red circle with white outline
          r = 16
          draw.ellipse([x-r-2, y-r-2, x+r+2, y+r+2], fill='white')
          draw.ellipse([x-r, y-r, x+r, y+r], fill='#E24B4A')
          
          # Number centered in circle
          text = str(num)
          bbox = draw.textbbox((0, 0), text, font=font_num)
          tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
          draw.text((x - tw/2, y - th/2 - 2), text, fill='white', font=font_num)
      
      img.save(output_path, 'PNG', quality=95)
      return output_path
  ```
- **Returns**: Annotated PNG paths
- **Upload annotated PNGs to Azure Blob**
- **Update sop_steps.annotated_screenshot_url**

---

## Node 4: Switch — Route by format
- **Type**: n8n-nodes-base.switch
- **Routes**:
  - format === "docx" → Node 5a
  - format === "pdf" → Node 5a → Node 5b (DOCX first, then convert)
  - format === "markdown" → Node 5c

---

## Node 5a: HTTP — Generate DOCX
- **Type**: n8n-nodes-base.httpRequest
- **URL**: `http://sop-api:8000/api/internal/generate-docx`
- **Method**: POST
- **Body**: Full SOP JSON data + template_id
- **The FastAPI endpoint**:
  - Opens the template DOCX (from /data/templates/)
  - Replaces placeholders with generated content
  - Inserts annotated screenshots
  - Populates all tables
  - Saves to /data/exports/{sop_id}/SOP_{title}_{date}.docx
  - Uploads to Azure Blob
  - Returns the download URL

### DOCX generation detail (python-docx logic):

```python
from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
import json
import requests
from io import BytesIO

def generate_sop_docx(sop_data, template_path, output_path):
    doc = Document(template_path)
    
    # ========================================
    # Phase 1: Simple text replacements
    # ========================================
    text_replacements = {
        '{{TITLE}}': sop_data['title'],
        '{{CLIENT_NAME}}': sop_data['client_name'],
        '{{PROCESS_NAME}}': sop_data['process_name'],
        '{{MEETING_DATE}}': sop_data['meeting_date'],
    }
    
    # Add section content to replacements
    for section in sop_data['sections']:
        key = section['section_key'].upper()
        if section['content_type'] == 'text' and section['content_text']:
            text_replacements[f'{{{{{key}}}}}'] = section['content_text']
    
    # Apply text replacements across all paragraphs
    for para in doc.paragraphs:
        for placeholder, value in text_replacements.items():
            if placeholder in para.text:
                for run in para.runs:
                    if placeholder in run.text:
                        run.text = run.text.replace(placeholder, value or '')
    
    # Also check table cells
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for placeholder, value in text_replacements.items():
                        if placeholder in para.text:
                            for run in para.runs:
                                if placeholder in run.text:
                                    run.text = run.text.replace(placeholder, value or '')
    
    # ========================================
    # Phase 2: List replacements
    # ========================================
    for section in sop_data['sections']:
        if section['content_type'] == 'list' and section['content_json']:
            key = f"{{{{{section['section_key'].upper()}}}}}"
            items = section['content_json']
            
            for i, para in enumerate(doc.paragraphs):
                if key in para.text:
                    # Clear the placeholder paragraph
                    para.text = ''
                    
                    # Insert bullet items after this paragraph
                    for item_text in reversed(items):
                        new_para = insert_paragraph_after(para, item_text)
                        new_para.style = doc.styles['List Bullet']
                    
                    # Remove the now-empty placeholder paragraph
                    delete_paragraph(para)
                    break
    
    # ========================================
    # Phase 3: Table population
    # ========================================
    
    # Risk table
    risk_section = find_section(sop_data, 'risks')
    if risk_section and risk_section['content_json']:
        populate_table(doc, '{{RISKS}}', risk_section['content_json'],
                      columns=['risk', 'mitigation'],
                      headers=['Risk', 'Mitigation Point'])
    
    # Software/Access table
    sw_section = find_section(sop_data, 'software_access')
    if sw_section and sw_section['content_json']:
        populate_table(doc, '{{SOFTWARE_ACCESS}}', sw_section['content_json'],
                      columns=['software', 'access_level'],
                      headers=['Software/Application/Mailbox', 'Access Level'])
    
    # Communication matrices
    for matrix_key in ['comm_matrix_infomate', 'comm_matrix_client']:
        section = find_section(sop_data, matrix_key)
        if section and section['content_json']:
            placeholder = f'{{{{{matrix_key.upper()}}}}}'
            populate_comm_matrix(doc, placeholder, section['content_json'])
    
    # Quality parameters
    qp_section = find_section(sop_data, 'quality_params')
    if qp_section and qp_section['content_json']:
        populate_quality_params(doc, '{{QUALITY_PARAMS}}', qp_section['content_json'])
    
    # Statement of Work
    sow_section = find_section(sop_data, 'sow')
    if sow_section and sow_section['content_json']:
        populate_sow_table(doc, '{{SOW}}', sow_section['content_json'])
    
    # Baseline/Target
    bt_section = find_section(sop_data, 'baseline_target')
    if bt_section and bt_section['content_json']:
        populate_table(doc, '{{BASELINE_TARGET}}', bt_section['content_json'],
                      columns=['metric', 'kpi', 'unit', 'current', 'target', 'formula'],
                      headers=['Metric', 'KPI', 'Unit', 'Current', 'Target', 'Formula'])
    
    # ========================================
    # Phase 4: Process map image
    # ========================================
    pm_section = find_section(sop_data, 'process_map')
    if pm_section and pm_section.get('diagram_url'):
        insert_image_at_placeholder(doc, '{{PROCESS_MAP}}', pm_section['diagram_url'],
                                    width=Inches(6.0))
    
    # ========================================
    # Phase 5: Detailed procedure (screenshots + steps)
    # This is the most complex section
    # ========================================
    insert_procedure_section(doc, sop_data['steps'])
    
    # ========================================
    # Phase 6: Property watchlist (if exists)
    # ========================================
    if sop_data.get('property_watchlist'):
        populate_table(doc, '{{WATCHLIST}}', sop_data['property_watchlist'],
                      columns=['property_name', 'known_issues'],
                      headers=['Property', 'Known Issues / Required Actions'])
    
    # Save
    doc.save(output_path)
    return output_path


def insert_procedure_section(doc, steps):
    """Insert the detailed procedure with screenshots and callouts."""
    
    # Find the {{PROCEDURE}} placeholder
    placeholder_para = None
    placeholder_idx = None
    for i, para in enumerate(doc.paragraphs):
        if '{{PROCEDURE}}' in para.text:
            placeholder_para = para
            placeholder_idx = i
            break
    
    if not placeholder_para:
        return
    
    # Get the parent element for insertion
    parent = placeholder_para._element.getparent()
    insert_after = placeholder_para._element
    
    for step in sorted(steps, key=lambda s: s['sequence']):
        # Step instruction paragraph (bullet point)
        step_para = create_paragraph(
            f"  {step['description']}",
            style='List Bullet'
        )
        insert_after.addnext(step_para)
        insert_after = step_para
        
        # Screenshot reference text
        callout_nums = ', '.join(str(c['callout_number']) for c in step.get('callouts', []))
        ref_text = f"(Screenshot {step['sequence']}, callout {callout_nums})"
        ref_para = create_paragraph(ref_text, italic=True, size=Pt(9))
        insert_after.addnext(ref_para)
        insert_after = ref_para
        
        # Annotated screenshot image
        if step.get('annotated_screenshot_url'):
            img_para = create_image_paragraph(
                step['annotated_screenshot_url'],
                width=Inches(5.0)
            )
            insert_after.addnext(img_para)
            insert_after = img_para
        
        # Sub-steps (if any)
        for sub in step.get('sub_steps', []):
            sub_para = create_paragraph(f"  {sub}", style='List Bullet 2')
            insert_after.addnext(sub_para)
            insert_after = sub_para
        
        # Spacing paragraph
        spacer = create_paragraph('')
        insert_after.addnext(spacer)
        insert_after = spacer
    
    # Remove the original placeholder paragraph
    parent.remove(placeholder_para._element)


def populate_table(doc, placeholder, data, columns, headers):
    """Find a table containing the placeholder and populate it."""
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if placeholder in cell.text:
                    # Found the table. Clear placeholder row.
                    placeholder_row = row
                    
                    # Add header row if not already present
                    # (template should have headers, so we just add data rows)
                    
                    # Add data rows
                    for item in data:
                        new_row = table.add_row()
                        for col_idx, col_key in enumerate(columns):
                            value = item.get(col_key, '')
                            if isinstance(value, bool):
                                value = 'X' if value else ''
                            new_row.cells[col_idx].text = str(value)
                            # Copy formatting from header row
                            copy_cell_formatting(
                                table.rows[0].cells[col_idx],
                                new_row.cells[col_idx]
                            )
                    
                    # Remove placeholder row
                    table._tbl.remove(placeholder_row._tr)
                    return


# Helper functions
def find_section(sop_data, key):
    for s in sop_data['sections']:
        if s['section_key'] == key:
            return s
    return None
```

---

## Node 5b: Convert DOCX to PDF (if format === "pdf")
- **Type**: n8n-nodes-base.httpRequest
- **URL**: `http://sop-api:8000/api/internal/convert-to-pdf`
- **Method**: POST
- **Body**: `{"docx_path": "/data/exports/{sop_id}/SOP.docx"}`
- **The FastAPI endpoint runs LibreOffice**:
  ```bash
  soffice --headless --convert-to pdf --outdir /data/exports/{sop_id}/ SOP.docx
  ```
- Upload PDF to Azure Blob

---

## Node 5c: Generate Markdown (if format === "markdown")
- **Type**: n8n-nodes-base.code
- **Purpose**: Generate clean Markdown for Confluence/Notion import
- **Code**:
  ```javascript
  const sop = $input.first().json;
  let md = '';
  
  md += `# ${sop.title}\n\n`;
  md += `**Client:** ${sop.client_name} | **Process:** ${sop.process_name}\n`;
  md += `**Date:** ${sop.meeting_date} | **Version:** ${sop.version || '1.0'}\n\n`;
  md += `---\n\n`;
  
  // Sections
  for (const section of sop.sections.sort((a,b) => a.display_order - b.display_order)) {
    md += `## ${section.section_title}\n\n`;
    
    if (section.content_type === 'text') {
      md += `${section.content_text}\n\n`;
    } else if (section.content_type === 'list') {
      for (const item of (section.content_json || [])) {
        md += `- ${item}\n`;
      }
      md += '\n';
    } else if (section.content_type === 'table') {
      // Generate markdown table
      const items = section.content_json || [];
      if (items.length > 0) {
        const keys = Object.keys(items[0]);
        md += `| ${keys.join(' | ')} |\n`;
        md += `| ${keys.map(() => '---').join(' | ')} |\n`;
        for (const item of items) {
          md += `| ${keys.map(k => item[k] || '').join(' | ')} |\n`;
        }
        md += '\n';
      }
    }
  }
  
  // Procedure steps
  md += `## Detailed Procedure\n\n`;
  for (const step of sop.steps) {
    md += `### Step ${step.sequence}: ${step.title}\n\n`;
    md += `${step.description}\n\n`;
    if (step.annotated_screenshot_url) {
      md += `![Screenshot ${step.sequence}](${step.annotated_screenshot_url})\n\n`;
    }
    for (const sub of (step.sub_steps || [])) {
      md += `  - ${sub}\n`;
    }
    md += '\n';
  }
  
  return [{ json: { markdown: md, sop_id: sop.sop_id } }];
  ```
- Save markdown file to /data/exports/ and upload to Blob

---

## Node 6: Postgres — Record export
- **Type**: n8n-nodes-base.postgres
- **Query**:
  ```sql
  INSERT INTO export_history (sop_id, format, file_url, file_size_bytes,
                              generated_by, sop_version)
  VALUES ('{{sop_id}}', '{{format}}', '{{file_url}}', {{file_size}},
          '{{requested_by}}', (SELECT MAX(version_number) FROM sop_versions WHERE sop_id = '{{sop_id}}'));
  ```

---

## Node 7: Respond to Webhook
- **Type**: n8n-nodes-base.respondToWebhook
- **Response**:
  ```json
  {
    "status": "success",
    "download_url": "https://blob.../exports/SOP_Aged_Debtor_2025-12-31.docx",
    "format": "docx",
    "file_size_bytes": 2456789
  }
  ```