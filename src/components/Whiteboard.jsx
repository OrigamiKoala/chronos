import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { RotateCcw, Trash2, Edit3, Eraser } from 'lucide-react';

export const Whiteboard = forwardRef(({ height = 1000 }, ref) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [tool, setTool] = useState('pencil'); // 'pencil' | 'eraser'
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState([]);

  // Setup palette colors matching theme
  const colors = [
    { value: '#ffffff', label: 'White' },
    { value: '#6366f1', label: 'Indigo' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#ef4444', label: 'Rose' },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas styles are set first so getBoundingClientRect measures correctly
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const context = canvas.getContext('2d');
    context.scale(dpr, dpr);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Save initial blank canvas state to history
    saveState();

    // Resize listener
    const handleResize = () => {
      const tempImage = canvas.toDataURL();
      const newRect = canvas.getBoundingClientRect();
      canvas.width = newRect.width * dpr;
      canvas.height = newRect.height * dpr;
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
      context.lineWidth = lineWidth;

      const img = new Image();
      img.onload = () => {
        context.drawImage(img, 0, 0, newRect.width, height);
      };
      img.src = tempImage;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!contextRef.current) return;
    contextRef.current.strokeStyle = color;
    if (tool === 'pencil') {
      contextRef.current.globalCompositeOperation = 'source-over';
    } else {
      contextRef.current.globalCompositeOperation = 'destination-out';
    }
  }, [color, tool]);

  useEffect(() => {
    if (!contextRef.current) return;
    contextRef.current.lineWidth = lineWidth;
  }, [lineWidth]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory((prev) => [...prev, canvas.toDataURL()]);
  };

  const undo = () => {
    if (history.length <= 1) return;
    const prevHistory = [...history];
    prevHistory.pop(); // remove current state
    const prevState = prevHistory[prevHistory.length - 1];
    setHistory(prevHistory);

    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw previous state
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      context.globalCompositeOperation = 'source-over';
      context.drawImage(img, 0, 0, rect.width, rect.height);
      // Restore active tool composite op
      context.globalCompositeOperation = tool === 'pencil' ? 'source-over' : 'destination-out';
    };
    img.src = prevState;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  // Modern pointer event handling (mouse and touch support)
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    setIsDrawing(true);
    e.preventDefault();
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
    e.preventDefault();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    contextRef.current.closePath();
    saveState();
  };

  // Expose export capability to parent Ref
  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      
      // Create a temporary canvas with a dark background matching the theme so it grades better
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Draw background
      tempCtx.fillStyle = '#0a0a0c';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Draw drawing
      tempCtx.drawImage(canvas, 0, 0);
      return tempCanvas.toDataURL('image/png');
    },
    clearWhiteboard: () => {
      clear();
    }
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', marginBottom: '1.5rem' }}>
      <div 
        style={{ 
          position: 'relative', 
          border: '1px solid var(--bg-glass-border)', 
          borderRadius: 'var(--radius-md)', 
          background: 'rgba(10, 10, 12, 0.8)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          maxHeight: '450px',
          overflowY: 'auto',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          KhtmlUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          style={{
            display: 'block',
            width: '100%',
            height: `${height}px`,
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            KhtmlUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        />
      </div>

      {/* Toolbar Controls */}
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
          borderRadius: 'var(--radius-md)' 
        }}
      >
        {/* Tools Selection */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn ${tool === 'pencil' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTool('pencil')}
            title="Pencil Tool"
          >
            <Edit3 size={15} /> Pencil
          </button>
          <button
            type="button"
            className={`btn ${tool === 'eraser' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={() => setTool('eraser')}
            title="Eraser Tool"
          >
            <Eraser size={15} /> Eraser
          </button>
        </div>

        {/* Color Palette (only visible/enabled when using pencil) */}
        {tool === 'pencil' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: c.value,
                  border: color === c.value ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.2)',
                  boxShadow: color === c.value ? '0 0 8px rgba(99, 102, 241, 0.8)' : 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
                title={c.label}
              />
            ))}
          </div>
        )}

        {/* Line Width Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <span>Size:</span>
          <input
            type="range"
            min={tool === 'pencil' ? 2 : 5}
            max={tool === 'pencil' ? 15 : 40}
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            style={{
              cursor: 'pointer',
              accentColor: 'var(--accent-primary)',
              width: '80px',
              height: '5px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.1)'
            }}
          />
          <span style={{ minWidth: '20px', textAlign: 'center' }}>{lineWidth}px</span>
        </div>

        {/* Clear & Undo Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={undo}
            disabled={history.length <= 1}
            title="Undo"
          >
            <RotateCcw size={15} /> Undo
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger-glass)' }}
            onClick={clear}
            title="Clear Whiteboard"
          >
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
});
