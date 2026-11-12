import { Router } from 'express';
import { BrandingService } from '../services/branding/branding.service.js';
import { AspectRatioKey } from '../services/branding/branding.types.js';

export const brandingRouter = Router();
const brandingService = new BrandingService();

// GET /api/branding - Get channel branding configuration
brandingRouter.get('/', async (req, res) => {
  try {
    const storyId = req.query.storyId ? String(req.query.storyId) : undefined;
    const config = await brandingService.getBrandingConfig(storyId);
    res.json(config);
  } catch (err: any) {
    console.error('[BrandingRouter] Fetch failed:', err);
    res.status(500).json({ message: 'Failed to retrieve branding configuration' });
  }
});

// POST /api/branding - Save channel branding configuration
brandingRouter.post('/', async (req, res) => {
  try {
    const storyId = req.query.storyId ? String(req.query.storyId) : undefined;
    const config = await brandingService.saveBrandingConfig(req.body, storyId);
    res.json({
      success: true,
      config,
    });
  } catch (err: any) {
    console.error('[BrandingRouter] Save failed:', err);
    res.status(500).json({ message: err.message || 'Failed to save branding configuration' });
  }
});

// POST /api/branding/upload - Upload logo, secondary badge, or subscribe button
brandingRouter.post('/upload', async (req, res) => {
  try {
    const { base64Data, filename = 'logo.png', assetType = 'logo', storyId } = req.body;

    if (!base64Data) {
      return res.status(400).json({ message: 'base64Data is required' });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Extract mime type from header or fallback
    const matchMime = base64Data.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    const mimeType = matchMime ? matchMime[1] : (filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png');

    const result = await brandingService.uploadBrandingAsset({
      buffer,
      originalFilename: filename,
      mimeType,
      assetType,
      storyId,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[BrandingRouter] Upload failed:', err);
    res.status(500).json({ message: err.message || 'Branding asset upload failed' });
  }
});

// GET /api/branding/calculate - Preview calculated placement for a viewport
brandingRouter.get('/calculate', async (req, res) => {
  try {
    const storyId = req.query.storyId ? String(req.query.storyId) : undefined;
    const format = (req.query.format as AspectRatioKey) || '16:9';
    const width = Number(req.query.width) || (format === '9:16' ? 1080 : 1920);
    const height = Number(req.query.height) || (format === '9:16' ? 1920 : 1080);
    const timeMs = Number(req.query.timeMs) || 0;

    const config = await brandingService.getBrandingConfig(storyId);
    const placement = BrandingService.calculatePlacement(config, format, width, height, timeMs);

    res.json({
      format,
      viewport: { width, height },
      placement,
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to calculate branding placement' });
  }
});
