/**
 * Cocos Creator 3.8 場景 / prefab 序列化器。
 *
 * 以宣告式的 NodeSpec 樹描述節點，由程式統一配置 `__id__` 索引，
 * 避免手寫上千行 JSON 的索引錯誤。節點與元件間的引用以 ref('key') 表示，
 * 序列化結束時統一解析為 `{ __id__ }`。
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const LAYER_UI_2D = 1 << 25;
export const LAYER_DEFAULT = 1 << 30;

// ─── uuid ────────────────────────────────────────────────────────────────

/**
 * 壓縮 uuid。腳本類別 id（`__type__`）使用 headLength = 5（23 字元），
 * 資產引用使用 headLength = 2（22 字元）。
 */
export function compressUuid(uuid: string, headLength = 5): string {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Invalid uuid: ${uuid}`);
  if ((32 - headLength) % 3 !== 0) throw new Error(`Invalid head length: ${headLength}`);
  let out = hex.slice(0, headLength);
  for (let i = headLength; i < 32; i += 3) {
    const v = parseInt(hex.slice(i, i + 3), 16);
    out += BASE64_KEYS[v >> 6] + BASE64_KEYS[v & 0x3f];
  }
  return out;
}

export function decompressUuid(compressed: string): string {
  const headLength = compressed.length === 23 ? 5 : compressed.length === 22 ? 2 : -1;
  if (headLength < 0) throw new Error(`Invalid compressed uuid: ${compressed}`);
  let hex = compressed.slice(0, headLength);
  for (let i = headLength; i < compressed.length; i += 2) {
    const v = (BASE64_KEYS.indexOf(compressed[i]) << 6) | BASE64_KEYS.indexOf(compressed[i + 1]);
    hex += v.toString(16).padStart(3, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 依種子字串產生穩定的 22 字元 id，讓重複生成時 diff 保持乾淨。 */
export function stableId(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return compressUuid(hex, 2);
}

// ─── .meta ───────────────────────────────────────────────────────────────

interface MetaFile {
  ver: string;
  importer: string;
  imported: boolean;
  uuid: string;
  files: string[];
  subMetas: Record<string, unknown>;
  userData: Record<string, unknown>;
}

function readMeta(assetPath: string): MetaFile | null {
  const metaPath = `${assetPath}.meta`;
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as MetaFile;
}

/** 讀取既有 meta 的 uuid；不存在時建立新 meta。已存在的 uuid 永不改寫。 */
export function ensureMeta(assetPath: string, template: Omit<MetaFile, 'uuid' | 'imported'>): string {
  const existing = readMeta(assetPath);
  if (existing) return existing.uuid;
  const meta: MetaFile = { ...template, imported: true, uuid: randomUUID() };
  const ordered = {
    ver: meta.ver,
    importer: meta.importer,
    imported: meta.imported,
    uuid: meta.uuid,
    files: meta.files,
    subMetas: meta.subMetas,
    userData: meta.userData,
  };
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(`${assetPath}.meta`, `${JSON.stringify(ordered, null, 2)}\n`);
  return meta.uuid;
}

export function scriptUuid(scriptPath: string): string {
  if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);
  return ensureMeta(scriptPath, { ver: '4.0.24', importer: 'typescript', files: [], subMetas: {}, userData: {} });
}

// ─── 值與引用 ────────────────────────────────────────────────────────────

export interface Ref {
  $ref: string;
}

export type Value = number | string | boolean | null | Ref | Value[] | { [key: string]: Value };

export const ref = (key: string): Ref => ({ $ref: key });
export const color = (r: number, g: number, b: number, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
export const vec2 = (x: number, y: number) => ({ __type__: 'cc.Vec2', x, y });
export const vec3 = (x: number, y: number, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
export const size = (width: number, height: number) => ({ __type__: 'cc.Size', width, height });

/** '#rrggbb' 或 '#rrggbbaa' */
export function hex(value: string) {
  const v = value.replace('#', '');
  const n = (i: number) => parseInt(v.slice(i, i + 2), 16);
  return color(n(0), n(2), n(4), v.length >= 8 ? n(6) : 255);
}

// ─── 規格 ────────────────────────────────────────────────────────────────

export interface ComponentSpec {
  /** 'cc.Sprite' 等內建型別，或以 script() 產生的壓縮類別 id */
  type: string;
  /** 供 ref() 引用的鍵 */
  key?: string;
  props?: Record<string, Value>;
}

export interface NodeSpec {
  name: string;
  key?: string;
  active?: boolean;
  position?: [number, number];
  scale?: [number, number];
  layer?: number;
  /** 設定後自動加上 UITransform */
  size?: [number, number];
  anchor?: [number, number];
  /** 不加 UITransform（例如 Camera 節點） */
  noTransform?: boolean;
  components?: ComponentSpec[];
  children?: NodeSpec[];
}

export function script(scriptPath: string, props?: Record<string, Value>, key?: string): ComponentSpec {
  return { type: compressUuid(scriptUuid(scriptPath)), props, key };
}

// ─── 序列化 ──────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

class Serializer {
  readonly objects: Obj[] = [];
  private readonly keys = new Map<string, number>();

  constructor(
    private readonly mode: 'scene' | 'prefab',
    private readonly idSeed: string,
  ) {}

  push(obj: Obj): number {
    this.objects.push(obj);
    return this.objects.length - 1;
  }

  private register(key: string | undefined, index: number): void {
    if (!key) return;
    if (this.keys.has(key)) throw new Error(`Duplicate ref key: ${key}`);
    this.keys.set(key, index);
  }

  private objectId(pathSeed: string): string {
    return this.mode === 'scene' ? stableId(`${this.idSeed}/${pathSeed}`) : '';
  }

  private prefabInfo(pathSeed: string, isRoot: boolean): Obj {
    const info: Obj = {
      __type__: 'cc.PrefabInfo',
      root: { __id__: 1 },
      asset: { __id__: 0 },
      fileId: stableId(`${this.idSeed}/${pathSeed}#prefab`),
      instance: null,
      targetOverrides: null,
    };
    if (isRoot) info.nestedPrefabInstanceRoots = null;
    return info;
  }

  writeNode(spec: NodeSpec, parent: number | null, pathSeed: string): number {
    const [x, y] = spec.position ?? [0, 0];
    const [sx, sy] = spec.scale ?? [1, 1];
    const node: Obj = {
      __type__: 'cc.Node',
      _name: spec.name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: parent === null ? null : { __id__: parent },
      _children: [],
      _active: spec.active ?? true,
      _components: [],
      _prefab: null,
      _lpos: vec3(x, y),
      _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
      _lscale: vec3(sx, sy, 1),
      _mobility: 0,
      _layer: spec.layer ?? LAYER_UI_2D,
      _euler: vec3(0, 0),
      _id: this.objectId(pathSeed),
    };
    const index = this.push(node);
    this.register(spec.key, index);

    (spec.children ?? []).forEach((child, i) => {
      const childIndex = this.writeNode(child, index, `${pathSeed}/${i}:${child.name}`);
      (node._children as Obj[]).push({ __id__: childIndex });
    });

    const components: ComponentSpec[] = [];
    if (!spec.noTransform) {
      const [w, h] = spec.size ?? [100, 100];
      const [ax, ay] = spec.anchor ?? [0.5, 0.5];
      components.push({ type: 'cc.UITransform', props: { _contentSize: size(w, h), _anchorPoint: vec2(ax, ay) } });
    }
    components.push(...(spec.components ?? []));

    components.forEach((comp, i) => {
      const compSeed = `${pathSeed}#${i}:${comp.type}`;
      const obj: Obj = {
        __type__: comp.type,
        _name: '',
        _objFlags: 0,
        __editorExtras__: {},
        node: { __id__: index },
        _enabled: true,
        __prefab: null,
        ...comp.props,
        _id: this.objectId(compSeed),
      };
      const compIndex = this.push(obj);
      this.register(comp.key, compIndex);
      if (this.mode === 'prefab') {
        obj.__prefab = { __id__: this.push({ __type__: 'cc.CompPrefabInfo', fileId: stableId(`${this.idSeed}/${compSeed}`) }) };
      }
      (node._components as Obj[]).push({ __id__: compIndex });
    });

    if (this.mode === 'prefab') {
      node._prefab = { __id__: this.push(this.prefabInfo(pathSeed, parent === null)) };
    }
    return index;
  }

  resolveRefs(): void {
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object') {
        const obj = value as Obj;
        if (typeof obj.$ref === 'string') {
          const index = this.keys.get(obj.$ref);
          if (index === undefined) throw new Error(`Unresolved ref: ${obj.$ref}`);
          return { __id__: index };
        }
        for (const k of Object.keys(obj)) obj[k] = walk(obj[k]);
      }
      return value;
    };
    this.objects.forEach(walk);
  }

  validate(): void {
    const count = this.objects.length;
    const check = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(check);
      if (value && typeof value === 'object') {
        const obj = value as Obj;
        if ('__id__' in obj) {
          const id = obj.__id__ as number;
          if (!Number.isInteger(id) || id < 0 || id >= count) throw new Error(`__id__ out of range: ${id}`);
          return;
        }
        if ('__uuid__' in obj) throw new Error('Asset uuid references are not allowed; load assets at runtime.');
        Object.values(obj).forEach(check);
      }
    };
    this.objects.forEach((o) => Object.values(o).forEach(check));
  }
}

function sceneGlobals(s: Serializer): number {
  const v4 = (x: number, y: number, z: number, w: number) => ({ __type__: 'cc.Vec4', x, y, z, w });
  const ambient = s.push({
    __type__: 'cc.AmbientInfo',
    _skyColorHDR: v4(0, 0, 0, 0.520833125),
    _skyColor: v4(0, 0, 0, 0.520833125),
    _skyIllumHDR: 20000,
    _skyIllum: 20000,
    _groundAlbedoHDR: v4(0, 0, 0, 0),
    _groundAlbedo: v4(0, 0, 0, 0),
    _skyColorLDR: v4(0.2, 0.5, 0.8, 1),
    _skyIllumLDR: 20000,
    _groundAlbedoLDR: v4(0.2, 0.2, 0.2, 1),
  });
  const shadows = s.push({
    __type__: 'cc.ShadowsInfo',
    _enabled: false,
    _type: 0,
    _normal: vec3(0, 1, 0),
    _distance: 0,
    _shadowColor: color(76, 76, 76),
    _maxReceived: 4,
    _size: vec2(512, 512),
  });
  const skybox = s.push({
    __type__: 'cc.SkyboxInfo',
    _envLightingType: 0,
    _envmapHDR: null,
    _envmap: null,
    _envmapLDR: null,
    _diffuseMapHDR: null,
    _diffuseMapLDR: null,
    _enabled: false,
    _useHDR: true,
  });
  const fog = s.push({
    __type__: 'cc.FogInfo',
    _type: 0,
    _fogColor: color(200, 200, 200),
    _enabled: false,
    _fogDensity: 0.3,
    _fogStart: 0.5,
    _fogEnd: 300,
    _fogAtten: 5,
    _fogTop: 1.5,
    _fogRange: 1.2,
    _accurate: false,
  });
  const octree = s.push({ __type__: 'cc.OctreeInfo', _enabled: false, _minPos: vec3(-1024, -1024, -1024), _maxPos: vec3(1024, 1024, 1024), _depth: 8 });
  const skin = s.push({ __type__: 'cc.SkinInfo', _enabled: false, _scale: 5 });
  return s.push({
    __type__: 'cc.SceneGlobals',
    ambient: { __id__: ambient },
    shadows: { __id__: shadows },
    _skybox: { __id__: skybox },
    fog: { __id__: fog },
    octree: { __id__: octree },
    skin: { __id__: skin },
  });
}

export function serializeScene(name: string, sceneUuid: string, roots: NodeSpec[]): Obj[] {
  const s = new Serializer('scene', sceneUuid);
  s.push({ __type__: 'cc.SceneAsset', _name: name, _objFlags: 0, __editorExtras__: {}, _native: '', scene: { __id__: 1 } });
  const scene: Obj = {
    __type__: 'cc.Scene',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: null,
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    autoReleaseAssets: false,
    _globals: null,
    _id: sceneUuid,
  };
  s.push(scene);
  roots.forEach((root, i) => {
    const index = s.writeNode(root, 1, `${i}:${root.name}`);
    (scene._children as Obj[]).push({ __id__: index });
  });
  scene._globals = { __id__: sceneGlobals(s) };
  s.resolveRefs();
  s.validate();
  return s.objects;
}

export function serializePrefab(prefabUuid: string, root: NodeSpec): Obj[] {
  const s = new Serializer('prefab', prefabUuid);
  s.push({
    __type__: 'cc.Prefab',
    _name: root.name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  s.writeNode(root, null, root.name);
  s.resolveRefs();
  s.validate();
  return s.objects;
}

// ─── 檔案輸出 ────────────────────────────────────────────────────────────

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeScene(filePath: string, roots: NodeSpec[]): void {
  const uuid = ensureMeta(filePath, { ver: '1.1.50', importer: 'scene', files: ['.json'], subMetas: {}, userData: {} });
  writeJson(filePath, serializeScene(path.basename(filePath, '.scene'), uuid, roots));
}

export function writePrefab(filePath: string, root: NodeSpec): void {
  const uuid = ensureMeta(filePath, {
    ver: '1.1.50',
    importer: 'prefab',
    files: ['.json'],
    subMetas: {},
    userData: { syncNodeName: root.name },
  });
  writeJson(filePath, serializePrefab(uuid, root));
}
