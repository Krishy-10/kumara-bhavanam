/**
 * The people who can be picked on "Who's using this?". In live mode (later)
 * this list will come from allowed_users.display_name; the picker itself
 * stays the same.
 */
export const APP_USERS = ['Krishna Kumar', 'Padmanabhan'] as const;
export type AppUser = (typeof APP_USERS)[number];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}
