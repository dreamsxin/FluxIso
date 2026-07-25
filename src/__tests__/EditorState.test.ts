import { describe, expect, it } from 'vitest';
import { EditorState } from '../editor/EditorState';

describe('EditorState command notifications', () => {
  it('notifies listeners after undo and redo stacks are consistent', () => {
    const state = new EditorState();
    const observed: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    state.onChange(() => observed.push({ canUndo: state.canUndo, canRedo: state.canRedo }));

    state.addCharacter({
      id: 'player-1', x: 2.5, y: 2.5, z: 0, radius: 20, color: '#5590cc',
    });
    expect(observed[observed.length - 1]).toEqual({ canUndo: true, canRedo: false });

    state.undo();
    expect(state.getById('player-1')).toBeUndefined();
    expect(observed[observed.length - 1]).toEqual({ canUndo: false, canRedo: true });

    state.redo();
    expect(state.getById('player-1')).toBeDefined();
    expect(observed[observed.length - 1]).toEqual({ canUndo: true, canRedo: false });
  });
});
