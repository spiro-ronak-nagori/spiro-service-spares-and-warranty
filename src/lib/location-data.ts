// ── Shared location dataset for workshop create/edit ──────────────────
export type CityEntry = { name: string; province: string };

export const LOCATION_DATA: Record<string, CityEntry[]> = {
  Uganda: [
    { name: 'Kampala', province: 'Central Region' },
    { name: 'Mukono', province: 'Central Region' },
    { name: 'Wakiso', province: 'Central Region' },
    { name: 'Jinja', province: 'Eastern Region' },
    { name: 'Mbarara', province: 'Western Region' },
    { name: 'Masaka', province: 'Central Region' },
    { name: 'Fort Portal', province: 'Western Region' },
    { name: 'Gulu', province: 'Northern Region' },
    { name: 'Lira', province: 'Northern Region' },
    { name: 'Iganga', province: 'Eastern Region' },
    { name: 'Mbale', province: 'Eastern Region' },
  ],
  Kenya: [
    { name: 'Nairobi', province: 'Nairobi County' },
    { name: 'Mombasa', province: 'Coast Province' },
    { name: 'Eldoret', province: 'Rift Valley Region' },
    { name: 'Kisumu', province: 'Nyanza Province' },
  ],
  Rwanda: [
    { name: 'Kigali', province: 'Kigali City Province' },
    { name: 'Muhanga', province: 'Southern Province' },
    { name: 'Kayonza', province: 'Eastern Province' },
    { name: 'Rwamagana', province: 'Eastern Province' },
    { name: 'Bugesera', province: 'Eastern Province' },
  ],
};

export const COUNTRIES = Object.keys(LOCATION_DATA);

/** Get the list of cities for a given country */
export function getCitiesForCountry(country: string): CityEntry[] {
  return LOCATION_DATA[country] ?? [];
}

/** Derive province from a country + city combination */
export function getProvinceForCity(country: string, city: string): string {
  const entry = getCitiesForCountry(country).find((c) => c.name === city);
  return entry?.province ?? '';
}

/** Validate that a city belongs to the given country */
export function isCityInCountry(country: string, city: string): boolean {
  return getCitiesForCountry(country).some((c) => c.name === city);
}
