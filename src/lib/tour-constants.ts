/** Element IDs used by the onboarding tour. Add these to dashboard elements so the tour can highlight them. */
export const TOUR_STEP_IDS = {
  OVERVIEW: 'tour-overview',
  TASKS: 'tour-tasks',
  TEAM: 'tour-team',
  DOCS: 'tour-docs',
  ACTIVITY: 'tour-activity',
  MAIN: 'tour-main',
  CMD_K: 'tour-command-palette',
} as const;

/** Mobile-specific IDs — bottom nav items need separate IDs so getElementById finds visible elements. */
export const TOUR_STEP_IDS_MOBILE = {
  OVERVIEW: 'tour-overview-m',
  TASKS: 'tour-tasks-m',
  TEAM: 'tour-team-m',
  DOCS: 'tour-docs-m',
  ACTIVITY: 'tour-activity-m',
  MORE: 'tour-more-m',
} as const;
