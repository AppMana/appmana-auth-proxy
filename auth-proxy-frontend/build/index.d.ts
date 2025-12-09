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
export declare function configureAuthProxy(userConfig: AuthProxyConfig): void;
