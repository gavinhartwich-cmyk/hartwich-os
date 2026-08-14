/**
 * Known HVAC franchise / multi-location chain brands — the "maintained
 * list of known HVAC franchise brands" the architecture doc's §5
 * auto-disqualify gate calls for ("large franchise/multi-location chain").
 * Starter set, matched case-insensitively as a substring of the company
 * name; extend via lead_sources_config.config.franchiseBlocklist as more
 * come up rather than editing this file.
 */
export const HVAC_FRANCHISE_BRANDS: readonly string[] = [
  "One Hour Heating & Air Conditioning",
  "One Hour Heating",
  "Aire Serv",
  "Service Experts",
  "ARS/Rescue Rooter",
  "ARS Rescue Rooter",
  "Any Hour Services",
  "Four Seasons Heating and Air Conditioning",
];
