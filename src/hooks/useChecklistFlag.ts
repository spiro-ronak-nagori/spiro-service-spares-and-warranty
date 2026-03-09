import { useSystemSetting } from './useSystemSetting';

/**
 * Returns whether the vehicle checklist feature is enabled.
 * Defaults to false (OFF) until loaded.
 */
export function useChecklistFlag() {
  return useSystemSetting('ENABLE_VEHICLE_CHECKLIST', false);
}
