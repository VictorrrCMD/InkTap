// The check and cross drawn into the PDF are the same glyphs the toolbar
// shows: Phosphor's bold Check and X (MIT), on their 256-unit grid.
export const MARK_BOX = 256

export const MARK_PATHS = {
  check:
    'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
  cross:
    'M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z',
} as const
