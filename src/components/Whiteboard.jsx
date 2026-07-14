import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { RotateCcw, Trash2, Edit3, Eraser } from 'lucide-react';

const VISIBLE_HEIGHT = 450;        // px — clipping viewport
const WORKSPACE_MULTIPLIER = 3;    // canvas is 3× taller

const COLORS = [
  { value: '#ffffff', label: 'White' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Rose' },
];

// Unique canvas ID per mount (avoids conflicts if component is re-used)
let instanceCounter = 0;

export const Whiteboard = forwardRef(({ initialImage, onChange }, ref) => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);   // Fabric.Canvas instance
  const canvasId = useRef(`wb-canvas-${++instanceCounter}`);

  const [isEraser, setIsEraser] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState([]);  // array of JSON snapshots
  const historyRef = useRef([]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const workspaceH = VISIBLE_HEIGHT * WORKSPACE_MULTIPLIER;

  // ── Init Fabric.js ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.fabric) {
      console.error('Fabric.js not loaded');
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const fc = new window.fabric.Canvas(canvasId.current, {
      isDrawingMode: true,
      backgroundColor: 'transparent',
      selection: false,
    });

    fc.freeDrawingBrush = new window.fabric.PencilBrush(fc);
    fc.freeDrawingBrush.color = '#ffffff';
    fc.freeDrawingBrush.width = 4;
    fc.freeDrawingBrush.strokeLineCap = 'round';
    fc.freeDrawingBrush.strokeLineJoin = 'round';

    fabricRef.current = fc;

    // Size the canvas
    function resize() {
      const w = container.clientWidth;
      fc.setWidth(w);
      fc.setHeight(workspaceH);
      fc._visibleHeight = VISIBLE_HEIGHT;
      fc._workspaceHeight = workspaceH;
      fc.renderAll();
    }
    setTimeout(resize, 0);
    window.addEventListener('resize', resize);

    // Viewport clamp helper
    function clampVpt() {
      const vpt = fc.viewportTransform;
      const maxY = 0;
      const minY = -(workspaceH - VISIBLE_HEIGHT);
      if (vpt[5] > maxY) vpt[5] = maxY;
      if (vpt[5] < minY) vpt[5] = minY;
      vpt[4] = 0;
    }

    // ── Two-finger pan / one-finger draw (ochem-bot pattern) ────────────────
    let isPanning = false;
    let lastPanY = 0;

    const upperCanvas = fc.upperCanvasEl || fc.wrapperEl;

    function onTouchStart(e) {
      if (e.touches.length >= 2) {
        isPanning = true;
        fc.isDrawingMode = false;
        lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        e.preventDefault();
      }
    }
    function onTouchMove(e) {
      if (isPanning && e.touches.length >= 2) {
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const delta = midY - lastPanY;
        lastPanY = midY;
        const vpt = fc.viewportTransform;
        vpt[5] += delta;
        clampVpt();
        fc.setViewportTransform(vpt);
        fc.requestRenderAll();
        e.preventDefault();
      }
    }
    function onTouchEnd(e) {
      if (isPanning && e.touches.length < 2) {
        isPanning = false;
        fc.isDrawingMode = true;
      }
    }

    upperCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    upperCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
    upperCanvas.addEventListener('touchend', onTouchEnd);

    // Mouse-wheel scroll
    function onWheel(e) {
      e.preventDefault();
      const vpt = fc.viewportTransform;
      vpt[5] -= e.deltaY;
      clampVpt();
      fc.setViewportTransform(vpt);
      fc.requestRenderAll();
    }
    container.addEventListener('wheel', onWheel, { passive: false });

    // Save history on each stroke
    fc.on('path:created', () => {
      const snap = JSON.stringify(fc.toJSON());
      historyRef.current = [...historyRef.current, snap];
      setHistory([...historyRef.current]);
      if (onChangeRef.current) onChangeRef.current();
    });

    // Load initial image if provided
    if (initialImage) {
      window.fabric.Image.fromURL(initialImage, (img) => {
        fc.setBackgroundImage(img, fc.renderAll.bind(fc), {
          scaleX: fc.width / img.width,
          scaleY: fc.height / img.height,
        });
      });
    }

    return () => {
      window.removeEventListener('resize', resize);
      upperCanvas.removeEventListener('touchstart', onTouchStart);
      upperCanvas.removeEventListener('touchmove', onTouchMove);
      upperCanvas.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('wheel', onWheel);
      fc.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync brush color / width / eraser ────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !window.fabric) return;
    fc.freeDrawingBrush = new window.fabric.PencilBrush(fc);
    fc.freeDrawingBrush.color = isEraser ? '#0a0a0c' : color;
    fc.freeDrawingBrush.width = isEraser ? lineWidth * 4 : lineWidth;
    fc.freeDrawingBrush.strokeLineCap = 'round';
    fc.freeDrawingBrush.strokeLineJoin = 'round';
  }, [color, lineWidth, isEraser]);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const undo = () => {
    const fc = fabricRef.current;
    if (!fc || historyRef.current.length === 0) return;
    const prev = historyRef.current.slice(0, -1);
    historyRef.current = prev;
    setHistory([...prev]);
    fc.clear();
    fc.backgroundColor = 'transparent';
    if (prev.length > 0) {
      fc.loadFromJSON(prev[prev.length - 1], () => {
        fc.renderAll();
        if (onChange) onChange();
      });
    } else {
      fc.renderAll();
      if (onChange) onChange();
    }
  };

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clear = () => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.clear();
    fc.backgroundColor = 'transparent';
    fc.renderAll();
    historyRef.current = [];
    setHistory([]);
    if (onChange) onChange();
  };

  // ── Expose to parent ─────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const fc = fabricRef.current;
      if (!fc) return null;
      
      const origBg = fc.backgroundColor;
      fc.backgroundColor = '#0a0a0c';

      // Save the current viewport transform
      const origVpt = [...fc.viewportTransform];
      // Reset viewport transform so that absolute coordinates map 1:1 on export
      fc.setViewportTransform([1, 0, 0, 1, 0, 0]);

      const objects = fc.getObjects();
      let exportOptions = {
        format: 'jpeg',
        quality: 0.85,
        multiplier: 1.0
      };

      if (objects.length > 0) {
        // Calculate bounding box of all paths/objects
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        objects.forEach(obj => {
          const bounds = obj.getBoundingRect(true, true);
          if (bounds.left < minX) minX = bounds.left;
          if (bounds.top < minY) minY = bounds.top;
          if (bounds.left + bounds.width > maxX) maxX = bounds.left + bounds.width;
          if (bounds.top + bounds.height > maxY) maxY = bounds.top + bounds.height;
        });

        // Add padding (20px) around content
        const padding = 20;
        const left = Math.max(0, minX - padding);
        const top = Math.max(0, minY - padding);
        const width = Math.min(fc.width - left, (maxX - minX) + padding * 2);
        const height = Math.min(fc.height - top, (maxY - minY) + padding * 2);

        exportOptions = {
          ...exportOptions,
          left,
          top,
          width,
          height
        };
      } else {
        // Fallback if canvas is empty: export the current visible viewport height
        const currentScrollY = -origVpt[5];
        exportOptions = {
          ...exportOptions,
          left: 0,
          top: currentScrollY,
          width: fc.width,
          height: VISIBLE_HEIGHT
        };
      }
      
      const url = fc.toDataURL(exportOptions);
      
      // Restore original background color and viewport transform
      fc.backgroundColor = origBg;
      fc.setViewportTransform(origVpt);
      fc.renderAll();
      return url;
    },
    getFullWorkspaceDataURL: () => {
      const fc = fabricRef.current;
      if (!fc) return null;
      
      const origBg = fc.backgroundColor;
      fc.backgroundColor = '#0a0a0c';

      // Save the current viewport transform
      const origVpt = [...fc.viewportTransform];
      // Reset viewport transform so that absolute coordinates map 1:1 on export
      fc.setViewportTransform([1, 0, 0, 1, 0, 0]);

      const url = fc.toDataURL({
        format: 'jpeg',
        quality: 0.85,
        multiplier: 1.0,
        left: 0,
        top: 0,
        width: fc.width,
        height: fc.height
      });
      
      // Restore original background color and viewport transform
      fc.backgroundColor = origBg;
      fc.setViewportTransform(origVpt);
      fc.renderAll();
      return url;
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
        <canvas id={canvasId.current} />
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
        alignItems: 'center', gap: '1rem',
        padding: 'var(--input-padding)',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--bg-glass-border)',
        borderRadius: 'var(--radius-md)',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        {/* Pencil / Eraser */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className={`btn ${!isEraser ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setIsEraser(false)}>
            <Edit3 size={15} /> Pencil
          </button>
          <button type="button" className={`btn ${isEraser ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setIsEraser(true)}>
            <Eraser size={15} /> Eraser
          </button>
        </div>

        {/* Color palette */}
        {!isEraser && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {COLORS.map((c) => (
              <button key={c.value} type="button"
                onClick={() => setColor(c.value)}
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
            min={2} max={isEraser ? 40 : 15}
            value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))}
            style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '80px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}
          />
          <span style={{ minWidth: '20px', textAlign: 'center' }}>{lineWidth}px</span>
        </div>

        {/* Undo / Clear */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={undo} disabled={history.length === 0} title="Undo">
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
