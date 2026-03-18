// TypeScript interfaces matching api/app/schemas.py exactly

export type SOPStatus = 'processing' | 'draft' | 'in_review' | 'published' | 'archived'
export type CalloutConfidence = 'ocr_exact' | 'ocr_fuzzy' | 'gemini_only'
export type CalloutMatchMethod = 'ocr' | 'gemini' | 'manual'
export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed'
export type SectionContentType = 'text' | 'list' | 'table' | 'mermaid' | 'html'

export interface StepCallout {
  id: string
  step_id: string
  callout_number: number
  label: string
  element_type: string | null
  target_x: number
  target_y: number
  confidence: CalloutConfidence
  match_method: CalloutMatchMethod
  ocr_matched_text: string | null
  gemini_region_hint: string | null
  was_repositioned: boolean
  original_x: number | null
  original_y: number | null
  created_at: string
  updated_at: string
}

export interface StepClip {
  id: string
  step_id: string
  clip_url: string
  duration_sec: number
  file_size_bytes: number | null
  created_at: string
}

export interface StepDiscussion {
  id: string
  step_id: string
  summary: string
  discussion_type: string | null
  transcript_refs: unknown[]
  transcript_start: number | null
  transcript_end: number | null
  speakers: string[]
  created_at: string
}

export interface SOPStep {
  id: string
  sop_id: string
  sequence: number
  title: string
  description: string | null
  sub_steps: string[]
  timestamp_start: number
  timestamp_end: number | null
  screenshot_url: string | null
  annotated_screenshot_url: string | null
  screenshot_width: number | null
  screenshot_height: number | null
  scene_score: number | null
  frame_classification: string | null
  gemini_description: string | null
  is_approved: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  callouts: StepCallout[]
  clips: StepClip[]
  discussions: StepDiscussion[]
}

export interface SOPSection {
  id: string
  sop_id: string
  section_key: string
  section_title: string
  display_order: number
  content_type: SectionContentType
  content_text: string | null
  content_json: Record<string, unknown> | unknown[] | null
  mermaid_syntax: string | null
  diagram_url: string | null
  is_approved: boolean
  was_edited: boolean
  created_at: string
  updated_at: string
}

export interface WatchlistItem {
  id: string
  sop_id: string
  property_name: string
  known_issues: string | null
  status: string
  required_actions: string | null
  created_at: string
  updated_at: string
}

export interface TranscriptLine {
  id: string
  sop_id: string
  sequence: number
  speaker: string
  timestamp_sec: number
  content: string
  linked_step_id: string | null
  original_speaker: string | null
  original_content: string | null
  was_edited: boolean
  created_at: string
  updated_at: string
}

export interface PipelineRun {
  id: string
  sop_id: string
  status: PipelineStatus
  current_stage: string | null
  stage_results: Record<string, unknown>
  total_api_cost: number
  gemini_input_tokens: number
  gemini_output_tokens: number
  processing_time_sec: number | null
  started_at: string
  completed_at: string | null
  error_message: string | null
  error_stage: string | null
  retry_count: number
}

export interface SOPListItem {
  id: string
  title: string
  status: SOPStatus
  client_name: string | null
  process_name: string | null
  meeting_date: string | null
  created_at: string
  step_count: number
}

export interface SOPDetail {
  id: string
  title: string
  status: SOPStatus
  video_url: string | null
  video_duration_sec: number | null
  video_file_size_bytes: number | null
  cropped_video_url: string | null
  screen_share_periods: unknown[]
  template_id: string | null
  meeting_date: string | null
  meeting_participants: string[]
  client_name: string | null
  process_name: string | null
  created_by: string | null
  published_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  archived_at: string | null
  steps: SOPStep[]
  sections: SOPSection[]
  watchlist: WatchlistItem[]
}
