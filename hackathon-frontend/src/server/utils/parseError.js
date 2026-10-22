/**
 * Parse API error responses into a standardized format
 * @param {Error} error - The error object from a try/catch block or axios catch
 * @param {string} defaultMessage - Default message to show when no specific error details are available
 * @returns {Object} A standardized error object with status and formatted error message
 */
export function parseError(error) {
    const status = error.response?.status;
    if (!status || status >= 500) {
        console.error('Backend proxy request failed:', error);
        return {
            status: 502,
            body: { code: 'proxy_error', message: 'Backend unavailable' },
        };
    }
    return { status, body: error.response.data };
}
