import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { RotateCcw, Trash2, Edit3, Eraser } from 'lucide-react';

const VISIBLE_HEIGHT = 450; // px — the clipping viewport
const WORKSPACE_MULTIPLIER = 3; // canvas is 3× taller

export const Whiteboard = forwardRef(({ initialImage }, ref) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const containerRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [color, setColor] = useState('#ffffff');
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState([]);

  // Scroll offset: translateY applied to canvas (always <= 0)
  const scrollOffsetRef = useRef(0);

  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);
  const toolRef = useRef(tool);
  colorRef.current = color;
  lineWidthRef.current = lineWidth;
  toolRef.current = tool;

  const colors = [
    { value: '#ffffff', label: 'White' },
    { value: '#6366f1', label: 'Indigo' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#ef4444', label: 'Rose' },
  ];

  const workspaceH = VISIBLE_HEIGHT * WORKSPACE_MULTIPLIER;

  const applyScroll = (offset) => {
    scrollOffsetRef.current = offset;
    if (canvasRef.current) canvasRef.current.style.transform = `translateY(${offset}px)`;
  };

  const clampScroll = (raw) => {
    const min = -(workspaceH - VISIBLE_HEIGHT);
    return Math.min(0, Math.max(min, raw));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = '100%';
    canvas.style.height = `${workspaceH}px`;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = workspaceH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth = lineWidthRef.current;
    contextRef.current = ctx;

    setHistory([canvas.toDataURL()]);

    if (initialImage) {
      const img = new Image();
      img.onload = () => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(img, 0, 0, rect.width, workspaceH);
        setHistory([canvas.toDataURL()]);
      };
      img.src = initialImage;
    }

    // ── Two-finger pan (ochem-bot pattern) ───────────────────────────────
    let isPanning = false;
    let lastPanY = 0;

    function onTouchStart(e) {
      if (e.touches.length >= 2) {
        isPanning = true;
        // cancel any in-progress stroke
        isDrawingRef.current = false;
        setIsDrawing(false);
        contextRef.current?.closePath();
        lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        e.preventDefault();
      }
    }
    function onTouchMove(e) {
      if (isPanning && e.touches.length >= 2) {
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        applyScroll(clampScroll(scrollOffsetRef.current + (midY - lastPanY)));
        lastPanY = midY;
        e.preventDefault();
      }
    }
    function onTouchEnd(e) {
      if (isPanning && e.touches.length < 2) isPanning = false;
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    // Mouse-wheel scroll
    function onWheel(e) {
      e.preventDefault();
      applyScroll(clampScroll(scrollOffsetRef.current - e.deltaY));
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Resize
    function handleResize() {
      const snapshot = canvas.toDataURL();
      const r = canvas.getBoundingClientRect();
      const oldStroke = ctx.strokeStyle;
      const oldW = ctx.lineWidth;
      const oldGco = ctx.globalCompositeOperation;
      canvas.width = r.width * dpr;
      canvas.height = workspaceH * dpr;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = oldStroke;
      ctx.lineWidth = oldW;
      ctx.globalCompositeOperation = oldGco;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, workspaceH);
      img.src = snapshot;
    }
    window.addEventListener('resize', handleResize);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contextRef.current) return;
    contextRef.current.strokeStyle = color;
    contextRef.current.globalCompositeOperation =
      tool === 'pencil' ? 'source-over' : 'destination-out';
  }, [color, tool]);

  useEffect(() => {
    if (!contextRef.current) return;
    contextRef.current.lineWidth = lineWidth;
  }, [lineWidth]);

  const saveState = () => {
    if (canvasRef.current) setHistory(p => [...p, canvasRef.current.toDataURL()]);
  };

  const undo = () => {
    if (history.length <= 1) return;
    const prev = history.slice(0, -1);
    setHistory(prev);
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      const r = canvas.getBoundingClientRect();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, 0, 0, r.width, workspaceH);
      ctx.globalCompositeOperation = toolRef.current === 'pencil' ? 'source-over' : 'destination-out';
    };
    img.src = prev[prev.length - 1];
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  // ── Pointer events: one-touch or stylus draws ────────────────────────────
  const startDrawing = (e) => {
    if (e.nativeEvent?.touches?.length >= 2) return; // two-finger → let touch handlers pan
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top - scrollOffsetRef.current;
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    isDrawingRef.current = true;
    setIsDrawing(true);
    e.preventDefault();
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top - scrollOffsetRef.current;
    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
    e.preventDefault();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    contextRef.current?.closePath();
    saveState();
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = '#0a0a0c';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, 0);
      return tmp.toDataURL('image/png');
    },
    clearWhiteboard: () => clear(),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', marginBottom: '1.5rem' }}>
      {/* Clipping viewport */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          border: '1px solid var(--bg-glass-border)',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(10, 10, 12, 0.8)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          height: `${VISIBLE_HEIGHT}px`,
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          style={{
            display: 'block',
            width: '100%',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            transformOrigin: 'top left',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
        ✏️ Draw with one finger or stylus &nbsp;·&nbsp; 🤌 Scroll with two fingers
      </p>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          padding: 'var(--input-padding)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--bg-glass-border)',
          borderRadius: 'var(--radius-md)',
          pointerEvents: isDrawing ? 'none' : 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Tools */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className={`btn ${tool === 'pencil' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTool('pencil')} title="Pencil">
            <Edit3 size={15} /> Pencil
          </button>
          <button type="button" className={`btn ${tool === 'eraser' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTool('eraser')} title="Eraser">
            <Eraser size={15} /> Eraser
          </button>
        </div>

        {/* Colors */}
        {tool === 'pencil' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  backgroundColor: c.value,
                  border: color === c.value ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.2)',
                  boxShadow: color === c.value ? '0 0 8px rgba(99,102,241,0.8)' : 'none',
                  cursor: 'pointer', padding: 0,
                }}
                title={c.label}
              />
            ))}
          </div>
        )}

        {/* Size */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <span>Size:</span>
          <input type="range"
            min={tool === 'pencil' ? 2 : 5} max={tool === 'pencil' ? 15 : 40}
            value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))}
            style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '80px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}
          />
          <span style={{ minWidth: '20px', textAlign: 'center' }}>{lineWidth}px</span>
        </div>

        {/* Undo / Clear */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={undo} disabled={history.length <= 1} title="Undo">
            <RotateCcw size={15} /> Undo
          </button>
          <button type="button" className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger-glass)' }}
            onClick={clear} title="Clear">
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
});
