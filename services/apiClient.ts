import { addLogEntry } from './aiLogService';
import { getVeoAuthTokens } from './userService';
import eventBus from './eventBus';

export const getVeoProxyUrl = (): string => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://veo.monoklix.com';
  }
  // In development, vite.config.js proxies requests starting with /api.
  // Using a relative path (by returning an empty string) ensures these requests
  // go to the Vite dev server and are proxied correctly.
  return '';
};

export const getImagenProxyUrl = (): string => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://gem.monoklix.com';
  }
  // In development, vite.config.js proxies requests starting with /api.
  // Using a relative path (by returning an empty string) ensures these requests
  // go to the Vite dev server and are proxied correctly.
  return '';
};

/**
 * Gets shared tokens from session storage.
 */
const getSharedTokens = (): { token: string; createdAt: string }[] => {
    const tokensJSON = sessionStorage.getItem('veoAuthTokens');
    if (tokensJSON) {
        try {
            const parsed = JSON.parse(tokensJSON);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch (e) {
            console.error("Could not parse VEO/Imagen tokens from session storage", e);
        }
    }
    return [];
};

/**
 * Gets the personal token from the current user's data.
 */
const getPersonalToken = (): { token: string; createdAt: string; } | null => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user && user.personalAuthToken) {
                return { token: user.personalAuthToken, createdAt: 'personal' };
            }
        }
    } catch (e) {
        console.error("Could not parse user from localStorage to get personal token", e);
    }
    return null;
};

/**
 * A robust fetch wrapper that handles Veo/Imagen token rotation and retries.
 * @param endpoint - The API endpoint to call (e.g., '/api/veo/generate-t2v').
 * @param requestBody - The JSON body for the POST request.
 * @param logContext - A string describing the operation for logging purposes (e.g., 'VEO T2V').
 * @param specificToken - If provided, bypasses rotation and uses only this token.
 * @returns An object containing the JSON response `data` and the `successfulToken` used.
 */
export const fetchWithTokenRotation = async (
  endpoint: string,
  requestBody: any,
  logContext: string,
  specificToken?: string
): Promise<{ data: any; successfulToken: string }> => {
  console.log(`[API Client] Starting process for: ${logContext}`);

  let tokensToTry: { token: string; createdAt: string }[] = [];

  if (specificToken) {
    // If a specific token is provided (like for status checks), use only that one.
    tokensToTry = [{ token: specificToken, createdAt: 'N/A' }];
  } else {
    // Construct the token list with personal token priority
    const personalToken = getPersonalToken();
    let sharedTokens = getSharedTokens();

    // If shared tokens are missing, try to re-fetch them.
    if (sharedTokens.length === 0) {
        console.log(`[API Client] No shared tokens in session for ${logContext}. Attempting re-fetch.`);
        try {
            const newTokens = await getVeoAuthTokens();
            if (newTokens && newTokens.length > 0) {
                sessionStorage.setItem('veoAuthTokens', JSON.stringify(newTokens));
                sharedTokens = newTokens;
                console.log(`[API Client] Successfully re-fetched ${newTokens.length} shared tokens.`);
            }
        } catch (e) {
            console.error('[API Client] Failed to re-fetch auth tokens:', e);
        }
    }
    
    tokensToTry = [
      ...(personalToken ? [personalToken] : []),
      ...sharedTokens
    ];
  }

  if (tokensToTry.length === 0) {
    console.error(`[API Client] Aborting ${logContext}: No auth tokens available after all checks.`);
    throw new Error(`Auth Token is required for ${logContext}. Please set one in Settings.`);
  }

  let lastError: any = null;

  for (let i = 0; i < tokensToTry.length; i++) {
    const currentToken = tokensToTry[i];
    const isPersonal = currentToken.createdAt === 'personal';
    const tokenIdentifier = isPersonal ? 'Personal Token' : `Shared Token #${i - (getPersonalToken() ? 1 : 0) + 1}`;
    
    console.log(`[API Client] Attempting ${logContext} with ${tokenIdentifier} (...${currentToken.token.slice(-6)})`);
    addLogEntry({ model: logContext, prompt: `Attempt with ${tokenIdentifier}`, output: `...${currentToken.token.slice(-6)}`, tokenCount: 0, status: "Success" });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken.token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log(`[API Client] Response for ${logContext} with ${tokenIdentifier}. Status: ${response.status}`);

      if (!response.ok) {
        const errorMessage = data.error?.message || data.message || `API call failed (${response.status})`;
        throw new Error(errorMessage);
      }
      
      console.log(`✅ [API Client] Success for ${logContext} with ${tokenIdentifier}`);
      return { data, successfulToken: currentToken.token };

    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [API Client] ${tokenIdentifier} failed for ${logContext}:`, errorMessage);
      addLogEntry({ model: logContext, prompt: `${tokenIdentifier} failed`, output: errorMessage, tokenCount: 0, status: 'Error', error: errorMessage });

      if (isPersonal) {
        eventBus.dispatch('personalTokenFailed');
      }

      if (i < tokensToTry.length - 1) {
        console.log(`[API Client] Retrying with next token...`);
      }
    }
  }

  console.error(`[API Client] All ${tokensToTry.length} tokens failed for ${logContext}. Final error:`, lastError);
  addLogEntry({ model: logContext, prompt: 'All available auth tokens failed.', output: `Final error: ${lastError.message}`, tokenCount: 0, status: 'Error', error: lastError.message });
  throw lastError;
};