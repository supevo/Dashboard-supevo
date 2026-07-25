/**
 * Predefined skill catalog for a marketing agency (media designers & online
 * marketers). Kept deliberately compact — broad areas, not micro-skills.
 * Skills are stored by name, so these strings are the canonical keys.
 */
export interface SkillGroup {
  title: string;
  skills: string[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    title: 'Mediengestaltung',
    skills: [
      'Grafikdesign',
      'Layout & Satz',
      'Bildbearbeitung',
      'Webdesign (UI/UX)',
      'Video & Motion',
      'Fotografie',
      'Illustration',
    ],
  },
  {
    title: 'Online-Marketing',
    skills: [
      'SEO',
      'Google Ads (SEA)',
      'Social Media',
      'Content & Copywriting',
      'E-Mail-Marketing',
      'Web-Analytics',
    ],
  },
];

/** Flat list of all catalog skill names. */
export const SKILL_CATALOG: string[] = SKILL_GROUPS.flatMap((g) => g.skills);
