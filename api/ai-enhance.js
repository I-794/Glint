import {
  DEFAULT_VISION_MODEL,
  clampNumber,
  dataUrlFromBase64,
  handleApiError,
  openAIChat,
  parseBody,
  requirePost,
  textFromChat
} from './_shared.js';
import { metered } from './_account.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

function parseFilters(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[0]);
    return {
      brightness: clampNumber(raw.brightness, 80, 140, 100),
      contrast: clampNumber(raw.contrast, 80, 150, 100),
      saturation: clampNumber(raw.saturation, 60, 160, 100)
    };
  } catch (e) {
    return null;
  }
}

export default metered('enhance', handler);

async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { image, mimeType = 'image/jpeg' } = parseBody(req);
    if (!image) {
      res.status(400).json({ error: 'Missing image' });
      return;
    }

    const model = process.env.OPENAI_ENHANCE_MODEL || process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
    const data = await openAIChat({
      model,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this image and suggest tasteful CSS filter values. Return only JSON with brightness (80-140), contrast (80-150), and saturation (60-160).'
          },
          { type: 'image_url', image_url: { url: dataUrlFromBase64(image, mimeType) } }
        ]
      }]
    });

    const filters = parseFilters(textFromChat(data));
    if (!filters) {
      res.status(502).json({ error: 'Could not parse filter suggestions' });
      return;
    }

    res.status(200).json({ filters, provider: 'openai', model });
  } catch (error) {
    handleApiError(res, error);
  }
}
