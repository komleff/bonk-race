import { MatchSummary } from '@bonk-race/shared/src/types';

// Increased from 3 to 5 retries to handle longer outages
// Total max wait: 1s + 2s + 4s + 8s = 15s (4 delays between 5 attempts)
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

interface MatchResultServiceConfig {
  metaServerUrl: string;
  serverToken: string;
}

/**
 * MatchResultService отправляет результаты матчей с MatchServer на MetaServer.
 * Использует retry с exponential backoff для гарантии доставки.
 */
export class MatchResultService {
  private config: MatchResultServiceConfig;

  constructor(config: MatchResultServiceConfig) {
    this.config = config;
  }

  /**
   * Отправить результаты матча на MetaServer
   */
  async submitMatchResult(matchSummary: MatchSummary): Promise<{ success: boolean; error?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.doSubmit(matchSummary);
        if (result.success) {
          console.log(`[MatchResult] Successfully submitted match ${matchSummary.matchId}`);
          return { success: true };
        }

        lastError = new Error(result.error || 'Unknown error');

        if (!result.retryable) {
          console.error(`[MatchResult] Non-retryable error for match ${matchSummary.matchId}: ${result.error}`);
          return { success: false, error: result.error };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[MatchResult] Attempt ${attempt} failed for match ${matchSummary.matchId}, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    console.error(`[MatchResult] All ${MAX_RETRIES} attempts failed for match ${matchSummary.matchId}: ${lastError?.message}`);
    return { success: false, error: lastError?.message || 'Max retries exceeded' };
  }

  private async doSubmit(matchSummary: MatchSummary): Promise<{ success: boolean; error?: string; retryable: boolean }> {
    const url = `${this.config.metaServerUrl}/api/v1/match-results/submit`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ServerToken ${this.config.serverToken}`,
        },
        body: JSON.stringify(matchSummary),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, retryable: false };
      }

      const body = await response.text();
      let errorMessage = `HTTP ${response.status}: ${body}`;

      try {
        const json = JSON.parse(body);
        errorMessage = json.message || json.error || errorMessage;
      } catch {
        // Use raw body as error
      }

      // 4xx errors (except 429) are not retryable
      const retryable = response.status >= 500 || response.status === 429;

      return { success: false, error: errorMessage, retryable };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout', retryable: true };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let matchResultServiceInstance: MatchResultService | null = null;

/**
 * Инициализировать singleton MatchResultService
 */
export function initializeMatchResultService(config: MatchResultServiceConfig): void {
  matchResultServiceInstance = new MatchResultService(config);
  console.log(`[MatchResult] Service initialized, MetaServer: ${config.metaServerUrl}`);
}

/**
 * Получить экземпляр MatchResultService
 */
export function getMatchResultService(): MatchResultService {
  if (!matchResultServiceInstance) {
    throw new Error('MatchResultService not initialized. Call initializeMatchResultService() first.');
  }
  return matchResultServiceInstance;
}
