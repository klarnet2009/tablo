/**
 * External API Service
 * Handles authentication and API requests to external cargo API
 */

interface TokenCache {
    token: string;
    expiresAt: number;
}

// Use globalThis to persist cache across hot reloads in dev mode
const globalForToken = globalThis as unknown as {
    externalApiTokenCache: TokenCache | null;
};

// Token validity duration (1 hour, with 5 minute buffer)
const TOKEN_VALIDITY_MS = 55 * 60 * 1000;

/**
 * Get External API configuration from environment
 */
function getConfig() {
    const url = process.env.EXTERNAL_API_URL;
    const username = process.env.EXTERNAL_API_USERNAME;
    const password = process.env.EXTERNAL_API_PASSWORD;

    if (!url || !username || !password) {
        throw new Error('External API configuration missing. Check EXTERNAL_API_URL, EXTERNAL_API_USERNAME, EXTERNAL_API_PASSWORD in .env');
    }

    return { url: url.replace(/\/$/, ''), username, password };
}

/**
 * Authenticate with external API and get bearer token
 */
export async function authenticate(): Promise<string> {
    // Check if we have a valid cached token
    const tokenCache = globalForToken.externalApiTokenCache;
    if (tokenCache && tokenCache.expiresAt > Date.now()) {
        return tokenCache.token;
    }

    const config = getConfig();

    const response = await fetch(`${config.url}/api/login-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            username: config.username,
            password: config.password,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`External API login failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.errors) {
        throw new Error(`External API login error: ${JSON.stringify(data.errors)}`);
    }

    if (!data.access_token) {
        throw new Error('External API login response missing access_token');
    }

    // Cache the token
    globalForToken.externalApiTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + TOKEN_VALIDITY_MS,
    };

    console.log('[External API] Token cached, expires at:', new Date(globalForToken.externalApiTokenCache.expiresAt).toISOString());

    return globalForToken.externalApiTokenCache.token;
}

/**
 * Make an authenticated request to external API
 */
export async function externalApiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const config = getConfig();
    const token = await authenticate();

    const url = `${config.url}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });

    // If unauthorized, clear cache and retry once
    if (response.status === 401) {
        globalForToken.externalApiTokenCache = null;
        const newToken = await authenticate();

        const retryResponse = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${newToken}`,
                ...options.headers,
            },
        });

        if (!retryResponse.ok) {
            const errorBody = await retryResponse.text();
            throw new Error(`External API request failed: ${retryResponse.status} - ${errorBody}`);
        }

        return retryResponse.json();
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`External API request failed: ${response.status} - ${errorBody}`);
    }

    return response.json();
}

/**
 * Clear the cached token (useful for testing or logout)
 */
export function clearTokenCache(): void {
    globalForToken.externalApiTokenCache = null;
}

/**
 * Check if external API is configured
 */
export function isExternalApiConfigured(): boolean {
    try {
        getConfig();
        return true;
    } catch {
        return false;
    }
}
