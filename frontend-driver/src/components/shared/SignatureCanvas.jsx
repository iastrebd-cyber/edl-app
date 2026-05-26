/**
 * src/components/shared/SignatureCanvas.jsx
 *
 * Reusable touch/mouse signature canvas.
 * Exports PNG base64 via onSign(dataUrl) callback.
 * onSign(null) is called when the canvas is cleared.
 *
 * Used by:
 *   - components/dvir/DVIRForm.jsx   (DVIR driver signature)
 *   - pages/LogbookPage.jsx          (certify-log signature)
 */

import { useState, useRef, useEffect } from 'react';

export default function SignatureCanvas({ onSign }) {
  const canvasRef  = useRef(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef(null);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.fillStyle   = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current   = getPos(e);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;

    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const pos    = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPos.current = pos;
    setSigned(true);
  };

  const stopDraw = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;

    // Export signature as base64 PNG
    const canvas = canvasRef.current;
    const sig    = canvas.toDataURL('image/png');
    onSign(sig);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    onSign(null);
  };

  return (
    <div>
      <div style={{
        border: `2px dashed ${signed ? '#22c55e' : '#334155'}`,
        borderRadius: 10,
        overflow: 'hidden',
        touchAction: 'none',
      }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: '#475569' }}>
          {signed ? '✓ Signature captured' : 'Draw your signature above'}
        </span>
        {signed && (
          <button
            onClick={clear}
            style={{
              background: 'none', border: 'none',
              color: '#64748b', cursor: 'pointer', fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
