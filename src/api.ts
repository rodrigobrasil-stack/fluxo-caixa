const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  'http://127.0.0.1:8000/api';

function buildUrl(path: string): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Erro na API (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

async function fetchWithError(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new Error(
      `Não foi possível conectar à API. Verifique a URL "${API_BASE}", o CORS e se o backend está online.`
    );
  }
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetchWithError(buildUrl(path));
  return handleResponse<T>(res);
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithError(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithError(buildUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function deleteJSON(path: string): Promise<void> {
  const res = await fetchWithError(buildUrl(path), {
    method: 'DELETE',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Erro ao excluir (${res.status})`);
  }
}