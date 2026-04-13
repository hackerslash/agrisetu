import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";

type ApiRequestConfig = AxiosRequestConfig & {
  skipUnauthorizedRedirect?: boolean;
};

let apiClient: AxiosInstance | null = null;
let _memoryToken: string | null = null;

// Default token handlers are in-memory only.
// Web auth should primarily use httpOnly cookie sessions.
let _getToken: () => string | null = () => _memoryToken;
let _setToken: (token: string) => void = (token) => {
  _memoryToken = token;
};
let _clearToken: () => void = () => {
  _memoryToken = null;
};
let _onUnauthorized: (() => void) | null = () => {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

/**
 * Override the token storage handlers. Call this early in your app (e.g. in React Native
 * use expo-secure-store). Must be called BEFORE getApiClient() for the first time, or
 * call resetApiClient() afterwards.
 */
export function configureApiClient(options: {
  baseURL?: string;
  getToken?: () => string | null;
  setToken?: (token: string) => void;
  clearToken?: () => void;
  onUnauthorized?: () => void;
}) {
  if (options.getToken) _getToken = options.getToken;
  if (options.setToken) _setToken = options.setToken;
  if (options.clearToken) _clearToken = options.clearToken;
  if (options.onUnauthorized !== undefined)
    _onUnauthorized = options.onUnauthorized;
  if (options.baseURL) _baseURL = options.baseURL;
  // Reset so next call to getApiClient() recreates with new config
  apiClient = null;
}

let _baseURL = "http://localhost:3001/api/v1";

function resolveBaseUrl(): string {
  const envBaseUrl =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  const baseURL = envBaseUrl || _baseURL;
  const isProduction =
    typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  const isLocalhostFallback = baseURL === "http://localhost:3001/api/v1";

  if (isProduction && !envBaseUrl && isLocalhostFallback) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be configured in production builds.",
    );
  }

  return baseURL;
}

export function getApiBaseUrl(): string {
  return resolveBaseUrl();
}

export function resetApiClient() {
  apiClient = null;
}

export function getApiClient(): AxiosInstance {
  if (!apiClient) {
    apiClient = axios.create({
      baseURL: resolveBaseUrl(),
      headers: { "Content-Type": "application/json" },
      withCredentials: true,
    });

    // Request interceptor — attach JWT
    apiClient.interceptors.request.use((config) => {
      const token = _getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor — handle 401
    apiClient.interceptors.response.use(
      (response) => response,
      (err: AxiosError) => {
        const requestConfig = err.config as (typeof err.config & ApiRequestConfig) | undefined;

        if (
          err.response?.status === 401 &&
          _onUnauthorized &&
          !requestConfig?.skipUnauthorizedRedirect
        ) {
          _clearToken();
          _onUnauthorized();
        }
        return Promise.reject(err);
      },
    );
  }

  return apiClient;
}

export function setAuthToken(token: string) {
  _setToken(token);
}

export function clearAuthToken() {
  _clearToken();
}

export function getAuthToken(): string | null {
  return _getToken();
}

export type { ApiRequestConfig };
