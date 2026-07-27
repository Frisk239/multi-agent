import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Select } from './Select';

describe('Select', () => {
  it('renders native select with ma-select class', () => {
    render(
      <Select aria-label="demo" data-testid="select-demo">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const el = screen.getByTestId('select-demo');
    expect(el.tagName).toBe('SELECT');
    expect(el.classList.contains('ma-select')).toBe(true);
  });

  it('merges className after ma-select', () => {
    render(
      <Select className="chat-new-select" data-testid="select-merge" defaultValue="x">
        <option value="x">X</option>
      </Select>,
    );
    const el = screen.getByTestId('select-merge');
    expect(el.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['ma-select', 'chat-new-select']),
    );
  });

  it('forwards value/onChange and other props', () => {
    let last = '';
    render(
      <Select
        value="b"
        onChange={(e) => {
          last = e.target.value;
        }}
        disabled={false}
        data-testid="select-fwd"
        aria-label="fwd"
      >
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const el = screen.getByTestId('select-fwd') as HTMLSelectElement;
    expect(el.value).toBe('b');
    fireEvent.change(el, { target: { value: 'a' } });
    expect(last).toBe('a');
  });
});
