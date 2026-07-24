import { describe, expect, it } from 'vitest';
import {
  canMoveHistory,
  createNavigationHistory,
  moveNavigationHistory,
  pushNavigationHistory,
} from './history';

describe('navigation history', () => {
  it('pushes, moves, and truncates forward history', () => {
    let history = createNavigationHistory('http://localhost/');
    history = pushNavigationHistory(history, 'http://localhost/one');
    history = pushNavigationHistory(history, 'http://localhost/two');
    history = moveNavigationHistory(history, -1);

    expect(history.entries[history.index]).toBe('http://localhost/one');
    expect(canMoveHistory(history, 1)).toBe(true);

    history = pushNavigationHistory(history, 'http://localhost/three');
    expect(history).toEqual({
      entries: ['http://localhost/', 'http://localhost/one', 'http://localhost/three'],
      index: 2,
    });
  });

  it('does not add consecutive duplicates', () => {
    const history = createNavigationHistory('http://localhost/');
    expect(pushNavigationHistory(history, 'localhost')).toBe(history);
  });
});
