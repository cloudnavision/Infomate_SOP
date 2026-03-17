# n8n Workflow 2: Section Generation Pipeline
# =============================================
# Triggered by Workflow 1 after extraction completes
# Generates all AI-written SOP sections from the transcript

## Trigger
- **Node**: Execute Workflow Trigger (called by Workflow 1)
- **Input**: { sop_id: "uuid" }

---

## Node 1: Postgres — Load full transcript + step data
- **Type**: n8n-nodes-base.postgres
- **Query**:
  ```sql
  SELECT
    s.id AS sop_id,
    s.title,
    s.client_name,
    s.process_name,
    s.meeting_participants,
    (
      SELECT json_agg(
        json_build_object(
          'speaker', tl.speaker,
          'timestamp', tl.timestamp_sec,
          'text', tl.content
        ) ORDER BY tl.sequence
      )
      FROM transcript_lines tl WHERE tl.sop_id = s.id
    ) AS transcript,
    (
      SELECT json_agg(
        json_build_object(
          'step_id', st.id,
          'sequence', st.sequence,
          'timestamp_start', st.timestamp_start,
          'timestamp_end', st.timestamp_end,
          'gemini_description', st.gemini_description,
          'callouts', (
            SELECT json_agg(
              json_build_object('number', sc.callout_number, 'label', sc.label)
              ORDER BY sc.callout_number
            )
            FROM step_callouts sc WHERE sc.step_id = st.id
          )
        ) ORDER BY st.sequence
      )
      FROM sop_steps st WHERE st.sop_id = s.id
    ) AS steps
  FROM sops s
  WHERE s.id = '{{$json.sop_id}}';
  ```

---

## Node 2: Code — Prepare section generation prompts
- **Type**: n8n-nodes-base.code
- **Purpose**: For each section_template, construct a specific Gemini prompt
  using the transcript as context
- **Code**:
  ```javascript
  const data = $input.first().json;
  const transcript = JSON.stringify(data.transcript);
  const steps = JSON.stringify(data.steps);
  const participants = JSON.stringify(data.meeting_participants);
  
  // Truncate transcript to fit context if needed (keep first 200K chars)
  const transcriptStr = transcript.length > 200000
    ? transcript.substring(0, 200000) + '...[truncated]'
    : transcript;
  
  const sections = [
    {
      key: 'purpose',
      title: 'Purpose/Objective/Scope',
      display_order: 1,
      content_type: 'text',
      prompt: `Based on this transcript of a knowledge transfer session for "${data.process_name}" at ${data.client_name}, write a concise Purpose/Objective/Scope paragraph for an SOP document. Use formal business English. Describe what this process does, who it applies to, and its scope. Keep it to 2-3 sentences.\n\nTranscript:\n${transcriptStr}\n\nReturn ONLY the paragraph text, no JSON wrapping.`
    },
    {
      key: 'inputs',
      title: 'Input',
      display_order: 2,
      content_type: 'list',
      prompt: `From this transcript, identify all inputs required for the "${data.process_name}" process. Inputs are documents, reports, data, or system access needed before the process can begin.\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: ["input1", "input2"]`
    },
    {
      key: 'process_summary',
      title: 'Process Description',
      display_order: 3,
      content_type: 'list',
      prompt: `From this transcript, write a high-level process description as a numbered list of 6-8 steps. Each step should be one sentence in infinitive form (e.g., "Open the Aged Debt report summary file"). This is a SUMMARY, not the detailed procedure.\n\nSteps identified from video:\n${steps}\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: ["Step 1 text", "Step 2 text"]`
    },
    {
      key: 'outputs',
      title: 'Output',
      display_order: 4,
      content_type: 'list',
      prompt: `From this transcript, identify all outputs produced by this process. Outputs are documents, reports, files, or notifications generated at the end.\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: ["output1", "output2"]`
    },
    {
      key: 'risks',
      title: 'Description of Risks',
      display_order: 5,
      content_type: 'table',
      prompt: `From this transcript, identify all process-level risks discussed or implied for "${data.process_name}". For each risk, provide a mitigation point.\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: [{"risk": "description", "mitigation": "mitigation point"}]`
    },
    {
      key: 'training_prereqs',
      title: 'Training Prerequisites',
      display_order: 6,
      content_type: 'list',
      prompt: `From this transcript, identify what software skills or knowledge someone would need before performing this process. Consider what tools are mentioned (Excel, specific systems, etc.)\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: ["MS Excel", "PMS System access"]`
    },
    {
      key: 'software_access',
      title: 'Software Applications/Access Levels',
      display_order: 7,
      content_type: 'table',
      prompt: `From this transcript, identify all software applications, systems, mailboxes, and shared folders mentioned. For each, identify who needs access (use standard BPO roles: AM=Account Manager, TL=Team Lead, SPA=Senior Process Associate, PA=Process Associate).\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: [{"software": "application name", "access_level": "roles"}]`
    },
    {
      key: 'process_map',
      title: 'Process Map',
      display_order: 8,
      content_type: 'diagram',
      prompt: `From this transcript, create a Mermaid.js flowchart diagram showing the process flow for "${data.process_name}" with swim lanes for each stakeholder role. Use the participants: ${participants}. Group them into roles (e.g., "GM/Client", "Finance/Processor", "QC").\n\nSteps:\n${steps}\n\nReturn ONLY the Mermaid.js syntax starting with "graph TD" or "graph LR". Use subgraph for swim lanes. Keep it to 8-12 nodes maximum.`
    },
    {
      key: 'step_descriptions',
      title: 'Detailed Procedure Steps',
      display_order: 9,
      content_type: 'table',
      prompt: `For each of these process steps identified from the video, write:\n1. A clear title (5-8 words, infinitive form)\n2. A detailed description (2-3 sentences, infinitive form, referencing what is visible on screen)\n3. Any sub-steps\n\nSteps from video:\n${steps}\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: [{"step_sequence": 1, "title": "Log in to the shared folder", "description": "Navigate to the SBH Accounts shared folder...", "sub_steps": ["Open Credit Check subfolder", "Select current fiscal year"]}]`
    },
    {
      key: 'comm_matrix_infomate',
      title: 'Communication Matrix - InfoMate',
      display_order: 10,
      content_type: 'table',
      prompt: `From this transcript, identify the InfoMate/processing team's communication and escalation chain. Identify the first communicator, first escalation, second escalation, and final escalation. Include their email addresses if mentioned.\n\nParticipants: ${participants}\nTranscript:\n${transcriptStr}\n\nReturn as JSON: {"first_communicator": {"name": "", "email": ""}, "first_escalation": {"name": "", "email": ""}, "second_escalation": {"name": "", "email": ""}, "final_escalation": {"name": "", "email": ""}}`
    },
    {
      key: 'comm_matrix_client',
      title: 'Communication Matrix - Client',
      display_order: 11,
      content_type: 'table',
      prompt: `From this transcript, identify the client-side communication and escalation chain. Identify the first communicator, first escalation, and final escalation. Include their email addresses if mentioned.\n\nParticipants: ${participants}\nTranscript:\n${transcriptStr}\n\nReturn as JSON: {"first_communicator": {"name": "", "email": ""}, "first_escalation": {"name": "", "email": ""}, "final_escalation": {"name": "", "email": ""}}`
    },
    {
      key: 'quality_params',
      title: 'Quality Parameters',
      display_order: 13,
      content_type: 'table',
      prompt: `From this transcript, identify all data fields in the reports being processed. For each field, classify the error type as "Fatal" (directly impacts financial reporting) or "Non-Fatal" (informational only). Group by report type if multiple report types are discussed.\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON: [{"report_type": "Aged Report", "fields": [{"field": "Hotel", "error_type": "Fatal"}, ...]}]`
    },
    {
      key: 'quality_sampling',
      title: 'Quality Sampling Percentage',
      display_order: 14,
      content_type: 'text',
      prompt: `From this transcript, determine the quality check sampling percentage. If not explicitly mentioned, recommend 100% for financial reporting processes. Return just the text description (e.g., "100% quality check.").`
    },
    {
      key: 'sow',
      title: 'Detailed Statement of Work',
      display_order: 15,
      content_type: 'table',
      prompt: `From this transcript, create a Statement of Work table. For each task discussed, identify:\n- Description of the task\n- Who is responsible: mark with "X" for the correct role column(s) (Client/GM, Processor, QC)\n- Frequency: Weekly, Ad Hoc, Monthly\n- Expected Time: deadline/turnaround\n- Remarks: any SLA exemptions or special conditions\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: [{"description": "task", "responsible_client": true/false, "responsible_processor": true/false, "responsible_qc": true/false, "frequency": "Weekly", "expected_time": "Friday EOD", "remarks": "SLA exempted if reports delayed"}]`
    },
    {
      key: 'baseline_target',
      title: 'Baselining and Target',
      display_order: 16,
      content_type: 'table',
      prompt: `From this transcript, identify KPIs for this process. Typical BPO KPIs include Timeliness (turnaround time) and Accuracy. For each, determine the unit of measure, current baseline (TBA if not mentioned), target, and formula.\n\nTranscript:\n${transcriptStr}\n\nReturn as JSON array: [{"metric": "Timeliness", "kpi": "Turnaround time", "unit": "%", "current": "TBA", "target": "95", "formula": "Completed within SLA * 100 / Total Volume"}]`
    },
    {
      key: 'challenges',
      title: 'Challenges',
      display_order: 17,
      content_type: 'text',
      prompt: `From this transcript, identify potential challenges in carrying out this process. Consider data quality issues, communication gaps, system limitations, and deadline pressures discussed.\n\nTranscript:\n${transcriptStr}\n\nReturn as a bullet-point list (plain text, each line starting with "- ").`
    },
    {
      key: 'improvements',
      title: 'Process Improvements',
      display_order: 18,
      content_type: 'text',
      prompt: `From this transcript, suggest process improvements based on pain points and inefficiencies discussed. Consider automation opportunities, format standardisation, and communication improvements.\n\nTranscript:\n${transcriptStr}\n\nReturn as a bullet-point list (plain text, each line starting with "- ").`
    },
    {
      key: 'discussions',
      title: 'Discussion Context',
      display_order: 99,
      content_type: 'table',
      prompt: `From this transcript, identify every significant question, clarification, decision, or warning that was discussed. For each, provide:\n- A summary of the discussion point\n- The type: "question", "clarification", "decision", "warning"\n- Which speakers were involved\n- The approximate timestamp range\n- Which process step it relates to (by step sequence number, or "general" if not step-specific)\n\nSteps:\n${steps}\nTranscript:\n${transcriptStr}\n\nReturn as JSON: [{"summary": "...", "type": "question", "speakers": ["Suchith", "Lasya"], "start_sec": 52, "end_sec": 90, "related_step": 1}]`
    }
  ];
  
  return sections.map(s => ({ json: s }));
  ```

---

## Node 3: Split In Batches — Generate each section
- **Type**: n8n-nodes-base.splitInBatches
- **Batch Size**: 4 (4 parallel Gemini calls at a time)
- **For each section**:

### Node 3a: HTTP — Gemini generate section
  - **Type**: n8n-nodes-base.httpRequest
  - **Method**: POST
  - **URL**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
  - **Body**:
    ```json
    {
      "contents": [{"parts": [{"text": "{{$json.prompt}}"}]}],
      "generationConfig": {
        "temperature": 0.2,
        "maxOutputTokens": 4096
      }
    }
    ```
  - For the process_map section, temperature = 0.1 (Mermaid syntax needs precision)

### Node 3b: Code — Parse response and prepare DB insert
  ```javascript
  const section = $input.first().json;
  const response = $input.first().json.gemini_response;
  
  // Extract text from Gemini response
  let responseText = response.candidates[0].content.parts[0].text;
  
  // Strip markdown code fences if present
  responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  let contentText = null;
  let contentJson = null;
  let mermaidSyntax = null;
  
  if (section.content_type === 'text') {
    contentText = responseText;
  } else if (section.content_type === 'diagram') {
    mermaidSyntax = responseText;
    // Will render to PNG in a later step
  } else {
    // table, list — parse as JSON
    try {
      contentJson = JSON.parse(responseText);
    } catch (e) {
      // Fallback: store as text if JSON parsing fails
      contentText = responseText;
    }
  }
  
  // Track API cost
  const usage = response.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const cost = (inputTokens * 0.30 / 1000000) + (outputTokens * 2.50 / 1000000);
  
  return [{
    json: {
      sop_id: section.sop_id,
      section_key: section.key,
      section_title: section.title,
      display_order: section.display_order,
      content_type: section.content_type,
      content_text: contentText,
      content_json: contentJson,
      mermaid_syntax: mermaidSyntax,
      api_cost: cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
  }];
  ```

### Node 3c: Postgres — Upsert section
  ```sql
  INSERT INTO sop_sections (sop_id, section_key, section_title, display_order,
                            content_type, content_text, content_json, mermaid_syntax)
  VALUES ({{sop_id}}, '{{section_key}}', '{{section_title}}', {{display_order}},
          '{{content_type}}', {{content_text}}, {{content_json}}, {{mermaid_syntax}})
  ON CONFLICT (sop_id, section_key) DO UPDATE SET
    content_text = EXCLUDED.content_text,
    content_json = EXCLUDED.content_json,
    mermaid_syntax = EXCLUDED.mermaid_syntax,
    updated_at = NOW();
  ```

---

## Node 4: Process special sections

### Node 4a: Update step titles and descriptions from AI
- **Type**: n8n-nodes-base.postgres
- **Purpose**: The 'step_descriptions' section generates better titles/descriptions
  for each step. Apply these to sop_steps.
- **Code node** (before postgres):
  ```javascript
  // Find the step_descriptions section output
  const stepDescs = $input.all().find(
    item => item.json.section_key === 'step_descriptions'
  );
  
  if (stepDescs && stepDescs.json.content_json) {
    return stepDescs.json.content_json.map(step => ({
      json: {
        sop_id: stepDescs.json.sop_id,
        step_sequence: step.step_sequence,
        title: step.title,
        description: step.description,
        sub_steps: JSON.stringify(step.sub_steps || [])
      }
    }));
  }
  return [];
  ```
- **Postgres query** (for each step):
  ```sql
  UPDATE sop_steps
  SET title = '{{title}}',
      description = '{{description}}',
      sub_steps = '{{sub_steps}}'::jsonb
  WHERE sop_id = '{{sop_id}}' AND sequence = {{step_sequence}};
  ```

### Node 4b: Insert discussion context
- **Purpose**: The 'discussions' section produces per-step discussion context.
  Insert into step_discussions table.
- **Code node** extracts discussions and matches them to steps
- **Postgres**: bulk insert into step_discussions

### Node 4c: Render Mermaid process map (if diagram section exists)
- **Type**: n8n-nodes-base.httpRequest
- **URL**: `http://frame-extractor:8001/render-mermaid`
- **Body**:
  ```json
  {
    "sop_id": "{{sop_id}}",
    "mermaid_syntax": "{{mermaid_syntax}}",
    "output_path": "/data/frames/{{sop_id}}/process_map.png",
    "width": 2000
  }
  ```
- **The frame-extractor service runs**:
  ```bash
  npx @mermaid-js/mermaid-cli -i diagram.mmd -o process_map.png -w 2000 -b transparent
  ```
- Upload rendered PNG to Azure Blob
- Update sop_sections.diagram_url for the process_map section

---

## Node 5: Aggregate API costs
- **Type**: n8n-nodes-base.code
- **Purpose**: Sum up all Gemini API costs from this workflow
- **Code**:
  ```javascript
  const allItems = $input.all();
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  
  allItems.forEach(item => {
    totalCost += item.json.api_cost || 0;
    totalInput += item.json.input_tokens || 0;
    totalOutput += item.json.output_tokens || 0;
  });
  
  return [{
    json: {
      sop_id: allItems[0].json.sop_id,
      total_api_cost: Math.round(totalCost * 1000) / 1000,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput
    }
  }];
  ```

---

## Node 6: Postgres — Update pipeline_run costs
- **Type**: n8n-nodes-base.postgres
- **Query**:
  ```sql
  UPDATE pipeline_runs
  SET total_api_cost = total_api_cost + {{total_api_cost}},
      gemini_input_tokens = gemini_input_tokens + {{total_input_tokens}},
      gemini_output_tokens = gemini_output_tokens + {{total_output_tokens}},
      stage_results = stage_results || jsonb_build_object(
        'section_generation', jsonb_build_object(
          'sections_generated', (SELECT COUNT(*) FROM sop_sections WHERE sop_id = '{{sop_id}}'),
          'api_cost', {{total_api_cost}}
        )
      )
  WHERE sop_id = '{{sop_id}}';
  ```