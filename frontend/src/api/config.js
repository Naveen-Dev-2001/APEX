/**
 * Common configuration for the backend base URL.
 * Automatically switches between production and local server based on hostname.
 */
const getBaseURL = () => {
    const { hostname } = window.location;
    
    // Check if we are running locally
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8014';
    }
    
    // Production / Remote server IP
    return 'http://10.21.151.5:8014';
};

export const API_BASE_URL = getBaseURL();
