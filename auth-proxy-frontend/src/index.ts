import xhook from 'xhook';

export interface AuthProxyConfig {
    /**
     * List of domains to proxy.
     * Requests to these domains will be rerouted to the proxy URL.
     */
    domains: string[];
    /**
     * URL of the proxy server.
     */
    proxyUrl: string;
    /**
     * Function to retrieve the authentication token.
     * Defaults to retrieving the cookie from oauth2-proxy.
     */
    getAuthToken?: () => Promise<string | null> | string | null;
}

let config: AuthProxyConfig | null = null;

const defaultGetAuthToken = () => {
    // Default implementation: retrieve token from cookie (e.g., _oauth2_proxy)
    // This is a placeholder; actual implementation depends on how oauth2-proxy stores the token.
    // Often oauth2-proxy handles auth via httpOnly cookies, so we might not need to send a token explicitly
    // if the proxy is on the same domain or we use credentials: 'include'.
    // However, the requirement says "injects a cookie with the authentication details",
    // so we might just rely on the browser sending the cookie.
    // If we need to extract a token from a cookie accessible to JS:
    const match = document.cookie.match(new RegExp('(^| )_oauth2_proxy=([^;]+)'));
    if (match) return match[2];
    return null;
};

export function configureAuthProxy(userConfig: AuthProxyConfig) {
    console.log('Configuring Auth Proxy', userConfig);
    config = {
        ...userConfig,
        getAuthToken: userConfig.getAuthToken || defaultGetAuthToken,
    };

    enableInterception();
}

function shouldProxy(url: string): boolean {
    if (!config) return false;
    try {
        const parsedUrl = new URL(url, window.location.origin);
        return config.domains.some(domain =>
            parsedUrl.host === domain ||
            parsedUrl.hostname === domain ||
            parsedUrl.hostname.endsWith('.' + domain)
        );
    } catch (e) {
        return false;
    }
}

function enableInterception() {
    if (!config) return;

    // Intercept XMLHttpRequest
    xhook.before(async function (request: any, callback: any) {
        if (shouldProxy(request.url)) {
            // Modify URL to point to proxy
            // We need to pass the original URL to the proxy, maybe as a query param or header?
            // The requirement says: "reroute requests to those domains to the proxy instead"
            // and "recreate the API request using the same object that the frontend used".
            // A common pattern is proxyUrl + / + encodedOriginalUrl, or proxyUrl?url=...
            // Or we can send it in a header X-Original-URL.

            // Let's assume we send the original URL in a header `X-Proxy-Target-Url`.
            // And we change the request URL to the proxy URL.

            const originalUrl = request.url;
            request.url = config!.proxyUrl;

            // We also need to ensure we send auth headers if we have a token.
            const token = await Promise.resolve(config!.getAuthToken!());
            if (token) {
                request.headers['Authorization'] = `Bearer ${token}`;
            }

            request.headers['X-Proxy-Target-Url'] = originalUrl;

            // Enable credentials for cross-origin (port) cookies
            request.withCredentials = true;
        }
        callback();
    });

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        let url = input instanceof Request ? input.url : input.toString();

        if (shouldProxy(url)) {
            const originalUrl = url;
            url = config!.proxyUrl;

            const token = await Promise.resolve(config!.getAuthToken!());

            // Merge headers
            const headers = new Headers(init?.headers || {});
            if (token) {
                headers.set('Authorization', `Bearer ${token}`);
            }
            headers.set('X-Proxy-Target-Url', originalUrl);

            const newInit = {
                ...init,
                headers,
                credentials: 'include' as RequestCredentials
            };

            // If input was a Request object, we need to clone it or create a new one with the new URL
            if (input instanceof Request) {
                // We can't easily mutate a Request object's URL. We have to create a new one.
                // But we can pass the new URL and the new init to fetch.
                return originalFetch(url, newInit);
            }

            return originalFetch(url, newInit);
        }

        return originalFetch(input, init);
    };
}
