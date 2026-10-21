/**
 * Parse API error responses into a standardized format
 * @param {Error} error - The error object from a try/catch block or axios catch
 * @param {string} defaultMessage - Default message to show when no specific error details are available
 * @returns {Object} A standardized error object with status and formatted error message
 */
export function parseError(error) {
    // Handle other error types
    return {
        status: error.response?.status || 500,
        error: error.response?.data || error.message,
    };
}
