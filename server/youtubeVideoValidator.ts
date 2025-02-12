import { z } from "zod";

/**
 * Interface for YouTube player response data
 */
interface YouTubePlayerResponse {
  playabilityStatus: {
    status: string;
    reason?: string;
  };
}

/**
 * Validates that the provided YouTube video URL corresponds to an available video.
 * It fetches the URL and inspects the page content for error markers.
 * @param videoUrl The YouTube video URL to validate
 * @returns Promise<boolean> indicating if the video is valid and available
 */
export async function isYouTubeVideoValid(videoUrl: string): Promise<boolean> {
  try {
    // Basic URL validation
    if (!videoUrl.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/)) {
      console.error("Invalid YouTube URL format:", videoUrl);
      return false;
    }

    const response = await fetch(videoUrl);
    // Note: YouTube returns 200 even for error pages
    const text = await response.text();

    // Check for common error messages
    const errorMessages = [
      "This video is unavailable",
      "This video has been removed",
      "This video is private",
      "This video is no longer available",
    ];

    if (errorMessages.some(msg => text.includes(msg))) {
      console.warn(`YouTube video unavailable (error message found): ${videoUrl}`);
      return false;
    }

    // Extract and parse embedded player response JSON
    const playerResponseMatch = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]) as YouTubePlayerResponse;
        if (
          playerResponse.playabilityStatus &&
          (playerResponse.playabilityStatus.status === "ERROR" ||
           playerResponse.playabilityStatus.status === "UNPLAYABLE")
        ) {
          console.warn(
            `YouTube video unplayable: ${videoUrl}`,
            playerResponse.playabilityStatus.reason || "No reason provided"
          );
          return false;
        }
      } catch (jsonError) {
        console.error("Failed to parse YouTube player response:", jsonError);
        // Continue with validation, don't fail just because we couldn't parse the JSON
      }
    }

    // If no error markers were found, consider the video valid
    return true;
  } catch (error) {
    console.error("Error validating YouTube video:", error);
    // On network or other errors, return false to avoid embedding potentially broken videos
    return false;
  }
}
