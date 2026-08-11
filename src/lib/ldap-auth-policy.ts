/**
 * Decides what to do when LDAP authentication does not succeed.
 *
 * Kept separate from ldap-service.ts (which needs a live directory) so the
 * policy itself is unit-testable.
 */

export interface LdapFailureInput {
    success: false;
    disabled?: boolean;
    disabledReason?: 'account_disabled' | 'account_expired' | 'account_locked';
    deniedByGroupList?: boolean;
    errorCode?: string;
    error?: string;
}

export interface LdapFailureDecision {
    /** 'fallback' = try the local password table; 'deny' = reject the login. */
    action: 'fallback' | 'deny';
    /** Message to surface to the user. Set whenever action is 'deny'. */
    message?: string;
}

/** Failures that mean "the directory could not answer", not "wrong password". */
const UNAVAILABLE_CODES = new Set([
    'LDAP_UNREACHABLE',
    'TLS_HANDSHAKE_FAILED',
    'BIND_FAILED',
    'BASE_DN_INVALID',
    'SEARCH_ERROR',
]);

export function resolveLdapFailure(
    config: { disableLocalFallback: boolean },
    result: LdapFailureInput
): LdapFailureDecision {
    // Account state in the directory always wins: a disabled or expired account
    // must not be able to log in with a stale local password.
    if (result.disabled) {
        if (result.disabledReason === 'account_expired') {
            return { action: 'deny', message: 'Account has expired. Please contact your administrator.' };
        }
        if (result.disabledReason === 'account_locked') {
            return { action: 'deny', message: 'Account is locked. Please contact your administrator.' };
        }
        return { action: 'deny', message: 'Account is disabled. Please contact your administrator.' };
    }

    if (result.deniedByGroupList) {
        return { action: 'deny', message: 'Access denied. You are not authorized to use this application.' };
    }

    if (config.disableLocalFallback) {
        if (result.errorCode && UNAVAILABLE_CODES.has(result.errorCode)) {
            return {
                action: 'deny',
                message: 'The directory service is unavailable. Please try again later or contact your administrator.',
            };
        }
        return { action: 'deny', message: 'Invalid username or password.' };
    }

    return { action: 'fallback' };
}
