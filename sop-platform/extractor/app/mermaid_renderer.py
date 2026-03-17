# Implemented in Phase 4
#
# Mermaid process map rendering to PNG via mermaid-cli (mmdc)
#
# Flow:
#   1. Write mermaid_syntax to a temp .mmd file
#   2. Run: mmdc -i diagram.mmd -o process_map.png -w 2000 -b transparent
#          -p /app/puppeteer.config.json
#   3. Upload resulting PNG to Azure Blob Storage
#   4. Return the Blob URL
#
# API endpoint: POST /render-mermaid
# Input:  { sop_id, mermaid_syntax, output_path, width }
# Output: { diagram_url }
#
# Note: puppeteer.config.json must set --no-sandbox for Docker
# See: docs/workflow_2_section_generation.md Node 4c
