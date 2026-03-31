import { describe, it, expect, vi } from 'vitest';
import { EventBus, globalBus } from '../ecs/EventBus';

describe('EventBus — on / emit / off', () => {
  it('calls handler on emit', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('test', fn);
    bus.emit('test', { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  it('unsubscribe stops calls', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const unsub = bus.on('test', fn);
    unsub();
    bus.emit('test', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple handlers all called', () => {
    const bus = new EventBus();
    const a = vi.fn(), b = vi.fn();
    bus.on('e', a); bus.on('e', b);
    bus.emit('e', null);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('once fires exactly once', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('e', fn);
    bus.emit('e', 1);
    bus.emit('e', 2);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('clear removes all handlers', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('e', fn);
    bus.clear('e');
    bus.emit('e', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it('listenerCount returns correct count', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('x')).toBe(0);
    bus.on('x', vi.fn());
    bus.on('x', vi.fn());
    expect(bus.listenerCount('x')).toBe(2);
  });
});

describe('globalBus', () => {
  it('is a shared singleton', () => {
    expect(globalBus).toBeInstanceOf(EventBus);
  });
});
