// The fixed humor vocabulary Gemini tags cracks and captions with. Keeping
// it fixed is what makes counts comparable across cracks and users. Safe to
// import from client components.

export const STYLES = [
  { key: "wordplay", label: "Wordplay", color: "#5b8fb0" },
  { key: "absurdist", label: "Absurdist", color: "#8a5a7a" },
  { key: "observational", label: "Observational", color: "#6f9468" },
  { key: "self-deprecating", label: "Self-deprecating", color: "#b5822a" },
  { key: "dark", label: "Dark", color: "#4a4a5e" },
  { key: "satire", label: "Satire", color: "#d86e4e" },
  { key: "wholesome", label: "Wholesome", color: "#c9799a" },
  { key: "irony", label: "Irony / meta", color: "#3f8a8a" },
  { key: "relatable", label: "Relatable", color: "#9a8c3a" },
  { key: "reference", label: "Reference-heavy", color: "#7a6ab0" },
] as const;

export const TOPICS = [
  { key: "academics", label: "Classes & the Core" },
  { key: "studying", label: "Studying & Butler" },
  { key: "dining", label: "Dining" },
  { key: "housing", label: "Housing" },
  { key: "nyc", label: "MTA & NYC" },
  { key: "careers", label: "Careers & finance" },
  { key: "social", label: "Dating & social life" },
  { key: "campus", label: "Campus life" },
  { key: "weather", label: "Weather" },
  { key: "other", label: "Other" },
] as const;

export type StyleKey = (typeof STYLES)[number]["key"];
export type TopicKey = (typeof TOPICS)[number]["key"];

export const STYLE_KEYS: readonly string[] = STYLES.map((s) => s.key);
export const TOPIC_KEYS: readonly string[] = TOPICS.map((t) => t.key);

export function styleInfo(key: string | null | undefined) {
  return STYLES.find((s) => s.key === key);
}

export function tagLabel(key: string) {
  return (
    STYLES.find((s) => s.key === key)?.label ??
    TOPICS.find((t) => t.key === key)?.label ??
    key
  );
}
