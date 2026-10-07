import {jsonTooBig, MAX_JSON_CHARS, readBoundedJson} from '../src/services/jsonLimit';

describe('json limit', () => {
  it('rejects a string before it can be parsed', () => {
    expect(jsonTooBig('{"ok":true}')).toBe(false);
    expect(jsonTooBig('x'.repeat(MAX_JSON_CHARS + 1))).toBe(true);
  });

  it('does not read a response whose declared size is over the limit', async () => {
    const response = {
      headers: {get: () => String(MAX_JSON_CHARS + 5)},
      text: jest.fn(async () => '{"a":1}'),
    } as unknown as Response;
    const abort = jest.fn();
    await expect(readBoundedJson(response, MAX_JSON_CHARS, abort)).rejects.toThrow('payload too big');
    expect(abort).toHaveBeenCalled();
    expect(response.text).not.toHaveBeenCalled();
  });

  it('parses a small body', async () => {
    const response = {
      headers: {get: () => '11'},
      text: async () => '{"a":1}',
    } as unknown as Response;
    await expect(readBoundedJson(response)).resolves.toEqual({a: 1});
  });

  it('parses when Overpass omits content-length', async () => {
    const response = {
      headers: {get: () => null},
      text: async () => '{"elements":[]}',
    } as unknown as Response;
    await expect(readBoundedJson(response)).resolves.toEqual({elements: []});
  });

  it('abandons a body that never finishes', async () => {
    const abort = jest.fn();
    const response = {
      headers: {get: () => null},
      text: () => new Promise<string>(() => {}),
    } as unknown as Response;
    await expect(readBoundedJson(response, MAX_JSON_CHARS, abort, 20)).rejects.toThrow('payload timeout');
    expect(abort).toHaveBeenCalled();
  });

  it('rejects a chunked body that is over the character cap', async () => {
    const abort = jest.fn();
    const response = {
      headers: {get: () => null},
      text: async () => 'x'.repeat(MAX_JSON_CHARS + 2),
    } as unknown as Response;
    await expect(readBoundedJson(response, MAX_JSON_CHARS, abort)).rejects.toThrow('payload too big');
    expect(abort).toHaveBeenCalled();
  });

  it('can skip the read timeout', async () => {
    const response = {
      headers: {get: () => null},
      text: async () => '{"ok":true}',
    } as unknown as Response;
    await expect(readBoundedJson(response, MAX_JSON_CHARS, undefined, 0)).resolves.toEqual({ok: true});
  });
});
