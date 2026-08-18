/**
 * LDAP search-filter construction.
 *
 * Values that reach a filter come from untrusted input (the login form feeds
 * `username` straight into the configured filter template), so they must be
 * escaped per RFC 4515 before substitution.
 */

const SPECIAL_CHARS: Record<string, string> = {
    '\\': '\\5c',
    '*': '\\2a',
    '(': '\\28',
    ')': '\\29',
    '\0': '\\00',
};

/**
 * Escape a value for use inside an LDAP filter (RFC 4515 section 3).
 */
export function escapeFilterValue(value: string): string {
    return value.replace(/[\\*()\0]/g, c => SPECIAL_CHARS[c]);
}

/**
 * Substitute a username into a configured user-search filter template.
 *
 * Accepts both `{{username}}` and `{username}`: databases created by earlier
 * versions of docker-entrypoint.sh persist the single-brace form, and a filter
 * whose placeholder is never substituted matches nothing — which silently turns
 * every LDAP login into a local-account login.
 */
export function buildUserSearchFilter(template: string, username: string): string {
    return template.replace(/\{\{username\}\}|\{username\}/g, escapeFilterValue(username));
}
