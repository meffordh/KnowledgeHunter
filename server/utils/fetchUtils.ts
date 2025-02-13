/**
 * Fetches a URL with a custom timeout and headers.
 * @param url The URL to fetch.
 * @param timeout Duration in ms before aborting (default: 2500ms).
 * @returns The response text.
 * @throws Error if the request fails, times out, or returns an error status.
 */
export async function fetchWithTimeout(url: string, timeout = 2500): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Quick check for common problematic URL patterns
    if (url.endsWith('.pdf') || url.includes('gov.au')) {
      console.warn(`Potentially problematic URL detected, using shorter timeout: ${url}`);
      clearTimeout(timeoutId);
      setTimeout(() => controller.abort(), timeout / 2);
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Fail fast for common error status codes
    if (response.status === 403 || response.status === 404 || response.status >= 500) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Add a shorter timeout for reading the response
    const textPromise = response.text();
    const responseTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Response reading timed out')), timeout / 2);
    });

    return await Promise.race([textPromise, responseTimeout]) as string;
  } catch (error) {
    clearTimeout(timeoutId);
    // Enhanced error logging for different types of errors
    if (error.name === 'AbortError') {
      console.error(`Timeout fetching URL (${timeout}ms): ${url}`);
    } else if (error.code === 'ECONNRESET') {
      console.error(`Connection reset while fetching: ${url}`);
    } else {
      console.error("fetchWithTimeout error for URL:", url, error);
    }
    throw error;
  }
}