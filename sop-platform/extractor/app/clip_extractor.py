# Implemented in Phase 4
#
# Per-step video clip extraction using FFmpeg
#
# For each SOP step (defined by timestamp_start → timestamp_end):
#   ffmpeg -i input.mp4 -vf "crop=w:h:x:y" \
#          -ss START -to END \
#          -c:v libx264 -crf 23 -c:a aac \
#          clip_STEP_ID.mp4
#
# API endpoint: POST /clips
# Input:  { sop_id, video_path, crop: {x,y,w,h}, steps: [{step_id, start_sec, end_sec}] }
# Output: { clips: [{step_id, clip_path, duration_sec}] }
#
# See: docs/workflow_1_extraction.md Node 11 for full spec
