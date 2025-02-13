/**
 * Fetches a URL with a custom timeout and headers.
 * @param url The URL to fetch.
 * @param timeout Duration in ms before aborting (default: 5000ms).
 * @returns The response text.
 * @throws Error if the request fails, times out, or returns an error status.
 */
export async function fetchWithTimeout(url: string, timeout = 5000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // Using "follow" so that we follow redirects, but note that excessive redirects will throw
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("fetchWithTimeout error for URL:", url, error);
    throw error;
  }
}