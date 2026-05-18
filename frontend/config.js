// Enhanced config.js with better error handling, debugging, and authentication
const configuredApiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim();
const apiHost = typeof window !== 'undefined' && window.location.hostname
  ? window.location.hostname
  : 'localhost';

export const API_BASE_URL = (configuredApiBaseUrl || `http://${apiHost}:5001`).replace(/\/$/, '');
const DEFAULT_API_TIMEOUT_MS = 90000;

// List of endpoints that do not require authentication
const UNAUTHENTICATED_ENDPOINTS = [
  '/api/forgot-password/request',
  '/api/forgot-password/verify',
  '/api/forgot-password/reset'
];

// Generic API call function
export async function apiCall(endpoint, options = {}) {
  const baseUrl = API_BASE_URL; // Use the defined constant
  const token = sessionStorage.getItem('token');
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: externalSignal,
    ...requestOptions
  } = options;

  // Conditionally add token only if the endpoint requires authentication
  const headers = {
    'Content-Type': 'application/json',
    ...(UNAUTHENTICATED_ENDPOINTS.includes(endpoint) ? {} : (token ? { 'Authorization': `Bearer ${token}` } : {})),
    ...(options.headers || {}) // Merge any additional headers
  };

  const url = `${baseUrl}${endpoint}`; // Construct the full URL
  const controller = new AbortController();
  const timeoutDuration = Number(timeoutMs);
  const timeoutId = Number.isFinite(timeoutDuration) && timeoutDuration > 0
    ? setTimeout(() => controller.abort(), timeoutDuration)
    : null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    console.log(`API Call: ${options.method || 'GET'} ${url}`); // Log the request

    const response = await fetch(url, {
      ...requestOptions,
      headers: headers,
      signal: controller.signal
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorText = await response.text(); // Attempt to read error message
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorText;
        } catch {
          errorMessage = errorText || errorMessage;
        }
      } catch (e) {
        errorMessage = `Gagal membaca respons kesalahan: ${e.message}`;
      }
      console.error(`API Call failed for ${endpoint}: HTTP ${response.status} - ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      const responseText = await response.text();
      console.warn(`Non-JSON response for ${endpoint}:`, responseText);
      return responseText; // Or handle as needed
    }

  } catch (error) {
    console.error('API Call failed for', endpoint, ':', error);
    if (error?.name === 'AbortError') {
      throw new Error('Server sedang dinyalakan atau respons terlalu lama. Mohon coba lagi sebentar.');
    }
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(`Tidak dapat terhubung ke backend di ${baseUrl}. Pastikan npm run server sedang berjalan.`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Authenticated API call - explicitly requires token
export async function authenticatedApiCall(endpoint, options = {}) {
  if (typeof options === 'string') {
    options = { method: options };
  }

  const token = sessionStorage.getItem('token');

  if (!token) {
    throw new Error('Token autentikasi tidak ditemukan. Silakan masuk kembali.');
  }

  // Add the token to the headers if not already present
  const headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
  };

  return apiCall(endpoint, { ...options, headers });
}

// Add a utility function to test the API connection
export async function testApiConnection() {
  try {
    console.log('Testing API connection...');
    const result = await apiCall('/api/test-db');
    console.log('API connection test successful:', result);
    return true;
  } catch (error) {
    console.error('API connection test failed:', error);
    return false;
  }
}

// Add a utility function to check server health
export async function checkServerHealth() {
  try {
    console.log('Checking server health...');
    const result = await apiCall('/');
    console.log('Server health check successful:', result);
    return true;
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
}

// Utility function to check if user is authenticated
export function isAuthenticated() {
  const token = sessionStorage.getItem('token');
  const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
  return !!(token && isLoggedIn);
}

// Utility function to get current user info
export function getCurrentUser() {
  const userStr = sessionStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

// Utility function to clear authentication
export function clearAuth() {
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("token");
  console.log('Authentication cleared');
}
