import { v4 as uuidv4 } from 'uuid';
import { fetchWithTokenRotation, getVeoProxyUrl } from './apiClient';
import { addLogEntry } from './aiLogService';

interface Veo3Config {
  authToken: string;
  aspectRatio: 'landscape' | 'portrait';
  seed?: number;
  useStandardModel?: boolean;
}

interface VideoGenerationRequest {
  prompt: string;
  imageMediaId?: string;
  config: Omit<Veo3Config, 'authToken'> & { authToken?: string };
}

const getProxyBaseUrl = (): string => {
  const server = getVeoProxyUrl();
  return `${server}/api/veo`;
};
const PROXY_BASE_URL = getProxyBaseUrl();

export const generateVideoWithVeo3 = async (
    request: VideoGenerationRequest
): Promise<{ operations: any[]; successfulToken: string }> => {
  console.log('🎬 [VEO Service] Preparing generateVideoWithVeo3 request...');
  const { prompt, imageMediaId, config } = request;
  const isImageToVideo = !!imageMediaId;
  const useFastModel = true; 

  let videoModelKey: string;
  
  if (isImageToVideo) {
    videoModelKey = config.aspectRatio === 'landscape'
      ? 'veo_3_1_i2v_s_fast_landscape_ultra'
      : 'veo_3_1_i2v_s_fast_portrait_ultra';
  } else {
    videoModelKey = config.aspectRatio === 'landscape'
      ? 'veo_3_1_t2v_fast_ultra'
      : 'veo_3_1_t2v_fast_portrait_ultra';
  }

  const aspectRatioValue = config.aspectRatio === 'landscape'
    ? 'VIDEO_ASPECT_RATIO_LANDSCAPE'
    : 'VIDEO_ASPECT_RATIO_PORTRAIT';

  const seed = config.seed || Math.floor(Math.random() * 2147483647);
  const sceneId = uuidv4();

  const requestBody: any = {
    clientContext: {
      tool: 'PINHOLE',
      userPaygateTier: 'PAYGATE_TIER_TWO'
    },
    requests: [{
      aspectRatio: aspectRatioValue,
      seed: seed,
      textInput: { prompt },
      videoModelKey: videoModelKey,
      metadata: { sceneId: sceneId }
    }]
  };

  if (imageMediaId) {
    requestBody.requests[0].startImage = { mediaId: imageMediaId };
  }

  console.log('🎬 [VEO Service] Constructed T2V/I2V request body. Sending to API client.');
  const endpoint = isImageToVideo ? '/generate-i2v' : '/generate-t2v';
  const url = `${PROXY_BASE_URL}${endpoint}`;
  
  if (config.authToken) {
    // Health check or direct call: bypass token rotation with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
            const errorMessage = data.error?.message || data.message || `API call failed (${response.status})`;
            throw new Error(errorMessage);
        }
        return { operations: data.operations || [], successfulToken: config.authToken };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out after 15 seconds.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
  } else {
    // Regular production call, use token rotation
    const { data, successfulToken } = await fetchWithTokenRotation(url, requestBody, isImageToVideo ? 'VEO I2V' : 'VEO T2V');
    console.log('🎬 [VEO Service] Received operations from API client:', data.operations?.length || 0);
    return { operations: data.operations || [], successfulToken };
  }
};

export const checkVideoStatus = async (operations: any[], token: string) => {
  console.log(`🔍 [VEO Service] Checking status for ${operations.length} operations...`);
  const url = `${PROXY_BASE_URL}/status`;
  const payload = { operations };

  // Use a direct fetch with the provided token, bypassing rotation.
  const { data } = await fetchWithTokenRotation(url, payload, 'VEO STATUS', token);
  
  if (data.operations && data.operations.length > 0) {
    data.operations.forEach((op: any, idx: number) => {
      console.log(`📊 Operation ${idx + 1} status:`, {
        status: op.status,
        done: op.done,
        hasResult: !!op.result,
        hasError: !!op.error,
        operationName: op.operation?.name
      });
    });
  }

  return data;
};

export const uploadImageForVeo3 = async (
  base64Image: string,
  mimeType: string,
  aspectRatio: 'landscape' | 'portrait'
): Promise<{ mediaId: string; successfulToken: string }> => {
  console.log(`📤 [VEO Service] Preparing to upload image for VEO. MimeType: ${mimeType}`);
  const imageAspectRatioEnum = aspectRatio === 'landscape' 
    ? 'IMAGE_ASPECT_RATIO_LANDSCAPE' 
    : 'IMAGE_ASPECT_RATIO_PORTRAIT';

  const requestBody = {
    imageInput: {
      rawImageBytes: base64Image,
      mimeType: mimeType,
      isUserUploaded: true,
      aspectRatio: imageAspectRatioEnum
    },
    clientContext: {
      sessionId: uuidv4(),
      tool: 'ASSET_MANAGER'
    }
  };

  const url = `${PROXY_BASE_URL}/upload`;
  const { data, successfulToken } = await fetchWithTokenRotation(url, requestBody, 'VEO UPLOAD');
  const mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaId;
  
  if (!mediaId) {
    console.error('❌ No mediaId in response:', JSON.stringify(data, null, 2));
    throw new Error('Upload succeeded but no mediaId returned');
  }
  
  console.log(`📤 [VEO Service] Image upload successful. Media ID: ${mediaId}`);
  return { mediaId, successfulToken };
};