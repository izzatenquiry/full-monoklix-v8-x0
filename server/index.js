import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;
const VEO_API_BASE = 'https://aisandbox-pa.googleapis.com/v1';

// A helper to safely parse JSON from a response
async function getJson(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`❌ Upstream API response is not valid JSON. Status: ${response.status}`);
        console.error(`   Body: ${text}`);
        // Return an object that looks like an error structure
        return { 
            error: 'Bad Gateway', 
            message: 'The API returned an invalid (non-JSON) response.', 
            details: text 
        };
    }
}


// ===============================
// 🧩 MIDDLEWARE
// ===============================
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// ===============================
// 🔍 HEALTH CHECK
// ===============================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===============================
// ========== VEO3 ENDPOINTS ==========
// ===============================

// 🎬 TEXT-TO-VIDEO
app.post('/api/veo/generate-t2v', async (req, res) => {
  console.log('\n🎬 ===== [T2V] TEXT-TO-VIDEO REQUEST =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    console.log('📤 Forwarding to Veo API...');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

    const response = await fetch(`${VEO_API_BASE}/video:batchAsyncGenerateVideoText`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    console.log('📨 Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ Veo API Error (T2V):', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ [T2V] Success - Operations:', data.operations?.length || 0);
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (T2V):', error);
    res.status(500).json({ error: error.message });
  }
});

// 🖼️ IMAGE-TO-VIDEO
app.post('/api/veo/generate-i2v', async (req, res) => {
  console.log('\n🖼️ ===== [I2V] IMAGE-TO-VIDEO REQUEST =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    const logBody = JSON.parse(JSON.stringify(req.body));
    if (logBody.requests?.[0]?.startImage?.mediaId) {
      console.log('📤 Has startImage with mediaId:', logBody.requests[0].startImage.mediaId);
    }
    console.log('📤 Prompt:', logBody.requests?.[0]?.textInput?.prompt?.substring(0, 100) + '...');
    console.log('📤 Aspect ratio:', logBody.requests?.[0]?.aspectRatio);
    
    const response = await fetch(`${VEO_API_BASE}/video:batchAsyncGenerateVideoStartImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    console.log('📨 Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ Veo API Error (I2V):', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ [I2V] Success - Operations:', data.operations?.length || 0);
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (I2V):', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔍 CHECK VIDEO STATUS
app.post('/api/veo/status', async (req, res) => {
  console.log('\n🔍 ===== [STATUS] CHECK VIDEO STATUS =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    console.log('📦 Payload:', JSON.stringify(req.body, null, 2));
    
    const response = await fetch(`${VEO_API_BASE}/video:batchCheckAsyncVideoGenerationStatus`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    console.log('📨 Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ Veo API Error (Status):', data);
      return res.status(response.status).json(data);
    }

    if (data.operations?.[0]) {
      console.log('📊 Operation status:', data.operations[0].status);
      console.log('📊 Done:', data.operations[0].done);
    }

    console.log('✅ [STATUS] Success');
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (STATUS):', error);
    res.status(500).json({ error: error.message });
  }
});

// 📤 VEO UPLOAD IMAGE
app.post('/api/veo/upload', async (req, res) => {
  console.log('\n📤 ===== [VEO UPLOAD] IMAGE UPLOAD =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    console.log('📤 Image size:', req.body.imageInput?.rawImageBytes?.length || 0, 'chars');
    console.log('📤 Mime type:', req.body.imageInput?.mimeType);
    console.log('📤 Aspect ratio:', req.body.imageInput?.aspectRatio);

    const response = await fetch(`${VEO_API_BASE}:uploadUserImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    console.log('📨 Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ Upload Error:', data);
      return res.status(response.status).json(data);
    }

    const mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaId;
    console.log('✅ [VEO UPLOAD] Success - MediaId:', mediaId);
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (VEO UPLOAD):', error);
    res.status(500).json({ error: error.message });
  }
});

// ===============================
// ========== IMAGEN ENDPOINTS ==========
// ===============================

// 🎨 GENERATE IMAGE (Imagen T2I)
app.post('/api/imagen/generate', async (req, res) => {
  console.log('\n🎨 ===== [IMAGEN] GENERATE IMAGE =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    console.log('📤 Forwarding to Imagen API...');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

    const response = await fetch(`${VEO_API_BASE}/whisk:generateImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ Imagen API Error:', JSON.stringify(data, null, 2));
      return res.status(response.status).json(data);
    }

    console.log('✅ [IMAGEN] Success - Generated:', data.imagePanels?.length || 0, 'panels');
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (IMAGEN GENERATE):', error);
    res.status(500).json({ error: error.message });
  }
});

// ✏️ RUN RECIPE (Imagen Edit/Compose) - ✅ FIXED FORMAT & ENDPOINT
app.post('/api/imagen/run-recipe', async (req, res) => {
  console.log('\n✏️ ===== [IMAGEN RECIPE] RUN RECIPE =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    console.log('📤 Forwarding recipe to Imagen API...');
    console.log('📦 Full body:', JSON.stringify(req.body, null, 2));

    // CORRECTED ENDPOINT
    const response = await fetch(`${VEO_API_BASE}/whisk:runImageRecipe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ Imagen Recipe Error:', JSON.stringify(data, null, 2));
      return res.status(response.status).json(data);
    }
    
    const panelCount = data.imagePanels?.length || 0;
    const imageCount = data.imagePanels?.[0]?.generatedImages?.length || 0;
    
    console.log('✅ [IMAGEN RECIPE] Success');
    console.log(`   Generated ${panelCount} panel(s) with ${imageCount} image(s)`);
    console.log('=========================================\n');
    
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (IMAGEN RECIPE):', error);
    res.status(500).json({ error: error.message });
  }
});

// 📤 IMAGEN UPLOAD IMAGE - ✅ FIXED FORMAT
app.post('/api/imagen/upload', async (req, res) => {
  console.log('\n📤 ===== [IMAGEN UPLOAD] IMAGE UPLOAD =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    const uploadMediaInput = req.body.uploadMediaInput;
    if (uploadMediaInput) {
      console.log('📤 Media category:', uploadMediaInput.mediaCategory);
      console.log('📤 Raw bytes length:', uploadMediaInput.rawBytes?.length || 0);
    }
    console.log('📦 Full request body keys:', Object.keys(req.body));

    const response = await fetch(`${VEO_API_BASE}:uploadUserImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
      },
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response);
    console.log('📨 Response status:', response.status);
    console.log('📨 Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ Imagen Upload Error:', data);
      return res.status(response.status).json(data);
    }

    const mediaId = data.result?.data?.json?.result?.uploadMediaGenerationId || 
                   data.mediaGenerationId?.mediaGenerationId || 
                   data.mediaId;
    
    console.log('✅ [IMAGEN UPLOAD] Success - MediaId:', mediaId);
    console.log('=========================================\n');
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy error (IMAGEN UPLOAD):', error);
    res.status(500).json({ error: error.message });
  }
});

// ===============================
// 📥 DOWNLOAD VIDEO (CORS BYPASS)
// ===============================
app.get('/api/veo/download-video', async (req, res) => {
  console.log('\n📥 ===== [DOWNLOAD] VIDEO DOWNLOAD =====');
  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl || typeof videoUrl !== 'string') {
      console.error('❌ No URL provided');
      return res.status(400).json({ error: 'Video URL is required' });
    }

    console.log('📥 Video URL:', videoUrl);
    console.log('📥 Fetching and streaming from Google Storage...');

    const response = await fetch(videoUrl);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch video:', response.status, response.statusText);
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Failed to download: ${response.statusText}`, details: errorBody });
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const filename = `monoklix-video-${Date.now()}.mp4`;

    console.log('📦 Video headers received:', { contentType, contentLength });

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    response.body.pipe(res);

    response.body.on('end', () => {
      console.log('✅ [DOWNLOAD] Video stream finished to client.');
      console.log('=========================================\n');
    });

    response.body.on('error', (err) => {
      console.error('❌ [DOWNLOAD] Error during video stream pipe:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming video' });
      }
    });

  } catch (error) {
    console.error('❌ Proxy error (DOWNLOAD):', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// ===============================
// 🚀 SERVER START
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 ===================================');
  console.log('🚀 Veo3 & Imagen Proxy Server STARTED');
  console.log('🚀 ===================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log('✅ CORS: Allow all origins');
  console.log('🔧 Debug logging: ENABLED');
  console.log('===================================\n');
  console.log('📋 VEO3 Endpoints:');
  console.log('   POST /api/veo/generate-t2v');
  console.log('   POST /api/veo/generate-i2v');
  console.log('   POST /api/veo/status');
  console.log('   POST /api/veo/upload');
  console.log('   GET  /api/veo/download-video');
  console.log('\n📋 IMAGEN Endpoints:');
  console.log('   POST /api/imagen/generate');
  console.log('   POST /api/imagen/run-recipe');
  console.log('   POST /api/imagen/upload');
  console.log('===================================\n');
});