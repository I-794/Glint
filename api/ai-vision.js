import {
  DEFAULT_VISION_MODEL,
  dataUrlFromBase64,
  handleApiError,
  openAIChat,
  parseBody,
  requirePost,
  textFromChat
} from './_shared.js';
import { metered } from './_account.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default metered('vision', handler);

async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { image, mimeType = 'image/png', prompt, maxTokens } = parseBody(req);
    if (!image) {
      res.status(400).json({ error: 'Missing image' });
      return;
    }
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const model = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
    const maxTokenCount = Math.max(1, Math.min(Number(maxTokens) || 1024, 2048));
    const data = await openAIChat({
      model,
      max_tokens: maxTokenCount,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrlFromBase64(image, mimeType) } }
        ]
      }]
    });

    const text = textFromChat(data);
    if (!text) {
      res.status(502).json({ error: 'No text returned' });
      return;
    }

    res.status(200).json({ text, provider: 'openai', model });
  } catch (error) {
    handleApiError(res, error);
  }
}
