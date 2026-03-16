import { useCountryBoolSetting } from './useCountrySetting';

/**
 * Returns whether the vehicle checklist feature is enabled for a given country.
 * Reads from country_settings, falls back to system_settings.
 * Defaults to false (OFF) until loaded.
 */
export function useChecklistFlag(country?: string | null) {
  return useCountryBoolSetting('ENABLE_VEHICLE_CHECKLIST', country, false);
}
