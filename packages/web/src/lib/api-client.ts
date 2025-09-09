export class ApiClient {
  private baseUrl: string;
  private getAuthToken: (() => Promise<string | null>) | null = null;

  constructor(
    baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  ) {
    this.baseUrl = baseUrl;
  }

  setAuthTokenProvider(provider: () => Promise<string | null>) {
    this.getAuthToken = provider;
  }

  async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ data: T }> {
    const url = `${this.baseUrl}${path}`;

    // Get auth token if provider is set
    const token = this.getAuthToken ? await this.getAuthToken() : null;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add Authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({ message: 'Request failed' }))) as { message?: string };
      throw new Error(
        error.message ?? `Request failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as T;
    return { data };
  }

  async getBlob(path: string, options: RequestInit = {}): Promise<Blob> {
    const url = `${this.baseUrl}${path}`;

    // Get auth token if provider is set
    const token = this.getAuthToken ? await this.getAuthToken() : null;

    const headers: HeadersInit = {
      ...options.headers,
    };

    // Add Authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Request failed');
      throw new Error(error || `Request failed with status ${response.status}`);
    }

    return response.blob();
  }

  get<T = unknown>(path: string, options?: RequestInit): Promise<{ data: T }> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = unknown>(
    path: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<{ data: T }> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T = unknown>(
    path: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<{ data: T }> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T = unknown>(
    path: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<{ data: T }> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T = unknown>(
    path: string,
    options?: RequestInit
  ): Promise<{ data: T }> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export const api = apiClient;
