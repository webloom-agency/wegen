/**
 * Feature flags for the orchestration system
 * Enable/disable orchestration features safely
 */

export const ORCHESTRATION_FEATURES = {
  // Master switch for the entire orchestration system
  ENABLED: process.env.ORCHESTRATION_ENABLED === 'true' || false,
  
  // Enable query analysis (can be used independently)
  QUERY_ANALYSIS: process.env.ORCHESTRATION_QUERY_ANALYSIS === 'true' || false,
  
  // Enable execution planning
  EXECUTION_PLANNING: process.env.ORCHESTRATION_PLANNING === 'true' || false,
  
  // Enable full orchestration (requires all above)
  FULL_ORCHESTRATION: process.env.ORCHESTRATION_FULL === 'true' || false,
  
  // Debug mode for orchestration
  DEBUG: process.env.ORCHESTRATION_DEBUG === 'true' || false,
} as const;

/**
 * Check if orchestration should be used for a given query
 */
export function shouldUseOrchestration(query: string): boolean {
  if (!ORCHESTRATION_FEATURES.ENABLED) return false;
  if (!ORCHESTRATION_FEATURES.FULL_ORCHESTRATION) return false;
  
  // Additional logic can be added here
  // For now, use orchestration for queries longer than 20 characters
  return query.trim().length > 20;
}

/**
 * Log orchestration debug information
 */
export function debugLog(message: string, data?: any): void {
  if (ORCHESTRATION_FEATURES.DEBUG) {
    console.log(`[ORCHESTRATION DEBUG] ${message}`, data || '');
  }
}
