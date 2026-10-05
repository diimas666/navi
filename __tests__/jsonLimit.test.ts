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
});
