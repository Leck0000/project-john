/**
 * WindowManager — renders desktop windows (z-ordered) over the workspace,
 * plus a taskbar for minimized windows.
 *
 * Consumes: desktopSlice (windows[], zOrder[], activeWindowId)
 * Produces: DesktopWindowFrame (titlebar drag, SE resize, min/max/close) with
 *           app content looked up from APP_REGISTRY.
 *
 * Strict TS: no `any`. Theming via CSS variables only.
 * Accessibility: windows are role="dialog" with an accessible name; controls
 * have aria-labels; Escape restores a maximized window.
 */
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  closeWindow,
  focusWindow,
  minimizeWindow,
  restoreWindow,
  setWindowBounds,
  toggleWindowState,
  type DesktopWindow,
} from './slice';
import { APP_REGISTRY, isAppKey } from './apps';

const TITLEBAR_HEIGHT = 28;
const MIN_SIZE = 160;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Gesture {
  kind: 'drag' | 'resize';
  pointerX: number;
  pointerY: number;
  start: Bounds;
}

const boundsOf = (w: DesktopWindow): Bounds => ({
  x: w.x,
  y: w.y,
  width: w.innerWidth,
  height: w.innerHeight,
});

const controlButtonStyle: React.CSSProperties = {
  width: 24,
  height: 20,
  background: 'transparent',
  border: 'none',
  color: 'var(--bg)',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
};

export interface DesktopWindowFrameProps {
  desktopWindow: DesktopWindow;
  zIndex: number;
  active: boolean;
  children?: React.ReactNode;
}

/** Window chrome: titlebar (drag), SE handle (resize), min / max / close. */
export function DesktopWindowFrame({ desktopWindow, zIndex, active, children }: DesktopWindowFrameProps) {
  const dispatch = useAppDispatch();
  const { id, title, maximized, minimized } = desktopWindow;
  const [bounds, setBounds] = useState<Bounds>(() => boundsOf(desktopWindow));
  const gesture = useRef<Gesture | null>(null);
  // Latest bounds for the pointer-up handler (state may lag a render behind).
  const liveBounds = useRef<Bounds>(bounds);

  // Follow store updates when not mid-gesture.
  useEffect(() => {
    if (!gesture.current) {
      const next = boundsOf(desktopWindow);
      liveBounds.current = next;
      setBounds(next);
    }
  }, [desktopWindow]);

  const canDrag = desktopWindow.draggable !== false && !maximized;
  const canResize = desktopWindow.resizable !== false && !maximized && !minimized;

  const beginGesture = (kind: Gesture['kind']) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (kind === 'drag' && !canDrag) return;
    if (kind === 'resize' && !canResize) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch(focusWindow(id));
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.current = { kind, pointerX: e.clientX, pointerY: e.clientY, start: liveBounds.current };
  };

  const moveGesture = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.pointerX;
    const dy = e.clientY - g.pointerY;
    const next =
      g.kind === 'drag'
        ? { ...g.start, x: Math.max(0, Math.round(g.start.x + dx)), y: Math.max(0, Math.round(g.start.y + dy)) }
        : {
            ...g.start,
            width: Math.max(MIN_SIZE, Math.round(g.start.width + dx)),
            height: Math.max(MIN_SIZE, Math.round(g.start.height + dy)),
          };
    liveBounds.current = next;
    setBounds(next);
  };

  const endGesture = (e: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return;
    gesture.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dispatch(setWindowBounds({ windowId: id, ...liveBounds.current }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && maximized) {
      e.stopPropagation();
      dispatch(toggleWindowState(id));
    }
  };

  if (minimized) return null;

  const placement: React.CSSProperties = maximized
    ? { left: 0, top: 0, width: '100%', height: '100%' }
    : { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height };

  return (
    <div
      data-testid={`window-${id}`}
      data-window-id={id}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        if (!active) dispatch(focusWindow(id));
      }}
      style={{
        position: 'absolute',
        ...placement,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
        backgroundColor: 'var(--card)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: 'var(--fg)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="window-titlebar"
        onPointerDown={beginGesture('drag')}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onDoubleClick={() => dispatch(toggleWindowState(id))}
        style={{
          height: TITLEBAR_HEIGHT,
          flex: `0 0 ${TITLEBAR_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px 0 10px',
          backgroundColor: active ? 'var(--accent)' : 'var(--border)',
          color: 'var(--bg)',
          fontSize: 13,
          fontWeight: 600,
          userSelect: 'none',
          touchAction: 'none',
          cursor: canDrag ? 'move' : 'default',
        }}
      >
        <span
          data-testid={canDrag ? 'title-drag-handle' : undefined}
          style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          <span data-testid="window-title">{title}</span>
        </span>
        <div style={{ display: 'flex', gap: 2 }} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            data-testid="window-minimize"
            style={controlButtonStyle}
            onClick={() => dispatch(minimizeWindow(id))}
            aria-label="Minimize window"
            title="Minimize"
          >
            –
          </button>
          <button
            type="button"
            data-testid="window-maximize"
            style={controlButtonStyle}
            onClick={() => dispatch(toggleWindowState(id))}
            aria-label={maximized ? 'Restore window' : 'Maximize window'}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? '❐' : '□'}
          </button>
          <button
            type="button"
            data-testid="window-close"
            style={controlButtonStyle}
            onClick={() => dispatch(closeWindow(id))}
            aria-label="Close window"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div data-testid="window-content" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {children}
      </div>

      {canResize && (
        <div
          data-testid="resize-se"
          title="Resize"
          onPointerDown={beginGesture('resize')}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 14,
            height: 14,
            cursor: 'se-resize',
            touchAction: 'none',
            background: 'linear-gradient(135deg, transparent 50%, var(--accent) 50%)',
          }}
        />
      )}
    </div>
  );
}

function WindowContent({ desktopWindow }: { desktopWindow: DesktopWindow }) {
  if (!isAppKey(desktopWindow.app)) {
    return <p style={{ padding: 12, color: 'var(--muted)' }}>No application for this window.</p>;
  }
  const { Component } = APP_REGISTRY[desktopWindow.app];
  return (
    <Suspense fallback={<p style={{ padding: 12, color: 'var(--muted)' }}>Loading…</p>}>
      <Component windowId={desktopWindow.id} />
    </Suspense>
  );
}

/** Desktop layer: absolutely positioned windows plus a taskbar for minimized ones. */
export function WindowManager() {
  const dispatch = useAppDispatch();
  const { windows, zOrder, activeWindowId } = useAppSelector((state) => state.desktop);
  const zIndexOf = (windowId: string) => zOrder.find((z) => z.windowId === windowId)?.zIndex ?? 0;
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div
      data-testid="window-manager"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 100, pointerEvents: 'none', overflow: 'hidden', zIndex: 20 }}
    >
      {windows.map((w) => (
        <DesktopWindowFrame key={w.id} desktopWindow={w} zIndex={10 + zIndexOf(w.id)} active={w.id === activeWindowId}>
          <WindowContent desktopWindow={w} />
        </DesktopWindowFrame>
      ))}

      {minimized.length > 0 && (
        <nav
          aria-label="Minimized windows"
          style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 6, pointerEvents: 'auto', zIndex: 10_000 }}
        >
          {minimized.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                dispatch(restoreWindow(w.id));
                dispatch(focusWindow(w.id));
              }}
              style={{
                maxWidth: 200,
                padding: '4px 10px',
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: 'var(--card)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {w.title}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
