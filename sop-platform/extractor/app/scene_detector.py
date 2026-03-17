# Implemented in Phase 4
#
# 5-stage frame extraction pipeline for Teams recordings:
#
#   Stage 1 — Gemini crop detection
#       Sample video at 0.5 FPS, identify screen-share bounding box
#
#   Stage 2 — FFmpeg crop + PySceneDetect adaptive threshold
#       Crop video to screen-share region, run adaptive scene detection
#       (avoids fixed threshold problems with Teams UI chrome)
#
#   Stage 3 — Perceptual deduplication (imagehash phash, threshold 8)
#       Remove near-identical frames captured during scroll/load transitions
#
#   Stage 4 — Transition frame filtering
#       Capture at T+1.5 seconds offset to skip half-rendered windows
#
#   Stage 5 — Gemini classification
#       Label each surviving frame: USEFUL / TRANSITIONAL / DUPLICATE
#
# Typical result for 30-min meeting: ~38 raw → ~14 after dedup → ~11 useful
#
# See: docs/workflow_1_extraction.md Node 8 for API contract
