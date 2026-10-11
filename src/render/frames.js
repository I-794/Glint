import { state } from '../state/state.js';
import { FRAME_INSETS } from '../state/presets.js';

export function drawDeviceFrame(ctx, x, y, width, height) {
  const t = state.deviceFrame.type;
  if (!t) return;
  if (t === 'macos') drawMacOSWindow(ctx, x, y, width, height);
  else if (t === 'windows') drawWindowsWindow(ctx, x, y, width, height);
  else if (t === 'iphone') drawIphoneFrame(ctx, x, y, width, height);
  else if (t === 'chrome' || t === 'safari' || t === 'firefox') drawBrowserFrame(ctx, x, y, width, height, t);
}

function drawMacOSWindow(ctx, x, y, width, height) {
  const titleBarHeight = FRAME_INSETS.macos.top;
  const isDark = state.deviceFrame.color === 'dark';
  const rad = state.borderRadius;
  ctx.save();

  const barColor = isDark ? '#2d2d2d' : '#ececec';
  const barColor2 = isDark ? '#1e1e1e' : '#d6d6d6';
  const titleBarGradient = ctx.createLinearGradient(x, y, x, y + titleBarHeight);
  titleBarGradient.addColorStop(0, barColor);
  titleBarGradient.addColorStop(1, barColor2);
  ctx.fillStyle = titleBarGradient;

  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + width - rad, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
  ctx.lineTo(x + width, y + titleBarHeight);
  ctx.lineTo(x, y + titleBarHeight);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + titleBarHeight);
  ctx.lineTo(x + width, y + titleBarHeight);
  ctx.stroke();

  const bY = y + titleBarHeight / 2;
  const bSpacing = 20, bRad = 6, startX = x + 12;
  [['#ff5f57', '#e04038'], ['#ffbd2e', '#dea123'], ['#28ca42', '#1fa935']].forEach(([fill, stroke], i) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(startX + bSpacing * i, bY, bRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });

  const titleText = state.deviceFrame.title || 'Screenshot';
  ctx.fillStyle = isDark ? '#cccccc' : '#333333';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, x + width / 2, y + titleBarHeight / 2);

  ctx.restore();
}

function drawWindowsWindow(ctx, x, y, width, height) {
  const titleBarHeight = FRAME_INSETS.windows.top;
  const isDark = state.deviceFrame.color === 'dark';
  const rad = state.borderRadius;
  ctx.save();

  ctx.fillStyle = isDark ? '#202020' : '#f0f0f0';
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + width - rad, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
  ctx.lineTo(x + width, y + titleBarHeight);
  ctx.lineTo(x, y + titleBarHeight);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + titleBarHeight);
  ctx.lineTo(x + width, y + titleBarHeight);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#888' : '#555';
  ctx.fillRect(x + 8, y + titleBarHeight / 2 - 8, 16, 16);

  const titleText = state.deviceFrame.title || 'Screenshot';
  ctx.fillStyle = isDark ? '#cccccc' : '#202020';
  ctx.font = '13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, x + 32, y + titleBarHeight / 2);

  const btnW = 46, btnH = titleBarHeight;
  ['–', '□', '✕'].forEach((ch, i) => {
    const bx = x + width - btnW * (3 - i);
    ctx.fillStyle = isDark ? '#444' : '#ccc';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, bx + btnW / 2, y + btnH / 2);
  });

  ctx.restore();
}

function drawIphoneFrame(ctx, x, y, width, height) {
  const isDark = state.deviceFrame.color === 'dark';
  const bodyColor = isDark ? '#1c1c1e' : '#f5f5f7';
  const bodyStroke = isDark ? '#3a3a3c' : '#d1d1d6';
  const screenBg = isDark ? '#000000' : '#ffffff';
  const rad = 50;
  const insets = FRAME_INSETS.iphone;

  ctx.save();

  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = bodyStroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + width - rad, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
  ctx.lineTo(x + width, y + height - rad);
  ctx.quadraticCurveTo(x + width, y + height, x + width - rad, y + height);
  ctx.lineTo(x + rad, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const sX = x + insets.left, sY = y + insets.top;
  const sW = width - insets.left - insets.right;
  const sH = height - insets.top - insets.bottom;
  ctx.fillStyle = screenBg;
  ctx.fillRect(sX, sY, sW, sH);

  const diW = Math.min(sW * 0.35, 120), diH = 28;
  const diX = sX + sW / 2 - diW / 2, diY = sY + 6;
  ctx.fillStyle = '#000000';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(diX, diY, diW, diH, diH / 2);
    ctx.fill();
  } else {
    ctx.fillRect(diX, diY, diW, diH);
  }

  ctx.fillStyle = isDark ? '#ffffff' : '#000000';
  ctx.font = 'bold 14px -apple-system, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('9:41', sX + 10, sY + 8);

  ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sX + sW - 32, sY + 10, 22, 12);
  ctx.fillStyle = isDark ? '#ffffff' : '#000000';
  ctx.fillRect(sX + sW - 30, sY + 12, 16, 8);
  ctx.fillRect(sX + sW - 10, sY + 13, 2, 6);

  const hiW = Math.min(sW * 0.3, 100), hiH = 5;
  const hiX = sX + sW / 2 - hiW / 2, hiY = sY + sH - 16;
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(hiX, hiY, hiW, hiH, hiH / 2);
    ctx.fill();
  } else {
    ctx.fillRect(hiX, hiY, hiW, hiH);
  }

  ctx.restore();
}

function drawBrowserFrame(ctx, x, y, width, height, browser) {
  const insets = FRAME_INSETS[browser];
  const isDark = state.deviceFrame.color === 'dark';
  const totalTop = insets.top;
  const rad = state.borderRadius;

  ctx.save();

  const bgColor = isDark ? '#292929' : '#dee1e6';
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + width - rad, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
  ctx.lineTo(x + width, y + totalTop);
  ctx.lineTo(x, y + totalTop);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + totalTop);
  ctx.lineTo(x + width, y + totalTop);
  ctx.stroke();

  const tabH = 36, toolH = totalTop - tabH;

  ctx.fillStyle = isDark ? '#1e1e1e' : '#c4c7cc';
  ctx.fillRect(x, y, width, tabH);

  const tabW = Math.min(200, width * 0.25);
  ctx.fillStyle = isDark ? '#292929' : '#dee1e6';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + tabH);
  ctx.lineTo(x + 12, y + 4);
  ctx.lineTo(x + tabW - 4, y + 4);
  ctx.lineTo(x + tabW + 4, y + tabH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isDark ? '#ccc' : '#333';
  ctx.font = '12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tabTitle = (state.deviceFrame.url || 'https://example.com').replace(/^https?:\/\//, '').split('/')[0];
  ctx.fillText(tabTitle.substring(0, 20), x + 20, y + tabH / 2);

  const toolY = y + tabH;

  ctx.fillStyle = isDark ? '#aaa' : '#555';
  ctx.font = '16px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('←', x + 18, toolY + toolH / 2);
  ctx.fillText('→', x + 38, toolY + toolH / 2);
  ctx.fillText('↺', x + 58, toolY + toolH / 2);

  const addrX = x + 70, addrY = toolY + (toolH - 28) / 2;
  const addrW = width - 80;
  ctx.fillStyle = isDark ? '#3a3a3c' : '#ffffff';
  ctx.strokeStyle = isDark ? '#555' : '#ccc';
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(addrX, addrY, addrW, 28, 14);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(addrX, addrY, addrW, 28);
    ctx.strokeRect(addrX, addrY, addrW, 28);
  }

  let icon = '🔒';
  if (browser === 'firefox') icon = '🦊';
  else if (browser === 'safari') icon = '🧭';

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = isDark ? '#888' : '#555';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon + ' ' + (state.deviceFrame.url || 'https://example.com'), addrX + 8, addrY + 14);

  ctx.restore();
}
