import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from './range.js';

const SIZE = 1000;

describe('parseRangeHeader', () => {
  it('无 Range 头 → none（全量 200）', () => {
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ kind: 'none' });
    expect(parseRangeHeader('', SIZE)).toEqual({ kind: 'none' });
  });

  it('标准闭区间', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({
      kind: 'range',
      start: 0,
      end: 99,
      length: 100,
    });
    expect(parseRangeHeader('bytes=100-199', SIZE)).toEqual({
      kind: 'range',
      start: 100,
      end: 199,
      length: 100,
    });
  });

  it('开区间 bytes=a- 取到结尾', () => {
    expect(parseRangeHeader('bytes=900-', SIZE)).toEqual({
      kind: 'range',
      start: 900,
      end: 999,
      length: 100,
    });
  });

  it('后缀式 bytes=-N 取最后 N 字节', () => {
    expect(parseRangeHeader('bytes=-100', SIZE)).toEqual({
      kind: 'range',
      start: 900,
      end: 999,
      length: 100,
    });
  });

  it('后缀长度超过文件大小时夹到整个文件', () => {
    expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({
      kind: 'range',
      start: 0,
      end: 999,
      length: 1000,
    });
  });

  it('end 超出文件末尾时夹到末尾', () => {
    expect(parseRangeHeader('bytes=990-99999', SIZE)).toEqual({
      kind: 'range',
      start: 990,
      end: 999,
      length: 10,
    });
  });

  // 416 分支
  it('起点超出文件长度 → unsatisfiable（调用方回 416）', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('end < start → unsatisfiable', () => {
    expect(parseRangeHeader('bytes=500-100', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('空文件对任何区间都不可满足', () => {
    expect(parseRangeHeader('bytes=0-0', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it('非 bytes 单位或语法不可解析 → none（容错为全量）', () => {
    expect(parseRangeHeader('items=0-99', SIZE)).toEqual({ kind: 'none' });
    expect(parseRangeHeader('bytes=abc-def', SIZE)).toEqual({ kind: 'none' });
    expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'none' });
    expect(parseRangeHeader('bytes=-', SIZE)).toEqual({ kind: 'none' });
  });

  it('数组头取第一个值', () => {
    expect(parseRangeHeader(['bytes=0-9', 'bytes=10-19'], SIZE)).toEqual({
      kind: 'range',
      start: 0,
      end: 9,
      length: 10,
    });
  });

  it('单字节区间', () => {
    expect(parseRangeHeader('bytes=0-0', SIZE)).toEqual({
      kind: 'range',
      start: 0,
      end: 0,
      length: 1,
    });
  });
});
