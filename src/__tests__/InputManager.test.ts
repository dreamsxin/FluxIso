import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '../core/InputManager';

describe('InputManager', () => {
  let canvas: HTMLCanvasElement;
  let input: InputManager;

  beforeEach(() => {
    // Simple mock for canvas and window events
    const listeners: Record<string, Function[]> = {};
    const winListeners: Record<string, Function[]> = {};

    canvas = {
      addEventListener: (type: string, cb: Function) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(cb);
      },
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      width: 800,
      height: 600
    } as unknown as HTMLCanvasElement;

    // Mock window global
    (global as any).window = {
      addEventListener: (type: string, cb: Function) => {
        if (!winListeners[type]) winListeners[type] = [];
        winListeners[type].push(cb);
      },
      removeEventListener: vi.fn(),
      dispatchEvent: (ev: any) => {
        if (winListeners[ev.type]) {
          winListeners[ev.type].forEach(cb => cb(ev));
        }
      }
    };

    // Helper to dispatch canvas events
    (canvas as any).dispatchEvent = (ev: any) => {
      if (listeners[ev.type]) {
        listeners[ev.type].forEach(cb => cb(ev));
      }
    };

    input = new InputManager(canvas);
  });

  afterEach(() => {
    input.destroy();
  });

  it('tracks keyboard state', () => {
    const downEv = { type: 'keydown', key: 'a', code: 'KeyA' };
    (window as any).dispatchEvent(downEv);

    expect(input.isDown('a')).toBe(true);
    expect(input.isDown('KeyA')).toBe(true);
    expect(input.wasPressed('a')).toBe(true);

    input.flush();
    expect(input.isDown('a')).toBe(true);
    expect(input.wasPressed('a')).toBe(false);

    const upEv = { type: 'keyup', key: 'a', code: 'KeyA' };
    (window as any).dispatchEvent(upEv);
    expect(input.isDown('a')).toBe(false);
    expect(input.wasReleased('a')).toBe(true);
  });

  it('tracks pointer state', () => {
    const moveEv = { type: 'mousemove', clientX: 100, clientY: 100 };
    (canvas as any).dispatchEvent(moveEv);
    
    const downEv = { type: 'mousedown', clientX: 50, clientY: 50 };
    (canvas as any).dispatchEvent(downEv);

    expect(input.pointer.down).toBe(true);
    expect(input.pointer.pressed).toBe(true);

    input.flush();
    expect(input.pointer.down).toBe(true);
    expect(input.pointer.pressed).toBe(false);

    const upEv = { type: 'mouseup' };
    (canvas as any).dispatchEvent(upEv);
    expect(input.pointer.down).toBe(false);
    expect(input.pointer.released).toBe(true);
  });

  it('handles action bindings', () => {
    input.bindKey('Space', 'jump');
    const callback = vi.fn();
    input.onAction('jump', callback);

    const downEv = { type: 'keydown', key: ' ', code: 'Space' };
    (window as any).dispatchEvent(downEv);

    expect(input.isAction('jump')).toBe(true);
    expect(input.wasAction('jump')).toBe(true);

    input.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(input.wasAction('jump')).toBe(false);
  });
});
