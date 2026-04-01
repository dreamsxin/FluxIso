import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneManager } from '../core/SceneManager';
import { Engine } from '../core/Engine';
import { Scene } from '../core/Scene';

describe('SceneManager', () => {
  let engine: Engine;
  let mgr: SceneManager;

  beforeEach(() => {
    // Simple mock for document and canvas since we are in node environment
    const canvas = {
      getContext: () => ({
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }),
      width: 800,
      height: 600,
    } as unknown as HTMLCanvasElement;

    engine = new Engine({ canvas });
    mgr = new SceneManager(engine);
  });

  it('registers and pushes scenes', async () => {
    const scene1 = new Scene();
    const onEnter = vi.fn();
    
    mgr.register('menu', () => ({
      scene: scene1,
      onEnter
    }));

    await mgr.push('menu');
    
    expect(mgr.current).toBe('menu');
    expect(engine.scene).toBe(scene1);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('handles stack push and pop lifecycle', async () => {
    const scene1 = new Scene();
    const scene2 = new Scene();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onExit = vi.fn();

    mgr.register('level1', () => ({
      scene: scene1,
      onPause,
      onResume
    }));

    mgr.register('pauseMenu', () => ({
      scene: scene2,
      onExit
    }));

    await mgr.push('level1');
    await mgr.push('pauseMenu');

    expect(mgr.current).toBe('pauseMenu');
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(engine.scene).toBe(scene2);

    await mgr.pop();
    expect(mgr.current).toBe('level1');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(engine.scene).toBe(scene1);
  });

  it('replaces the current scene', async () => {
    const scene1 = new Scene();
    const scene2 = new Scene();
    const onExit1 = vi.fn();
    const onEnter2 = vi.fn();

    mgr.register('s1', () => ({ scene: scene1, onExit: onExit1 }));
    mgr.register('s2', () => ({ scene: scene2, onEnter: onEnter2 }));

    await mgr.push('s1');
    await mgr.replace('s2');

    expect(mgr.current).toBe('s2');
    expect(mgr.depth).toBe(1);
    expect(onExit1).toHaveBeenCalledTimes(1);
    expect(onEnter2).toHaveBeenCalledTimes(1);
  });
});
