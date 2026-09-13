import { describe, expect, it } from 'vitest';
import { compressUuid, decompressUuid, ref, serializePrefab, serializeScene, type NodeSpec } from '../../tools/lib/cocos-json';

describe('uuid 壓縮', () => {
  it('腳本類別 id 與編輯器內建資產一致（5 碼前綴，23 字元）', () => {
    // 取自 Cocos Creator 3.8.8 內建 debug-view-runtime-control.ts.meta 與其 prefab
    expect(compressUuid('b2bd1fa7-8d7c-49c5-a158-df29a6d3a594')).toBe('b2bd1+njXxJxaFY3ymm06WU');
  });

  it('資產 uuid 與引擎 decodeUuid 範例一致（2 碼前綴，22 字元）', () => {
    expect(compressUuid('fc991dd7-0033-4b80-9d41-c8a86a702e59', 2)).toBe('fcmR3XADNLgJ1ByKhqcC5Z');
  });

  it('可還原', () => {
    const uuid = '0359b2f1-3a37-43fa-9c1c-bbe2b353ea1f';
    expect(decompressUuid(compressUuid(uuid))).toBe(uuid);
    expect(decompressUuid(compressUuid(uuid, 2))).toBe(uuid);
  });
});

describe('序列化器', () => {
  const tree: NodeSpec = {
    name: 'Root',
    key: 'root',
    children: [{ name: 'Child', key: 'child', components: [{ type: 'cc.Label', key: 'label', props: { _string: 'hi' } }] }],
    components: [{ type: 'cc.Button', props: { _target: ref('child'), labelRef: ref('label') } }],
  };

  it('場景的所有 __id__ 皆有效，且引用正確解析', () => {
    const objs = serializeScene('Test', '0359b2f1-3a37-43fa-9c1c-bbe2b353ea1f', [tree]);
    expect(objs[0].__type__).toBe('cc.SceneAsset');
    const button = objs.find((o) => o.__type__ === 'cc.Button') as Record<string, { __id__: number }>;
    expect(objs[button._target.__id__]._name).toBe('Child');
    expect(objs[button.labelRef.__id__].__type__).toBe('cc.Label');
  });

  it('prefab 每個節點都有 PrefabInfo，每個元件都有 CompPrefabInfo', () => {
    const objs = serializePrefab('0359b2f1-3a37-43fa-9c1c-bbe2b353ea1f', tree);
    const nodes = objs.filter((o) => o.__type__ === 'cc.Node');
    for (const node of nodes) {
      const info = objs[(node._prefab as { __id__: number }).__id__];
      expect(info.__type__).toBe('cc.PrefabInfo');
    }
    const comps = objs.filter((o) => 'node' in o);
    for (const comp of comps) {
      expect(objs[(comp.__prefab as { __id__: number }).__id__].__type__).toBe('cc.CompPrefabInfo');
    }
  });

  it('未定義的引用會拋錯', () => {
    expect(() => serializeScene('Bad', '0359b2f1-3a37-43fa-9c1c-bbe2b353ea1f', [{ name: 'A', components: [{ type: 'cc.Button', props: { x: ref('nope') } }] }])).toThrow(/Unresolved ref/);
  });
});
