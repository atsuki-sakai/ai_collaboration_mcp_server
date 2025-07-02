/**
 * 基本的なテスト - Jest設定の確認
 */

describe('基本テスト', () => {
  test('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2);
  });

  test('文字列連結', () => {
    expect('Hello' + ' ' + 'World').toBe('Hello World');
  });

  test('配列操作', () => {
    const arr = [1, 2, 3];
    arr.push(4);
    expect(arr).toEqual([1, 2, 3, 4]);
  });

  test('オブジェクト作成', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj).toHaveProperty('name', 'test');
    expect(obj).toHaveProperty('value', 42);
  });

  test('Promise解決', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });

  test('非同期関数', async () => {
    const asyncFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    };

    const result = await asyncFn();
    expect(result).toBe('done');
  });
});